import { formatEtb } from './money';
import type { LedgerEntry } from '../types/phase2';
import type { Dispute, EntryHistoryRecord } from '../types/phase3';

export function canEditOrVoidEntry(
  entry: Pick<LedgerEntry, 'created_by' | 'voided'>,
  currentUserId: string | null | undefined
): boolean {
  if (!currentUserId || entry.voided) {
    return false;
  }
  return entry.created_by === currentUserId;
}

export function canRaiseDispute(
  entry: Pick<LedgerEntry, 'created_by' | 'voided'>,
  disputes: readonly Dispute[],
  currentUserId: string | null | undefined
): boolean {
  if (!currentUserId || entry.voided) {
    return false;
  }
  if (entry.created_by === currentUserId) {
    return false;
  }
  return !disputes.some((d) => d.status === 'open');
}

export function canResolveDispute(
  entry: Pick<LedgerEntry, 'created_by'>,
  dispute: Pick<Dispute, 'status'>,
  currentUserId: string | null | undefined
): boolean {
  if (!currentUserId || dispute.status !== 'open') {
    return false;
  }
  return entry.created_by === currentUserId;
}

export function validateVoidReason(rawReason: string): string {
  const trimmed = rawReason.trim();
  if (trimmed.length === 0) {
    throw new Error('A reason is required to void an entry');
  }
  if (trimmed.length > 500) {
    throw new Error('Void reason must be 500 characters or fewer');
  }
  return trimmed;
}

export function validateDisputeNote(rawNote: string): string {
  const trimmed = rawNote.trim();
  if (trimmed.length === 0) {
    throw new Error('Enter a short note explaining what looks wrong');
  }
  if (trimmed.length > 500) {
    throw new Error('Note must be 500 characters or fewer');
  }
  return trimmed;
}

interface EntrySnapshot {
  entry_date?: string;
  bill_month?: string | null;
  total_amount_santim?: number;
  note?: string;
  void_reason?: string;
}

function extractEntrySnapshot(data: Record<string, unknown> | null): EntrySnapshot {
  if (!data) return {};
  if (data.entry && typeof data.entry === 'object') {
    return data.entry as EntrySnapshot;
  }
  return data as EntrySnapshot;
}

function extractLineCount(data: Record<string, unknown> | null): number | null {
  if (!data || !Array.isArray(data.lines)) {
    return null;
  }
  return data.lines.length;
}

/**
 * Formats an entry audit record into readable title + before/after summary lines.
 */
export function describeEntryHistoryRecord(record: EntryHistoryRecord): {
  title: string;
  details: string[];
} {
  const beforeSnap = extractEntrySnapshot(record.before_data);
  const afterSnap = extractEntrySnapshot(record.after_data);

  switch (record.action) {
    case 'charge_created': {
      const amount =
        typeof afterSnap.total_amount_santim === 'number'
          ? formatEtb(afterSnap.total_amount_santim)
          : '';
      return {
        title: `Created charge${amount ? ` (${amount})` : ''}`,
        details: [
          afterSnap.entry_date ? `Date: ${afterSnap.entry_date}` : '',
          afterSnap.bill_month ? `Bill: ${afterSnap.bill_month}` : '',
        ].filter(Boolean),
      };
    }
    case 'payment_created': {
      const amount =
        typeof afterSnap.total_amount_santim === 'number'
          ? formatEtb(afterSnap.total_amount_santim)
          : '';
      return {
        title: `Recorded payment${amount ? ` (${amount})` : ''}`,
        details: [afterSnap.entry_date ? `Date: ${afterSnap.entry_date}` : ''].filter(Boolean),
      };
    }
    case 'entry_edited': {
      const details: string[] = [];
      if (
        typeof beforeSnap.total_amount_santim === 'number' &&
        typeof afterSnap.total_amount_santim === 'number' &&
        beforeSnap.total_amount_santim !== afterSnap.total_amount_santim
      ) {
        details.push(
          `Total: ${formatEtb(beforeSnap.total_amount_santim)} → ${formatEtb(
            afterSnap.total_amount_santim
          )}`
        );
      }
      if (beforeSnap.entry_date && afterSnap.entry_date && beforeSnap.entry_date !== afterSnap.entry_date) {
        details.push(`Date: ${beforeSnap.entry_date} → ${afterSnap.entry_date}`);
      }
      if (beforeSnap.bill_month !== afterSnap.bill_month && afterSnap.bill_month) {
        details.push(`Bill: ${beforeSnap.bill_month ?? '—'} → ${afterSnap.bill_month}`);
      }
      if ((beforeSnap.note ?? '') !== (afterSnap.note ?? '')) {
        details.push(`Note: "${beforeSnap.note || 'none'}" → "${afterSnap.note || 'none'}"`);
      }
      const beforeLines = extractLineCount(record.before_data);
      const afterLines = extractLineCount(record.after_data);
      if (beforeLines !== null && afterLines !== null) {
        details.push(`Items: ${beforeLines} line(s) → ${afterLines} line(s)`);
      }
      if (details.length === 0) {
        details.push('Item details updated');
      }
      return { title: 'Edited entry', details };
    }
    case 'entry_voided':
      return {
        title: 'Voided entry',
        details: [
          afterSnap.void_reason ? `Reason: ${afterSnap.void_reason}` : 'Marked VOID',
        ],
      };
    case 'dispute_raised': {
      const note = typeof record.after_data?.note === 'string' ? record.after_data.note : '';
      return {
        title: 'Flagged as disputed',
        details: note ? [`"${note}"`] : [],
      };
    }
    case 'dispute_resolved': {
      const resolutionNote =
        typeof record.after_data?.resolution_note === 'string'
          ? record.after_data.resolution_note
          : '';
      return {
        title: 'Dispute resolved',
        details: resolutionNote ? [`Resolution: "${resolutionNote}"`] : [],
      };
    }
    case 'entry_reassigned_by_merge':
      return {
        title: 'Moved during shop merge',
        details: ['Assigned to target active shop by super admin'],
      };
    default:
      return {
        title: record.action.replace(/_/g, ' '),
        details: [],
      };
  }
}
