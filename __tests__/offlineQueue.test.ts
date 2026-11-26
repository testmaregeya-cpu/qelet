const mockQueueStorage = new Map<string, string>();

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (key: string) => mockQueueStorage.get(key) ?? null),
  setItem: jest.fn(async (key: string, val: string) => {
    mockQueueStorage.set(key, val);
  }),
  removeItem: jest.fn(async (key: string) => {
    mockQueueStorage.delete(key);
  }),
}));

import {
  enqueueOfflineMutation,
  flushOfflineMutations,
  getOfflineMutations,
  isLikelyNetworkError,
  type OfflineMutation,
} from '../src/services/offlineQueue';

describe('offlineQueue service', () => {
  beforeEach(() => {
    mockQueueStorage.clear();
    jest.clearAllMocks();
  });

  test('enqueues charge and payment mutations and deduplicates by clientRequestId', async () => {
    const item1: OfflineMutation = {
      id: 'req-1',
      kind: 'charge',
      householdId: 'h1',
      shopId: 's1',
      createdAt: '2026-11-25T10:00:00Z',
      payload: {
        shopId: 's1',
        entryDate: '2026-11-25',
        billMonth: '2026-11',
        note: 'Milk',
        clientRequestId: 'req-1',
        lines: [
          {
            item_name: 'Milk',
            quantity_milli: 1000,
            unit: 'L',
            unit_price_santim: 9500,
          },
        ],
      },
    };

    await enqueueOfflineMutation(item1);
    await enqueueOfflineMutation(item1);

    const queued = await getOfflineMutations('h1');
    expect(queued).toHaveLength(1);
    expect(queued[0].id).toBe('req-1');
  });

  test('flushes queued mutations in FIFO order and preserves unsent items if network drops', async () => {
    const chargeItem: OfflineMutation = {
      id: 'req-a',
      kind: 'charge',
      householdId: 'h1',
      shopId: 's1',
      createdAt: '2026-11-25T10:00:00Z',
      payload: {
        shopId: 's1',
        entryDate: '2026-11-25',
        billMonth: '2026-11',
        note: '',
        clientRequestId: 'req-a',
        lines: [
          {
            item_name: 'Bread',
            quantity_milli: 2000,
            unit: 'pcs',
            unit_price_santim: 2500,
          },
        ],
      },
    };
    const payItem: OfflineMutation = {
      id: 'req-b',
      kind: 'payment',
      householdId: 'h1',
      shopId: 's1',
      createdAt: '2026-11-25T10:05:00Z',
      payload: {
        shopId: 's1',
        entryDate: '2026-11-25',
        amountSantim: 5000,
        note: 'Cash',
        clientRequestId: 'req-b',
      },
    };

    await enqueueOfflineMutation(chargeItem);
    await enqueueOfflineMutation(payItem);

    let calls = 0;
    const partialResult = await flushOfflineMutations('h1', async () => {
      calls += 1;
      if (calls === 2) {
        throw new Error('Network request failed');
      }
    });

    expect(partialResult.syncedCount).toBe(1);
    expect(partialResult.remainingCount).toBe(1);
    const remaining = await getOfflineMutations('h1');
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe('req-b');

    const secondResult = await flushOfflineMutations('h1', async () => undefined);
    expect(secondResult.syncedCount).toBe(1);
    expect(secondResult.remainingCount).toBe(0);
    expect(isLikelyNetworkError(new TypeError('Network request failed'))).toBe(true);
  });
});
