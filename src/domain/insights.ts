import { formatBillMonthLabel, getAddisAbabaDateString, getStandardBillMonth } from './billing';
import type { Member, Shop } from '../types/phase1';
import type { LedgerEntry } from '../types/phase2';

export interface PersonInsight {
  userId: string;
  displayName: string;
  avatarColor: string;
  chargedSantim: number;
  paidSantim: number;
  sharePercent: number;
}

export interface ShopInsight {
  shopId: string;
  shopName: string;
  chargedSantim: number;
  sharePercent: number;
}

export interface ItemInsight {
  itemKey: string;
  itemName: string;
  unit: string;
  totalQuantityMilli: number;
  totalSantim: number;
  lineCount: number;
}

export interface MonthlyInsightsReport {
  month: string;
  label: string;
  totalChargedSantim: number;
  totalPaidSantim: number;
  byPerson: PersonInsight[];
  byShop: ShopInsight[];
  topItems: ItemInsight[];
}

export function getAvailableInsightMonths(
  entries: readonly LedgerEntry[],
  todayDate: string = getAddisAbabaDateString()
): string[] {
  const months = new Set<string>([getStandardBillMonth(todayDate)]);
  for (const entry of entries) {
    if (entry.voided) continue;
    if (entry.type === 'charge' && entry.bill_month) {
      months.add(entry.bill_month);
    } else if (entry.type === 'payment') {
      months.add(entry.entry_date.slice(0, 7));
    }
  }
  return Array.from(months).sort().reverse();
}

export function computeMonthlyInsights(
  entries: readonly LedgerEntry[],
  shops: readonly Shop[],
  members: readonly Member[],
  targetMonth: string
): MonthlyInsightsReport {
  const shopMap = new Map(shops.map((s) => [s.id, s]));
  const memberMap = new Map(members.map((m) => [m.user_id, m]));

  let totalChargedSantim = 0;
  let totalPaidSantim = 0;

  const personCharges = new Map<string, number>();
  const personPayments = new Map<string, number>();
  const shopCharges = new Map<string, number>();
  const itemTotals = new Map<string, ItemInsight>();

  for (const entry of entries) {
    if (entry.voided) continue;

    if (entry.type === 'charge') {
      const entryBillMonth = entry.bill_month ?? getStandardBillMonth(entry.entry_date);
      if (entryBillMonth !== targetMonth) continue;

      totalChargedSantim += entry.total_amount_santim;
      personCharges.set(
        entry.created_by,
        (personCharges.get(entry.created_by) ?? 0) + entry.total_amount_santim
      );
      shopCharges.set(
        entry.shop_id,
        (shopCharges.get(entry.shop_id) ?? 0) + entry.total_amount_santim
      );

      for (const line of entry.entry_lines ?? []) {
        const key = line.item_name.trim().toLowerCase();
        const existing = itemTotals.get(key);
        if (existing) {
          existing.totalQuantityMilli += line.quantity_milli;
          existing.totalSantim += line.line_total_santim;
          existing.lineCount += 1;
        } else {
          itemTotals.set(key, {
            itemKey: key,
            itemName: line.item_name.trim(),
            unit: line.unit,
            totalQuantityMilli: line.quantity_milli,
            totalSantim: line.line_total_santim,
            lineCount: 1,
          });
        }
      }
    } else if (entry.type === 'payment') {
      const paymentMonth = entry.entry_date.slice(0, 7);
      if (paymentMonth !== targetMonth) continue;

      totalPaidSantim += entry.total_amount_santim;
      personPayments.set(
        entry.created_by,
        (personPayments.get(entry.created_by) ?? 0) + entry.total_amount_santim
      );
    }
  }

  const personIds = new Set<string>([
    ...members.map((m) => m.user_id),
    ...personCharges.keys(),
    ...personPayments.keys(),
  ]);

  const byPerson: PersonInsight[] = Array.from(personIds)
    .map((userId) => {
      const member = memberMap.get(userId);
      const chargedSantim = personCharges.get(userId) ?? 0;
      const paidSantim = personPayments.get(userId) ?? 0;
      const sharePercent =
        totalChargedSantim > 0 ? Math.round((chargedSantim / totalChargedSantim) * 100) : 0;
      return {
        userId,
        displayName: member?.display_name ?? 'Partner',
        avatarColor: member?.avatar_color ?? '#146C43',
        chargedSantim,
        paidSantim,
        sharePercent,
      };
    })
    .sort((a, b) => b.chargedSantim - a.chargedSantim);

  const byShop: ShopInsight[] = Array.from(shopCharges.entries())
    .map(([shopId, chargedSantim]) => ({
      shopId,
      shopName: shopMap.get(shopId)?.name ?? 'Unknown Shop',
      chargedSantim,
      sharePercent:
        totalChargedSantim > 0 ? Math.round((chargedSantim / totalChargedSantim) * 100) : 0,
    }))
    .sort((a, b) => b.chargedSantim - a.chargedSantim);

  const topItems = Array.from(itemTotals.values()).sort(
    (a, b) => b.totalSantim - a.totalSantim
  );

  return {
    month: targetMonth,
    label: formatBillMonthLabel(targetMonth),
    totalChargedSantim,
    totalPaidSantim,
    byPerson,
    byShop,
    topItems,
  };
}
