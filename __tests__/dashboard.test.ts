import {
  buildTopBalanceShops,
  buildUpcomingAndDueShops,
  getQuickAddSuggestions,
  mergeItemSuggestions,
} from '../src/domain/dashboard';
import type { Shop } from '../src/types/phase1';
import type { PriceMemoryItem, ShopLedgerSummary } from '../src/types/phase2';
import type { CatalogItem, Category } from '../src/types/phase4to6';

function makeShop(id: string, name: string, archived = false): Shop {
  return {
    id,
    household_id: 'h1',
    name,
    archived,
    needs_review: false,
    merged_into_shop_id: null,
    created_by: 'u1',
    created_at: '2026-11-01T00:00:00Z',
    updated_at: '2026-11-01T00:00:00Z',
  };
}

function makeSummary(
  balanceSantim: number,
  status: ShopLedgerSummary['status']
): ShopLedgerSummary {
  return {
    totalChargedSantim: Math.max(0, balanceSantim),
    totalPaidSantim: 0,
    balanceSantim,
    unappliedCreditSantim: 0,
    status,
    oldestUnpaidBillMonth: balanceSantim > 0 ? '2026-11' : null,
    bills: [],
  };
}

describe('Phase 4 dashboard cards, catalog merge, and quick-add suggestions', () => {
  test('orders Upcoming & Due shops by urgency (OVERDUE > DUE NOW > DUE SOON) then balance', () => {
    const shops = [
      makeShop('s1', 'Open Shop'),
      makeShop('s2', 'Due Soon'),
      makeShop('s3', 'Overdue Small'),
      makeShop('s4', 'Overdue Big'),
      makeShop('s5', 'Due Now'),
      makeShop('s6', 'Archived Overdue', true),
    ];
    const summaries = new Map<string, ShopLedgerSummary>([
      ['s1', makeSummary(90_000, 'OPEN')],
      ['s2', makeSummary(50_000, 'DUE SOON')],
      ['s3', makeSummary(10_000, 'OVERDUE')],
      ['s4', makeSummary(40_000, 'OVERDUE')],
      ['s5', makeSummary(30_000, 'DUE NOW')],
      ['s6', makeSummary(99_000, 'OVERDUE')],
    ]);

    const due = buildUpcomingAndDueShops(shops, summaries);
    expect(due.map((d) => d.shop.id)).toEqual(['s4', 's3', 's5', 's2']);

    const top = buildTopBalanceShops(shops, summaries, 3);
    expect(top.map((t) => t.shop.id)).toEqual(['s1', 's2', 's4']);
  });

  test('merges shop price_memory and admin catalog_items without duplicates', () => {
    const categories: Category[] = [
      { id: 'cat1', household_id: 'h1', name: 'Bakery', sort_order: 0, archived: false, created_at: '' },
    ];
    const catalog: CatalogItem[] = [
      {
        id: 'ci1',
        household_id: 'h1',
        category_id: 'cat1',
        name: 'Bread',
        default_unit: 'pcs',
        default_price_santim: 2500,
        archived: false,
        created_at: '',
      },
      {
        id: 'ci2',
        household_id: 'h1',
        category_id: 'cat1',
        name: 'Croissant',
        default_unit: 'pcs',
        default_price_santim: 6000,
        archived: false,
        created_at: '',
      },
    ];
    const memory: PriceMemoryItem[] = [
      {
        household_id: 'h1',
        shop_id: 's1',
        item_key: 'bread',
        item_name: 'Bread',
        last_unit: 'pcs',
        last_unit_price_santim: 3000, // remembered price at this shop overrides catalog default 2500
        last_used: '2026-11-24T10:00:00Z',
        use_count: 8,
      },
    ];

    const merged = mergeItemSuggestions(memory, catalog, categories);
    expect(merged).toHaveLength(2);
    expect(merged[0]).toMatchObject({
      item_name: 'Bread',
      unit_price_santim: 3000,
      source: 'memory',
      catalog_item_id: 'ci1',
      category_name: 'Bakery',
    });
    expect(merged[1]).toMatchObject({
      item_name: 'Croissant',
      unit_price_santim: 6000,
      source: 'catalog',
      catalog_item_id: 'ci2',
      category_name: 'Bakery',
    });

    const quick = getQuickAddSuggestions(memory, catalog, categories, 5);
    expect(quick.map((q) => q.item_name)).toEqual(['Bread', 'Croissant']);
  });
});
