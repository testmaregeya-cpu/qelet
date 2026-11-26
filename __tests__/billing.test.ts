import {
  calculateShopLedgerSummary,
  evaluateBillStatus,
  getAddisAbabaDateString,
  getStandardBillMonth,
  previewPaymentAllocation,
  resolveDefaultBillMonth,
  shiftCalendarDays,
  shiftYearMonth,
} from '../src/domain/billing';
import type { LedgerEntry } from '../src/types/phase2';

function makeCharge(
  id: string,
  entryDate: string,
  billMonth: string,
  santim: number,
  voided = false
): LedgerEntry {
  return {
    id,
    household_id: 'h1',
    shop_id: 's1',
    type: 'charge',
    entry_date: entryDate,
    bill_month: billMonth,
    total_amount_santim: santim,
    note: '',
    created_by: 'u1',
    created_at: `${entryDate}T10:00:00Z`,
    edited_at: null,
    edit_count: 0,
    voided,
    voided_by: null,
    voided_at: null,
    void_reason: null,
  };
}

function makePayment(id: string, entryDate: string, santim: number, voided = false): LedgerEntry {
  return {
    id,
    household_id: 'h1',
    shop_id: 's1',
    type: 'payment',
    entry_date: entryDate,
    bill_month: null,
    total_amount_santim: santim,
    note: '',
    created_by: 'u1',
    created_at: `${entryDate}T12:00:00Z`,
    edited_at: null,
    edit_count: 0,
    voided,
    voided_by: null,
    voided_at: null,
    void_reason: null,
  };
}

describe('Phase 2 billing cycles, FIFO payments, status badges, and day 24-26 rollovers', () => {
  test('converts UTC timestamps to Addis Ababa (UTC+3) local YYYY-MM-DD', () => {
    // 2026-11-26 21:30 UTC is 2026-11-27 00:30 in Addis Ababa -> belongs to next day!
    const lateNightAddis = new Date('2026-11-26T21:30:00Z');
    expect(getAddisAbabaDateString(lateNightAddis)).toBe('2026-11-27');
    expect(getStandardBillMonth('2026-11-26')).toBe('2026-11');
    expect(getStandardBillMonth('2026-11-27')).toBe('2026-12');
    expect(getStandardBillMonth('2026-12-27')).toBe('2027-01');
  });

  test('shifts calendar days and bill months across year boundaries', () => {
    expect(shiftYearMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftYearMonth('2027-01', -1)).toBe('2026-12');
    expect(shiftCalendarDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  test('evaluates PAID, OPEN, DUE SOON, DUE NOW, and OVERDUE status badges', () => {
    expect(evaluateBillStatus('2026-11', 0, '2026-11-28')).toBe('PAID');
    expect(evaluateBillStatus('2026-11', 5000, '2026-11-20')).toBe('OPEN');
    expect(evaluateBillStatus('2026-11', 5000, '2026-11-21')).toBe('DUE SOON');
    expect(evaluateBillStatus('2026-11', 5000, '2026-11-23')).toBe('DUE SOON');
    expect(evaluateBillStatus('2026-11', 5000, '2026-11-24')).toBe('DUE NOW');
    expect(evaluateBillStatus('2026-11', 5000, '2026-11-26')).toBe('DUE NOW');
    expect(evaluateBillStatus('2026-11', 5000, '2026-11-27')).toBe('OVERDUE');
  });

  test('allocates partial payments FIFO oldest bill first and excludes voided entries', () => {
    const entries: LedgerEntry[] = [
      makeCharge('c1', '2026-10-15', '2026-10', 50_000), // 500 ETB
      makeCharge('c2', '2026-11-05', '2026-11', 80_000), // 800 ETB
      makeCharge('c_void', '2026-11-06', '2026-11', 99_900, true), // voided -> ignored
      makePayment('p1', '2026-11-10', 60_000), // 600 ETB partial payment
      makePayment('p_void', '2026-11-11', 50_000, true), // voided -> ignored
    ];

    const nov15 = calculateShopLedgerSummary(entries, '2026-11-15');
    expect(nov15.totalChargedSantim).toBe(130_000);
    expect(nov15.totalPaidSantim).toBe(60_000);
    expect(nov15.balanceSantim).toBe(70_000); // 700 ETB owed
    expect(nov15.status).toBe('OPEN');
    expect(nov15.oldestUnpaidBillMonth).toBe('2026-11');
    expect(nov15.bills).toEqual([
      {
        billMonth: '2026-10',
        label: 'Oct 2026',
        chargedSantim: 50_000,
        paidSantim: 50_000,
        remainingSantim: 0,
        status: 'PAID',
      },
      {
        billMonth: '2026-11',
        label: 'Nov 2026',
        chargedSantim: 80_000,
        paidSantim: 10_000,
        remainingSantim: 70_000,
        status: 'OPEN',
      },
    ]);

    expect(calculateShopLedgerSummary(entries, '2026-11-22').status).toBe('DUE SOON');
    expect(calculateShopLedgerSummary(entries, '2026-11-25').status).toBe('DUE NOW');
    expect(calculateShopLedgerSummary(entries, '2026-11-27').status).toBe('OVERDUE');
  });

  test('rolls new day 24-26 charges to next month after full settlement and keeps settled bill PAID', () => {
    const baseEntries: LedgerEntry[] = [
      makeCharge('c1', '2026-11-10', '2026-11', 100_000), // 1,000 ETB
    ];

    // Before payment on Nov 24 -> still belongs to Nov 2026
    expect(resolveDefaultBillMonth(baseEntries, '2026-11-24')).toEqual({
      billMonth: '2026-11',
      rolledAfterPayoff: false,
    });

    // Partial payment (600 ETB) on Nov 24 -> Nov 25 still stays in Nov 2026
    const afterPartial = [...baseEntries, makePayment('p_partial', '2026-11-24', 60_000)];
    expect(resolveDefaultBillMonth(afterPartial, '2026-11-25')).toEqual({
      billMonth: '2026-11',
      rolledAfterPayoff: false,
    });

    // Full settlement (1,000 ETB total paid) on Nov 24 -> Nov 25 purchase rolls to Dec 2026
    const afterFull = [...afterPartial, makePayment('p_rest', '2026-11-24', 40_000)];
    expect(resolveDefaultBillMonth(afterFull, '2026-11-25')).toEqual({
      billMonth: '2026-12',
      rolledAfterPayoff: true,
    });

    // Second purchase on Nov 26 ALSO rolls to Dec 2026 even though Dec now has a balance!
    const afterFirstDecCharge = [
      ...afterFull,
      makeCharge('c2', '2026-11-25', '2026-12', 5_000),
    ];
    expect(resolveDefaultBillMonth(afterFirstDecCharge, '2026-11-26')).toEqual({
      billMonth: '2026-12',
      rolledAfterPayoff: true,
    });

    // On Nov 27, Nov 2026 stays PAID and shop is OPEN (NOT OVERDUE!) for the rolled Dec charge
    const nov27Summary = calculateShopLedgerSummary(afterFirstDecCharge, '2026-11-27');
    expect(nov27Summary.status).toBe('OPEN');
    expect(nov27Summary.bills[0].status).toBe('PAID');
    expect(nov27Summary.bills[1].billMonth).toBe('2026-12');
    expect(nov27Summary.bills[1].status).toBe('OPEN');
  });

  test('previews FIFO payment allocation and credit carry cleanly', () => {
    const entries: LedgerEntry[] = [
      makeCharge('c1', '2026-10-10', '2026-10', 30_000),
      makeCharge('c2', '2026-11-10', '2026-11', 50_000),
    ];
    const summary = calculateShopLedgerSummary(entries, '2026-11-24');
    const preview = previewPaymentAllocation(summary, 90_000);

    expect(preview.allocations).toEqual([
      { billMonth: '2026-10', label: 'Oct 2026', allocatedSantim: 30_000, remainingAfterSantim: 0 },
      { billMonth: '2026-11', label: 'Nov 2026', allocatedSantim: 50_000, remainingAfterSantim: 0 },
    ]);
    expect(preview.creditCarrySantim).toBe(10_000);
  });
});
