import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import type { ChargeLineDraft, LedgerEntry } from '../types/phase2';

const OFFLINE_QUEUE_KEY = 'qelet_offline_mutations_v1';

export interface OfflineChargePayload {
  shopId: string;
  entryDate: string;
  billMonth: string;
  note: string;
  lines: ChargeLineDraft[];
  clientRequestId: string;
}

export interface OfflinePaymentPayload {
  shopId: string;
  entryDate: string;
  amountSantim: number;
  note: string;
  clientRequestId: string;
}

export type OfflineMutation =
  | {
      id: string;
      kind: 'charge';
      householdId: string;
      shopId: string;
      createdAt: string;
      lastError?: string;
      payload: OfflineChargePayload;
    }
  | {
      id: string;
      kind: 'payment';
      householdId: string;
      shopId: string;
      createdAt: string;
      lastError?: string;
      payload: OfflinePaymentPayload;
    };

export interface FlushResult {
  syncedCount: number;
  remainingCount: number;
  lastError: string | null;
}

export function createClientRequestId(): string {
  return Crypto.randomUUID();
}

export function isLikelyNetworkError(err: unknown): boolean {
  if (!err) return false;
  let full = '';
  if (typeof err === 'string') {
    full = err;
  } else if (err && typeof err === 'object') {
    const errorObj = err as Record<string, unknown>;
    const msg = typeof errorObj.message === 'string' ? errorObj.message : '';
    const cause =
      errorObj.cause instanceof Error
        ? errorObj.cause.message
        : typeof errorObj.cause === 'string'
        ? errorObj.cause
        : typeof errorObj.cause === 'object' && errorObj.cause !== null
        ? JSON.stringify(errorObj.cause)
        : '';
    const details = typeof errorObj.details === 'string' ? errorObj.details : '';
    full = `${msg} ${cause} ${details} ${String(err)}`.toLowerCase();
  } else {
    full = String(err).toLowerCase();
  }

  return (
    full.includes('network request failed') ||
    full.includes('failed to fetch') ||
    full.includes('fetch failed') ||
    full.includes('network error') ||
    full.includes('networkerror') ||
    full.includes('timed out') ||
    full.includes('timeout') ||
    full.includes('econn') ||
    full.includes('offline') ||
    full.includes('internet') ||
    full.includes('unable to resolve host') ||
    full.includes('unknownhostexception') ||
    full.includes('no address associated with hostname') ||
    full.includes('enotfound') ||
    full.includes('eai_again')
  );
}

async function readAllQueue(): Promise<OfflineMutation[]> {
  const raw = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as OfflineMutation[]) : [];
  } catch {
    return [];
  }
}

async function writeAllQueue(items: OfflineMutation[]): Promise<void> {
  if (items.length === 0) {
    await AsyncStorage.removeItem(OFFLINE_QUEUE_KEY);
    return;
  }
  await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(items));
}

export async function getOfflineMutations(householdId?: string): Promise<OfflineMutation[]> {
  const items = await readAllQueue();
  return householdId ? items.filter((item) => item.householdId === householdId) : items;
}

export async function enqueueOfflineMutation(mutation: OfflineMutation): Promise<void> {
  const existing = await readAllQueue();
  if (existing.some((item) => item.id === mutation.id)) {
    return;
  }
  existing.push(mutation);
  await writeAllQueue(existing);
}

export async function removeOfflineMutation(mutationId: string): Promise<void> {
  const existing = await readAllQueue();
  const next = existing.filter((item) => item.id !== mutationId);
  await writeAllQueue(next);
}

export async function flushOfflineMutations(
  householdId: string,
  executor: (mutation: OfflineMutation) => Promise<LedgerEntry | void>
): Promise<FlushResult> {
  const all = await readAllQueue();
  const targetItems = all.filter((item) => item.householdId === householdId);
  if (targetItems.length === 0) {
    return { syncedCount: 0, remainingCount: 0, lastError: null };
  }

  let syncedCount = 0;
  let lastError: string | null = null;
  const completedIds = new Set<string>();
  const errorById = new Map<string, string>();

  for (const item of targetItems) {
    try {
      await executor(item);
      completedIds.add(item.id);
      syncedCount += 1;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Sync failed';
      if (isLikelyNetworkError(err)) {
        // Network drop or offline: stop draining immediately so FIFO order is preserved.
        // Do not tag the item with a permanent error because it's just offline.
        lastError = null;
        break;
      }
      lastError = msg;
      errorById.set(item.id, msg);
    }
  }

  const remaining = all
    .filter((item) => !completedIds.has(item.id))
    .map((item) =>
      errorById.has(item.id)
        ? { ...item, lastError: errorById.get(item.id) }
        : item
    );

  await writeAllQueue(remaining);

  const remainingForHousehold = remaining.filter((item) => item.householdId === householdId).length;
  return {
    syncedCount,
    remainingCount: remainingForHousehold,
    lastError,
  };
}
