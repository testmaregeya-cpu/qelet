-- Qelet Phase 2 Schema: Itemized Charges, Payments, Price Memory, Atomic RPCs, and Shop Merge Ledger Support

-- 1. Tables
create table if not exists public.entries (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  shop_id uuid not null references public.shops(id),
  type text not null check (type in ('charge', 'payment')),
  entry_date date not null,
  bill_month text check (bill_month is null or bill_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  total_amount_santim bigint not null check (total_amount_santim > 0),
  note text not null default '' check (char_length(note) <= 500),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  edit_count int not null default 0 check (edit_count >= 0),
  voided boolean not null default false,
  voided_by uuid references auth.users(id),
  voided_at timestamptz,
  void_reason text,
  constraint chk_charge_requires_bill_month check (
    (type = 'charge' and bill_month is not null)
    or (type = 'payment' and bill_month is null)
  ),
  constraint chk_void_requires_reason check (
    not voided
    or (
      voided_by is not null
      and voided_at is not null
      and char_length(btrim(coalesce(void_reason, ''))) > 0
    )
  )
);

create index if not exists idx_entries_shop_date
  on public.entries (shop_id, entry_date desc, created_at desc);

create index if not exists idx_entries_household_date
  on public.entries (household_id, entry_date desc);

create table if not exists public.entry_lines (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  entry_id uuid not null references public.entries(id) on delete cascade,
  item_name text not null check (char_length(btrim(item_name)) between 1 and 80),
  quantity_milli bigint not null check (quantity_milli > 0),
  unit text not null default 'pcs' check (char_length(btrim(unit)) between 1 and 20),
  unit_price_santim bigint not null check (unit_price_santim >= 0),
  line_total_santim bigint not null check (line_total_santim > 0),
  sort_order int not null default 0
);

create index if not exists idx_entry_lines_entry_id
  on public.entry_lines (entry_id, sort_order);

create table if not exists public.price_memory (
  household_id uuid not null references public.households(id) on delete cascade,
  shop_id uuid not null references public.shops(id) on delete cascade,
  item_key text not null check (char_length(btrim(item_key)) between 1 and 80),
  item_name text not null check (char_length(btrim(item_name)) between 1 and 80),
  last_unit text not null default 'pcs' check (char_length(btrim(last_unit)) between 1 and 20),
  last_unit_price_santim bigint not null check (last_unit_price_santim >= 0),
  last_used timestamptz not null default now(),
  use_count int not null default 1 check (use_count >= 1),
  primary key (shop_id, item_key)
);

create index if not exists idx_price_memory_shop_usage
  on public.price_memory (shop_id, use_count desc, last_used desc);

-- 2. Integrity & server-driven audit triggers on entries
create or replace function public.trg_entries_before_write()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_shop public.shops;
begin
  new.note := btrim(coalesce(new.note, ''));

  if tg_op = 'INSERT' then
    select * into v_shop from public.shops where id = new.shop_id;
    if not found then
      raise exception 'Shop not found';
    end if;

    if v_shop.household_id <> new.household_id or not public.is_household_member(v_shop.household_id) then
      raise exception 'Not authorized for this household shop';
    end if;

    if v_shop.archived or v_shop.merged_into_shop_id is not null then
      raise exception 'Cannot add entries to an archived or merged shop';
    end if;

    new.created_by := auth.uid();
    new.created_at := now();
    new.edited_at := null;
    new.edit_count := 0;
    new.voided := false;
    new.voided_by := null;
    new.voided_at := null;
    new.void_reason := null;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    -- Internal RPCs (such as merge_shops) may reassign shop_id atomically
    if coalesce(current_setting('qelet.internal_rpc', true), '') = 'true' then
      return new;
    end if;

    if old.created_by <> auth.uid() then
      raise exception 'Only the person who added an entry can edit or void it';
    end if;

    if old.voided then
      raise exception 'Voided entries cannot be modified';
    end if;

    if new.household_id <> old.household_id
       or new.shop_id <> old.shop_id
       or new.type <> old.type
       or new.created_by <> old.created_by
       or new.created_at <> old.created_at then
      raise exception 'Immutable entry fields cannot be changed';
    end if;

    if new.voided and not old.voided then
      new.voided_by := auth.uid();
      new.voided_at := now();
      new.void_reason := btrim(coalesce(new.void_reason, ''));
      if char_length(new.void_reason) = 0 then
        raise exception 'A reason is required to void an entry';
      end if;
    else
      new.edited_at := now();
      new.edit_count := old.edit_count + 1;
    end if;

    return new;
  end if;

  return new;
end;
$$;

drop trigger if exists entries_before_write on public.entries;
create trigger entries_before_write
  before insert or update on public.entries
  for each row
  execute function public.trg_entries_before_write();

create or replace function public.trg_entries_after_write()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_action text;
begin
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

drop trigger if exists entries_after_write on public.entries;
create trigger entries_after_write
  after insert or update on public.entries
  for each row
  execute function public.trg_entries_after_write();

-- 3. Atomic RPCs for itemized charges and payments
create or replace function public.create_charge_entry(
  p_shop_id uuid,
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
  v_shop public.shops;
  v_entry public.entries;
  v_line jsonb;
  v_item_name text;
  v_item_key text;
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

  -- First validate and sum integer santim totals across all lines
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

  insert into public.entries (
    household_id, shop_id, type, entry_date, bill_month, total_amount_santim, note, created_by
  )
  values (
    v_shop.household_id,
    v_shop.id,
    'charge',
    p_entry_date,
    p_bill_month,
    v_total_santim,
    btrim(coalesce(p_note, '')),
    v_uid
  )
  returning * into v_entry;

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
      v_shop.household_id,
      v_entry.id,
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
  p_note text default ''
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

  if v_shop.archived or v_shop.merged_into_shop_id is not null then
    raise exception 'Cannot record payments for an archived or merged shop';
  end if;

  insert into public.entries (
    household_id, shop_id, type, entry_date, bill_month, total_amount_santim, note, created_by
  )
  values (
    v_shop.household_id,
    v_shop.id,
    'payment',
    p_entry_date,
    null,
    p_amount_santim,
    btrim(coalesce(p_note, '')),
    v_uid
  )
  returning * into v_entry;

  return v_entry;
end;
$$;

-- 4. Update merge_shops to move entries and price_memory atomically
create or replace function public.merge_shops(
  p_source_shop_id uuid,
  p_target_shop_id uuid
)
returns public.shops
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_source public.shops;
  v_target public.shops;
  v_updated public.shops;
begin
  if p_source_shop_id = p_target_shop_id then
    raise exception 'Cannot merge a shop into itself';
  end if;

  select * into v_source from public.shops where id = p_source_shop_id for update;
  select * into v_target from public.shops where id = p_target_shop_id for update;

  if not found or v_source.id is null or v_target.id is null then
    raise exception 'Source or target shop not found';
  end if;

  if v_source.household_id <> v_target.household_id then
    raise exception 'Shops must belong to the same household';
  end if;

  if not public.is_super_admin(v_source.household_id) then
    raise exception 'Only super_admin can merge shops';
  end if;

  if v_source.merged_into_shop_id is not null then
    raise exception 'Source shop is already merged';
  end if;

  if v_target.archived or v_target.merged_into_shop_id is not null then
    raise exception 'Target shop must be active';
  end if;

  perform set_config('qelet.internal_rpc', 'true', true);

  update public.entries
  set shop_id = p_target_shop_id
  where shop_id = p_source_shop_id;

  insert into public.price_memory (
    household_id, shop_id, item_key, item_name, last_unit, last_unit_price_santim, last_used, use_count
  )
  select
    household_id,
    p_target_shop_id,
    item_key,
    item_name,
    last_unit,
    last_unit_price_santim,
    last_used,
    use_count
  from public.price_memory
  where shop_id = p_source_shop_id
  on conflict (shop_id, item_key) do update
    set item_name = case
          when excluded.last_used > public.price_memory.last_used then excluded.item_name
          else public.price_memory.item_name
        end,
        last_unit = case
          when excluded.last_used > public.price_memory.last_used then excluded.last_unit
          else public.price_memory.last_unit
        end,
        last_unit_price_santim = case
          when excluded.last_used > public.price_memory.last_used then excluded.last_unit_price_santim
          else public.price_memory.last_unit_price_santim
        end,
        last_used = greatest(public.price_memory.last_used, excluded.last_used),
        use_count = public.price_memory.use_count + excluded.use_count;

  delete from public.price_memory
  where shop_id = p_source_shop_id;

  update public.shops
  set archived = true,
      needs_review = false,
      merged_into_shop_id = p_target_shop_id
  where id = p_source_shop_id
  returning * into v_updated;

  return v_updated;
end;
$$;

revoke all on function public.create_charge_entry(uuid, date, text, text, jsonb) from public;
revoke all on function public.create_payment_entry(uuid, date, bigint, text) from public;
grant execute on function public.create_charge_entry(uuid, date, text, text, jsonb) to authenticated;
grant execute on function public.create_payment_entry(uuid, date, bigint, text) to authenticated;

-- 5. Row Level Security (RLS)
alter table public.entries enable row level security;
alter table public.entry_lines enable row level security;
alter table public.price_memory enable row level security;

drop policy if exists entries_select_household on public.entries;
create policy entries_select_household
  on public.entries for select
  to authenticated
  using (public.is_household_member(household_id));

drop policy if exists entries_insert_member on public.entries;
create policy entries_insert_member
  on public.entries for insert
  to authenticated
  with check (
    public.is_household_member(household_id)
    and created_by = auth.uid()
  );

drop policy if exists entries_update_creator_only on public.entries;
create policy entries_update_creator_only
  on public.entries for update
  to authenticated
  using (public.is_household_member(household_id) and created_by = auth.uid())
  with check (public.is_household_member(household_id) and created_by = auth.uid());

drop policy if exists entry_lines_select_household on public.entry_lines;
create policy entry_lines_select_household
  on public.entry_lines for select
  to authenticated
  using (public.is_household_member(household_id));

drop policy if exists price_memory_select_household on public.price_memory;
create policy price_memory_select_household
  on public.price_memory for select
  to authenticated
  using (public.is_household_member(household_id));

-- 6. Realtime updates
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'entries'
  ) then
    alter publication supabase_realtime add table public.entries;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'entry_lines'
  ) then
    alter publication supabase_realtime add table public.entry_lines;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'price_memory'
  ) then
    alter publication supabase_realtime add table public.price_memory;
  end if;
end $$;
