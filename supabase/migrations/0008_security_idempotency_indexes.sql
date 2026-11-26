-- Qelet Migration 0008: Security Hardening, Idempotency Keys, CSPRNG Invites, and Policy Indexes

-- 1. Enforce all ledger entry mutations through SECURITY DEFINER RPCs (no direct PostgREST INSERT/UPDATE on entries)
revoke insert, update on table public.entries from authenticated;

-- 2. Idempotency key for duplicate-tap / offline-retry safety on charges & payments
alter table public.entries
  add column if not exists client_request_id uuid;

create unique index if not exists uq_entries_client_request
  on public.entries (household_id, created_by, client_request_id)
  where client_request_id is not null;

-- 3. Missing FK / RLS filter indexes
create index if not exists idx_entry_lines_household
  on public.entry_lines (household_id);

create index if not exists idx_entry_lines_catalog_item
  on public.entry_lines (catalog_item_id)
  where catalog_item_id is not null;

create index if not exists idx_price_memory_household
  on public.price_memory (household_id);

create index if not exists idx_disputes_entry_id
  on public.disputes (entry_id);

-- 4. CSPRNG invite code generation using pgcrypto gen_random_bytes
create or replace function public.generate_invite_code()
returns text
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  chars constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_bytes bytea;
  code text;
  attempts int := 0;
begin
  loop
    attempts := attempts + 1;
    v_bytes := gen_random_bytes(6);
    code := '';
    for i in 0..5 loop
      code := code || substr(chars, 1 + (get_byte(v_bytes, i) % length(chars)), 1);
    end loop;

    exit when not exists (
      select 1 from public.households h where h.invite_code = code
    );

    if attempts > 30 then
      raise exception 'Failed to generate unique invite code';
    end if;
  end loop;
  return code;
end;
$$;

-- 5. Idempotent create_charge_entry & create_payment_entry (drop prior signatures cleanly to avoid PostgREST overload ambiguity)
drop function if exists public.create_charge_entry(uuid, date, text, text, jsonb);
drop function if exists public.create_payment_entry(uuid, date, bigint, text);

create or replace function public.create_charge_entry(
  p_shop_id uuid,
  p_entry_date date,
  p_bill_month text,
  p_note text,
  p_lines jsonb,
  p_client_request_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_shop public.shops;
  v_entry public.entries;
  v_line jsonb;
  v_item_name text;
  v_item_key text;
  v_catalog_item_id uuid;
  v_qty_milli bigint;
  v_unit text;
  v_unit_price bigint;
  v_line_total bigint;
  v_total_santim bigint := 0;
  v_idx int := 0;
  v_inserted_lines jsonb := '[]'::jsonb;
  v_inserted_line public.entry_lines;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select * into v_shop from public.shops where id = p_shop_id;
  if not found then
    raise exception 'Shop not found';
  end if;

  if not public.is_household_member(v_shop.household_id) then
    raise exception 'Not a member of this household';
  end if;

  if p_client_request_id is not null then
    select *
    into v_entry
    from public.entries
    where household_id = v_shop.household_id
      and created_by = v_uid
      and client_request_id = p_client_request_id;

    if found then
      select coalesce(jsonb_agg(to_jsonb(el) order by el.sort_order), '[]'::jsonb)
      into v_inserted_lines
      from public.entry_lines el
      where el.entry_id = v_entry.id;

      return jsonb_build_object(
        'entry', to_jsonb(v_entry),
        'lines', v_inserted_lines
      );
    end if;
  end if;

  if v_shop.archived or v_shop.merged_into_shop_id is not null then
    raise exception 'Cannot add charges to an archived or merged shop';
  end if;

  if p_bill_month is null or p_bill_month !~ '^\d{4}-(0[1-9]|1[0-2])$' then
    raise exception 'Invalid bill_month format (expected YYYY-MM)';
  end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'At least one item line is required';
  end if;

  if jsonb_array_length(p_lines) > 50 then
    raise exception 'Too many item lines in one entry';
  end if;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_item_name := btrim(coalesce(v_line->>'item_name', ''));
    if char_length(v_item_name) < 1 or char_length(v_item_name) > 80 then
      raise exception 'Each item name must be 1 to 80 characters';
    end if;

    v_qty_milli := (v_line->>'quantity_milli')::bigint;
    v_unit_price := (v_line->>'unit_price_santim')::bigint;
    if v_qty_milli <= 0 then
      raise exception 'Quantity must be positive';
    end if;
    if v_unit_price < 0 then
      raise exception 'Unit price cannot be negative';
    end if;

    v_line_total := round((v_qty_milli::numeric * v_unit_price::numeric) / 1000.0)::bigint;
    if v_line_total <= 0 then
      raise exception 'Each line total must be greater than 0 ETB';
    end if;

    v_total_santim := v_total_santim + v_line_total;
  end loop;

  begin
    insert into public.entries (
      household_id, shop_id, type, entry_date, bill_month, total_amount_santim, note, created_by, client_request_id
    )
    values (
      v_shop.household_id,
      v_shop.id,
      'charge',
      p_entry_date,
      p_bill_month,
      v_total_santim,
      btrim(coalesce(p_note, '')),
      v_uid,
      p_client_request_id
    )
    returning * into v_entry;
  exception
    when unique_violation then
      if p_client_request_id is not null then
        select *
        into v_entry
        from public.entries
        where household_id = v_shop.household_id
          and created_by = v_uid
          and client_request_id = p_client_request_id;

        if found then
          select coalesce(jsonb_agg(to_jsonb(el) order by el.sort_order), '[]'::jsonb)
          into v_inserted_lines
          from public.entry_lines el
          where el.entry_id = v_entry.id;

          return jsonb_build_object(
            'entry', to_jsonb(v_entry),
            'lines', v_inserted_lines
          );
        end if;
      end if;
      raise;
  end;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_item_name := btrim(v_line->>'item_name');
    v_item_key := lower(v_item_name);
    v_catalog_item_id := nullif(btrim(coalesce(v_line->>'catalog_item_id', '')), '')::uuid;
    if v_catalog_item_id is not null and not exists (
      select 1 from public.catalog_items ci
      where ci.id = v_catalog_item_id and ci.household_id = v_shop.household_id
    ) then
      v_catalog_item_id := null;
    end if;

    v_qty_milli := (v_line->>'quantity_milli')::bigint;
    v_unit := coalesce(nullif(btrim(v_line->>'unit'), ''), 'pcs');
    v_unit_price := (v_line->>'unit_price_santim')::bigint;
    v_line_total := round((v_qty_milli::numeric * v_unit_price::numeric) / 1000.0)::bigint;

    insert into public.entry_lines (
      household_id, entry_id, catalog_item_id, item_name, quantity_milli, unit, unit_price_santim, line_total_santim, sort_order
    )
    values (
      v_shop.household_id,
      v_entry.id,
      v_catalog_item_id,
      v_item_name,
      v_qty_milli,
      v_unit,
      v_unit_price,
      v_line_total,
      v_idx
    )
    returning * into v_inserted_line;

    v_inserted_lines := v_inserted_lines || jsonb_build_array(to_jsonb(v_inserted_line));
    v_idx := v_idx + 1;

    insert into public.price_memory (
      household_id, shop_id, item_key, item_name, last_unit, last_unit_price_santim, last_used, use_count
    )
    values (
      v_shop.household_id,
      v_shop.id,
      v_item_key,
      v_item_name,
      v_unit,
      v_unit_price,
      now(),
      1
    )
    on conflict (shop_id, item_key) do update
      set item_name = excluded.item_name,
          last_unit = excluded.last_unit,
          last_unit_price_santim = excluded.last_unit_price_santim,
          last_used = now(),
          use_count = public.price_memory.use_count + 1;
  end loop;

  return jsonb_build_object(
    'entry', to_jsonb(v_entry),
    'lines', v_inserted_lines
  );
end;
$$;

create or replace function public.create_payment_entry(
  p_shop_id uuid,
  p_entry_date date,
  p_amount_santim bigint,
  p_note text default '',
  p_client_request_id uuid default null
)
returns public.entries
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_shop public.shops;
  v_entry public.entries;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  if p_amount_santim is null or p_amount_santim <= 0 then
    raise exception 'Payment amount must be greater than 0 ETB';
  end if;

  select * into v_shop from public.shops where id = p_shop_id;
  if not found then
    raise exception 'Shop not found';
  end if;

  if not public.is_household_member(v_shop.household_id) then
    raise exception 'Not a member of this household';
  end if;

  if p_client_request_id is not null then
    select *
    into v_entry
    from public.entries
    where household_id = v_shop.household_id
      and created_by = v_uid
      and client_request_id = p_client_request_id;

    if found then
      return v_entry;
    end if;
  end if;

  if v_shop.archived or v_shop.merged_into_shop_id is not null then
    raise exception 'Cannot record payments for an archived or merged shop';
  end if;

  begin
    insert into public.entries (
      household_id, shop_id, type, entry_date, bill_month, total_amount_santim, note, created_by, client_request_id
    )
    values (
      v_shop.household_id,
      v_shop.id,
      'payment',
      p_entry_date,
      null,
      p_amount_santim,
      btrim(coalesce(p_note, '')),
      v_uid,
      p_client_request_id
    )
    returning * into v_entry;
  exception
    when unique_violation then
      if p_client_request_id is not null then
        select *
        into v_entry
        from public.entries
        where household_id = v_shop.household_id
          and created_by = v_uid
          and client_request_id = p_client_request_id;

        if found then
          return v_entry;
        end if;
      end if;
      raise;
  end;

  return v_entry;
end;
$$;

revoke all on function public.create_charge_entry(uuid, date, text, text, jsonb, uuid) from public;
revoke all on function public.create_payment_entry(uuid, date, bigint, text, uuid) from public;
grant execute on function public.create_charge_entry(uuid, date, text, text, jsonb, uuid) to authenticated;
grant execute on function public.create_payment_entry(uuid, date, bigint, text, uuid) to authenticated;
