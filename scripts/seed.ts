import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { generateSeedPlan, generateSeedSql } from './seedPlan';

async function main() {
  const args = process.argv.slice(2);
  let householdId = args.find((a) => a.startsWith('--household-id='))?.split('=')[1];
  let userId = args.find((a) => a.startsWith('--user-id='))?.split('=')[1];
  const targetEmail =
    args.find((a) => a.startsWith('--email='))?.split('=')[1] ?? 'tensaylemessa@gmail.com';

  if (!args.includes('--force')) {
    console.log('[Qelet Seeder] Notice: Test seeding is disabled by default for production safety.');
    console.log('To run explicitly for local testing, invoke with: npx tsx scripts/seed.ts --force');
    return;
  }

  console.log(`[Qelet Seeder] Target email: ${targetEmail}`);

  if (!householdId || !userId) {
    try {
      const queryCmd = `npx supabase db query --remote --read-only "SELECT m.household_id, m.user_id, u.email FROM public.members m JOIN auth.users u ON m.user_id = u.id WHERE u.email = '${targetEmail}' LIMIT 1;"`;
      const output = execSync(queryCmd, { encoding: 'utf-8' });
      const parsed = JSON.parse(output);
      const row = parsed.rows?.[0];
      if (row) {
        householdId = row.household_id;
        userId = row.user_id;
        console.log(`[Qelet Seeder] Discovered household: ${householdId}, user: ${userId}`);
      }
    } catch (err) {
      console.warn('[Qelet Seeder] Discovery query failed, fallback to defaults', err);
    }
  }

  if (!householdId || !userId) {
    // Default to Tensay Lemessa's known ID from inspection
    householdId = '10445912-ea3b-475c-bbf9-c229799698f9';
    userId = '75c5a264-2565-45aa-885c-e9ace1487c4e';
    console.log(`[Qelet Seeder] Using static IDs for Tensay: ${householdId}`);
  }

  const plan = generateSeedPlan({ householdId, userId });
  console.log('[Qelet Seeder] Seed plan generated:');
  console.log(`  - Shops: ${plan.shops.length} (${plan.shops.map((s) => s.name).join(', ')})`);
  console.log(`  - Charges: ${plan.summary.chargeCount} (${plan.summary.totalChargeSantim / 100} ETB)`);
  console.log(`  - Payments: ${plan.summary.paymentCount} (${plan.summary.totalPaymentSantim / 100} ETB)`);
  console.log(`  - Net Balance: ${plan.summary.netBalanceSantim / 100} ETB`);
  console.log(`  - Item lines: ${plan.entryLines.length}`);

  const sql = generateSeedSql(plan);
  const tempSqlFile = path.resolve(__dirname, '.temp_seed.sql');
  fs.writeFileSync(tempSqlFile, sql, 'utf-8');

  try {
    console.log('[Qelet Seeder] Executing seed SQL on remote database via --file...');
    execSync(`npx supabase db query --remote --file "${tempSqlFile}" --yes`, { stdio: 'inherit' });
    console.log('[Qelet Seeder] Database seeded successfully!');
  } finally {
    if (fs.existsSync(tempSqlFile)) {
      fs.unlinkSync(tempSqlFile);
    }
  }
}

main().catch((err) => {
  console.error('[Qelet Seeder] Fatal error:', err);
  process.exit(1);
});
