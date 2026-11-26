import { useCallback, useEffect, useState } from 'react';
import { createTrailingDebouncer } from '../lib/debounce';
import {
  fetchHouseholdDisputes,
  fetchHouseholdEntries,
  fetchHouseholdPriceMemory,
  subscribeToLedgerRealtime,
} from '../services/ledger';
import {
  flushOfflineMutations,
  getOfflineMutations,
  type OfflineMutation,
} from '../services/offlineQueue';
import {
  cacheHouseholdLedger,
  getCachedHouseholdLedger,
} from '../services/offlineStorage';
import { fetchShops, subscribeToHouseholdRealtime } from '../services/shops';
import { executeOfflineMutation, useSession } from '../state/SessionContext';
import type { Shop } from '../types/phase1';
import type { LedgerEntry, PriceMemoryItem } from '../types/phase2';
import type { Dispute } from '../types/phase3';

export function useHouseholdLedger(options?: {
  includeDisputesAndMemory?: boolean;
}) {
  const includeDisputesAndMemory = options?.includeDisputesAndMemory ?? true;
  const { householdContext, refreshHousehold } = useSession();
  const householdId = householdContext?.household.id ?? null;

  const [shops, setShops] = useState<Shop[]>([]);
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [priceMemory, setPriceMemory] = useState<PriceMemoryItem[]>([]);
  const [pendingMutations, setPendingMutations] = useState<OfflineMutation[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    if (!householdId) return;
    try {
      const [shopList, entryList, disputeList, memoryList, pendingList] = await Promise.all([
        fetchShops(householdId),
        fetchHouseholdEntries(householdId),
        includeDisputesAndMemory ? fetchHouseholdDisputes(householdId) : Promise.resolve([]),
        includeDisputesAndMemory ? fetchHouseholdPriceMemory(householdId) : Promise.resolve([]),
        getOfflineMutations(householdId),
      ]);
      setError(null);
      setShops(shopList);
      setEntries(entryList);
      setDisputes(disputeList);
      setPriceMemory(memoryList);
      setPendingMutations(pendingList);
      void cacheHouseholdLedger(householdId, {
        shops: shopList,
        entries: entryList,
        disputes: disputeList,
        priceMemory: memoryList,
      });
    } catch (err) {
      const cached = await getCachedHouseholdLedger(householdId);
      if (cached && shops.length === 0) {
        setShops(cached.shops);
        setEntries(cached.entries);
        setDisputes(cached.disputes);
        setPriceMemory(cached.priceMemory);
      }
      setError(err instanceof Error ? err.message : 'Failed to load ledger');
    } finally {
      setLoadingData(false);
    }
  }, [householdId, includeDisputesAndMemory, shops.length]);

  const syncOfflineQueueNow = useCallback(async () => {
    if (!householdId) return;
    const result = await flushOfflineMutations(householdId, executeOfflineMutation);
    setPendingMutations(await getOfflineMutations(householdId));
    if (result.syncedCount > 0) {
      await loadAll();
    }
    if (result.lastError) {
      setError(result.lastError);
    }
  }, [householdId, loadAll]);

  const refreshAll = useCallback(async () => {
    if (!householdId) return;
    setRefreshing(true);
    try {
      await flushOfflineMutations(householdId, executeOfflineMutation).catch(() => undefined);
      await Promise.all([loadAll(), refreshHousehold()]);
    } finally {
      setRefreshing(false);
    }
  }, [householdId, loadAll, refreshHousehold]);

  useEffect(() => {
    if (!householdId) return;
    let active = true;

    void getCachedHouseholdLedger(householdId).then((cached) => {
      if (cached && active) {
        setShops(cached.shops);
        setEntries(cached.entries);
        setDisputes(cached.disputes);
        setPriceMemory(cached.priceMemory);
        setLoadingData(false);
      }
    });

    void Promise.all([
      fetchShops(householdId),
      fetchHouseholdEntries(householdId),
      includeDisputesAndMemory ? fetchHouseholdDisputes(householdId) : Promise.resolve([]),
      includeDisputesAndMemory ? fetchHouseholdPriceMemory(householdId) : Promise.resolve([]),
      getOfflineMutations(householdId),
    ])
      .then(([shopList, entryList, disputeList, memoryList, pendingList]) => {
        if (!active) return;
        setError(null);
        setShops(shopList);
        setEntries(entryList);
        setDisputes(disputeList);
        setPriceMemory(memoryList);
        setPendingMutations(pendingList);
        void cacheHouseholdLedger(householdId, {
          shops: shopList,
          entries: entryList,
          disputes: disputeList,
          priceMemory: memoryList,
        });
      })
      .catch(async (err) => {
        if (!active) return;
        const cached = await getCachedHouseholdLedger(householdId);
        if (cached) {
          setShops(cached.shops);
          setEntries(cached.entries);
          setDisputes(cached.disputes);
          setPriceMemory(cached.priceMemory);
        }
        setError(err instanceof Error ? err.message : 'Failed to load ledger');
      })
      .finally(() => {
        if (active) setLoadingData(false);
      });

    const debouncedHouseholdReload = createTrailingDebouncer(() => {
      if (!active) return;
      void loadAll();
      void refreshHousehold();
    }, 350);

    const debouncedLedgerReload = createTrailingDebouncer(() => {
      if (!active) return;
      void loadAll();
    }, 350);

    const unsubHousehold = subscribeToHouseholdRealtime(
      householdId,
      debouncedHouseholdReload.trigger
    );
    const unsubLedger = subscribeToLedgerRealtime(householdId, debouncedLedgerReload.trigger);

    return () => {
      active = false;
      debouncedHouseholdReload.cancel();
      debouncedLedgerReload.cancel();
      unsubHousehold();
      unsubLedger();
    };
  }, [householdId, includeDisputesAndMemory, loadAll, refreshHousehold]);

  return {
    shops,
    entries,
    disputes,
    priceMemory,
    pendingMutations,
    loadingData,
    refreshing,
    error,
    setError,
    reload: loadAll,
    refreshAll,
    syncOfflineQueueNow,
  };
}
