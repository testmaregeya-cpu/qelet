import { calculateShopLedgerSummary } from '../src/domain/billing';
import { computeMonthlyInsights, getAvailableInsightMonths } from '../src/domain/insights';
import {
  buildEntriesCsv,
  buildShopStatementHtml,
  buildShopStatementText,
} from '../src/lib/statement';
import type { Member, Shop } from '../src/types/phase1';
import type { LedgerEntry } from '../src/types/phase2';

const members: Member[] = [
  {
    user_id: 'u1',
    household_id: 'h1',
    role: 'super_admin',
    display_name: 'Tensay',
    avatar_color: '#146C43',
    joined_at: '2026-11-01T00:00:00Z',
  },
  {
    user_id: 'u2',
    household_id: 'h1',
    role: 'member',
    display_name: 'Girlfriend',
    avatar_color: '#B45309',
    joined_at: '2026-11-01T00:05:00Z',
  },
];

const shops: Shop[] = [
  {
    id: 's1',
    household_id: 'h1',
    name: 'Abebe Mini Mart',
    archived: false,
    needs_review: false,
    merged_into_shop_id: null,
    created_by: 'u1',
    created_at: '2026-11-01T00:00:00Z',
    updated_at: '2026-11-01T00:00:00Z',
  },
  {
    id: 's2',
    household_id: 'h1',
    name: 'Selam Bakery',
    archived: false,
    needs_review: false,
    merged_into_shop_id: null,
    created_by: 'u2',
    created_at: '2026-11-01T00:00:00Z',
    updated_at: '2026-11-01T00:00:00Z',
  },
];

const sampleEntries: LedgerEntry[] = [
  {
    id: 'e1',
    household_id: 'h1',
    shop_id: 's1',
    type: 'charge',
    entry_date: '2026-11-10',
    bill_month: '2026-11',
    total_amount_santim: 30_000,
    note: '',
    created_by: 'u1',
    created_at: '2026-11-10T09:00:00Z',
    edited_at: null,
    edit_count: 0,
    voided: false,
    voided_by: null,
    voided_at: null,
    void_reason: null,
    entry_lines: [
      {
        id: 'l1',
        household_id: 'h1',
        entry_id: 'e1',
        item_name: 'Milk',
        quantity_milli: 2000,
        unit: 'L',
        unit_price_santim: 15_000,
        line_total_santim: 30_000,
        sort_order: 0,
      },
    ],
  },
  {
    id: 'e2',
    household_id: 'h1',
    shop_id: 's2',
    type: 'charge',
    entry_date: '2026-11-12',
    bill_month: '2026-11',
    total_amount_santim: 10_000,
    note: 'Morning bread',
    created_by: 'u2',
    created_at: '2026-11-12T08:00:00Z',
    edited_at: null,
    edit_count: 0,
    voided: false,
    voided_by: null,
    voided_at: null,
    void_reason: null,
    entry_lines: [
      {
        id: 'l2',
        household_id: 'h1',
        entry_id: 'e2',
        item_name: 'Bread',
        quantity_milli: 4000,
        unit: 'pcs',
        unit_price_santim: 2500,
        line_total_santim: 10_000,
        sort_order: 0,
      },
    ],
  },
  {
    id: 'e3',
    household_id: 'h1',
    shop_id: 's1',
    type: 'payment',
    entry_date: '2026-11-24',
    bill_month: null,
    total_amount_santim: 20_000,
    note: 'Telebirr',
    created_by: 'u1',
    created_at: '2026-11-24T12:00:00Z',
    edited_at: null,
    edit_count: 0,
    voided: false,
    voided_by: null,
    voided_at: null,
    void_reason: null,
  },
];

describe('Phase 6 monthly insights and Telegram/WhatsApp/PDF/CSV statements', () => {
  test('aggregates monthly insights by person, shop, and top items', () => {
    const months = getAvailableInsightMonths(sampleEntries, '2026-11-25');
    expect(months).toEqual(['2026-11']);

    const report = computeMonthlyInsights(sampleEntries, shops, members, '2026-11');
    expect(report.totalChargedSantim).toBe(40_000);
    expect(report.totalPaidSantim).toBe(20_000);

    expect(report.byPerson[0]).toMatchObject({
      displayName: 'Tensay',
      chargedSantim: 30_000,
      paidSantim: 20_000,
      sharePercent: 75,
    });
    expect(report.byPerson[1]).toMatchObject({
      displayName: 'Girlfriend',
      chargedSantim: 10_000,
      paidSantim: 0,
      sharePercent: 25,
    });

    expect(report.byShop.map((s) => s.shopName)).toEqual(['Abebe Mini Mart', 'Selam Bakery']);
    expect(report.topItems[0]).toMatchObject({ itemName: 'Milk', totalSantim: 30_000 });
  });

  test('builds readable text, escaped HTML PDF statement, and CSV export', () => {
    const shopEntries = sampleEntries.filter((e) => e.shop_id === 's1');
    const summary = calculateShopLedgerSummary(shopEntries, '2026-11-25');

    const text = buildShopStatementText({
      householdName: 'Our Shop Tab',
      shopName: 'Abebe Mini Mart',
      generatedDate: '2026-11-25',
      summary,
      entries: shopEntries,
      members,
    });
    expect(text).toContain('QELET SHOP STATEMENT');
    expect(text).toContain('Current Balance Owed: 100 ETB');
    expect(text).toContain('2 L Milk = 300 ETB');

    const html = buildShopStatementHtml({
      householdName: 'Our <Tab>',
      shopName: 'Abebe Mini Mart',
      generatedDate: '2026-11-25',
      summary,
      entries: shopEntries,
      members,
    });
    expect(html).toContain('Our &lt;Tab&gt;');
    expect(html).toContain('100 ETB');

    const csv = buildEntriesCsv(sampleEntries, shops, members);
    expect(csv).toContain('entry_id,entry_date,bill_month,shop,type,added_by,total_etb');
    expect(csv).toContain('Abebe Mini Mart');
    expect(csv).toContain('300.00');
  });
});
