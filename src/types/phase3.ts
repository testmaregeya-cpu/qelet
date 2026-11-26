export type DisputeStatus = 'open' | 'resolved';

export interface Dispute {
  id: string;
  household_id: string;
  entry_id: string;
  raised_by: string;
  note: string;
  raised_at: string;
  status: DisputeStatus;
  resolved_by: string | null;
  resolved_at: string | null;
  resolution_note: string | null;
}

export interface EntryHistoryRecord {
  id: string;
  at: string;
  actor_id: string | null;
  action: string;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
}
