-- Qelet Migration 0010: Private Personal Expenses with Strict User Isolation and RLS

create table if not exists public.personal_expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount_santim bigint not null check (amount_santim > 0),
  category text not null check (length(category) between 1 and 60),
  title text not null check (length(title) between 1 and 120),
  note text not null default '',
  expense_date date not null,
  payment_method text not null default 'cash' check (payment_method in ('cash', 'telebirr', 'cbe_birr', 'bank', 'other')),
  client_request_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Index on (user_id, expense_date) for fast personal timeline queries
create index if not exists idx_personal_expenses_user_date
  on public.personal_expenses (user_id, expense_date desc, created_at desc);

-- Idempotency key per user for offline synchronization & double-tap protection
create unique index if not exists uq_personal_expenses_client_request
  on public.personal_expenses (user_id, client_request_id)
  where client_request_id is not null;

-- Enable Row Level Security (RLS)
alter table public.personal_expenses enable row level security;

-- Policies: STRICT 100% user-level isolation. Cross-partner access is completely forbidden.
create policy "personal_expenses_select"
  on public.personal_expenses for select
  to authenticated
  using (auth.uid() = user_id);

create policy "personal_expenses_insert"
  on public.personal_expenses for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "personal_expenses_update"
  on public.personal_expenses for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "personal_expenses_delete"
  on public.personal_expenses for delete
  to authenticated
  using (auth.uid() = user_id);

grant select, insert, update, delete on table public.personal_expenses to authenticated;
