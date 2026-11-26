import fs from 'node:fs';
import path from 'node:path';

describe('Phase 3 Supabase SQL migration invariants', () => {
  const sqlPath = path.resolve(__dirname, '../supabase/migrations/0003_phase3_edit_void_disputes.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  test('enables RLS and single open-dispute uniqueness on disputes', () => {
    expect(sql).toMatch(/alter table public\.disputes enable row level security/i);
    expect(sql).toMatch(/uq_open_dispute_per_entry/i);
  });

  test('enforces partner-only dispute raise and creator-only dispute resolution in triggers', () => {
    expect(sql).toMatch(/if v_entry\.created_by = auth\.uid\(\) then/i);
    expect(sql).toMatch(/only the entry creator can resolve this dispute/i);
  });

  test('enforces creator-only edit/void RPCs and member-scoped get_entry_history', () => {
    expect(sql).toMatch(/create or replace function public\.edit_charge_entry/i);
    expect(sql).toMatch(/create or replace function public\.edit_payment_entry/i);
    expect(sql).toMatch(/create or replace function public\.void_entry/i);
    expect(sql).toMatch(/create or replace function public\.get_entry_history/i);
    expect(sql).toMatch(/only the person who added an entry can edit or void it/i);
  });
});
