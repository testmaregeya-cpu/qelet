import fs from 'node:fs';
import path from 'node:path';

describe('Personal Categories SQL migration invariants', () => {
  const sqlPath = path.resolve(__dirname, '../supabase/migrations/0011_personal_categories.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  test('creates personal_categories table with user foreign key and length constraints', () => {
    expect(sql).toMatch(/create table if not exists public\.personal_categories/i);
    expect(sql).toMatch(/user_id uuid not null references auth\.users\(id\) on delete cascade/i);
    expect(sql).toMatch(/name text not null check \(length\(name\) between 1 and 60\)/i);
    expect(sql).toMatch(/icon text not null default 'tag'/i);
  });

  test('enforces unique index per user on lower(name)', () => {
    expect(sql).toMatch(/create unique index if not exists uq_personal_categories_user_name/i);
    expect(sql).toMatch(/on public\.personal_categories \(user_id, lower\(name\)\)/i);
  });

  test('strictly enforces Row Level Security with auth.uid() = user_id isolation', () => {
    expect(sql).toMatch(/alter table public\.personal_categories enable row level security/i);
    expect(sql).toMatch(/using \(auth\.uid\(\) = user_id\)/i);
    expect(sql).toMatch(/with check \(auth\.uid\(\) = user_id\)/i);
    expect(sql).toMatch(/grant select, insert, update, delete on table public\.personal_categories to authenticated/i);
  });
});
