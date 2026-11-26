import type { Shop } from '../types/phase1';
import type { PriceMemoryItem, ShopLedgerSummary } from '../types/phase2';
import type { CatalogItem, Category, ItemSuggestion } from '../types/phase4to6';

export interface ShopWithSummary {
  shop: Shop;
  summary: ShopLedgerSummary;
}

const DUE_PRIORITY: Record<string, number> = {
  OVERDUE: 0,
  'DUE NOW': 1,
  'DUE SOON': 2,
};

/**
 * Returns active shops that are DUE SOON, DUE NOW, or OVERDUE, sorted by urgency
 * and then highest unpaid balance.
 */
export function buildUpcomingAndDueShops(
  shops: readonly Shop[],
  summariesByShop: ReadonlyMap<string, ShopLedgerSummary>
): ShopWithSummary[] {
  const items: ShopWithSummary[] = [];

  for (const shop of shops) {
    if (shop.archived || shop.merged_into_shop_id !== null) continue;
    const summary = summariesByShop.get(shop.id);
    if (!summary || summary.balanceSantim <= 0) continue;
    if (
      summary.status === 'OVERDUE' ||
      summary.status === 'DUE NOW' ||
      summary.status === 'DUE SOON'
    ) {
      items.push({ shop, summary });
    }
  }

  items.sort((a, b) => {
    const pA = DUE_PRIORITY[a.summary.status] ?? 99;
    const pB = DUE_PRIORITY[b.summary.status] ?? 99;
    if (pA !== pB) return pA - pB;
    return b.summary.balanceSantim - a.summary.balanceSantim;
  });

  return items;
}

/**
 * Returns top active shops with positive unpaid ETB balances.
 */
export function buildTopBalanceShops(
  shops: readonly Shop[],
  summariesByShop: ReadonlyMap<string, ShopLedgerSummary>,
  limit = 3
): ShopWithSummary[] {
  const items: ShopWithSummary[] = [];

  for (const shop of shops) {
    if (shop.archived || shop.merged_into_shop_id !== null) continue;
    const summary = summariesByShop.get(shop.id);
    if (!summary || summary.balanceSantim <= 0) continue;
    items.push({ shop, summary });
  }

  items.sort((a, b) => b.summary.balanceSantim - a.summary.balanceSantim);
  return items.slice(0, limit);
}

/**
 * Combines shop-specific remembered prices (`price_memory`) with admin-managed
 * `catalog_items` for fast autocomplete and quick-add buttons.
 * Shop price memory takes precedence when an item exists in both lists.
 */
export function mergeItemSuggestions(
  priceMemory: readonly PriceMemoryItem[],
  catalogItems: readonly CatalogItem[],
  categories: readonly Category[]
): ItemSuggestion[] {
  const categoryNameById = new Map<string, string>();
  for (const cat of categories) {
    if (!cat.archived) {
      categoryNameById.set(cat.id, cat.name);
    }
  }

  const activeCatalogByKey = new Map<string, CatalogItem>();
  for (const item of catalogItems) {
    if (item.archived) continue;
    activeCatalogByKey.set(item.name.trim().toLowerCase(), item);
  }

  const seen = new Set<string>();
  const suggestions: ItemSuggestion[] = [];

  const sortedMemory = [...priceMemory].sort(
    (a, b) => b.use_count - a.use_count || b.last_used.localeCompare(a.last_used)
  );

  for (const mem of sortedMemory) {
    const key = mem.item_key.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const catalogMatch = activeCatalogByKey.get(key);
    suggestions.push({
      key,
      item_name: mem.item_name,
      unit: mem.last_unit,
      unit_price_santim: mem.last_unit_price_santim,
      source: 'memory',
      catalog_item_id: catalogMatch?.id ?? null,
      category_name:
        catalogMatch?.category_id ? (categoryNameById.get(catalogMatch.category_id) ?? null) : null,
      use_count: mem.use_count,
    });
  }

  const sortedCatalog = [...catalogItems]
    .filter((item) => !item.archived)
    .sort((a, b) => a.name.localeCompare(b.name));

  for (const item of sortedCatalog) {
    const key = item.name.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    suggestions.push({
      key,
      item_name: item.name,
      unit: item.default_unit,
      unit_price_santim: item.default_price_santim,
      source: 'catalog',
      catalog_item_id: item.id,
      category_name: item.category_id ? (categoryNameById.get(item.category_id) ?? null) : null,
      use_count: 0,
    });
  }

  return suggestions;
}

export function getQuickAddSuggestions(
  priceMemory: readonly PriceMemoryItem[],
  catalogItems: readonly CatalogItem[],
  categories: readonly Category[],
  limit = 6
): ItemSuggestion[] {
  return mergeItemSuggestions(priceMemory, catalogItems, categories)
    .filter((item) => item.unit_price_santim > 0)
    .slice(0, limit);
}
