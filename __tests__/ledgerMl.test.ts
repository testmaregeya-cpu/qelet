import {
  computeHouseholdMlReport,
  detectShopPriceAnomalies,
  forecastHouseholdPaydayBill,
  predictSmartChargeSuggestions,
} from '../src/domain/ml/ledgerMl';
import type { Shop } from '../src/types/phase1';
import type { LedgerEntry } from '../src/types/phase2';
import type { ItemSuggestion } from '../src/types/phase4to6';

const shops: Shop[] = [
  {
    id: 's1',
    household_id: 'hh-1',
    name: 'Abebe Mini Mart',
    archived: false,
    needs_review: false,
    merged_into_shop_id: null,
    created_by: 'u1',
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
  },
  {
    id: 's2',
    household_id: 'hh-1',
    name: 'Selam Bakery',
    archived: false,
    needs_review: false,
    merged_into_shop_id: null,
    created_by: 'u2',
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
  },
];

function makeCharge(
  id: string,
  shopId: string,
  date: string,
  items: { name: string; unitPriceSantim: number; qtyMilli?: number; unit?: string }[]
): LedgerEntry {
  const lines = items.map((it, idx) => {
    const qty = it.qtyMilli ?? 1000;
    const total = Math.round((qty * it.unitPriceSantim) / 1000);
    return {
      id: `${id}-l${idx}`,
      household_id: 'hh-1',
      entry_id: id,
      item_name: it.name,
      quantity_milli: qty,
      unit: it.unit ?? 'pcs',
      unit_price_santim: it.unitPriceSantim,
      line_total_santim: total,
      sort_order: idx,
    };
  });
  return {
    id,
    household_id: 'hh-1',
    shop_id: shopId,
    type: 'charge',
    entry_date: date,
    bill_month: date.slice(0, 7),
    total_amount_santim: lines.reduce((s, l) => s + l.line_total_santim, 0),
    note: '',
    created_by: 'u1',
    created_at: `${date}T10:00:00Z`,
    edited_at: null,
    edit_count: 0,
    voided: false,
    voided_by: null,
    voided_at: null,
    void_reason: null,
    entry_lines: lines,
  };
}

describe('Household Shop Ledger On-Device ML', () => {
  const entries: LedgerEntry[] = [
    // Aug, Sep, Oct baseline (~300 ETB/mo at Abebe Mini Mart, Milk @ 150 ETB)
    makeCharge('aug-1', 's1', '2026-08-04', [
      { name: 'Milk', unitPriceSantim: 15000 },
      { name: 'Sugar', unitPriceSantim: 12000 },
    ]),
    makeCharge('sep-1', 's1', '2026-09-04', [
      { name: 'Milk', unitPriceSantim: 15000 },
      { name: 'Sugar', unitPriceSantim: 12000 },
    ]),
    makeCharge('oct-1', 's1', '2026-10-04', [
      { name: 'Milk', unitPriceSantim: 15500 },
      { name: 'Sugar', unitPriceSantim: 12000 },
    ]),
    // Selam Bakery weekly Bread habit + Milk+Bread co-occurrence
    makeCharge('nov-b1', 's2', '2026-11-01', [{ name: 'Bread', unitPriceSantim: 3000 }]),
    makeCharge('nov-b2', 's2', '2026-11-08', [{ name: 'Bread', unitPriceSantim: 3000 }]),
    makeCharge('nov-b3', 's2', '2026-11-15', [{ name: 'Bread', unitPriceSantim: 3000 }]),
    // Nov spike + Milk price hike from ~150 ETB -> 195 ETB (+30%)
    makeCharge('nov-m1', 's1', '2026-11-05', [
      { name: 'Milk', unitPriceSantim: 19500, qtyMilli: 2000 },
      { name: 'Sugar', unitPriceSantim: 12500 },
      { name: 'Cooking Oil', unitPriceSantim: 45000 },
    ]),
  ];

  it('ranks co-occurring basket items higher when Milk is already in the cart', () => {
    const baseSuggestions: ItemSuggestion[] = [
      {
        key: 'water',
        item_name: 'Water',
        unit: 'pcs',
        unit_price_santim: 3500,
        source: 'memory',
        catalog_item_id: null,
        category_name: null,
        use_count: 8,
      },
      {
        key: 'sugar',
        item_name: 'Sugar',
        unit: 'kg',
        unit_price_santim: 12500,
        source: 'memory',
        catalog_item_id: null,
        category_name: null,
        use_count: 4,
      },
      {
        key: 'milk',
        item_name: 'Milk',
        unit: 'L',
        unit_price_santim: 19500,
        source: 'memory',
        catalog_item_id: null,
        category_name: null,
        use_count: 4,
      },
    ];

    const ranked = predictSmartChargeSuggestions({
      baseSuggestions,
      shopEntries: entries.filter((e) => e.shop_id === 's1'),
      currentLineItemNames: ['Milk'],
      targetDate: '2026-11-18',
    });

    // Milk is already in the cart -> omitted; Sugar paired 4/4 times with Milk -> ranked #1 with hint
    expect(ranked.map((r) => r.key)).not.toContain('milk');
    expect(ranked[0].key).toBe('sugar');
    expect(ranked[0].badgeHint).toBe('With Milk');
  });

  it('detects unit price creep across shop visits', () => {
    const alerts = detectShopPriceAnomalies({ entries, shops });
    const milkAlert = alerts.find((a) => a.itemName === 'Milk' && a.shopId === 's1');

    expect(milkAlert).toBeDefined();
    expect(milkAlert?.direction).toBe('increase');
    expect(milkAlert?.previousMedianSantim).toBe(15000);
    expect(milkAlert?.latestPriceSantim).toBe(19500);
    expect(milkAlert?.percentChange).toBe(30);
  });

  it('forecasts Day 24 Payday Settlement bill above current balance before window opens', () => {
    const forecast = forecastHouseholdPaydayBill({
      entries,
      shops,
      todayDate: '2026-11-18',
    });

    expect(forecast.billMonth).toBe('2026-11');
    expect(forecast.daysUntilPaydayWindow).toBe(6);
    expect(forecast.currentOwedSantim).toBeGreaterThan(0);
    expect(forecast.projectedPaydayTotalSantim).toBeGreaterThanOrEqual(
      forecast.currentOwedSantim
    );
  });

  it('builds complete HouseholdMlReport with recurring shop items and baseline Z-score anomalies', () => {
    const report = computeHouseholdMlReport({
      entries,
      shops,
      targetMonth: '2026-11',
      todayDate: '2026-11-18',
    });

    expect(report.priceAnomalies.length).toBeGreaterThanOrEqual(1);
    expect(report.recurringShopItems.some((r) => r.label.includes('Bread'))).toBe(true);
    expect(report.totalSpendAnomaly).not.toBeNull();
    expect(report.shopAnomalies.some((s) => s.shopId === 's1')).toBe(true);
  });
});
