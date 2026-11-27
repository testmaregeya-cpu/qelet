import fs from 'node:fs';
import path from 'node:path';

describe('Personal Expenses SQL migration invariants', () => {
  const sqlPath = path.resolve(__dirname, '../supabase/migrations/0010_personal_expenses.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  test('creates personal_expenses table with user foreign key and positive amount check', () => {
    expect(sql).toMatch(/create table if not exists public\.personal_expenses/i);
    expect(sql).toMatch(/user_id uuid not null references auth\.users\(id\) on delete cascade/i);
    expect(sql).toMatch(/amount_santim bigint not null check \(amount_santim > 0\)/i);
    expect(sql).toMatch(/payment_method in \('cash', 'telebirr', 'cbe_birr', 'bank', 'other'\)/i);
  });

  test('enforces idempotency index and user timeline performance index', () => {
    expect(sql).toMatch(/create unique index if not exists uq_personal_expenses_client_request/i);
    expect(sql).toMatch(/create index if not exists idx_personal_expenses_user_date/i);
  });

  test('strictly enforces Row Level Security with auth.uid() = user_id isolation', () => {
    expect(sql).toMatch(/alter table public\.personal_expenses enable row level security/i);
    expect(sql).toMatch(/using \(auth\.uid\(\) = user_id\)/i);
    expect(sql).toMatch(/with check \(auth\.uid\(\) = user_id\)/i);
    expect(sql).toMatch(/grant select, insert, update, delete on table public\.personal_expenses to authenticated/i);
  });
});
