import { useCallback, useEffect, useState } from 'react';
import { createTrailingDebouncer } from '../lib/debounce';
import {
  fetchCatalogItems,
  fetchCategories,
  subscribeToCatalogRealtime,
} from '../services/catalog';
import {
  fetchHouseholdDisputes,
  fetchShopEntries,
  fetchShopPriceMemory,
  subscribeToLedgerRealtime,
} from '../services/ledger';
import {
  cacheShopDetail,
  getCachedShopDetail,
} from '../services/offlineStorage';
import { fetchShops, subscribeToHouseholdRealtime } from '../services/shops';
import type { Shop } from '../types/phase1';
import type { LedgerEntry, PriceMemoryItem } from '../types/phase2';
import type { Dispute } from '../types/phase3';
import type { CatalogItem, Category } from '../types/phase4to6';

export function useShopDetail(householdId: string | null, shopId: string | undefined) {
  const [shop, setShop] = useState<Shop | null>(null);
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [priceMemory, setPriceMemory] = useState<PriceMemoryItem[]>([]);
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadShopDetail = useCallback(async () => {
    if (!householdId || !shopId) return;
    try {
      const [shopList, shopEntries, householdDisputes, memory, items, cats] =
        await Promise.all([
          fetchShops(householdId),
          fetchShopEntries(shopId),
          fetchHouseholdDisputes(householdId),
          fetchShopPriceMemory(shopId),
          fetchCatalogItems(householdId),
          fetchCategories(householdId),
        ]);
      setError(null);
      const foundShop = shopList.find((s) => s.id === shopId) ?? null;
      setShop(foundShop);
      setEntries(shopEntries);
      setDisputes(householdDisputes);
      setPriceMemory(memory);
      setCatalogItems(items);
      setCategories(cats);
      void cacheShopDetail(shopId, {
        shop: foundShop,
        entries: shopEntries,
        disputes: householdDisputes,
        priceMemory: memory,
      });
    } catch (err) {
      const cached = await getCachedShopDetail(shopId);
      if (cached) {
        setShop(cached.shop);
        setEntries(cached.entries);
        setDisputes(cached.disputes);
        setPriceMemory(cached.priceMemory);
      }
      setError(err instanceof Error ? err.message : 'Failed to load shop detail');
    } finally {
      setLoadingData(false);
    }
  }, [householdId, shopId]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadShopDetail();
    } finally {
      setRefreshing(false);
    }
  }, [loadShopDetail]);

  useEffect(() => {
    if (!householdId || !shopId) return;
    let active = true;

    void getCachedShopDetail(shopId).then((cached) => {
      if (cached && active) {
        setShop(cached.shop);
        setEntries(cached.entries);
        setDisputes(cached.disputes);
        setPriceMemory(cached.priceMemory);
        setLoadingData(false);
      }
    });

    void Promise.all([
      fetchShops(householdId),
      fetchShopEntries(shopId),
      fetchHouseholdDisputes(householdId),
      fetchShopPriceMemory(shopId),
      fetchCatalogItems(householdId),
      fetchCategories(householdId),
    ])
      .then(([shopList, shopEntries, householdDisputes, memory, items, cats]) => {
        if (!active) return;
        setError(null);
        const found = shopList.find((s) => s.id === shopId) ?? null;
        setShop(found);
        setEntries(shopEntries);
        setDisputes(householdDisputes);
        setPriceMemory(memory);
        setCatalogItems(items);
        setCategories(cats);
        void cacheShopDetail(shopId, {
          shop: found,
          entries: shopEntries,
          disputes: householdDisputes,
          priceMemory: memory,
        });
      })
      .catch(async (err) => {
        if (!active) return;
        const cached = await getCachedShopDetail(shopId);
        if (cached) {
          setShop(cached.shop);
          setEntries(cached.entries);
          setDisputes(cached.disputes);
          setPriceMemory(cached.priceMemory);
        }
        setError(err instanceof Error ? err.message : 'Failed to load shop detail');
      })
      .finally(() => {
        if (active) setLoadingData(false);
      });

    const debouncedReload = createTrailingDebouncer(() => {
      if (active) void loadShopDetail();
    }, 350);

    const unsubHouse = subscribeToHouseholdRealtime(householdId, debouncedReload.trigger);
    const unsubLedger = subscribeToLedgerRealtime(householdId, debouncedReload.trigger);
    const unsubCat = subscribeToCatalogRealtime(householdId, debouncedReload.trigger);

    return () => {
      active = false;
      debouncedReload.cancel();
      unsubHouse();
      unsubLedger();
      unsubCat();
    };
  }, [householdId, shopId, loadShopDetail]);

  return {
    shop,
    entries,
    disputes,
    priceMemory,
    catalogItems,
    categories,
    loadingData,
    refreshing,
    error,
    setError,
    reload: loadShopDetail,
    refresh,
  };
}
