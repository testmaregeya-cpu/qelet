import {
  computeEditableLinesSummary,
  filterLineSuggestions,
  makeEmptyEditableLine,
  validateEditableLinesToDrafts,
} from '../src/lib/chargeForm';
import type { ItemSuggestion } from '../src/types/phase4to6';

describe('chargeForm shared helpers', () => {
  test('computes per-line totals and grand total in santim', () => {
    const lines = [
      {
        ...makeEmptyEditableLine(0),
        itemName: 'Cooking oil',
        quantity: '2',
        unit: 'L',
        unitPriceEtb: '350',
      },
      {
        ...makeEmptyEditableLine(1),
        itemName: 'Bread',
        quantity: '1.5',
        unit: 'pcs',
        unitPriceEtb: '20',
      },
    ];

    const summary = computeEditableLinesSummary(lines);
    expect(summary.lineTotals).toEqual([70000, 3000]);
    expect(summary.grandTotalSantim).toBe(73000);
  });

  test('validates lines and emits ChargeLineDraft[] or throws crisp error', () => {
    const valid = [
      {
        ...makeEmptyEditableLine(0),
        catalogItemId: 'cat-1',
        itemName: ' Milk ',
        quantity: '1',
        unit: ' L ',
        unitPriceEtb: '90.50',
      },
    ];

    expect(validateEditableLinesToDrafts(valid)).toEqual([
      {
        catalog_item_id: 'cat-1',
        item_name: 'Milk',
        quantity_milli: 1000,
        unit: 'L',
        unit_price_santim: 9050,
      },
    ]);

    expect(() =>
      validateEditableLinesToDrafts([{ ...makeEmptyEditableLine(0), itemName: '   ' }])
    ).toThrow(/item name/i);
  });

  test('filters autocomplete suggestions without exact-match duplicates', () => {
    const items: ItemSuggestion[] = [
      {
        key: 'milk',
        item_name: 'Milk',
        unit: 'L',
        unit_price_santim: 9000,
        source: 'memory',
        catalog_item_id: null,
        category_name: null,
        use_count: 5,
      },
      {
        key: 'milk powder',
        item_name: 'Milk Powder',
        unit: 'pack',
        unit_price_santim: 45000,
        source: 'catalog',
        catalog_item_id: 'c2',
        category_name: 'Dairy',
        use_count: 0,
      },
    ];

    expect(filterLineSuggestions(items, 'milk').map((s) => s.key)).toEqual(['milk powder']);
  });
});
