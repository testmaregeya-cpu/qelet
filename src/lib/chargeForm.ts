import {
  computeLineTotalSantim,
  formatSantimForInput,
  parseEtbToSantim,
  parseQuantityToMilli,
} from './money';
import type { ChargeLineDraft } from '../types/phase2';
import type { ItemSuggestion } from '../types/phase4to6';

export interface EditableChargeLine {
  key: string;
  catalogItemId: string | null;
  itemName: string;
  quantity: string;
  unit: string;
  unitPriceEtb: string;
}

export const COMMON_UNITS = ['pcs', 'kg', 'L', 'pack'] as const;

export function makeEmptyEditableLine(index: number): EditableChargeLine {
  return {
    key: `line-${Date.now()}-${index}`,
    catalogItemId: null,
    itemName: '',
    quantity: '1',
    unit: 'pcs',
    unitPriceEtb: '',
  };
}

export function makeEditableLineFromSuggestion(
  suggestion: ItemSuggestion,
  index: number
): EditableChargeLine {
  return {
    key: `line-${Date.now()}-${index}`,
    catalogItemId: suggestion.catalog_item_id,
    itemName: suggestion.item_name,
    quantity: '1',
    unit: suggestion.unit,
    unitPriceEtb:
      suggestion.unit_price_santim > 0
        ? formatSantimForInput(suggestion.unit_price_santim)
        : '',
  };
}

export function computeEditableLinesSummary(lines: readonly EditableChargeLine[]): {
  lineTotals: (number | null)[];
  grandTotalSantim: number;
} {
  const lineTotals: (number | null)[] = [];
  let grandTotalSantim = 0;

  for (const line of lines) {
    try {
      const qtyMilli = parseQuantityToMilli(line.quantity);
      const unitPrice = parseEtbToSantim(line.unitPriceEtb);
      const total = computeLineTotalSantim(qtyMilli, unitPrice);
      lineTotals.push(total);
      grandTotalSantim += total;
    } catch {
      lineTotals.push(null);
    }
  }

  return { lineTotals, grandTotalSantim };
}

export function validateEditableLinesToDrafts(
  lines: readonly EditableChargeLine[]
): ChargeLineDraft[] {
  if (lines.length === 0) {
    throw new Error('Add at least one item line');
  }

  return lines.map((line) => {
    const cleanName = line.itemName.trim();
    if (!cleanName) {
      throw new Error('Every item row needs an item name');
    }

    const quantity_milli = parseQuantityToMilli(line.quantity);
    const unit_price_santim = parseEtbToSantim(line.unitPriceEtb);
    const total = computeLineTotalSantim(quantity_milli, unit_price_santim);
    if (total <= 0) {
      throw new Error(`Line total for "${cleanName}" must be greater than 0 ETB`);
    }

    return {
      catalog_item_id: line.catalogItemId,
      item_name: cleanName,
      quantity_milli,
      unit: line.unit.trim() || 'pcs',
      unit_price_santim,
    };
  });
}

export function filterLineSuggestions(
  suggestions: readonly ItemSuggestion[],
  rawQuery: string,
  limit = 5
): ItemSuggestion[] {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return [];
  return suggestions
    .filter((item) => item.key.includes(query) && item.key !== query)
    .slice(0, limit);
}
