export interface SeedShop {
  id: string;
  household_id: string;
  name: string;
  created_by: string;
}

export interface SeedEntry {
  id: string;
  household_id: string;
  shop_id: string;
  type: 'charge' | 'payment';
  entry_date: string;
  bill_month: string | null;
  total_amount_santim: number;
  note: string;
  created_by: string;
}

export interface SeedEntryLine {
  id: string;
  household_id: string;
  entry_id: string;
  item_name: string;
  quantity_milli: number;
  unit: string;
  unit_price_santim: number;
  line_total_santim: number;
  sort_order: number;
}

export interface SeedPlan {
  shops: SeedShop[];
  entries: SeedEntry[];
  entryLines: SeedEntryLine[];
  summary: {
    shopCount: number;
    chargeCount: number;
    paymentCount: number;
    totalChargeSantim: number;
    totalPaymentSantim: number;
    netBalanceSantim: number;
  };
}

export const ETHIOPIAN_SHOP_TEMPLATES = [
  { idSuffix: '0001', name: 'Abebe Suq' },
  { idSuffix: '0002', name: 'Bole Mini Market' },
  { idSuffix: '0003', name: 'Shoa Bakery' },
  { idSuffix: '0004', name: 'Merkato Butcher' },
];

export const ETHIOPIAN_STAPLE_ITEMS = [
  { name: 'Sugar (ስኳር)', defaultUnit: 'kg', defaultPriceSantim: 13000 },
  { name: 'Milk (ወተት)', defaultUnit: 'L', defaultPriceSantim: 8500 },
  { name: 'Cooking Oil (ዘይት)', defaultUnit: 'L', defaultPriceSantim: 22000 },
  { name: 'Bread (ዳቦ)', defaultUnit: 'pcs', defaultPriceSantim: 1000 },
  { name: 'Coffee (ቡና)', defaultUnit: 'kg', defaultPriceSantim: 45000 },
  { name: 'Pasta (ፓስታ)', defaultUnit: 'pcs', defaultPriceSantim: 7500 },
  { name: 'Soap (ሳሙና)', defaultUnit: 'pcs', defaultPriceSantim: 4500 },
  { name: 'Beef (የበሬ ሥጋ)', defaultUnit: 'kg', defaultPriceSantim: 85000 },
];

export function generateSeedPlan(params: {
  householdId: string;
  userId: string;
  billMonth?: string;
  currentDate?: string;
}): SeedPlan {
  const {
    householdId,
    userId,
    billMonth = '2026-11',
    currentDate = '2026-11-26',
  } = params;

  // Stable UUIDs derived from householdId and fixed suffixes
  const shops: SeedShop[] = ETHIOPIAN_SHOP_TEMPLATES.map((tmpl, idx) => ({
    id: `00000000-0000-0000-5eed-00000000000${idx + 1}`,
    household_id: householdId,
    name: tmpl.name,
    created_by: userId,
  }));

  const entries: SeedEntry[] = [
    // Entry 1: Abebe Suq (Charge: Sugar & Milk)
    {
      id: '00000000-0000-0000-5eed-100000000001',
      household_id: householdId,
      shop_id: shops[0].id,
      type: 'charge',
      entry_date: currentDate,
      bill_month: billMonth,
      total_amount_santim: 30000,
      note: 'Morning tea items',
      created_by: userId,
    },
    // Entry 2: Abebe Suq (Payment)
    {
      id: '00000000-0000-0000-5eed-100000000002',
      household_id: householdId,
      shop_id: shops[0].id,
      type: 'payment',
      entry_date: currentDate,
      bill_month: null,
      total_amount_santim: 15000,
      note: 'Partial telebirr cash settlement',
      created_by: userId,
    },
    // Entry 3: Bole Mini Market (Charge: Cooking Oil & Pasta)
    {
      id: '00000000-0000-0000-5eed-100000000003',
      household_id: householdId,
      shop_id: shops[1].id,
      type: 'charge',
      entry_date: currentDate,
      bill_month: billMonth,
      total_amount_santim: 37000,
      note: 'Dinner ingredients',
      created_by: userId,
    },
    // Entry 4: Shoa Bakery (Charge: 5 breads)
    {
      id: '00000000-0000-0000-5eed-100000000004',
      household_id: householdId,
      shop_id: shops[2].id,
      type: 'charge',
      entry_date: currentDate,
      bill_month: billMonth,
      total_amount_santim: 5000,
      note: 'Fresh morning bread',
      created_by: userId,
    },
    // Entry 5: Merkato Butcher (Charge: 1kg Beef)
    {
      id: '00000000-0000-0000-5eed-100000000005',
      household_id: householdId,
      shop_id: shops[3].id,
      type: 'charge',
      entry_date: currentDate,
      bill_month: billMonth,
      total_amount_santim: 85000,
      note: 'Sunday lunch beef',
      created_by: userId,
    },
    // Entry 6: Merkato Butcher (Payment)
    {
      id: '00000000-0000-0000-5eed-100000000006',
      household_id: householdId,
      shop_id: shops[3].id,
      type: 'payment',
      entry_date: currentDate,
      bill_month: null,
      total_amount_santim: 50000,
      note: 'CBE mobile transfer',
      created_by: userId,
    },
  ];

  const entryLines: SeedEntryLine[] = [
    // Lines for Entry 1 (Abebe Suq charge: Sugar 1kg + Milk 2L = 13000 + 17000 = 30000)
    {
      id: '00000000-0000-0000-5eed-200000000001',
      household_id: householdId,
      entry_id: entries[0].id,
      item_name: 'Sugar (ስኳር)',
      quantity_milli: 1000,
      unit: 'kg',
      unit_price_santim: 13000,
      line_total_santim: 13000,
      sort_order: 1,
    },
    {
      id: '00000000-0000-0000-5eed-200000000002',
      household_id: householdId,
      entry_id: entries[0].id,
      item_name: 'Milk (ወተት)',
      quantity_milli: 2000,
      unit: 'L',
      unit_price_santim: 8500,
      line_total_santim: 17000,
      sort_order: 2,
    },
    // Lines for Entry 3 (Bole Mini Market charge: Cooking Oil 1L + Pasta 2pcs)
    {
      id: '00000000-0000-0000-5eed-200000000003',
      household_id: householdId,
      entry_id: entries[2].id,
      item_name: 'Cooking Oil (ዘይት)',
      quantity_milli: 1000,
      unit: 'L',
      unit_price_santim: 22000,
      line_total_santim: 22000,
      sort_order: 1,
    },
    {
      id: '00000000-0000-0000-5eed-200000000004',
      household_id: householdId,
      entry_id: entries[2].id,
      item_name: 'Pasta (ፓስታ)',
      quantity_milli: 2000,
      unit: 'pcs',
      unit_price_santim: 7500,
      line_total_santim: 15000,
      sort_order: 2,
    },
    // Lines for Entry 4 (Shoa Bakery: Bread 5pcs)
    {
      id: '00000000-0000-0000-5eed-200000000005',
      household_id: householdId,
      entry_id: entries[3].id,
      item_name: 'Bread (ዳबो)',
      quantity_milli: 5000,
      unit: 'pcs',
      unit_price_santim: 1000,
      line_total_santim: 5000,
      sort_order: 1,
    },
    // Lines for Entry 5 (Merkato Butcher: Beef 1kg)
    {
      id: '00000000-0000-0000-5eed-200000000006',
      household_id: householdId,
      entry_id: entries[4].id,
      item_name: 'Beef (የበሬ ሥጋ)',
      quantity_milli: 1000,
      unit: 'kg',
      unit_price_santim: 85000,
      line_total_santim: 85000,
      sort_order: 1,
    },
  ];

  const totalChargeSantim = entries
    .filter((e) => e.type === 'charge')
    .reduce((sum, e) => sum + e.total_amount_santim, 0);

  const totalPaymentSantim = entries
    .filter((e) => e.type === 'payment')
    .reduce((sum, e) => sum + e.total_amount_santim, 0);

  return {
    shops,
    entries,
    entryLines,
    summary: {
      shopCount: shops.length,
      chargeCount: entries.filter((e) => e.type === 'charge').length,
      paymentCount: entries.filter((e) => e.type === 'payment').length,
      totalChargeSantim,
      totalPaymentSantim,
      netBalanceSantim: totalChargeSantim - totalPaymentSantim,
    },
  };
}

export function generateSeedSql(plan: SeedPlan): string {
  const shopInserts = plan.shops
    .map(
      (s) =>
        `INSERT INTO public.shops (id, household_id, name, created_by, archived, needs_review)
VALUES ('${s.id}', '${s.household_id}', '${s.name}', '${s.created_by}', false, false)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, archived = false;`
    )
    .join('\n');

  const entryInserts = plan.entries
    .map(
      (e) => {
        const billMonthVal = e.bill_month ? `'${e.bill_month}'` : 'NULL';
        return `INSERT INTO public.entries (id, household_id, shop_id, type, entry_date, bill_month, total_amount_santim, note, created_by)
VALUES ('${e.id}', '${e.household_id}', '${e.shop_id}', '${e.type}', '${e.entry_date}', ${billMonthVal}, ${e.total_amount_santim}, '${e.note}', '${e.created_by}')
ON CONFLICT (id) DO UPDATE SET total_amount_santim = EXCLUDED.total_amount_santim, note = EXCLUDED.note, voided = false;`;
      }
    )
    .join('\n');

  const lineInserts = plan.entryLines
    .map(
      (l) =>
        `INSERT INTO public.entry_lines (id, household_id, entry_id, item_name, quantity_milli, unit, unit_price_santim, line_total_santim, sort_order)
VALUES ('${l.id}', '${l.household_id}', '${l.entry_id}', '${l.item_name}', ${l.quantity_milli}, '${l.unit}', ${l.unit_price_santim}, ${l.line_total_santim}, ${l.sort_order})
ON CONFLICT (id) DO UPDATE SET quantity_milli = EXCLUDED.quantity_milli, unit_price_santim = EXCLUDED.unit_price_santim, line_total_santim = EXCLUDED.line_total_santim;`
    )
    .join('\n');

  return `SET session_replication_role = 'replica';
BEGIN;
${shopInserts}
${entryInserts}
${lineInserts}
COMMIT;
SET session_replication_role = 'origin';`;
}
