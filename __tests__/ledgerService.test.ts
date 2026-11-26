const mockRpc = jest.fn();

jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn(() => '00000000-0000-4000-8000-000000000123'),
}));

jest.mock('../src/lib/supabase', () => ({
  getSupabaseClient: jest.fn(() => ({
    rpc: mockRpc,
  })),
}));

jest.mock('../src/services/notifications', () => ({
  markEntryLoggedTodayAndSyncReminder: jest.fn(async () => undefined),
  notifyPartnerOfLedgerEntry: jest.fn(async () => undefined),
}));

import { createChargeEntry, createPaymentEntry } from '../src/services/ledger';
import { markEntryLoggedTodayAndSyncReminder } from '../src/services/notifications';

const mockMarkEntryLogged = markEntryLoggedTodayAndSyncReminder as jest.Mock;

describe('ledger service RPC idempotency & reminder hook', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('createChargeEntry passes explicit or generated p_client_request_id and notifies reminder sync', async () => {
    mockRpc.mockResolvedValueOnce({
      data: {
        entry: {
          id: 'e1',
          household_id: 'h1',
          shop_id: 's1',
          type: 'charge',
          entry_date: '2026-11-25',
          bill_month: '2026-11',
          total_amount_santim: 5000,
          note: '',
          created_by: 'u1',
          created_at: '2026-11-25T10:00:00Z',
          edited_at: null,
          edit_count: 0,
          voided: false,
          voided_by: null,
          voided_at: null,
          void_reason: null,
        },
        lines: [],
      },
      error: null,
    });

    await createChargeEntry({
      shopId: 's1',
      entryDate: '2026-11-25',
      billMonth: '2026-11',
      note: 'Bread',
      lines: [
        {
          item_name: 'Bread',
          quantity_milli: 1000,
          unit: 'pcs',
          unit_price_santim: 5000,
        },
      ],
      clientRequestId: '11111111-1111-4111-8111-111111111111',
    });

    expect(mockRpc).toHaveBeenCalledWith(
      'create_charge_entry',
      expect.objectContaining({
        p_client_request_id: '11111111-1111-4111-8111-111111111111',
      })
    );
    expect(mockMarkEntryLogged).toHaveBeenCalledWith('2026-11-25');
  });

  test('createPaymentEntry generates p_client_request_id when omitted and validates positive amount', async () => {
    await expect(
      createPaymentEntry({
        shopId: 's1',
        entryDate: '2026-11-25',
        amountSantim: 0,
        note: '',
      })
    ).rejects.toThrow(/greater than 0/i);

    mockRpc.mockResolvedValueOnce({
      data: {
        id: 'p1',
        household_id: 'h1',
        shop_id: 's1',
        type: 'payment',
        entry_date: '2026-11-25',
        bill_month: null,
        total_amount_santim: 12000,
        note: 'Cash',
        created_by: 'u1',
        created_at: '2026-11-25T10:00:00Z',
        edited_at: null,
        edit_count: 0,
        voided: false,
        voided_by: null,
        voided_at: null,
        void_reason: null,
      },
      error: null,
    });

    await createPaymentEntry({
      shopId: 's1',
      entryDate: '2026-11-25',
      amountSantim: 12000,
      note: 'Cash',
    });

    expect(mockRpc).toHaveBeenCalledWith(
      'create_payment_entry',
      expect.objectContaining({
        p_client_request_id: '00000000-0000-4000-8000-000000000123',
      })
    );
    expect(mockMarkEntryLogged).toHaveBeenCalledWith('2026-11-25');
  });
});
