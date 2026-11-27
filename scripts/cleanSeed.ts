import { execSync } from 'node:child_process';

async function main() {
  console.log('[Qelet Seeder] Removing any test seed data from remote database...');
  const sql = `SET session_replication_role = 'replica';
DELETE FROM public.entry_lines WHERE id::text LIKE '00000000-0000-0000-5eed-%';
DELETE FROM public.entries WHERE id::text LIKE '00000000-0000-0000-5eed-%';
DELETE FROM public.shops WHERE id::text LIKE '00000000-0000-0000-5eed-%';
DELETE FROM public.personal_expenses WHERE id::text LIKE '00000000-0000-0000-5eed-%';
SET session_replication_role = 'origin';`;

  execSync(`npx supabase db query --remote "${sql.replace(/\r?\n/g, ' ')}" --yes`, { stdio: 'inherit' });
  console.log('[Qelet Seeder] Remote database clean! Only real user data remains.');
}

main().catch((err) => {
  console.error('[Qelet Seeder] Failed to clean seed data:', err);
  process.exit(1);
});
