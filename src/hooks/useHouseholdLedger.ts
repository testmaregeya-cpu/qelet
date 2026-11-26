import { useCallback, useEffect, useMemo, useState } from 'react';
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
  isLikelyNetworkError,
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

export function mutationToSyntheticEntry(mutation: OfflineMutation, householdId: string): LedgerEntry {
  if (mutation.kind === 'charge') {
    const totalSantim = mutation.payload.lines.reduce(
      (sum, line) => sum + Math.round((line.quantity_milli * line.unit_price_santim) / 1000),
      0
    );
    return {
      id: mutation.payload.clientRequestId || mutation.id,
      household_id: householdId,
      shop_id: mutation.payload.shopId,
      created_by: 'offline',
      entry_date: mutation.payload.entryDate,
      bill_month: mutation.payload.billMonth,
      type: 'charge',
      total_amount_santim: totalSantim,
      note: mutation.payload.note,
      voided: false,
      voided_by: null,
      voided_at: null,
      void_reason: null,
      edited_at: null,
      edit_count: 0,
      client_request_id: mutation.payload.clientRequestId,
      created_at: mutation.createdAt,
      entry_lines: mutation.payload.lines.map((line, idx) => ({
        id: `${mutation.id}-line-${idx}`,
        household_id: householdId,
        entry_id: mutation.payload.clientRequestId || mutation.id,
        catalog_item_id: line.catalog_item_id ?? null,
        item_name: line.item_name,
        quantity_milli: line.quantity_milli,
        unit: line.unit,
        unit_price_santim: line.unit_price_santim,
        line_total_santim: Math.round((line.quantity_milli * line.unit_price_santim) / 1000),
        sort_order: idx,
        created_at: mutation.createdAt,
      })),
    };
  } else {
    return {
      id: mutation.payload.clientRequestId || mutation.id,
      household_id: householdId,
      shop_id: mutation.payload.shopId,
      created_by: 'offline',
      entry_date: mutation.payload.entryDate,
      bill_month: null,
      type: 'payment',
      total_amount_santim: mutation.payload.amountSantim,
      note: mutation.payload.note,
      voided: false,
      voided_by: null,
      voided_at: null,
      void_reason: null,
      edited_at: null,
      edit_count: 0,
      client_request_id: mutation.payload.clientRequestId,
      created_at: mutation.createdAt,
      entry_lines: [],
    };
  }
}

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

  const displayEntries = useMemo(() => {
    if (!householdId || pendingMutations.length === 0) return entries;
    const existingReqIds = new Set(
      entries.map((e) => e.client_request_id || e.id).filter(Boolean)
    );
    const synthetic = pendingMutations
      .filter((m) => !existingReqIds.has(m.payload.clientRequestId) && !existingReqIds.has(m.id))
      .map((m) => mutationToSyntheticEntry(m, householdId));
    return [...synthetic, ...entries];
  }, [entries, pendingMutations, householdId]);

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
      const [cached, pendingList] = await Promise.all([
        getCachedHouseholdLedger(householdId),
        getOfflineMutations(householdId).catch(() => [] as OfflineMutation[]),
      ]);
      if (cached) {
        setShops(cached.shops);
        setEntries(cached.entries);
        setDisputes(cached.disputes);
        setPriceMemory(cached.priceMemory);
      }
      setPendingMutations(pendingList);
      if (isLikelyNetworkError(err)) {
        if (!cached || cached.shops.length === 0) {
          setError('You are offline. Connect to the internet to load your household ledger.');
        } else {
          setError(null);
        }
      } else {
        setError(err instanceof Error ? err.message : 'Failed to load ledger');
      }
    } finally {
      setLoadingData(false);
    }
  }, [householdId, includeDisputesAndMemory]);

  const syncOfflineQueueNow = useCallback(async () => {
    if (!householdId) return;
    const result = await flushOfflineMutations(householdId, executeOfflineMutation);
    const updatedPending = await getOfflineMutations(householdId);
    setPendingMutations(updatedPending);
    if (result.syncedCount > 0) {
      await loadAll();
    }
    if (result.lastError) {
      if (isLikelyNetworkError(result.lastError)) {
        setError(null);
      } else {
        setError(result.lastError);
      }
    } else {
      setError(null);
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

  // Auto-sync retry timer: periodically attempt to sync pending mutations when network restores
  useEffect(() => {
    if (!householdId || pendingMutations.length === 0) return;

    const timer = setInterval(() => {
      void (async () => {
        try {
          const result = await flushOfflineMutations(householdId, executeOfflineMutation);
          if (result.syncedCount > 0) {
            const updated = await getOfflineMutations(householdId);
            setPendingMutations(updated);
            await loadAll();
          }
        } catch {
          // Still offline, will retry next tick
        }
      })();
    }, 8000);

    return () => clearInterval(timer);
  }, [householdId, pendingMutations.length, loadAll]);

  useEffect(() => {
    if (!householdId) return;
    let active = true;

    void Promise.all([
      getCachedHouseholdLedger(householdId),
      getOfflineMutations(householdId).catch(() => [] as OfflineMutation[]),
    ]).then(([cached, pendingList]) => {
      if (active) {
        if (cached) {
          setShops(cached.shops);
          setEntries(cached.entries);
          setDisputes(cached.disputes);
          setPriceMemory(cached.priceMemory);
          setLoadingData(false);
        }
        setPendingMutations(pendingList);
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
        const [cached, pendingList] = await Promise.all([
          getCachedHouseholdLedger(householdId),
          getOfflineMutations(householdId).catch(() => [] as OfflineMutation[]),
        ]);
        if (cached) {
          setShops(cached.shops);
          setEntries(cached.entries);
          setDisputes(cached.disputes);
          setPriceMemory(cached.priceMemory);
        }
        setPendingMutations(pendingList);
        if (isLikelyNetworkError(err)) {
          if (!cached || cached.shops.length === 0) {
            setError('You are offline. Connect to the internet to load your household ledger.');
          } else {
            setError(null);
          }
        } else {
          setError(err instanceof Error ? err.message : 'Failed to load ledger');
        }
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

    let unsubHousehold = () => {};
    let unsubLedger = () => {};

    try {
      unsubHousehold = subscribeToHouseholdRealtime(
        householdId,
        debouncedHouseholdReload.trigger
      );
      unsubLedger = subscribeToLedgerRealtime(householdId, debouncedLedgerReload.trigger);
    } catch {
      // Non-fatal if socket/channel initialization error
    }

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
    entries: displayEntries,
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
