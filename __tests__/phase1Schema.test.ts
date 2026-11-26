import fs from 'node:fs';
import path from 'node:path';

describe('Phase 1 Supabase SQL migration invariants', () => {
  const sqlPath = path.resolve(__dirname, '../supabase/migrations/0001_phase1_schema.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  test('enables RLS on all Phase 1 tables', () => {
    expect(sql).toMatch(/alter table public\.households enable row level security/i);
    expect(sql).toMatch(/alter table public\.members enable row level security/i);
    expect(sql).toMatch(/alter table public\.shops enable row level security/i);
    expect(sql).toMatch(/alter table public\.audit_log enable row level security/i);
  });

  test('locks currency to ETB and household capacity to 2 members with 1 super_admin', () => {
    expect(sql).toMatch(/currency_code = 'ETB'/);
    expect(sql).toMatch(/uq_household_super_admin/);
    expect(sql).toMatch(/v_count >= 2/);
  });

  test('enforces role checks, member needs_review flag, and super_admin shop merge RPC', () => {
    expect(sql).toMatch(/new\.needs_review := \(v_role <> 'super_admin'\)/);
    expect(sql).toMatch(/create or replace function public\.merge_shops/);
    expect(sql).toMatch(/only super_admin can merge shops/i);
    expect(sql).toMatch(/audit_log_select_super_admin/);
  });
});
