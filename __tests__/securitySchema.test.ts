import fs from 'node:fs';
import path from 'node:path';

describe('Security hardening SQL migration & Edge Functions invariants', () => {
  const readFile = (relPath: string) =>
    fs.readFileSync(path.resolve(__dirname, '..', relPath), 'utf8');

  test('Migration 0008 revokes direct entry writes, enforces idempotency, CSPRNG invites, and indexes', () => {
    const sql = readFile('supabase/migrations/0008_security_idempotency_indexes.sql');
    expect(sql).toMatch(/revoke insert, update on table public\.entries from authenticated/i);
    expect(sql).toMatch(/client_request_id uuid/i);
    expect(sql).toMatch(/uq_entries_client_request/i);
    expect(sql).toMatch(/p_client_request_id uuid default null/i);
    expect(sql).toMatch(/gen_random_bytes/i);
    expect(sql).toMatch(/idx_entry_lines_household/i);
    expect(sql).toMatch(/idx_price_memory_household/i);
    expect(sql).toMatch(/idx_disputes_entry_id/i);
  });

  test('notify-partner Edge Function fails closed when QELET_WEBHOOK_SECRET is missing or mismatched', () => {
    const code = readFile('supabase/functions/notify-partner/index.ts');
    expect(code).toMatch(/!webhookSecret\s*\|\|/);
    expect(code).not.toMatch(/if\s*\(\s*webhookSecret\s*&&/);
  });

  test('scheduled-reminders Edge Function fails closed when QELET_CRON_SECRET is missing or mismatched', () => {
    const code = readFile('supabase/functions/scheduled-reminders/index.ts');
    expect(code).toMatch(/!cronSecret\s*\|\|/);
    expect(code).not.toMatch(/if\s*\(\s*cronSecret\s*&&/);
  });
});
