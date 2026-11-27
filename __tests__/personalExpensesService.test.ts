import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  cachePersonalExpenses,
  getCachedPersonalExpenses,
  clearCachedPersonalExpenses,
} from '../src/services/offlineStorage';
import {
  getOfflinePersonalExpenses,
  flushOfflinePersonalExpenses,
} from '../src/services/offlineQueue';
import {
  createPersonalExpense,
  fetchPersonalExpenses,
} from '../src/services/personalExpenses';
import { getSupabaseClient } from '../src/lib/supabase';
import type { PersonalExpense } from '../src/types/personalExpense';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

jest.mock('../src/lib/supabase', () => ({
  getSupabaseClient: jest.fn(),
}));

describe('personalExpensesService & offline partitioning', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
  });

  it('strictly isolates cached personal expenses by userId (privacy test)', async () => {
    const userA = 'user-a-uuid';
    const userB = 'user-b-uuid';

    const expensesA: PersonalExpense[] = [
      {
        id: 'exp-1',
        user_id: userA,
        amount_santim: 15000,
        category: 'transport',
        title: 'Ride Feres to Bole',
        note: '',
        expense_date: '2026-05-10',
        payment_method: 'telebirr',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    const expensesB: PersonalExpense[] = [
      {
        id: 'exp-2',
        user_id: userB,
        amount_santim: 5000,
        category: 'mobile',
        title: 'Ethio 50 ETB card',
        note: '',
        expense_date: '2026-05-11',
        payment_method: 'cbe_birr',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    await cachePersonalExpenses(userA, expensesA);
    await cachePersonalExpenses(userB, expensesB);

    // Verify User A only sees User A's expenses
    const cachedA = await getCachedPersonalExpenses<PersonalExpense>(userA);
    expect(cachedA).toHaveLength(1);
    expect(cachedA?.[0].title).toBe('Ride Feres to Bole');

    // Verify User B only sees User B's expenses
    const cachedB = await getCachedPersonalExpenses<PersonalExpense>(userB);
    expect(cachedB).toHaveLength(1);
    expect(cachedB?.[0].title).toBe('Ethio 50 ETB card');

    // Clear A does not affect B
    await clearCachedPersonalExpenses(userA);
    expect(await getCachedPersonalExpenses(userA)).toBeNull();
    expect(await getCachedPersonalExpenses(userB)).toHaveLength(1);
  });

  it('rejects invalid inputs when creating expense', async () => {
    await expect(
      createPersonalExpense('user-1', {
        amountSantim: 0,
        category: 'transport',
        title: 'Taxi',
        expenseDate: '2026-05-10',
        paymentMethod: 'cash',
      })
    ).rejects.toThrow('Amount must be greater than zero');

    await expect(
      createPersonalExpense('user-1', {
        amountSantim: 5000,
        category: 'transport',
        title: '   ',
        expenseDate: '2026-05-10',
        paymentMethod: 'cash',
      })
    ).rejects.toThrow('Title is required');
  });

  it('optimistically saves and enqueues offline mutation when network fails', async () => {
    const userId = 'user-offline-test';
    const networkError = new TypeError('fetch failed');

    (getSupabaseClient as jest.Mock).mockReturnValue({
      from: jest.fn().mockReturnValue({
        insert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockRejectedValue(networkError),
          }),
        }),
      }),
    });

    const optimistic = await createPersonalExpense(userId, {
      amountSantim: 10000,
      category: 'mobile',
      title: 'Ethio 100 ETB',
      note: 'Bought via telebirr',
      expenseDate: '2026-05-15',
      paymentMethod: 'telebirr',
    });

    expect(optimistic.id).toMatch(/^local_/);
    expect(optimistic.title).toBe('Ethio 100 ETB');
    expect(optimistic.amount_santim).toBe(10000);

    // Verify it was cached locally
    const cached = await getCachedPersonalExpenses<PersonalExpense>(userId);
    expect(cached).toHaveLength(1);
    expect(cached?.[0].id).toBe(optimistic.id);

    // Verify it was placed in the offline mutations queue
    const queued = await getOfflinePersonalExpenses(userId);
    expect(queued).toHaveLength(1);
    expect(queued[0].payload.title).toBe('Ethio 100 ETB');
    expect(queued[0].payload.amountSantim).toBe(10000);
  });

  it('drains offline queue when connection restored', async () => {
    const userId = 'user-drain-test';
    let executed = false;

    // Enqueue an offline expense
    await createPersonalExpense(userId, {
      amountSantim: 3500,
      category: 'food_coffee',
      title: 'Morning Bunna',
      expenseDate: '2026-05-12',
      paymentMethod: 'cash',
    }).catch(() => undefined);

    const queuedBefore = await getOfflinePersonalExpenses(userId);
    expect(queuedBefore.length).toBeGreaterThan(0);

    // Simulate online flush executor
    const result = await flushOfflinePersonalExpenses(userId, async () => {
      executed = true;
    });

    expect(executed).toBe(true);
    expect(result.syncedCount).toBe(queuedBefore.length);
    expect(result.remainingCount).toBe(0);

    const queuedAfter = await getOfflinePersonalExpenses(userId);
    expect(queuedAfter).toHaveLength(0);
  });
});
