import {
  calculateShopLedgerSummary,
  getAddisAbabaDateString,
  getStandardBillMonth,
  shiftYearMonth,
} from '../billing';
import type { Shop } from '../../types/phase1';
import type { LedgerEntry } from '../../types/phase2';
import type { ItemSuggestion } from '../../types/phase4to6';
import { estimateMedianAmountSantim, recencyWeight } from './textClassifier';
import {
  detectAnomalyZScore,
  detectRecurringCadence,
  diffCalendarDays,
  forecastPeriodEnd,
  getDayOfWeekUtc,
  type AnomalySignal,
  type PeriodForecast,
  type RecurringPattern,
} from './timeSeriesAndAnomalies';

export interface SmartChargeSuggestion extends ItemSuggestion {
  mlScore: number;
  badgeHint: string | null;
}

export interface ShopPriceAnomaly {
  shopId: string;
  shopName: string;
  itemName: string;
  unit: string;
  previousMedianSantim: number;
  latestPriceSantim: number;
  deltaSantim: number;
  percentChange: number;
  direction: 'increase' | 'decrease';
  latestDate: string;
  observations: number;
}

export interface HouseholdPaydayForecast {
  billMonth: string;
  currentOwedSantim: number;
  projectedPaydayTotalSantim: number;
  additionalExpectedSantim: number;
  lowPaydayTotalSantim: number;
  highPaydayTotalSantim: number;
  daysUntilPaydayWindow: number;
  inPaydayWindow: boolean;
  confidence: PeriodForecast['confidence'];
}

export interface ShopBaselineAnomaly {
  shopId: string;
  shopName: string;
  signal: AnomalySignal;
}

export interface HouseholdMlReport {
  paydayForecast: HouseholdPaydayForecast;
  priceAnomalies: ShopPriceAnomaly[];
  recurringShopItems: RecurringPattern[];
  totalSpendAnomaly: AnomalySignal | null;
  shopAnomalies: ShopBaselineAnomaly[];
}

/**
 * Re-ranks quick-add item suggestions at a shop using market-basket co-occurrence
 * (items bought together on the same receipt), day-of-week buying patterns, and recency.
 */
export function predictSmartChargeSuggestions(params: {
  baseSuggestions: readonly ItemSuggestion[];
  shopEntries: readonly LedgerEntry[];
  currentLineItemNames?: readonly string[];
  targetDate?: string;
  limit?: number;
}): SmartChargeSuggestion[] {
  const {
    baseSuggestions,
    shopEntries,
    currentLineItemNames = [],
    targetDate = getAddisAbabaDateString(),
    limit = 8,
  } = params;

  const activeCartKeys = new Set(
    currentLineItemNames
      .map((n) => n.trim().toLowerCase())
      .filter((n) => n.length > 0)
  );

  const targetDow = getDayOfWeekUtc(targetDate);
  const itemCounts = new Map<string, number>();
  const itemWeekdayCounts = new Map<string, number>();
  const itemRecencyScores = new Map<string, number>();
  const coOccurrence = new Map<string, Map<string, number>>();
  const itemDisplayNames = new Map<string, string>();

  for (const entry of shopEntries) {
    if (entry.voided || entry.type !== 'charge') continue;
    const lines = entry.entry_lines ?? [];
    if (lines.length === 0) continue;

    const age = Math.max(0, diffCalendarDays(entry.entry_date, targetDate));
    const rw = recencyWeight(age, 60);
    const sameDow = getDayOfWeekUtc(entry.entry_date) === targetDow;

    const keysInReceipt = Array.from(
      new Set(
        lines
          .map((l) => {
            const k = l.item_name.trim().toLowerCase();
            if (k && !itemDisplayNames.has(k)) {
              itemDisplayNames.set(k, l.item_name.trim());
            }
            return k;
          })
          .filter(Boolean)
      )
    );

    for (const key of keysInReceipt) {
      itemCounts.set(key, (itemCounts.get(key) ?? 0) + 1);
      itemRecencyScores.set(key, (itemRecencyScores.get(key) ?? 0) + rw);
      if (sameDow) {
        itemWeekdayCounts.set(key, (itemWeekdayCounts.get(key) ?? 0) + 1);
      }

      let partnerMap = coOccurrence.get(key);
      if (!partnerMap) {
        partnerMap = new Map<string, number>();
        coOccurrence.set(key, partnerMap);
      }
      for (const other of keysInReceipt) {
        if (other !== key) {
          partnerMap.set(other, (partnerMap.get(other) ?? 0) + 1);
        }
      }
    }
  }

  const scored: SmartChargeSuggestion[] = [];

  for (const sug of baseSuggestions) {
    if (sug.unit_price_santim <= 0) continue;
    const key = sug.key.trim().toLowerCase();

    // Hide items already placed in the current receipt to surface relevant next additions
    if (activeCartKeys.has(key)) continue;

    let bestLift = 0;
    let bestAnchorName: string | null = null;
    for (const cartKey of activeCartKeys) {
      const anchorTotal = itemCounts.get(cartKey) ?? 0;
      if (anchorTotal <= 0) continue;
      const pairedCount = coOccurrence.get(cartKey)?.get(key) ?? 0;
      const condProb = pairedCount / anchorTotal;
      if (pairedCount >= 1 && condProb > bestLift) {
        bestLift = condProb;
        bestAnchorName = itemDisplayNames.get(cartKey) ?? cartKey;
      }
    }

    const totalCount = itemCounts.get(key) ?? 0;
    const dowCount = itemWeekdayCounts.get(key) ?? 0;
    const dowShare = totalCount >= 2 ? dowCount / totalCount : 0;
    const recency = itemRecencyScores.get(key) ?? 0;

    const mlScore =
      bestLift * 4.5 +
      (dowShare >= 0.45 ? dowShare * 1.8 : 0) +
      recency * 0.9 +
      Math.log1p(sug.use_count) * 0.65;

    let badgeHint: string | null = null;
    if (bestLift >= 0.35 && bestAnchorName) {
      badgeHint = `With ${bestAnchorName}`;
    } else if (totalCount >= 3 && dowShare >= 0.5) {
      badgeHint = 'Today pick';
    }

    scored.push({
      ...sug,
      mlScore: Number(mlScore.toFixed(3)),
      badgeHint,
    });
  }

  scored.sort(
    (a, b) =>
      b.mlScore - a.mlScore ||
      b.use_count - a.use_count ||
      a.item_name.localeCompare(b.item_name)
  );

  return scored.slice(0, limit);
}

/**
 * Detects unit-price inflation or drops across historical shop line items.
 */
export function detectShopPriceAnomalies(params: {
  entries: readonly LedgerEntry[];
  shops: readonly Shop[];
  minDeltaSantim?: number;
  minPercentChange?: number;
}): ShopPriceAnomaly[] {
  const minDeltaSantim = params.minDeltaSantim ?? 500; // 5 ETB
  const minPercentChange = params.minPercentChange ?? 12;

  const shopById = new Map(params.shops.map((s) => [s.id, s]));
  const historyByShopItem = new Map<
    string,
    {
      shopId: string;
      shopName: string;
      itemName: string;
      unit: string;
      points: { date: string; createdAt: string; priceSantim: number }[];
    }
  >();

  for (const entry of params.entries) {
    if (entry.voided || entry.type !== 'charge') continue;
    const shop = shopById.get(entry.shop_id);
    if (!shop || shop.archived || shop.merged_into_shop_id !== null) continue;

    for (const line of entry.entry_lines ?? []) {
      if (line.unit_price_santim <= 0) continue;
      const itemKey = line.item_name.trim().toLowerCase();
      if (!itemKey) continue;

      const compositeKey = `${entry.shop_id}::${itemKey}`;
      let group = historyByShopItem.get(compositeKey);
      if (!group) {
        group = {
          shopId: entry.shop_id,
          shopName: shop.name,
          itemName: line.item_name.trim(),
          unit: line.unit,
          points: [],
        };
        historyByShopItem.set(compositeKey, group);
      }
      group.points.push({
        date: entry.entry_date,
        createdAt: entry.created_at,
        priceSantim: line.unit_price_santim,
      });
    }
  }

  const anomalies: ShopPriceAnomaly[] = [];

  for (const group of historyByShopItem.values()) {
    if (group.points.length < 2) continue;

    group.points.sort(
      (a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt)
    );

    const latest = group.points[group.points.length - 1];
    const priorPoints = group.points.slice(0, -1);
    const previousMedianSantim =
      estimateMedianAmountSantim(priorPoints.map((p) => p.priceSantim)) ?? 0;
    if (previousMedianSantim <= 0) continue;

    const deltaSantim = latest.priceSantim - previousMedianSantim;
    const percentChange = Math.round((deltaSantim / previousMedianSantim) * 100);

    if (
      Math.abs(deltaSantim) >= minDeltaSantim &&
      Math.abs(percentChange) >= minPercentChange
    ) {
      anomalies.push({
        shopId: group.shopId,
        shopName: group.shopName,
        itemName: group.itemName,
        unit: group.unit,
        previousMedianSantim,
        latestPriceSantim: latest.priceSantim,
        deltaSantim,
        percentChange,
        direction: deltaSantim >= 0 ? 'increase' : 'decrease',
        latestDate: latest.date,
        observations: group.points.length,
      });
    }
  }

  return anomalies.sort(
    (a, b) => Math.abs(b.percentChange) - Math.abs(a.percentChange) || Math.abs(b.deltaSantim) - Math.abs(a.deltaSantim)
  );
}

/**
 * Forecasts the household's total settlement bill approaching the Days 24-26 Payday Window.
 */
export function forecastHouseholdPaydayBill(params: {
  entries: readonly LedgerEntry[];
  shops: readonly Shop[];
  todayDate?: string;
}): HouseholdPaydayForecast {
  const todayDate = params.todayDate ?? getAddisAbabaDateString();
  const activeBillMonth = getStandardBillMonth(todayDate);
  const currentYm = todayDate.slice(0, 7);
  const dayOfMonth = Number.parseInt(todayDate.slice(8, 10), 10);

  // Sum current unpaid shop balances across active shops
  const entriesByShop = new Map<string, LedgerEntry[]>();
  for (const e of params.entries) {
    const arr = entriesByShop.get(e.shop_id);
    if (arr) arr.push(e);
    else entriesByShop.set(e.shop_id, [e]);
  }

  let currentOwedSantim = 0;
  for (const shop of params.shops) {
    if (shop.archived || shop.merged_into_shop_id !== null) continue;
    const summary = calculateShopLedgerSummary(entriesByShop.get(shop.id) ?? [], todayDate);
    if (summary.balanceSantim > 0) {
      currentOwedSantim += summary.balanceSantim;
    }
  }

  const dailyCharges = params.entries
    .filter((e) => !e.voided && e.type === 'charge')
    .map((e) => ({ date: e.entry_date, amountSantim: e.total_amount_santim }));

  // Already billed toward activeBillMonth
  let alreadyChargedCycle = 0;
  for (const e of params.entries) {
    if (e.voided || e.type !== 'charge') continue;
    const bm = e.bill_month ?? getStandardBillMonth(e.entry_date);
    if (bm === activeBillMonth && e.entry_date.startsWith(currentYm)) {
      alreadyChargedCycle += e.total_amount_santim;
    }
  }

  const inPaydayWindow = dayOfMonth >= 24 && dayOfMonth <= 26;
  const daysUntilPaydayWindow = dayOfMonth >= 27 ? 0 : Math.max(0, 24 - dayOfMonth);

  // When already past day 26 (rolled to next bill month) or past payday window close, no extra run before current window
  if (dayOfMonth >= 26) {
    return {
      billMonth: activeBillMonth,
      currentOwedSantim,
      projectedPaydayTotalSantim: currentOwedSantim,
      additionalExpectedSantim: 0,
      lowPaydayTotalSantim: currentOwedSantim,
      highPaydayTotalSantim: currentOwedSantim,
      daysUntilPaydayWindow,
      inPaydayWindow,
      confidence: 'high',
    };
  }

  const forecast = forecastPeriodEnd({
    targetMonthYm: currentYm,
    currentDayOfMonth: dayOfMonth,
    targetEndDay: 25,
    dailySeries: dailyCharges,
  });

  const additionalExpectedSantim = Math.max(0, forecast.projectedTotalSantim - alreadyChargedCycle);
  const additionalLow = Math.max(0, forecast.lowTotalSantim - alreadyChargedCycle);
  const additionalHigh = Math.max(additionalExpectedSantim, forecast.highTotalSantim - alreadyChargedCycle);

  return {
    billMonth: activeBillMonth,
    currentOwedSantim,
    projectedPaydayTotalSantim: currentOwedSantim + additionalExpectedSantim,
    additionalExpectedSantim,
    lowPaydayTotalSantim: currentOwedSantim + additionalLow,
    highPaydayTotalSantim: currentOwedSantim + additionalHigh,
    daysUntilPaydayWindow,
    inPaydayWindow,
    confidence: forecast.confidence,
  };
}

/**
 * Generates household-level on-device ML insights strictly from shared ledger data.
 */
export function computeHouseholdMlReport(params: {
  entries: readonly LedgerEntry[];
  shops: readonly Shop[];
  targetMonth: string;
  todayDate?: string;
}): HouseholdMlReport {
  const todayDate = params.todayDate ?? getAddisAbabaDateString();
  const { entries, shops, targetMonth } = params;

  const paydayForecast = forecastHouseholdPaydayBill({ entries, shops, todayDate });
  const priceAnomalies = detectShopPriceAnomalies({ entries, shops }).slice(0, 5);

  const shopById = new Map(shops.map((s) => [s.id, s]));
  const recurringEvents: { key: string; label: string; date: string; amountSantim: number }[] = [];

  const activeMonths = new Set<string>();
  const monthlyHouseholdCharges = new Map<string, number>();
  const monthlyShopCharges = new Map<string, Map<string, number>>();

  for (const entry of entries) {
    if (entry.voided || entry.type !== 'charge') continue;
    const bm = entry.bill_month ?? getStandardBillMonth(entry.entry_date);
    if (bm < targetMonth) {
      activeMonths.add(bm);
    }

    monthlyHouseholdCharges.set(
      bm,
      (monthlyHouseholdCharges.get(bm) ?? 0) + entry.total_amount_santim
    );

    let shopMap = monthlyShopCharges.get(bm);
    if (!shopMap) {
      shopMap = new Map<string, number>();
      monthlyShopCharges.set(bm, shopMap);
    }
    shopMap.set(entry.shop_id, (shopMap.get(entry.shop_id) ?? 0) + entry.total_amount_santim);

    const shop = shopById.get(entry.shop_id);
    if (shop && !shop.archived && shop.merged_into_shop_id === null) {
      for (const line of entry.entry_lines ?? []) {
        const normName = line.item_name.trim().toLowerCase();
        if (!normName) continue;
        recurringEvents.push({
          key: `${entry.shop_id}::${normName}`,
          label: `${line.item_name.trim()} (${shop.name})`,
          date: entry.entry_date,
          amountSantim: line.line_total_santim,
        });
      }
    }
  }

  const recurringShopItems = detectRecurringCadence(recurringEvents, todayDate).slice(0, 4);

  // Gather up to 6 prior active bill months for household Z-score baseline
  const priorMonths: string[] = [];
  let cursor = shiftYearMonth(targetMonth, -1);
  for (let i = 0; i < 6; i++) {
    if (activeMonths.has(cursor)) priorMonths.push(cursor);
    cursor = shiftYearMonth(cursor, -1);
  }

  let totalSpendAnomaly: AnomalySignal | null = null;
  const shopAnomalies: ShopBaselineAnomaly[] = [];

  if (priorMonths.length >= 3) {
    const currentTotal = monthlyHouseholdCharges.get(targetMonth) ?? 0;
    const priorTotals = priorMonths.map((ym) => monthlyHouseholdCharges.get(ym) ?? 0);
    if (currentTotal > 0) {
      totalSpendAnomaly = detectAnomalyZScore(currentTotal, priorTotals, {
        minHistory: 3,
        zThreshold: 1.65,
        minAbsoluteDelta: 10000, // 100 ETB
        minPercentDelta: 20,
      });
    }

    const currentShopMap = monthlyShopCharges.get(targetMonth);
    if (currentShopMap) {
      for (const [shopId, curShopTotal] of currentShopMap.entries()) {
        if (curShopTotal <= 0) continue;
        const shopHistory = priorMonths.map((ym) => monthlyShopCharges.get(ym)?.get(shopId) ?? 0);
        const signal = detectAnomalyZScore(curShopTotal, shopHistory, {
          minHistory: 3,
          zThreshold: 1.65,
          minAbsoluteDelta: 7500, // 75 ETB
          minPercentDelta: 25,
        });
        if (signal) {
          const shop = shopById.get(shopId);
          if (shop) {
            shopAnomalies.push({ shopId, shopName: shop.name, signal });
          }
        }
      }
      shopAnomalies.sort((a, b) => Math.abs(b.signal.zScore) - Math.abs(a.signal.zScore));
    }
  }

  return {
    paydayForecast,
    priceAnomalies,
    recurringShopItems,
    totalSpendAnomaly,
    shopAnomalies: shopAnomalies.slice(0, 3),
  };
}
