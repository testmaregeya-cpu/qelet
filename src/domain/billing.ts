import type {
  LedgerEntry,
  MonthlyBillSummary,
  PaymentAllocationPreviewItem,
  ShopLedgerSummary,
  ShopStatusBadge,
} from '../types/phase2';

const ADDIS_ABABA_OFFSET_MS = 3 * 60 * 60 * 1000;

const SHORT_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

/**
 * Ethiopia (Africa/Addis_Ababa) is permanently UTC+3 with no daylight saving.
 * Returning the local YYYY-MM-DD via UTC+3 offset ensures identical behavior
 * across Android Hermes, Node, and Jest regardless of device locale/ICU settings.
 */
export function getAddisAbabaDateString(date: Date = new Date()): string {
  const shifted = new Date(date.getTime() + ADDIS_ABABA_OFFSET_MS);
  return shifted.toISOString().slice(0, 10);
}

export function validateDateString(dateStr: string): string {
  const trimmed = dateStr.trim();
  if (!/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(trimmed)) {
    throw new Error('Date must be in YYYY-MM-DD format');
  }
  const [y, m, d] = trimmed.split('-').map((n) => Number.parseInt(n, 10));
  const check = new Date(Date.UTC(y, m - 1, d));
  if (
    check.getUTCFullYear() !== y ||
    check.getUTCMonth() + 1 !== m ||
    check.getUTCDate() !== d
  ) {
    throw new Error('Invalid calendar date');
  }
  return trimmed;
}

export function shiftCalendarDays(dateStr: string, deltaDays: number): string {
  const valid = validateDateString(dateStr);
  const [y, m, d] = valid.split('-').map((n) => Number.parseInt(n, 10));
  const shifted = new Date(Date.UTC(y, m - 1, d + deltaDays));
  return shifted.toISOString().slice(0, 10);
}

export function shiftYearMonth(billMonth: string, deltaMonths: number): string {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(billMonth)) {
    throw new Error('Bill month must be in YYYY-MM format');
  }
  const [year, month] = billMonth.split('-').map((n) => Number.parseInt(n, 10));
  const totalMonths = year * 12 + (month - 1) + deltaMonths;
  const nextYear = Math.floor(totalMonths / 12);
  const nextMonth = (totalMonths % 12) + 1;
  return `${nextYear}-${String(nextMonth).padStart(2, '0')}`;
}

export function formatBillMonthLabel(billMonth: string): string {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(billMonth)) {
    return billMonth;
  }
  const [year, month] = billMonth.split('-');
  const monthIdx = Number.parseInt(month, 10) - 1;
  return `${SHORT_MONTHS[monthIdx]} ${year}`;
}

export function getStandardBillMonth(entryDate: string): string {
  const valid = validateDateString(entryDate);
  const ym = valid.slice(0, 7);
  const day = Number.parseInt(valid.slice(8, 10), 10);
  return day >= 27 ? shiftYearMonth(ym, 1) : ym;
}

export function evaluateBillStatus(
  billMonth: string,
  remainingSantim: number,
  todayDate: string
): ShopStatusBadge {
  if (remainingSantim <= 0) {
    return 'PAID';
  }
  const dueSoonStart = `${billMonth}-21`;
  const dueNowStart = `${billMonth}-24`;
  const cutoffEnd = `${billMonth}-26`;

  if (todayDate > cutoffEnd) {
    return 'OVERDUE';
  }
  if (todayDate >= dueNowStart) {
    return 'DUE NOW';
  }
  if (todayDate >= dueSoonStart) {
    return 'DUE SOON';
  }
  return 'OPEN';
}

/**
 * Calculates a shop's live balance, monthly bills with FIFO oldest-bill-first
 * payment allocation, and shop status badge from raw ledger entries.
 */
export function calculateShopLedgerSummary(
  entries: readonly LedgerEntry[],
  todayDate: string = getAddisAbabaDateString()
): ShopLedgerSummary {
  const validToday = validateDateString(todayDate);
  const active = entries.filter((entry) => !entry.voided);

  let totalChargedSantim = 0;
  let totalPaidSantim = 0;
  const chargesByMonth = new Map<string, number>();

  for (const entry of active) {
    if (entry.type === 'charge') {
      totalChargedSantim += entry.total_amount_santim;
      const monthKey = entry.bill_month ?? getStandardBillMonth(entry.entry_date);
      chargesByMonth.set(monthKey, (chargesByMonth.get(monthKey) ?? 0) + entry.total_amount_santim);
    } else {
      totalPaidSantim += entry.total_amount_santim;
    }
  }

  const sortedMonths = Array.from(chargesByMonth.keys()).sort();
  let remainingPaymentPool = totalPaidSantim;

  const bills: MonthlyBillSummary[] = sortedMonths.map((billMonth) => {
    const chargedSantim = chargesByMonth.get(billMonth) ?? 0;
    const paidSantim = Math.min(chargedSantim, remainingPaymentPool);
    remainingPaymentPool -= paidSantim;
    const remainingSantim = chargedSantim - paidSantim;
    const status = evaluateBillStatus(billMonth, remainingSantim, validToday);

    return {
      billMonth,
      label: formatBillMonthLabel(billMonth),
      chargedSantim,
      paidSantim,
      remainingSantim,
      status,
    };
  });

  const balanceSantim = totalChargedSantim - totalPaidSantim;
  const unappliedCreditSantim = balanceSantim < 0 ? Math.abs(balanceSantim) : 0;
  const oldestUnpaid = bills.find((b) => b.remainingSantim > 0) ?? null;

  let status: ShopStatusBadge;
  if (balanceSantim <= 0 || !oldestUnpaid) {
    status = 'PAID';
  } else {
    status = oldestUnpaid.status;
  }

  return {
    totalChargedSantim,
    totalPaidSantim,
    balanceSantim,
    unappliedCreditSantim,
    status,
    oldestUnpaidBillMonth: oldestUnpaid?.billMonth ?? null,
    bills,
  };
}

/**
 * Checks the locked "roll to next month" rule for days 24–26:
 * If a payment was recorded on days 24–26 of the current month AND the shop's
 * current month bill (plus any older bills) is settled to 0, a new charge added
 * during days 24–26 rolls automatically to next month's bill.
 */
export function resolveDefaultBillMonth(
  entries: readonly LedgerEntry[],
  entryDate: string
): { billMonth: string; rolledAfterPayoff: boolean } {
  const validDate = validateDateString(entryDate);
  const ym = validDate.slice(0, 7);
  const day = Number.parseInt(validDate.slice(8, 10), 10);

  if (day >= 27) {
    return {
      billMonth: shiftYearMonth(ym, 1),
      rolledAfterPayoff: false,
    };
  }

  if (day >= 24 && day <= 26) {
    const summary = calculateShopLedgerSummary(entries, validDate);
    const billsUpToCurrent = summary.bills.filter((b) => b.billMonth <= ym);
    const allUpToCurrentSettled =
      billsUpToCurrent.length > 0 && billsUpToCurrent.every((b) => b.remainingSantim === 0);
    const hasWindowPayment = entries.some(
      (entry) =>
        !entry.voided &&
        entry.type === 'payment' &&
        entry.entry_date >= `${ym}-24` &&
        entry.entry_date <= validDate
    );

    if (hasWindowPayment && allUpToCurrentSettled) {
      return {
        billMonth: shiftYearMonth(ym, 1),
        rolledAfterPayoff: true,
      };
    }
  }

  return {
    billMonth: ym,
    rolledAfterPayoff: false,
  };
}

/**
 * Previews how a proposed payment amount allocates FIFO across unpaid bills.
 */
export function previewPaymentAllocation(
  summary: ShopLedgerSummary,
  paymentSantim: number
): {
  allocations: PaymentAllocationPreviewItem[];
  creditCarrySantim: number;
} {
  let pool = Math.max(0, paymentSantim);
  const allocations: PaymentAllocationPreviewItem[] = [];

  for (const bill of summary.bills) {
    if (bill.remainingSantim <= 0 || pool <= 0) {
      continue;
    }
    const allocatedSantim = Math.min(bill.remainingSantim, pool);
    pool -= allocatedSantim;
    allocations.push({
      billMonth: bill.billMonth,
      label: bill.label,
      allocatedSantim,
      remainingAfterSantim: bill.remainingSantim - allocatedSantim,
    });
  }

  return {
    allocations,
    creditCarrySantim: pool,
  };
}
