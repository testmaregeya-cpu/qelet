-- Qelet Phase 5 Schema: User Reminder Preferences, Push Tokens, and Server Alert Query Helper

-- 1. User settings table (per user inside their household)
create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  daily_reminder_enabled boolean not null default true,
  daily_reminder_hour int not null default 20 check (daily_reminder_hour between 0 and 23),
  daily_reminder_minute int not null default 0 check (daily_reminder_minute between 0 and 59),
  skip_if_logged_today boolean not null default false,
  window_open_alerts boolean not null default true,
  overdue_nudges boolean not null default true,
  partner_alerts boolean not null default true,
  theme_mode text not null default 'system' check (theme_mode in ('light', 'dark', 'system')),
  expo_push_token text,
  updated_at timestamptz not null default now()
);

create index if not exists idx_user_settings_household
  on public.user_settings (household_id);

create or replace function public.trg_user_settings_before_write()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_household_id uuid;
begin
  select m.household_id into v_household_id
  from public.members m
  where m.user_id = auth.uid();

  if v_household_id is null then
    raise exception 'Join a household before saving settings';
  end if;

  new.user_id := auth.uid();
  new.household_id := v_household_id;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists user_settings_before_write on public.user_settings;
create trigger user_settings_before_write
  before insert or update on public.user_settings
  for each row
  execute function public.trg_user_settings_before_write();

-- 2. RLS on user_settings (strictly own row)
alter table public.user_settings enable row level security;

drop policy if exists user_settings_select_self on public.user_settings;
create policy user_settings_select_self
  on public.user_settings for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists user_settings_insert_self on public.user_settings;
create policy user_settings_insert_self
  on public.user_settings for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists user_settings_update_self on public.user_settings;
create policy user_settings_update_self
  on public.user_settings for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- 3. Service-role helper for scheduled day-24 and day-27+ Edge Function reminders
create or replace function public.get_unpaid_shop_balances_for_alerts()
returns table (
  household_id uuid,
  shop_id uuid,
  shop_name text,
  balance_santim bigint,
  user_id uuid,
  expo_push_token text,
  window_open_alerts boolean,
  overdue_nudges boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with shop_balances as (
    select
      s.household_id,
      s.id as shop_id,
      s.name as shop_name,
      coalesce(sum(
        case
          when e.voided then 0
          when e.type = 'charge' then e.total_amount_santim
          when e.type = 'payment' then -e.total_amount_santim
          else 0
        end
      ), 0)::bigint as balance_santim
    from public.shops s
    left join public.entries e on e.shop_id = s.id
    where s.archived = false
      and s.merged_into_shop_id is null
    group by s.household_id, s.id, s.name
  )
  select
    sb.household_id,
    sb.shop_id,
    sb.shop_name,
    sb.balance_santim,
    us.user_id,
    us.expo_push_token,
    us.window_open_alerts,
    us.overdue_nudges
  from shop_balances sb
  join public.user_settings us on us.household_id = sb.household_id
  where sb.balance_santim > 0
    and us.expo_push_token is not null
    and char_length(btrim(us.expo_push_token)) > 0;
$$;

revoke all on function public.get_unpaid_shop_balances_for_alerts() from public;
revoke all on function public.get_unpaid_shop_balances_for_alerts() from authenticated;
grant execute on function public.get_unpaid_shop_balances_for_alerts() to service_role;
