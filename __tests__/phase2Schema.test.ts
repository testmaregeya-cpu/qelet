import fs from 'node:fs';
import path from 'node:path';

describe('Phase 2 Supabase SQL migration invariants', () => {
  const sqlPath = path.resolve(__dirname, '../supabase/migrations/0002_phase2_ledger.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  test('enables RLS on entries, entry_lines, and price_memory', () => {
    expect(sql).toMatch(/alter table public\.entries enable row level security/i);
    expect(sql).toMatch(/alter table public\.entry_lines enable row level security/i);
    expect(sql).toMatch(/alter table public\.price_memory enable row level security/i);
  });

  test('enforces creator-only updates and integer santim columns', () => {
    expect(sql).toMatch(/total_amount_santim bigint not null check \(total_amount_santim > 0\)/i);
    expect(sql).toMatch(/quantity_milli bigint not null check \(quantity_milli > 0\)/i);
    expect(sql).toMatch(/only the person who added an entry can edit or void it/i);
    expect(sql).toMatch(/entries_update_creator_only/i);
  });

  test('provides atomic charge/payment RPCs and updates merge_shops to move entries and price_memory', () => {
    expect(sql).toMatch(/create or replace function public\.create_charge_entry/i);
    expect(sql).toMatch(/create or replace function public\.create_payment_entry/i);
    expect(sql).toMatch(/update public\.entries\s+set shop_id = p_target_shop_id/i);
    expect(sql).toMatch(/delete from public\.price_memory\s+where shop_id = p_source_shop_id/i);
  });
});
