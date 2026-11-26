-- Qelet Phase 4 Schema: Admin-Managed Categories, Catalog Items, and Line Catalog References

-- 1. Categories & Catalog Items tables
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  sort_order int not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index if not exists uq_active_category_per_household
  on public.categories (household_id, lower(btrim(name)))
  where archived = false;

create index if not exists idx_categories_household
  on public.categories (household_id, archived, sort_order, name);

create table if not exists public.catalog_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  default_unit text not null default 'pcs' check (char_length(btrim(default_unit)) between 1 and 20),
  default_price_santim bigint not null default 0 check (default_price_santim >= 0),
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index if not exists uq_active_catalog_item_per_household
  on public.catalog_items (household_id, lower(btrim(name)))
  where archived = false;

create index if not exists idx_catalog_items_household
  on public.catalog_items (household_id, archived, name);

-- Optional link from entry_lines back to catalog_items
alter table public.entry_lines
  add column if not exists catalog_item_id uuid references public.catalog_items(id) on delete set null;

-- 2. Triggers & Audit Logging for Categories and Catalog Items
create or replace function public.trg_categories_before_write()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_super_admin(coalesce(new.household_id, old.household_id)) then
    raise exception 'Only super_admin can manage categories';
  end if;
  new.name := btrim(new.name);
  if tg_op = 'UPDATE' and new.household_id <> old.household_id then
    raise exception 'Cannot change category household_id';
  end if;
  return new;
end;
$$;

drop trigger if exists categories_before_write on public.categories;
create trigger categories_before_write
  before insert or update on public.categories
  for each row
  execute function public.trg_categories_before_write();

create or replace function public.trg_categories_after_write()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  perform public.write_audit_log(
    new.household_id,
    auth.uid(),
    case when tg_op = 'INSERT' then 'category_created' else 'category_updated' end,
    'category',
    new.id,
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    to_jsonb(new)
  );
  return new;
end;
$$;

drop trigger if exists categories_after_write on public.categories;
create trigger categories_after_write
  after insert or update on public.categories
  for each row
  execute function public.trg_categories_after_write();

create or replace function public.trg_catalog_items_before_write()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_super_admin(coalesce(new.household_id, old.household_id)) then
    raise exception 'Only super_admin can manage catalog items';
  end if;
  new.name := btrim(new.name);
  new.default_unit := coalesce(nullif(btrim(new.default_unit), ''), 'pcs');
  if new.category_id is not null and not exists (
    select 1 from public.categories c
    where c.id = new.category_id and c.household_id = new.household_id
  ) then
    raise exception 'Category must belong to the same household';
  end if;
  if tg_op = 'UPDATE' and new.household_id <> old.household_id then
    raise exception 'Cannot change catalog item household_id';
  end if;
  return new;
end;
$$;

drop trigger if exists catalog_items_before_write on public.catalog_items;
create trigger catalog_items_before_write
  before insert or update on public.catalog_items
  for each row
  execute function public.trg_catalog_items_before_write();

create or replace function public.trg_catalog_items_after_write()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  perform public.write_audit_log(
    new.household_id,
    auth.uid(),
    case when tg_op = 'INSERT' then 'catalog_item_created' else 'catalog_item_updated' end,
    'catalog_item',
    new.id,
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    to_jsonb(new)
  );
  return new;
end;
$$;

drop trigger if exists catalog_items_after_write on public.catalog_items;
create trigger catalog_items_after_write
  after insert or update on public.catalog_items
  for each row
  execute function public.trg_catalog_items_after_write();

-- 3. Update create_charge_entry and edit_charge_entry to persist optional catalog_item_id
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
  v_catalog_item_id uuid;
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
    v_catalog_item_id := nullif(btrim(coalesce(v_line->>'catalog_item_id', '')), '')::uuid;
    if v_catalog_item_id is not null and not exists (
      select 1 from public.catalog_items ci
      where ci.id = v_catalog_item_id and ci.household_id = v_old_entry.household_id
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
      v_old_entry.household_id,
      p_entry_id,
      v_catalog_item_id,
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

-- 4. RLS on categories and catalog_items
alter table public.categories enable row level security;
alter table public.catalog_items enable row level security;

drop policy if exists categories_select_household on public.categories;
create policy categories_select_household
  on public.categories for select
  to authenticated
  using (public.is_household_member(household_id));

drop policy if exists categories_insert_super_admin on public.categories;
create policy categories_insert_super_admin
  on public.categories for insert
  to authenticated
  with check (public.is_super_admin(household_id));

drop policy if exists categories_update_super_admin on public.categories;
create policy categories_update_super_admin
  on public.categories for update
  to authenticated
  using (public.is_super_admin(household_id))
  with check (public.is_super_admin(household_id));

drop policy if exists catalog_items_select_household on public.catalog_items;
create policy catalog_items_select_household
  on public.catalog_items for select
  to authenticated
  using (public.is_household_member(household_id));

drop policy if exists catalog_items_insert_super_admin on public.catalog_items;
create policy catalog_items_insert_super_admin
  on public.catalog_items for insert
  to authenticated
  with check (public.is_super_admin(household_id));

drop policy if exists catalog_items_update_super_admin on public.catalog_items;
create policy catalog_items_update_super_admin
  on public.catalog_items for update
  to authenticated
  using (public.is_super_admin(household_id))
  with check (public.is_super_admin(household_id));

-- 5. Realtime publication
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'categories'
  ) then
    alter publication supabase_realtime add table public.categories;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'catalog_items'
  ) then
    alter publication supabase_realtime add table public.catalog_items;
  end if;
end $$;
