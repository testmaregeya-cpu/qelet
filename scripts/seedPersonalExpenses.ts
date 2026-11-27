import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

interface MockPersonalExpense {
  id: string;
  category: string;
  title: string;
  note: string;
  amount_santim: number;
  expense_date: string;
  payment_method: string;
}

export function generatePersonalSeedData(userId: string): MockPersonalExpense[] {
  return [
    // --- PREVIOUS MONTH (2026-10) ---
    {
      id: '00000000-0000-0000-5eed-000000000001',
      category: 'transport',
      title: 'Minibus Taxi',
      note: 'Megenagna to Stadium',
      amount_santim: 1500, // 15 ETB
      expense_date: '2026-10-04',
      payment_method: 'cash',
    },
    {
      id: '00000000-0000-0000-5eed-000000000002',
      category: 'transport',
      title: 'Minibus Taxi',
      note: 'Stadium to Bole',
      amount_santim: 2000, // 20 ETB
      expense_date: '2026-10-10',
      payment_method: 'cash',
    },
    {
      id: '00000000-0000-0000-5eed-000000000003',
      category: 'mobile',
      title: 'Ethio 100 ETB',
      note: 'Bought via Telebirr',
      amount_santim: 10000, // 100 ETB
      expense_date: '2026-10-08',
      payment_method: 'telebirr',
    },
    {
      id: '00000000-0000-0000-5eed-000000000004',
      category: 'mobile',
      title: 'Ethio 100 ETB',
      note: 'Voice package',
      amount_santim: 10000, // 100 ETB
      expense_date: '2026-10-22',
      payment_method: 'telebirr',
    },
    {
      id: '00000000-0000-0000-5eed-000000000005',
      category: 'food_coffee',
      title: 'Morning Bunna',
      note: 'Tomoca Bole',
      amount_santim: 4000, // 40 ETB
      expense_date: '2026-10-05',
      payment_method: 'cbe_birr',
    },
    {
      id: '00000000-0000-0000-5eed-000000000006',
      category: 'food_coffee',
      title: 'Macchiato & Sambusa',
      note: 'Quick breakfast',
      amount_santim: 6500, // 65 ETB
      expense_date: '2026-10-15',
      payment_method: 'telebirr',
    },
    {
      id: '00000000-0000-0000-5eed-000000000007',
      category: 'lunch_dining',
      title: 'Workday Lunch',
      note: 'Shiro & salad',
      amount_santim: 16000, // 160 ETB
      expense_date: '2026-10-14',
      payment_method: 'cbe_birr',
    },

    // --- CURRENT MONTH (2026-11) ---
    // Taxi & Transport (Spike: multiple rides including one large 450 ETB Feres ride)
    {
      id: '00000000-0000-0000-5eed-000000000010',
      category: 'transport',
      title: 'Ride / Feres',
      note: 'Bole to Piassa meeting',
      amount_santim: 28000, // 280 ETB
      expense_date: '2026-11-03',
      payment_method: 'telebirr',
    },
    {
      id: '00000000-0000-0000-5eed-000000000011',
      category: 'transport',
      title: 'Ride / Feres',
      note: 'Late night return',
      amount_santim: 45000, // 450 ETB (Splurge item)
      expense_date: '2026-11-07',
      payment_method: 'telebirr',
    },
    {
      id: '00000000-0000-0000-5eed-000000000012',
      category: 'transport',
      title: 'Bajaj Ride',
      note: 'Neighborhood ride',
      amount_santim: 3000, // 30 ETB
      expense_date: '2026-11-12',
      payment_method: 'cash',
    },
    {
      id: '00000000-0000-0000-5eed-000000000013',
      category: 'transport',
      title: 'Ride / Feres',
      note: 'To Bole Airport',
      amount_santim: 35000, // 350 ETB
      expense_date: '2026-11-18',
      payment_method: 'telebirr',
    },
    {
      id: '00000000-0000-0000-5eed-000000000014',
      category: 'transport',
      title: 'Minibus Taxi',
      note: 'Kazanchis to Megenagna',
      amount_santim: 2500, // 25 ETB
      expense_date: '2026-11-23',
      payment_method: 'cash',
    },

    // Mobile Card & Data (Frequent: 5 times)
    {
      id: '00000000-0000-0000-5eed-000000000020',
      category: 'mobile',
      title: 'Ethio 100 ETB',
      note: 'Telebirr 100 birr card',
      amount_santim: 10000, // 100 ETB
      expense_date: '2026-11-02',
      payment_method: 'telebirr',
    },
    {
      id: '00000000-0000-0000-5eed-000000000021',
      category: 'mobile',
      title: 'Weekly Data Package',
      note: 'Unlimited evening package',
      amount_santim: 18000, // 180 ETB
      expense_date: '2026-11-09',
      payment_method: 'telebirr',
    },
    {
      id: '00000000-0000-0000-5eed-000000000022',
      category: 'mobile',
      title: 'Ethio 100 ETB',
      note: 'Airtime refill',
      amount_santim: 10000, // 100 ETB
      expense_date: '2026-11-15',
      payment_method: 'telebirr',
    },
    {
      id: '00000000-0000-0000-5eed-000000000023',
      category: 'mobile',
      title: 'Ethio 50 ETB',
      note: 'Emergency card',
      amount_santim: 5000, // 50 ETB
      expense_date: '2026-11-20',
      payment_method: 'cash',
    },
    {
      id: '00000000-0000-0000-5eed-000000000024',
      category: 'mobile',
      title: 'Weekly Data Package',
      note: 'Weekly renewal',
      amount_santim: 18000, // 180 ETB
      expense_date: '2026-11-26',
      payment_method: 'telebirr',
    },

    // Coffee & Snacks (Habit: 6 times)
    {
      id: '00000000-0000-0000-5eed-000000000030',
      category: 'food_coffee',
      title: 'Morning Bunna',
      note: 'Jebena bunna',
      amount_santim: 3500, // 35 ETB
      expense_date: '2026-11-04',
      payment_method: 'cash',
    },
    {
      id: '00000000-0000-0000-5eed-000000000031',
      category: 'food_coffee',
      title: 'Macchiato',
      note: 'Work cafe',
      amount_santim: 5000, // 50 ETB
      expense_date: '2026-11-06',
      payment_method: 'telebirr',
    },
    {
      id: '00000000-0000-0000-5eed-000000000032',
      category: 'food_coffee',
      title: 'Morning Bunna',
      note: 'With colleagues',
      amount_santim: 4000, // 40 ETB
      expense_date: '2026-11-11',
      payment_method: 'cbe_birr',
    },
    {
      id: '00000000-0000-0000-5eed-000000000033',
      category: 'food_coffee',
      title: 'Macchiato & Sambusa',
      note: 'Afternoon tea',
      amount_santim: 7500, // 75 ETB
      expense_date: '2026-11-16',
      payment_method: 'cash',
    },
    {
      id: '00000000-0000-0000-5eed-000000000034',
      category: 'food_coffee',
      title: 'Juice / Smoothie',
      note: 'Avocado mango juice',
      amount_santim: 9000, // 90 ETB
      expense_date: '2026-11-21',
      payment_method: 'telebirr',
    },
    {
      id: '00000000-0000-0000-5eed-000000000035',
      category: 'food_coffee',
      title: 'Morning Bunna',
      note: 'Traditional coffee',
      amount_santim: 3500, // 35 ETB
      expense_date: '2026-11-25',
      payment_method: 'cash',
    },

    // Lunch & Dining
    {
      id: '00000000-0000-0000-5eed-000000000040',
      category: 'lunch_dining',
      title: 'Workday Lunch',
      note: 'Tibs firfir',
      amount_santim: 22000, // 220 ETB
      expense_date: '2026-11-05',
      payment_method: 'cbe_birr',
    },
    {
      id: '00000000-0000-0000-5eed-000000000041',
      category: 'lunch_dining',
      title: 'Fast Food',
      note: 'Burger & fries',
      amount_santim: 28000, // 280 ETB
      expense_date: '2026-11-17',
      payment_method: 'telebirr',
    },
    {
      id: '00000000-0000-0000-5eed-000000000042',
      category: 'lunch_dining',
      title: 'Dinner Out',
      note: 'Weekend family dinner',
      amount_santim: 42000, // 420 ETB
      expense_date: '2026-11-22',
      payment_method: 'cbe_birr',
    },

    // Groceries & Personal Care
    {
      id: '00000000-0000-0000-5eed-000000000050',
      category: 'groceries',
      title: 'Supermarket Snacks',
      note: 'Biscuits and juice',
      amount_santim: 14000, // 140 ETB
      expense_date: '2026-11-10',
      payment_method: 'telebirr',
    },
    {
      id: '00000000-0000-0000-5eed-000000000051',
      category: 'shopping',
      title: 'Haircut / Salon',
      note: 'Monthly grooming',
      amount_santim: 20000, // 200 ETB
      expense_date: '2026-11-14',
      payment_method: 'cash',
    },
  ];
}

export function generatePersonalSeedSql(userId: string, items: MockPersonalExpense[]): string {
  const lines: string[] = [
    '-- Qelet Personal Expense Seeder',
    'SET session_replication_role = \'replica\';',
    'DELETE FROM public.personal_expenses WHERE id::text LIKE \'00000000-0000-0000-5eed-%\';',
  ];

  for (const item of items) {
    const escapedTitle = item.title.replace(/'/g, "''");
    const escapedNote = item.note.replace(/'/g, "''");
    lines.push(
      `INSERT INTO public.personal_expenses (id, user_id, category, title, note, amount_santim, expense_date, payment_method) VALUES ('${item.id}', '${userId}', '${item.category}', '${escapedTitle}', '${escapedNote}', ${item.amount_santim}, '${item.expense_date}', '${item.payment_method}');`
    );
  }

  lines.push('SET session_replication_role = \'origin\';');
  return lines.join('\n');
}

async function main() {
  const args = process.argv.slice(2);
  let userId = args.find((a) => a.startsWith('--user-id='))?.split('=')[1];
  const targetEmail =
    args.find((a) => a.startsWith('--email='))?.split('=')[1] ?? 'tensaylemessa@gmail.com';

  if (!args.includes('--force')) {
    console.log('[Personal Expense Seeder] Notice: Pass --force to execute.');
    return;
  }

  if (!userId) {
    try {
      const queryCmd = `npx supabase db query --remote --read-only "SELECT id, email FROM auth.users WHERE email = '${targetEmail}' LIMIT 1;"`;
      const output = execSync(queryCmd, { encoding: 'utf-8' });
      const parsed = JSON.parse(output);
      const row = parsed.rows?.[0];
      if (row) {
        userId = row.id;
        console.log(`[Personal Expense Seeder] Found user: ${userId} (${row.email})`);
      }
    } catch {
      userId = '75c5a264-2565-45aa-885c-e9ace1487c4e'; // Fallback
    }
  }

  if (!userId) {
    userId = '75c5a264-2565-45aa-885c-e9ace1487c4e';
  }

  const items = generatePersonalSeedData(userId);
  console.log(`[Personal Expense Seeder] Generated ${items.length} realistic personal expenses for ${userId}`);

  const sql = generatePersonalSeedSql(userId, items);
  const tempSqlFile = path.resolve(__dirname, '.temp_personal_seed.sql');
  fs.writeFileSync(tempSqlFile, sql, 'utf-8');

  try {
    console.log('[Personal Expense Seeder] Executing seed SQL on remote database...');
    execSync(`npx supabase db query --remote --file "${tempSqlFile}" --yes`, { stdio: 'inherit' });
    console.log('[Personal Expense Seeder] Successfully seeded personal expenses!');
  } finally {
    if (fs.existsSync(tempSqlFile)) {
      fs.unlinkSync(tempSqlFile);
    }
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[Personal Expense Seeder] Fatal error:', err);
    process.exit(1);
  });
}
