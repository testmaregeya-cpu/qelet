import * as Crypto from 'expo-crypto';
import { validateDisputeNote, validateVoidReason } from '../lib/entryHistory';
import { getSupabaseClient } from '../lib/supabase';
import { markEntryLoggedTodayAndSyncReminder, notifyPartnerOfLedgerEntry } from './notifications';
import type { ChargeLineDraft, LedgerEntry, PriceMemoryItem } from '../types/phase2';
import type { Dispute, EntryHistoryRecord } from '../types/phase3';

export async function fetchHouseholdEntries(householdId: string): Promise<LedgerEntry[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('entries')
    .select('*, entry_lines(*)')
    .eq('household_id', householdId)
    .order('entry_date', { ascending: false })
    .order('created_at', { ascending: false })
    .returns<LedgerEntry[]>();

  if (error) {
    throw new Error(error.message);
  }

  return normalizeEntries(data ?? []);
}

export async function fetchShopEntries(shopId: string): Promise<LedgerEntry[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('entries')
    .select('*, entry_lines(*)')
    .eq('shop_id', shopId)
    .order('entry_date', { ascending: false })
    .order('created_at', { ascending: false })
    .returns<LedgerEntry[]>();

  if (error) {
    throw new Error(error.message);
  }

  return normalizeEntries(data ?? []);
}

export async function fetchEntryDetail(entryId: string): Promise<{
  entry: LedgerEntry | null;
  disputes: Dispute[];
}> {
  const supabase = getSupabaseClient();
  const [{ data: entry, error: entryError }, { data: disputes, error: disputeError }] =
    await Promise.all([
      supabase
        .from('entries')
        .select('*, entry_lines(*)')
        .eq('id', entryId)
        .maybeSingle<LedgerEntry>(),
      supabase
        .from('disputes')
        .select('*')
        .eq('entry_id', entryId)
        .order('raised_at', { ascending: false })
        .returns<Dispute[]>(),
    ]);

  if (entryError) {
    throw new Error(entryError.message);
  }
  if (disputeError) {
    throw new Error(disputeError.message);
  }

  return {
    entry: entry ? normalizeEntries([entry])[0] : null,
    disputes: disputes ?? [],
  };
}

export async function fetchHouseholdDisputes(householdId: string): Promise<Dispute[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('disputes')
    .select('*')
    .eq('household_id', householdId)
    .order('raised_at', { ascending: false })
    .returns<Dispute[]>();

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

export async function fetchEntryHistory(entryId: string): Promise<EntryHistoryRecord[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc('get_entry_history', {
    p_entry_id: entryId,
  });

  if (error) {
    throw new Error(error.message);
  }

  return (data as EntryHistoryRecord[]) ?? [];
}

export async function fetchShopPriceMemory(shopId: string): Promise<PriceMemoryItem[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('price_memory')
    .select('*')
    .eq('shop_id', shopId)
    .order('use_count', { ascending: false })
    .order('last_used', { ascending: false })
    .returns<PriceMemoryItem[]>();

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

export async function fetchHouseholdPriceMemory(householdId: string): Promise<PriceMemoryItem[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('price_memory')
    .select('*')
    .eq('household_id', householdId)
    .order('use_count', { ascending: false })
    .order('last_used', { ascending: false })
    .returns<PriceMemoryItem[]>();

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

export async function createChargeEntry(params: {
  shopId: string;
  entryDate: string;
  billMonth: string;
  note: string;
  lines: ChargeLineDraft[];
  clientRequestId?: string;
}): Promise<LedgerEntry> {
  if (params.lines.length === 0) {
    throw new Error('Add at least one item line');
  }

  const clientRequestId = params.clientRequestId ?? Crypto.randomUUID();
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc('create_charge_entry', {
    p_shop_id: params.shopId,
    p_entry_date: params.entryDate,
    p_bill_month: params.billMonth,
    p_note: params.note.trim(),
    p_lines: params.lines.map((line) => ({
      catalog_item_id: line.catalog_item_id ?? null,
      item_name: line.item_name.trim(),
      quantity_milli: line.quantity_milli,
      unit: line.unit.trim() || 'pcs',
      unit_price_santim: line.unit_price_santim,
    })),
    p_client_request_id: clientRequestId,
  });

  if (error) {
    throw new Error(error.message);
  }

  void markEntryLoggedTodayAndSyncReminder(params.entryDate).catch(() => undefined);

  const payload = data as { entry: LedgerEntry; lines: LedgerEntry['entry_lines'] };
  const entryResult = {
    ...payload.entry,
    entry_lines: payload.lines ?? [],
  };

  void notifyPartnerOfLedgerEntry({
    householdId: entryResult.household_id,
    shopId: entryResult.shop_id,
    type: 'charge',
    totalSantim: entryResult.total_amount_santim,
    entryId: entryResult.id,
  }).catch(() => undefined);

  return entryResult;
}

export async function editChargeEntry(params: {
  entryId: string;
  entryDate: string;
  billMonth: string;
  note: string;
  lines: ChargeLineDraft[];
}): Promise<LedgerEntry> {
  if (params.lines.length === 0) {
    throw new Error('Add at least one item line');
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc('edit_charge_entry', {
    p_entry_id: params.entryId,
    p_entry_date: params.entryDate,
    p_bill_month: params.billMonth,
    p_note: params.note.trim(),
    p_lines: params.lines.map((line) => ({
      catalog_item_id: line.catalog_item_id ?? null,
      item_name: line.item_name.trim(),
      quantity_milli: line.quantity_milli,
      unit: line.unit.trim() || 'pcs',
      unit_price_santim: line.unit_price_santim,
    })),
  });

  if (error) {
    throw new Error(error.message);
  }

  const payload = data as { entry: LedgerEntry; lines: LedgerEntry['entry_lines'] };
  return {
    ...payload.entry,
    entry_lines: payload.lines ?? [],
  };
}

export async function createPaymentEntry(params: {
  shopId: string;
  entryDate: string;
  amountSantim: number;
  note: string;
  clientRequestId?: string;
}): Promise<LedgerEntry> {
  if (!Number.isSafeInteger(params.amountSantim) || params.amountSantim <= 0) {
    throw new Error('Payment amount must be greater than 0 ETB');
  }

  const clientRequestId = params.clientRequestId ?? Crypto.randomUUID();
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc('create_payment_entry', {
    p_shop_id: params.shopId,
    p_entry_date: params.entryDate,
    p_amount_santim: params.amountSantim,
    p_note: params.note.trim(),
    p_client_request_id: clientRequestId,
  });

  if (error) {
    throw new Error(error.message);
  }

  void markEntryLoggedTodayAndSyncReminder(params.entryDate).catch(() => undefined);

  const paymentEntry = data as LedgerEntry;
  void notifyPartnerOfLedgerEntry({
    householdId: paymentEntry.household_id,
    shopId: paymentEntry.shop_id,
    type: 'payment',
    totalSantim: paymentEntry.total_amount_santim,
    entryId: paymentEntry.id,
  }).catch(() => undefined);

  return paymentEntry;
}

export async function editPaymentEntry(params: {
  entryId: string;
  entryDate: string;
  amountSantim: number;
  note: string;
}): Promise<LedgerEntry> {
  if (!Number.isSafeInteger(params.amountSantim) || params.amountSantim <= 0) {
    throw new Error('Payment amount must be greater than 0 ETB');
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc('edit_payment_entry', {
    p_entry_id: params.entryId,
    p_entry_date: params.entryDate,
    p_amount_santim: params.amountSantim,
    p_note: params.note.trim(),
  });

  if (error) {
    throw new Error(error.message);
  }

  return data as LedgerEntry;
}

export async function voidEntry(entryId: string, rawReason: string): Promise<LedgerEntry> {
  const reason = validateVoidReason(rawReason);
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc('void_entry', {
    p_entry_id: entryId,
    p_void_reason: reason,
  });

  if (error) {
    throw new Error(error.message);
  }

  return data as LedgerEntry;
}

export async function raiseDispute(entryId: string, rawNote: string): Promise<Dispute> {
  const note = validateDisputeNote(rawNote);
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('disputes')
    .insert({
      entry_id: entryId,
      note,
    })
    .select('*')
    .single<Dispute>();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function resolveDispute(
  disputeId: string,
  rawResolutionNote: string
): Promise<Dispute> {
  const resolutionNote = validateDisputeNote(rawResolutionNote);
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('disputes')
    .update({
      status: 'resolved',
      resolution_note: resolutionNote,
    })
    .eq('id', disputeId)
    .select('*')
    .single<Dispute>();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export function subscribeToLedgerRealtime(
  householdId: string,
  onSyncEvent: () => void
): () => void {
  const supabase = getSupabaseClient();
  const channel = supabase
    .channel(`ledger:${householdId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'entries',
        filter: `household_id=eq.${householdId}`,
      },
      onSyncEvent
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'entry_lines',
        filter: `household_id=eq.${householdId}`,
      },
      onSyncEvent
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'price_memory',
        filter: `household_id=eq.${householdId}`,
      },
      onSyncEvent
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'disputes',
        filter: `household_id=eq.${householdId}`,
      },
      onSyncEvent
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

function normalizeEntries(rows: LedgerEntry[]): LedgerEntry[] {
  return rows.map((row) => ({
    ...row,
    entry_lines: [...(row.entry_lines ?? [])].sort((a, b) => a.sort_order - b.sort_order),
  }));
}
