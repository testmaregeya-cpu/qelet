-- Qelet Phase 3 Schema: Edit/Void Own Entries, Dispute Workflow, and Entry History Audit View

-- 1. Disputes table
create table if not exists public.disputes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  entry_id uuid not null references public.entries(id) on delete cascade,
  raised_by uuid not null default auth.uid() references auth.users(id),
  note text not null check (char_length(btrim(note)) between 1 and 500),
  raised_at timestamptz not null default now(),
  status text not null default 'open' check (status in ('open', 'resolved')),
  resolved_by uuid references auth.users(id),
  resolved_at timestamptz,
  resolution_note text,
  constraint chk_resolved_dispute_fields check (
    status = 'open'
    or (
      resolved_by is not null
      and resolved_at is not null
      and char_length(btrim(coalesce(resolution_note, ''))) > 0
    )
  )
);

-- At most one open dispute at a time per entry
create unique index if not exists uq_open_dispute_per_entry
  on public.disputes (entry_id)
  where status = 'open';

create index if not exists idx_disputes_household_status
  on public.disputes (household_id, status, raised_at desc);

-- 2. Respect skip_entry_audit flag inside trg_entries_after_write when edit_charge_entry logs rich line snapshots
create or replace function public.trg_entries_after_write()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_action text;
begin
  if coalesce(current_setting('qelet.skip_entry_audit', true), '') = 'true' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    perform public.write_audit_log(
      new.household_id,
      new.created_by,
      case when new.type = 'charge' then 'charge_created' else 'payment_created' end,
      'entry',
      new.id,
      null,
      to_jsonb(new)
    );
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if coalesce(current_setting('qelet.internal_rpc', true), '') = 'true'
       and new.shop_id <> old.shop_id then
      v_action := 'entry_reassigned_by_merge';
    elsif new.voided and not old.voided then
      v_action := 'entry_voided';
    else
      v_action := 'entry_edited';
    end if;

    perform public.write_audit_log(
      new.household_id,
      coalesce(auth.uid(), new.created_by),
      v_action,
      'entry',
      new.id,
      to_jsonb(old),
      to_jsonb(new)
    );
    return new;
  end if;

  return new;
end;
$$;

-- 3. Disputes integrity & audit triggers
create or replace function public.trg_disputes_before_write()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_entry public.entries;
begin
  if tg_op = 'INSERT' then
    select * into v_entry from public.entries where id = new.entry_id;
    if not found then
      raise exception 'Entry not found';
    end if;

    if not public.is_household_member(v_entry.household_id) then
      raise exception 'Not a member of this household';
    end if;

    if v_entry.voided then
      raise exception 'Cannot dispute a voided entry';
    end if;

    if v_entry.created_by = auth.uid() then
      raise exception 'You can only flag your partner''s entry as disputed';
    end if;

    new.household_id := v_entry.household_id;
    new.raised_by := auth.uid();
    new.note := btrim(coalesce(new.note, ''));
    if char_length(new.note) = 0 then
      raise exception 'A note is required when raising a dispute';
    end if;
    new.raised_at := now();
    new.status := 'open';
    new.resolved_by := null;
    new.resolved_at := null;
    new.resolution_note := null;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    select * into v_entry from public.entries where id = old.entry_id;
    if not found then
      raise exception 'Entry not found';
    end if;

    if old.status <> 'open' then
      raise exception 'Dispute is already resolved';
    end if;

    if v_entry.created_by <> auth.uid() then
      raise exception 'Only the entry creator can resolve this dispute';
    end if;

    if new.status <> 'resolved' then
      raise exception 'Open disputes can only transition to resolved';
    end if;

    if new.household_id <> old.household_id
       or new.entry_id <> old.entry_id
       or new.raised_by <> old.raised_by
       or new.note <> old.note
       or new.raised_at <> old.raised_at then
      raise exception 'Immutable dispute fields cannot be changed';
    end if;

    new.resolution_note := btrim(coalesce(new.resolution_note, ''));
    if char_length(new.resolution_note) = 0 then
      raise exception 'A resolution note is required';
    end if;

    new.resolved_by := auth.uid();
    new.resolved_at := now();
    return new;
  end if;

  return new;
end;
$$;

drop trigger if exists disputes_before_write on public.disputes;
create trigger disputes_before_write
  before insert or update on public.disputes
  for each row
  execute function public.trg_disputes_before_write();

create or replace function public.trg_disputes_after_write()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if tg_op = 'INSERT' then
    perform public.write_audit_log(
      new.household_id,
      new.raised_by,
      'dispute_raised',
      'entry',
      new.entry_id,
      null,
      to_jsonb(new)
    );
    return new;
  end if;

  if tg_op = 'UPDATE' then
    perform public.write_audit_log(
      new.household_id,
      new.resolved_by,
      'dispute_resolved',
      'entry',
      new.entry_id,
      to_jsonb(old),
      to_jsonb(new)
    );
    return new;
  end if;

  return new;
end;
$$;

drop trigger if exists disputes_after_write on public.disputes;
create trigger disputes_after_write
  after insert or update on public.disputes
  for each row
  execute function public.trg_disputes_after_write();

-- 4. Atomic RPCs for editing/voiding own entries, disputes, and entry history
create or replace function public.edit_charge_entry(
  p_entry_id uuid,
  p_entry_date date,
  p_bill_month text,
  p_note text,
  p_lines jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_old_entry public.entries;
  v_new_entry public.entries;
  v_old_lines jsonb;
  v_new_lines jsonb := '[]'::jsonb;
  v_line jsonb;
  v_item_name text;
  v_item_key text;
  v_qty_milli bigint;
  v_unit text;
  v_unit_price bigint;
  v_line_total bigint;
  v_total_santim bigint := 0;
  v_idx int := 0;
  v_inserted_line public.entry_lines;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select * into v_old_entry from public.entries where id = p_entry_id for update;
  if not found then
    raise exception 'Entry not found';
  end if;

  if not public.is_household_member(v_old_entry.household_id) then
    raise exception 'Not a member of this household';
  end if;

  if v_old_entry.created_by <> v_uid then
    raise exception 'Only the person who added an entry can edit or void it';
  end if;

  if v_old_entry.type <> 'charge' then
    raise exception 'Only charge entries can be edited with item lines';
  end if;

  if v_old_entry.voided then
    raise exception 'Voided entries cannot be modified';
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

  select coalesce(jsonb_agg(to_jsonb(el) order by el.sort_order), '[]'::jsonb)
  into v_old_lines
  from public.entry_lines el
  where el.entry_id = p_entry_id;

  -- Suppress duplicate entry trigger audit row so we log one complete entry+lines snapshot
  perform set_config('qelet.skip_entry_audit', 'true', true);

  update public.entries
  set entry_date = p_entry_date,
      bill_month = p_bill_month,
      total_amount_santim = v_total_santim,
      note = btrim(coalesce(p_note, ''))
  where id = p_entry_id
  returning * into v_new_entry;

  delete from public.entry_lines where entry_id = p_entry_id;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_item_name := btrim(v_line->>'item_name');
    v_item_key := lower(v_item_name);
    v_qty_milli := (v_line->>'quantity_milli')::bigint;
    v_unit := coalesce(nullif(btrim(v_line->>'unit'), ''), 'pcs');
    v_unit_price := (v_line->>'unit_price_santim')::bigint;
    v_line_total := round((v_qty_milli::numeric * v_unit_price::numeric) / 1000.0)::bigint;

    insert into public.entry_lines (
      household_id, entry_id, item_name, quantity_milli, unit, unit_price_santim, line_total_santim, sort_order
    )
    values (
      v_old_entry.household_id,
      p_entry_id,
      v_item_name,
      v_qty_milli,
      v_unit,
      v_unit_price,
      v_line_total,
      v_idx
    )
    returning * into v_inserted_line;

    v_new_lines := v_new_lines || jsonb_build_array(to_jsonb(v_inserted_line));
    v_idx := v_idx + 1;

    insert into public.price_memory (
      household_id, shop_id, item_key, item_name, last_unit, last_unit_price_santim, last_used, use_count
    )
    values (
      v_old_entry.household_id,
      v_old_entry.shop_id,
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
          last_used = now();
  end loop;

  perform public.write_audit_log(
    v_old_entry.household_id,
    v_uid,
    'entry_edited',
    'entry',
    p_entry_id,
    jsonb_build_object('entry', to_jsonb(v_old_entry), 'lines', v_old_lines),
    jsonb_build_object('entry', to_jsonb(v_new_entry), 'lines', v_new_lines)
  );

  return jsonb_build_object(
    'entry', to_jsonb(v_new_entry),
    'lines', v_new_lines
  );
end;
$$;

create or replace function public.edit_payment_entry(
  p_entry_id uuid,
  p_entry_date date,
  p_amount_santim bigint,
  p_note text default ''
)
returns public.entries
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_entry public.entries;
  v_updated public.entries;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  if p_amount_santim is null or p_amount_santim <= 0 then
    raise exception 'Payment amount must be greater than 0 ETB';
  end if;

  select * into v_entry from public.entries where id = p_entry_id for update;
  if not found then
    raise exception 'Entry not found';
  end if;

  if not public.is_household_member(v_entry.household_id) then
    raise exception 'Not a member of this household';
  end if;

  if v_entry.created_by <> v_uid then
    raise exception 'Only the person who added an entry can edit or void it';
  end if;

  if v_entry.type <> 'payment' then
    raise exception 'Use edit_charge_entry for charges';
  end if;

  if v_entry.voided then
    raise exception 'Voided entries cannot be modified';
  end if;

  update public.entries
  set entry_date = p_entry_date,
      total_amount_santim = p_amount_santim,
      note = btrim(coalesce(p_note, ''))
  where id = p_entry_id
  returning * into v_updated;

  return v_updated;
end;
$$;

create or replace function public.void_entry(
  p_entry_id uuid,
  p_void_reason text
)
returns public.entries
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_entry public.entries;
  v_updated public.entries;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select * into v_entry from public.entries where id = p_entry_id for update;
  if not found then
    raise exception 'Entry not found';
  end if;

  if not public.is_household_member(v_entry.household_id) then
    raise exception 'Not a member of this household';
  end if;

  if v_entry.created_by <> v_uid then
    raise exception 'Only the person who added an entry can edit or void it';
  end if;

  if v_entry.voided then
    raise exception 'Entry is already voided';
  end if;

  update public.entries
  set voided = true,
      void_reason = btrim(coalesce(p_void_reason, ''))
  where id = p_entry_id
  returning * into v_updated;

  return v_updated;
end;
$$;

-- Entry-specific history accessible to BOTH super_admin and member (without exposing full audit_log)
create or replace function public.get_entry_history(p_entry_id uuid)
returns table (
  id uuid,
  at timestamptz,
  actor_id uuid,
  action text,
  before_data jsonb,
  after_data jsonb
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_entry public.entries;
begin
  select * into v_entry from public.entries e where e.id = p_entry_id;
  if not found then
    raise exception 'Entry not found';
  end if;

  if not public.is_household_member(v_entry.household_id) then
    raise exception 'Not authorized';
  end if;

  return query
  select al.id, al.at, al.actor_id, al.action, al.before_data, al.after_data
  from public.audit_log al
  where al.household_id = v_entry.household_id
    and al.object_type = 'entry'
    and al.object_id = p_entry_id
  order by al.at desc;
end;
$$;

revoke all on function public.edit_charge_entry(uuid, date, text, text, jsonb) from public;
revoke all on function public.edit_payment_entry(uuid, date, bigint, text) from public;
revoke all on function public.void_entry(uuid, text) from public;
revoke all on function public.get_entry_history(uuid) from public;

grant execute on function public.edit_charge_entry(uuid, date, text, text, jsonb) to authenticated;
grant execute on function public.edit_payment_entry(uuid, date, bigint, text) to authenticated;
grant execute on function public.void_entry(uuid, text) to authenticated;
grant execute on function public.get_entry_history(uuid) to authenticated;

-- 5. RLS on disputes
alter table public.disputes enable row level security;

drop policy if exists disputes_select_household on public.disputes;
create policy disputes_select_household
  on public.disputes for select
  to authenticated
  using (public.is_household_member(household_id));

drop policy if exists disputes_insert_partner on public.disputes;
create policy disputes_insert_partner
  on public.disputes for insert
  to authenticated
  with check (
    public.is_household_member(household_id)
    and raised_by = auth.uid()
  );

drop policy if exists disputes_update_creator on public.disputes;
create policy disputes_update_creator
  on public.disputes for update
  to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

-- 6. Realtime for disputes
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'disputes'
  ) then
    alter publication supabase_realtime add table public.disputes;
  end if;
end $$;
