-- Qelet Phase 1 Schema: Auth-backed Households, Members (Roles), Shops, and Server Audit Log
-- Currency: ETB only (integer santim will be enforced on ledger tables in Phase 2)
-- Timezone convention: Africa/Addis_Ababa (UTC+3)

create extension if not exists pgcrypto;

-- 1. Tables
create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  currency_code text not null default 'ETB' check (currency_code = 'ETB'),
  invite_code text not null unique check (invite_code ~ '^[A-Z2-9]{6}$'),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  role text not null check (role in ('super_admin', 'member')),
  display_name text not null check (char_length(btrim(display_name)) between 1 and 50),
  avatar_color text not null default '#1E6B52' check (avatar_color ~ '^#[0-9A-Fa-f]{6}$'),
  joined_at timestamptz not null default now()
);

-- Only one super_admin per household
create unique index if not exists uq_household_super_admin
  on public.members (household_id)
  where role = 'super_admin';

create index if not exists idx_members_household_id
  on public.members (household_id);

create table if not exists public.shops (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  archived boolean not null default false,
  needs_review boolean not null default false,
  merged_into_shop_id uuid references public.shops(id),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_shop_not_merged_into_self check (merged_into_shop_id is null or merged_into_shop_id <> id)
);

-- Prevent duplicate active shop names (case-insensitive) inside the same household
create unique index if not exists uq_active_shop_name_per_household
  on public.shops (household_id, lower(btrim(name)))
  where archived = false and merged_into_shop_id is null;

create index if not exists idx_shops_household_active
  on public.shops (household_id, archived, name);

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  at timestamptz not null default now(),
  actor_id uuid references auth.users(id),
  action text not null,
  object_type text not null,
  object_id uuid not null,
  before_data jsonb,
  after_data jsonb
);

create index if not exists idx_audit_log_household_at
  on public.audit_log (household_id, at desc);

-- 2. Security helper functions
create or replace function public.is_household_member(p_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.members m
    where m.household_id = p_household_id
      and m.user_id = auth.uid()
  );
$$;

create or replace function public.is_super_admin(p_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.members m
    where m.household_id = p_household_id
      and m.user_id = auth.uid()
      and m.role = 'super_admin'
  );
$$;

create or replace function public.generate_invite_code()
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  chars constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text;
  attempts int := 0;
begin
  loop
    attempts := attempts + 1;
    code := '';
    for i in 1..6 loop
      code := code || substr(chars, 1 + floor(random() * length(chars))::int, 1);
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

create or replace function public.write_audit_log(
  p_household_id uuid,
  p_actor_id uuid,
  p_action text,
  p_object_type text,
  p_object_id uuid,
  p_before jsonb,
  p_after jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_log (
    household_id, actor_id, action, object_type, object_id, before_data, after_data
  )
  values (
    p_household_id, p_actor_id, p_action, p_object_type, p_object_id, p_before, p_after
  );
end;
$$;

-- 3. Integrity & server-driven audit triggers
create or replace function public.trg_members_before_update()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if new.user_id <> old.user_id or new.household_id <> old.household_id or new.role <> old.role then
    raise exception 'Role, user_id, and household_id cannot be changed';
  end if;
  new.display_name := btrim(new.display_name);
  return new;
end;
$$;

drop trigger if exists members_before_update on public.members;
create trigger members_before_update
  before update on public.members
  for each row
  execute function public.trg_members_before_update();

create or replace function public.trg_shops_before_write()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_role text;
begin
  new.name := btrim(new.name);

  if tg_op = 'INSERT' then
    select m.role into v_role
    from public.members m
    where m.user_id = auth.uid()
      and m.household_id = new.household_id;

    if v_role is null then
      raise exception 'Not a member of this household';
    end if;

    new.created_by := auth.uid();
    new.archived := false;
    new.merged_into_shop_id := null;
    -- Members always create shops flagged for super_admin review
    new.needs_review := (v_role <> 'super_admin');
    new.created_at := now();
    new.updated_at := now();
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if not public.is_super_admin(old.household_id) and coalesce(current_setting('qelet.internal_rpc', true), '') <> 'true' then
      raise exception 'Only super_admin can update shops';
    end if;

    if new.household_id <> old.household_id
       or new.created_by <> old.created_by
       or new.created_at <> old.created_at then
      raise exception 'Immutable shop metadata cannot be modified';
    end if;

    new.updated_at := now();
    return new;
  end if;

  return new;
end;
$$;

drop trigger if exists shops_before_write on public.shops;
create trigger shops_before_write
  before insert or update on public.shops
  for each row
  execute function public.trg_shops_before_write();

create or replace function public.trg_shops_after_write()
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
      'shop_created',
      'shop',
      new.id,
      null,
      to_jsonb(new)
    );
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.merged_into_shop_id is not null and old.merged_into_shop_id is null then
      v_action := 'shop_merged';
    elsif old.archived = false and new.archived = true then
      v_action := 'shop_archived';
    elsif old.archived = true and new.archived = false then
      v_action := 'shop_unarchived';
    elsif old.needs_review = true and new.needs_review = false then
      v_action := 'shop_approved';
    else
      v_action := 'shop_updated';
    end if;

    perform public.write_audit_log(
      new.household_id,
      auth.uid(),
      v_action,
      'shop',
      new.id,
      to_jsonb(old),
      to_jsonb(new)
    );
    return new;
  end if;

  return new;
end;
$$;

drop trigger if exists shops_after_write on public.shops;
create trigger shops_after_write
  after insert or update on public.shops
  for each row
  execute function public.trg_shops_after_write();

-- 4. RPCs for household creation, 2-member invite linking, and super_admin shop merge
create or replace function public.create_household(
  p_household_name text,
  p_display_name text,
  p_avatar_color text default '#1E6B52'
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_household public.households;
  v_member public.members;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  if exists (select 1 from public.members where user_id = v_uid) then
    raise exception 'User already belongs to a household';
  end if;

  insert into public.households (name, currency_code, invite_code, created_by)
  values (
    btrim(p_household_name),
    'ETB',
    public.generate_invite_code(),
    v_uid
  )
  returning * into v_household;

  insert into public.members (user_id, household_id, role, display_name, avatar_color)
  values (
    v_uid,
    v_household.id,
    'super_admin',
    btrim(p_display_name),
    coalesce(nullif(btrim(p_avatar_color), ''), '#1E6B52')
  )
  returning * into v_member;

  perform public.write_audit_log(
    v_household.id,
    v_uid,
    'household_created',
    'household',
    v_household.id,
    null,
    to_jsonb(v_household)
  );

  perform public.write_audit_log(
    v_household.id,
    v_uid,
    'member_joined',
    'member',
    v_uid,
    null,
    to_jsonb(v_member)
  );

  return jsonb_build_object(
    'household', to_jsonb(v_household),
    'member', to_jsonb(v_member)
  );
end;
$$;

create or replace function public.join_household_by_code(
  p_invite_code text,
  p_display_name text,
  p_avatar_color text default '#B45309'
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_household public.households;
  v_member public.members;
  v_count int;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  if exists (select 1 from public.members where user_id = v_uid) then
    raise exception 'User already belongs to a household';
  end if;

  select *
  into v_household
  from public.households
  where invite_code = upper(btrim(p_invite_code))
  for update;

  if not found then
    raise exception 'Invalid invite code';
  end if;

  select count(*) into v_count
  from public.members
  where household_id = v_household.id;

  if v_count >= 2 then
    raise exception 'Household already has two members';
  end if;

  insert into public.members (user_id, household_id, role, display_name, avatar_color)
  values (
    v_uid,
    v_household.id,
    'member',
    btrim(p_display_name),
    coalesce(nullif(btrim(p_avatar_color), ''), '#B45309')
  )
  returning * into v_member;

  perform public.write_audit_log(
    v_household.id,
    v_uid,
    'member_joined',
    'member',
    v_uid,
    null,
    to_jsonb(v_member)
  );

  return jsonb_build_object(
    'household', to_jsonb(v_household),
    'member', to_jsonb(v_member)
  );
end;
$$;

create or replace function public.rotate_invite_code(p_household_id uuid)
returns text
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_new_code text;
  v_old_household public.households;
  v_new_household public.households;
begin
  if not public.is_super_admin(p_household_id) then
    raise exception 'Only super_admin can rotate invite code';
  end if;

  select * into v_old_household from public.households where id = p_household_id for update;
  v_new_code := public.generate_invite_code();

  update public.households
  set invite_code = v_new_code
  where id = p_household_id
  returning * into v_new_household;

  perform public.write_audit_log(
    p_household_id,
    auth.uid(),
    'invite_code_rotated',
    'household',
    p_household_id,
    to_jsonb(v_old_household),
    to_jsonb(v_new_household)
  );

  return v_new_code;
end;
$$;

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

  -- Phase 2 will also move entries and price_memory rows here atomically.
  perform set_config('qelet.internal_rpc', 'true', true);

  update public.shops
  set archived = true,
      needs_review = false,
      merged_into_shop_id = p_target_shop_id
  where id = p_source_shop_id
  returning * into v_updated;

  return v_updated;
end;
$$;

-- Lock down RPC execution strictly to authenticated users
revoke all on function public.is_household_member(uuid) from public;
revoke all on function public.is_super_admin(uuid) from public;
revoke all on function public.generate_invite_code() from public;
revoke all on function public.write_audit_log(uuid, uuid, text, text, uuid, jsonb, jsonb) from public;
revoke all on function public.create_household(text, text, text) from public;
revoke all on function public.join_household_by_code(text, text, text) from public;
revoke all on function public.rotate_invite_code(uuid) from public;
revoke all on function public.merge_shops(uuid, uuid) from public;

grant execute on function public.is_household_member(uuid) to authenticated;
grant execute on function public.is_super_admin(uuid) to authenticated;
grant execute on function public.create_household(text, text, text) to authenticated;
grant execute on function public.join_household_by_code(text, text, text) to authenticated;
grant execute on function public.rotate_invite_code(uuid) to authenticated;
grant execute on function public.merge_shops(uuid, uuid) to authenticated;

-- 5. Row Level Security (RLS)
alter table public.households enable row level security;
alter table public.members enable row level security;
alter table public.shops enable row level security;
alter table public.audit_log enable row level security;

-- Households: members read, super_admin can rename
drop policy if exists households_select_member on public.households;
create policy households_select_member
  on public.households for select
  to authenticated
  using (public.is_household_member(id));

drop policy if exists households_update_super_admin on public.households;
create policy households_update_super_admin
  on public.households for update
  to authenticated
  using (public.is_super_admin(id))
  with check (public.is_super_admin(id) and currency_code = 'ETB');

-- Members: household members read; users can update only their own display_name/avatar_color (trigger blocks role change)
drop policy if exists members_select_household on public.members;
create policy members_select_household
  on public.members for select
  to authenticated
  using (public.is_household_member(household_id));

drop policy if exists members_update_self on public.members;
create policy members_update_self
  on public.members for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Shops: household members read & create; only super_admin updates (never hard deleted)
drop policy if exists shops_select_household on public.shops;
create policy shops_select_household
  on public.shops for select
  to authenticated
  using (public.is_household_member(household_id));

drop policy if exists shops_insert_member on public.shops;
create policy shops_insert_member
  on public.shops for insert
  to authenticated
  with check (
    public.is_household_member(household_id)
    and created_by = auth.uid()
  );

drop policy if exists shops_update_super_admin on public.shops;
create policy shops_update_super_admin
  on public.shops for update
  to authenticated
  using (public.is_super_admin(household_id))
  with check (public.is_super_admin(household_id));

-- Audit log: read-only for super_admin; no direct client writes
drop policy if exists audit_log_select_super_admin on public.audit_log;
create policy audit_log_select_super_admin
  on public.audit_log for select
  to authenticated
  using (public.is_super_admin(household_id));

-- 6. Enable Realtime updates for live two-phone sync
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'shops'
  ) then
    alter publication supabase_realtime add table public.shops;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'members'
  ) then
    alter publication supabase_realtime add table public.members;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'households'
  ) then
    alter publication supabase_realtime add table public.households;
  end if;
end $$;
