export type EntryType = 'charge' | 'payment';

export type ShopStatusBadge = 'PAID' | 'OPEN' | 'DUE SOON' | 'DUE NOW' | 'OVERDUE';

export interface EntryLine {
  id: string;
  household_id: string;
  entry_id: string;
  catalog_item_id?: string | null;
  item_name: string;
  quantity_milli: number;
  unit: string;
  unit_price_santim: number;
  line_total_santim: number;
  sort_order: number;
}

export interface LedgerEntry {
  id: string;
  household_id: string;
  shop_id: string;
  type: EntryType;
  entry_date: string; // YYYY-MM-DD in Africa/Addis_Ababa
  bill_month: string | null; // YYYY-MM for charges, null for payments
  total_amount_santim: number;
  note: string;
  created_by: string;
  created_at: string;
  edited_at: string | null;
  edit_count: number;
  voided: boolean;
  voided_by: string | null;
  voided_at: string | null;
  void_reason: string | null;
  entry_lines?: EntryLine[];
}

export interface PriceMemoryItem {
  household_id: string;
  shop_id: string;
  item_key: string;
  item_name: string;
  last_unit: string;
  last_unit_price_santim: number;
  last_used: string;
  use_count: number;
}

export interface ChargeLineDraft {
  catalog_item_id?: string | null;
  item_name: string;
  quantity_milli: number;
  unit: string;
  unit_price_santim: number;
}

export interface MonthlyBillSummary {
  billMonth: string; // YYYY-MM
  label: string; // e.g. "Nov 2026"
  chargedSantim: number;
  paidSantim: number;
  remainingSantim: number;
  status: ShopStatusBadge;
}

export interface ShopLedgerSummary {
  totalChargedSantim: number;
  totalPaidSantim: number;
  balanceSantim: number; // positive = owed, 0 = paid, negative = credit advance
  unappliedCreditSantim: number;
  status: ShopStatusBadge;
  oldestUnpaidBillMonth: string | null;
  bills: MonthlyBillSummary[];
}

export interface PaymentAllocationPreviewItem {
  billMonth: string;
  label: string;
  allocatedSantim: number;
  remainingAfterSantim: number;
}
