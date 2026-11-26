import {
  canEditOrVoidEntry,
  canRaiseDispute,
  canResolveDispute,
  describeEntryHistoryRecord,
  validateDisputeNote,
  validateVoidReason,
} from '../src/lib/entryHistory';
import type { LedgerEntry } from '../src/types/phase2';
import type { Dispute, EntryHistoryRecord } from '../src/types/phase3';

const baseEntry: LedgerEntry = {
  id: 'e1',
  household_id: 'h1',
  shop_id: 's1',
  type: 'charge',
  entry_date: '2026-11-20',
  bill_month: '2026-11',
  total_amount_santim: 15_000,
  note: '',
  created_by: 'u1',
  created_at: '2026-11-20T09:00:00Z',
  edited_at: null,
  edit_count: 0,
  voided: false,
  voided_by: null,
  voided_at: null,
  void_reason: null,
};

const openDispute: Dispute = {
  id: 'd1',
  household_id: 'h1',
  entry_id: 'e1',
  raised_by: 'u2',
  note: 'Price was 120 ETB',
  raised_at: '2026-11-20T10:00:00Z',
  status: 'open',
  resolved_by: null,
  resolved_at: null,
  resolution_note: null,
};

describe('Phase 3 entry ownership, dispute rules, and entry history formatting', () => {
  test('only non-voided entry creator can edit or void', () => {
    expect(canEditOrVoidEntry(baseEntry, 'u1')).toBe(true);
    expect(canEditOrVoidEntry(baseEntry, 'u2')).toBe(false);
    expect(canEditOrVoidEntry({ ...baseEntry, voided: true }, 'u1')).toBe(false);
  });

  test('only non-creator can raise dispute when no open dispute exists; only creator resolves', () => {
    expect(canRaiseDispute(baseEntry, [], 'u1')).toBe(false);
    expect(canRaiseDispute(baseEntry, [], 'u2')).toBe(true);
    expect(canRaiseDispute(baseEntry, [openDispute], 'u2')).toBe(false);
    expect(canRaiseDispute({ ...baseEntry, voided: true }, [], 'u2')).toBe(false);

    expect(canResolveDispute(baseEntry, openDispute, 'u1')).toBe(true);
    expect(canResolveDispute(baseEntry, openDispute, 'u2')).toBe(false);
    expect(canResolveDispute(baseEntry, { ...openDispute, status: 'resolved' }, 'u1')).toBe(false);
  });

  test('validates required void reasons and dispute notes', () => {
    expect(validateVoidReason('  Duplicate entry ')).toBe('Duplicate entry');
    expect(() => validateVoidReason('   ')).toThrow();

    expect(validateDisputeNote(' Wrong price ')).toBe('Wrong price');
    expect(() => validateDisputeNote('')).toThrow();
  });

  test('formats audit history records with readable before/after diffs', () => {
    const editedRecord: EntryHistoryRecord = {
      id: 'a1',
      at: '2026-11-20T11:00:00Z',
      actor_id: 'u1',
      action: 'entry_edited',
      before_data: {
        entry: { total_amount_santim: 15_000, entry_date: '2026-11-20', note: '' },
        lines: [{ id: 'l1' }],
      },
      after_data: {
        entry: { total_amount_santim: 12_000, entry_date: '2026-11-20', note: 'Corrected' },
        lines: [{ id: 'l1' }, { id: 'l2' }],
      },
    };

    const editedSummary = describeEntryHistoryRecord(editedRecord);
    expect(editedSummary.title).toBe('Edited entry');
    expect(editedSummary.details).toContain('Total: 150 ETB → 120 ETB');
    expect(editedSummary.details).toContain('Note: "none" → "Corrected"');
    expect(editedSummary.details).toContain('Items: 1 line(s) → 2 line(s)');

    const voidedSummary = describeEntryHistoryRecord({
      id: 'a2',
      at: '2026-11-20T12:00:00Z',
      actor_id: 'u1',
      action: 'entry_voided',
      before_data: {},
      after_data: { void_reason: 'Duplicate entry' },
    });
    expect(voidedSummary.title).toBe('Voided entry');
    expect(voidedSummary.details).toEqual(['Reason: Duplicate entry']);

    const disputeSummary = describeEntryHistoryRecord({
      id: 'a3',
      at: '2026-11-20T13:00:00Z',
      actor_id: 'u2',
      action: 'dispute_raised',
      before_data: null,
      after_data: { note: 'Price was 120 ETB' },
    });
    expect(disputeSummary.title).toBe('Flagged as disputed');
    expect(disputeSummary.details).toEqual(['"Price was 120 ETB"']);
  });
});
