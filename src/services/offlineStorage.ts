import AsyncStorage from '@react-native-async-storage/async-storage';
import type { HouseholdContextData } from './household';
import type { Shop } from '../types/phase1';
import type { LedgerEntry, PriceMemoryItem } from '../types/phase2';
import type { Dispute } from '../types/phase3';

const HOUSEHOLD_CONTEXT_CACHE_KEY = 'qelet_household_context_cache_v1';
const LEDGER_CACHE_KEY_PREFIX = 'qelet_ledger_cache_v1_';
const SHOP_DETAIL_CACHE_PREFIX = 'qelet_shop_detail_cache_v1_';

export interface CachedLedgerData {
  shops: Shop[];
  entries: LedgerEntry[];
  disputes: Dispute[];
  priceMemory: PriceMemoryItem[];
  cachedAt: string;
}

export interface CachedShopDetailData {
  shop: Shop | null;
  entries: LedgerEntry[];
  disputes: Dispute[];
  priceMemory: PriceMemoryItem[];
  cachedAt: string;
}

export async function cacheHouseholdContext(ctx: HouseholdContextData): Promise<void> {
  try {
    await AsyncStorage.setItem(HOUSEHOLD_CONTEXT_CACHE_KEY, JSON.stringify(ctx));
  } catch {
    // Non-fatal if storage full
  }
}

export async function getCachedHouseholdContext(): Promise<HouseholdContextData | null> {
  try {
    const raw = await AsyncStorage.getItem(HOUSEHOLD_CONTEXT_CACHE_KEY);
    return raw ? (JSON.parse(raw) as HouseholdContextData) : null;
  } catch {
    return null;
  }
}

export async function clearCachedHouseholdContext(): Promise<void> {
  try {
    await AsyncStorage.removeItem(HOUSEHOLD_CONTEXT_CACHE_KEY);
  } catch {
    // Non-fatal
  }
}

export async function cacheHouseholdLedger(
  householdId: string,
  data: Omit<CachedLedgerData, 'cachedAt'>
): Promise<void> {
  try {
    const payload: CachedLedgerData = {
      ...data,
      cachedAt: new Date().toISOString(),
    };
    await AsyncStorage.setItem(`${LEDGER_CACHE_KEY_PREFIX}${householdId}`, JSON.stringify(payload));
  } catch {
    // Non-fatal
  }
}

export async function getCachedHouseholdLedger(
  householdId: string
): Promise<CachedLedgerData | null> {
  try {
    const raw = await AsyncStorage.getItem(`${LEDGER_CACHE_KEY_PREFIX}${householdId}`);
    return raw ? (JSON.parse(raw) as CachedLedgerData) : null;
  } catch {
    return null;
  }
}

export async function cacheShopDetail(
  shopId: string,
  data: Omit<CachedShopDetailData, 'cachedAt'>
): Promise<void> {
  try {
    const payload: CachedShopDetailData = {
      ...data,
      cachedAt: new Date().toISOString(),
    };
    await AsyncStorage.setItem(`${SHOP_DETAIL_CACHE_PREFIX}${shopId}`, JSON.stringify(payload));
  } catch {
    // Non-fatal
  }
}

export async function getCachedShopDetail(
  shopId: string
): Promise<CachedShopDetailData | null> {
  try {
    const raw = await AsyncStorage.getItem(`${SHOP_DETAIL_CACHE_PREFIX}${shopId}`);
    return raw ? (JSON.parse(raw) as CachedShopDetailData) : null;
  } catch {
    return null;
  }
}

const PERSONAL_EXPENSES_CACHE_PREFIX = 'qelet_personal_expenses_v1_';

export async function cachePersonalExpenses<T = unknown>(
  userId: string,
  expenses: T[]
): Promise<void> {
  try {
    await AsyncStorage.setItem(`${PERSONAL_EXPENSES_CACHE_PREFIX}${userId}`, JSON.stringify(expenses));
  } catch {
    // Non-fatal if storage full
  }
}

export async function getCachedPersonalExpenses<T = unknown>(
  userId: string
): Promise<T[] | null> {
  try {
    const raw = await AsyncStorage.getItem(`${PERSONAL_EXPENSES_CACHE_PREFIX}${userId}`);
    return raw ? (JSON.parse(raw) as T[]) : null;
  } catch {
    return null;
  }
}

export async function clearCachedPersonalExpenses(userId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(`${PERSONAL_EXPENSES_CACHE_PREFIX}${userId}`);
  } catch {
    // Non-fatal
  }
}

