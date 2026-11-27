import {
  computeMonthlyPersonalAnalytics,
  getAvailableExpenseMonths,
} from '../src/domain/personalAnalytics';
import type { PersonalExpense } from '../src/types/personalExpense';

describe('Personal Analytics domain engine', () => {
  const sampleExpenses: PersonalExpense[] = [
    // October 2026
    {
      id: 'oct-1',
      user_id: 'u-1',
      amount_santim: 10000, // 100 ETB
      category: 'mobile',
      title: 'Ethio telecom 100',
      note: '',
      expense_date: '2026-10-05',
      payment_method: 'telebirr',
      created_at: '2026-10-05T10:00:00Z',
      updated_at: '2026-10-05T10:00:00Z',
    },
    {
      id: 'oct-2',
      user_id: 'u-1',
      amount_santim: 20000, // 200 ETB
      category: 'transport',
      title: 'Taxi to Megenagna',
      note: '',
      expense_date: '2026-10-12',
      payment_method: 'cash',
      created_at: '2026-10-12T10:00:00Z',
      updated_at: '2026-10-12T10:00:00Z',
    },

    // November 2026
    {
      id: 'nov-1',
      user_id: 'u-1',
      amount_santim: 10000, // 100 ETB
      category: 'mobile',
      title: 'Ethio 100',
      note: '',
      expense_date: '2026-11-02',
      payment_method: 'telebirr',
      created_at: '2026-11-02T10:00:00Z',
      updated_at: '2026-11-02T10:00:00Z',
    },
    {
      id: 'nov-2',
      user_id: 'u-1',
      amount_santim: 5000, // 50 ETB
      category: 'mobile',
      title: 'Ethio 50',
      note: '',
      expense_date: '2026-11-06',
      payment_method: 'telebirr',
      created_at: '2026-11-06T10:00:00Z',
      updated_at: '2026-11-06T10:00:00Z',
    },
    {
      id: 'nov-3',
      user_id: 'u-1',
      amount_santim: 10000, // 100 ETB
      category: 'mobile',
      title: 'Data card',
      note: '',
      expense_date: '2026-11-10',
      payment_method: 'telebirr',
      created_at: '2026-11-10T10:00:00Z',
      updated_at: '2026-11-10T10:00:00Z',
    },
    {
      id: 'nov-4',
      user_id: 'u-1',
      amount_santim: 5000, // 50 ETB
      category: 'mobile',
      title: 'Card',
      note: '',
      expense_date: '2026-11-14',
      payment_method: 'telebirr',
      created_at: '2026-11-14T10:00:00Z',
      updated_at: '2026-11-14T10:00:00Z',
    },
    {
      id: 'nov-5',
      user_id: 'u-1',
      amount_santim: 35000, // 350 ETB (Transport surge)
      category: 'transport',
      title: 'Feres ride',
      note: '',
      expense_date: '2026-11-16',
      payment_method: 'cbe_birr',
      created_at: '2026-11-16T10:00:00Z',
      updated_at: '2026-11-16T10:00:00Z',
    },
    {
      id: 'nov-6',
      user_id: 'u-1',
      amount_santim: 30000, // 300 ETB
      category: 'shopping',
      title: 'New Shoes',
      note: '',
      expense_date: '2026-11-20',
      payment_method: 'cbe_birr',
      created_at: '2026-11-20T10:00:00Z',
      updated_at: '2026-11-20T10:00:00Z',
    },
  ];

  test('extracts available months including current and past months', () => {
    const months = getAvailableExpenseMonths(sampleExpenses, '2026-11-26');
    expect(months).toContain('2026-11');
    expect(months).toContain('2026-10');
    expect(months[0]).toBe('2026-11');
  });

  test('computes accurate month-over-month totals and percentage changes', () => {
    const analytics = computeMonthlyPersonalAnalytics(sampleExpenses, '2026-11', '2026-11-26');

    // October total: 100 + 200 = 300 ETB (30,000 santim)
    expect(analytics.previousMonthTotalSantim).toBe(30000);

    // November total: 100 + 50 + 100 + 50 + 350 + 300 = 950 ETB (95,000 santim)
    expect(analytics.totalSpentSantim).toBe(95000);
    expect(analytics.expenseCount).toBe(6);

    // MoM change: (95,000 - 30,000) / 30,000 = +217%
    expect(analytics.momChangePct).toBe(217);

    // Daily average based on 26 days elapsed in November
    expect(analytics.dailyAverageSantim).toBe(Math.round(95000 / 26));
  });

  test('accurately breaks down categories and detects category surges and habits', () => {
    const analytics = computeMonthlyPersonalAnalytics(sampleExpenses, '2026-11', '2026-11-26');

    // Transport: 35,000 vs Oct 20,000 -> +75% surge!
    const transport = analytics.categories.find((c) => c.category === 'transport')!;
    expect(transport.totalSantim).toBe(35000);
    expect(transport.changeFromLastMonthPct).toBe(75);

    // Mobile: 30,000 vs Oct 10,000 -> 4 items logged!
    const mobile = analytics.categories.find((c) => c.category === 'mobile')!;
    expect(mobile.totalSantim).toBe(30000);
    expect(mobile.count).toBe(4);

    // Top Category should be Transport (35,000 santim)
    expect(analytics.topCategory?.category).toBe('transport');

    // Top single expense should be Transport (35,000 santim)
    expect(analytics.topExpense?.id).toBe('nov-5');

    // Smart Insights checks:
    const insightIds = analytics.insights.map((i) => i.id);

    // 1. Pace alert (spending up by >20% MoM)
    expect(insightIds).toContain('pace-alert');

    // 2. Transport spike alert (>25% MoM increase and >=10% total spend)
    expect(insightIds).toContain('surge-transport');

    // 3. Frequent Mobile card habit alert (>=4 mobile purchases)
    expect(insightIds).toContain('frequent-mobile');
  });

  test('handles months with zero previous spending gracefully', () => {
    const octAnalytics = computeMonthlyPersonalAnalytics(sampleExpenses, '2026-10', '2026-10-31');
    expect(octAnalytics.previousMonthTotalSantim).toBe(0);
    expect(octAnalytics.momChangePct).toBeNull();
    expect(octAnalytics.totalSpentSantim).toBe(30000);
  });

  test('seamlessly incorporates custom categories into deep analytics and surge detection', () => {
    const customExpenses: PersonalExpense[] = [
      {
        id: 'oct-c1',
        user_id: 'u-1',
        amount_santim: 10000, // 100 ETB
        category: 'Gym & Fitness',
        title: 'Gym monthly pass',
        note: '',
        expense_date: '2026-10-02',
        payment_method: 'telebirr',
        created_at: '2026-10-02T10:00:00Z',
        updated_at: '2026-10-02T10:00:00Z',
      },
      {
        id: 'nov-c1',
        user_id: 'u-1',
        amount_santim: 25000, // 250 ETB (150% surge!)
        category: 'Gym & Fitness',
        title: 'Gym renewed + protein shake',
        note: '',
        expense_date: '2026-11-03',
        payment_method: 'telebirr',
        created_at: '2026-11-03T10:00:00Z',
        updated_at: '2026-11-03T10:00:00Z',
      },
    ];

    const customCategories = [
      {
        id: 'cat-gym',
        user_id: 'u-1',
        name: 'Gym & Fitness',
        icon: 'activity' as const,
        color: '#059669',
        bg_color: '#D1FAE5',
        created_at: '2026-10-01T00:00:00Z',
      },
    ];

    const analytics = computeMonthlyPersonalAnalytics(
      customExpenses,
      '2026-11',
      '2026-11-26',
      customCategories
    );

    const gymStat = analytics.categories.find((c) => c.category === 'Gym & Fitness')!;
    expect(gymStat).toBeDefined();
    expect(gymStat.label).toBe('Gym & Fitness');
    expect(gymStat.icon).toBe('activity');
    expect(gymStat.color).toBe('#059669');
    expect(gymStat.totalSantim).toBe(25000);
    expect(gymStat.pctOfTotal).toBe(100);
    expect(gymStat.changeFromLastMonthPct).toBe(150); // +150%

    // Surge insight generated for custom category
    const gymSurge = analytics.insights.find((i) => i.id === 'surge-Gym & Fitness');
    expect(gymSurge).toBeDefined();
    expect(gymSurge?.title).toBe('Gym & Fitness Spike');
    expect(gymSurge?.metric).toBe('+150%');
  });
});
