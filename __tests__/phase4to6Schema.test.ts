import fs from 'node:fs';
import path from 'node:path';

describe('Phase 4–6 Supabase SQL migration security invariants', () => {
  const readSql = (name: string) =>
    fs.readFileSync(path.resolve(__dirname, `../supabase/migrations/${name}`), 'utf8');

  test('Phase 4 enforces super_admin RLS on categories and catalog_items', () => {
    const sql = readSql('0004_phase4_catalog.sql');
    expect(sql).toMatch(/alter table public\.categories enable row level security/i);
    expect(sql).toMatch(/alter table public\.catalog_items enable row level security/i);
    expect(sql).toMatch(/categories_insert_super_admin/i);
    expect(sql).toMatch(/catalog_items_update_super_admin/i);
    expect(sql).toMatch(/only super_admin can manage catalog items/i);
  });

  test('Phase 5 locks user_settings to self and restricts alert query to service_role', () => {
    const sql = readSql('0005_phase5_reminders.sql');
    expect(sql).toMatch(/alter table public\.user_settings enable row level security/i);
    expect(sql).toMatch(/user_settings_update_self/i);
    expect(sql).toMatch(/revoke all on function public\.get_unpaid_shop_balances_for_alerts\(\) from authenticated/i);
    expect(sql).toMatch(/grant execute on function public\.get_unpaid_shop_balances_for_alerts\(\) to service_role/i);
  });

  test('Phase 6 restricts export_household_data to super_admin and writes audit log', () => {
    const sql = readSql('0006_phase6_admin_export.sql');
    expect(sql).toMatch(/only super_admin can export all household data/i);
    expect(sql).toMatch(/data_exported/i);
    expect(sql).toMatch(/household_login/i);
  });

  test('Migration 0007 grants least-privilege table permissions to authenticated and service_role', () => {
    const sql = readSql('0007_role_grants.sql');
    expect(sql).toMatch(/grant select, insert, update on table public\.shops to authenticated/i);
    expect(sql).toMatch(/grant select on table public\.audit_log to authenticated/i);
    expect(sql).toMatch(/grant all on all tables in schema public to service_role/i);
    expect(sql).not.toMatch(/to anon/i);
  });
});
