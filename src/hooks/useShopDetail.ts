import { useCallback, useEffect, useMemo, useState } from 'react';
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
  getOfflineMutations,
  isLikelyNetworkError,
  type OfflineMutation,
} from '../services/offlineQueue';
import {
  cacheShopDetail,
  getCachedShopDetail,
} from '../services/offlineStorage';
import { fetchShops, subscribeToHouseholdRealtime } from '../services/shops';
import { mutationToSyntheticEntry } from './useHouseholdLedger';
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
  const [pendingMutations, setPendingMutations] = useState<OfflineMutation[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const displayEntries = useMemo(() => {
    if (!householdId || !shopId || pendingMutations.length === 0) return entries;
    const existingReqIds = new Set(
      entries.map((e) => e.client_request_id || e.id).filter(Boolean)
    );
    const synthetic = pendingMutations
      .filter(
        (m) =>
          m.shopId === shopId &&
          !existingReqIds.has(m.payload.clientRequestId) &&
          !existingReqIds.has(m.id)
      )
      .map((m) => mutationToSyntheticEntry(m, householdId));
    return [...synthetic, ...entries];
  }, [entries, pendingMutations, householdId, shopId]);

  const loadShopDetail = useCallback(async () => {
    if (!householdId || !shopId) return;
    try {
      const [shopList, shopEntries, householdDisputes, memory, items, cats, pendingList] =
        await Promise.all([
          fetchShops(householdId),
          fetchShopEntries(shopId),
          fetchHouseholdDisputes(householdId),
          fetchShopPriceMemory(shopId),
          fetchCatalogItems(householdId),
          fetchCategories(householdId),
          getOfflineMutations(householdId),
        ]);
      setError(null);
      const foundShop = shopList.find((s) => s.id === shopId) ?? null;
      setShop(foundShop);
      setEntries(shopEntries);
      setDisputes(householdDisputes);
      setPriceMemory(memory);
      setCatalogItems(items);
      setCategories(cats);
      setPendingMutations(pendingList);
      void cacheShopDetail(shopId, {
        shop: foundShop,
        entries: shopEntries,
        disputes: householdDisputes,
        priceMemory: memory,
      });
    } catch (err) {
      const [cached, pendingList] = await Promise.all([
        getCachedShopDetail(shopId),
        getOfflineMutations(householdId).catch(() => [] as OfflineMutation[]),
      ]);
      if (cached) {
        setShop(cached.shop);
        setEntries(cached.entries);
        setDisputes(cached.disputes);
        setPriceMemory(cached.priceMemory);
      }
      setPendingMutations(pendingList);
      if (isLikelyNetworkError(err)) {
        if (!cached || !cached.shop) {
          setError('You are offline. Connect to the internet to load this shop.');
        } else {
          setError(null);
        }
      } else {
        setError(err instanceof Error ? err.message : 'Failed to load shop detail');
      }
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

    void Promise.all([
      getCachedShopDetail(shopId),
      getOfflineMutations(householdId).catch(() => [] as OfflineMutation[]),
    ]).then(([cached, pendingList]) => {
      if (!active) return;
      if (cached) {
        setShop(cached.shop);
        setEntries(cached.entries);
        setDisputes(cached.disputes);
        setPriceMemory(cached.priceMemory);
        setLoadingData(false);
      }
      if (pendingList.length > 0) {
        setPendingMutations(pendingList);
      }
    });

    void Promise.all([
      fetchShops(householdId),
      fetchShopEntries(shopId),
      fetchHouseholdDisputes(householdId),
      fetchShopPriceMemory(shopId),
      fetchCatalogItems(householdId),
      fetchCategories(householdId),
      getOfflineMutations(householdId),
    ])
      .then(([shopList, shopEntries, householdDisputes, memory, items, cats, pendingList]) => {
        if (!active) return;
        setError(null);
        const found = shopList.find((s) => s.id === shopId) ?? null;
        setShop(found);
        setEntries(shopEntries);
        setDisputes(householdDisputes);
        setPriceMemory(memory);
        setCatalogItems(items);
        setCategories(cats);
        setPendingMutations(pendingList);
        void cacheShopDetail(shopId, {
          shop: found,
          entries: shopEntries,
          disputes: householdDisputes,
          priceMemory: memory,
        });
      })
      .catch(async (err) => {
        if (!active) return;
        const [cached, pendingList] = await Promise.all([
          getCachedShopDetail(shopId),
          getOfflineMutations(householdId).catch(() => [] as OfflineMutation[]),
        ]);
        if (cached) {
          setShop(cached.shop);
          setEntries(cached.entries);
          setDisputes(cached.disputes);
          setPriceMemory(cached.priceMemory);
        }
        setPendingMutations(pendingList);
        if (isLikelyNetworkError(err)) {
          if (!cached || !cached.shop) {
            setError('You are offline. Connect to the internet to load this shop.');
          } else {
            setError(null);
          }
        } else {
          setError(err instanceof Error ? err.message : 'Failed to load shop detail');
        }
      })
      .finally(() => {
        if (active) setLoadingData(false);
      });

    const debouncedReload = createTrailingDebouncer(() => {
      if (active) void loadShopDetail();
    }, 350);

    let unsubHouse = () => {};
    let unsubLedger = () => {};
    let unsubCat = () => {};

    try {
      unsubHouse = subscribeToHouseholdRealtime(householdId, debouncedReload.trigger);
      unsubLedger = subscribeToLedgerRealtime(householdId, debouncedReload.trigger);
      unsubCat = subscribeToCatalogRealtime(householdId, debouncedReload.trigger);
    } catch {
      // Non-fatal if socket/channel initialization error
    }

    return () => {
      active = false;
      debouncedReload.cancel();
      unsubHouse();
      unsubLedger();
      unsubCat();
    };
  }, [householdId, shopId, loadShopDetail]);

  // Periodic poll if there are pending offline mutations waiting to be synced
  useEffect(() => {
    if (!householdId || pendingMutations.length === 0) return;
    const interval = setInterval(() => {
      void loadShopDetail();
    }, 8000);
    return () => clearInterval(interval);
  }, [householdId, pendingMutations.length, loadShopDetail]);

  return {
    shop,
    entries: displayEntries,
    rawEntries: entries,
    disputes,
    priceMemory,
    catalogItems,
    categories,
    pendingMutations,
    loadingData,
    refreshing,
    error,
    setError,
    reload: loadShopDetail,
    refresh,
  };
}
