-- Qelet Migration 0011: Custom Personal Categories with User-level Isolation and RLS

create table if not exists public.personal_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(name) between 1 and 60),
  icon text not null default 'tag' check (length(icon) between 1 and 40),
  color text not null default '#0284C7' check (length(color) between 1 and 20),
  bg_color text not null default '#E0F2FE' check (length(bg_color) between 1 and 20),
  created_at timestamptz not null default now()
);

-- Index and unique constraint: user cannot have duplicate category names (case-insensitive)
create unique index if not exists uq_personal_categories_user_name
  on public.personal_categories (user_id, lower(name));

-- Fast lookup index by user
create index if not exists idx_personal_categories_user
  on public.personal_categories (user_id, created_at asc);

-- Enable Row Level Security (RLS)
alter table public.personal_categories enable row level security;

-- Policies: STRICT 100% user-level isolation. Cross-partner access is completely forbidden.
create policy "personal_categories_select"
  on public.personal_categories for select
  to authenticated
  using (auth.uid() = user_id);

create policy "personal_categories_insert"
  on public.personal_categories for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "personal_categories_update"
  on public.personal_categories for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "personal_categories_delete"
  on public.personal_categories for delete
  to authenticated
  using (auth.uid() = user_id);

grant select, insert, update, delete on table public.personal_categories to authenticated;
