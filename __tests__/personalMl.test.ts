import { computeMonthlyPersonalAnalytics } from '../src/domain/personalAnalytics';
import { predictPersonalExpenseDefaults } from '../src/domain/ml/personalMl';
import type { PersonalCategory, PersonalExpense } from '../src/types/personalExpense';

function makeExpense(
  id: string,
  title: string,
  category: string,
  amountSantim: number,
  date: string,
  paymentMethod: PersonalExpense['payment_method'] = 'telebirr'
): PersonalExpense {
  return {
    id,
    user_id: 'u-1',
    amount_santim: amountSantim,
    category,
    title,
    note: '',
    expense_date: date,
    payment_method: paymentMethod,
    created_at: `${date}T10:00:00Z`,
    updated_at: `${date}T10:00:00Z`,
  };
}

describe('Personal Spend On-Device ML', () => {
  const customCategories: PersonalCategory[] = [
    {
      id: 'cat-gym',
      user_id: 'u-1',
      name: 'Gym & Fitness',
      icon: 'activity',
      color: '#059669',
      bg_color: '#D1FAE5',
      created_at: '2026-08-01T00:00:00Z',
    },
  ];

  const history: PersonalExpense[] = [
    // Aug, Sep, Oct baseline for food_coffee (~100 ETB / month) and recurring mobile card
    makeExpense('aug-1', 'Morning Bunna', 'food_coffee', 5000, '2026-08-05', 'cash'),
    makeExpense('aug-2', 'Macchiato', 'food_coffee', 5500, '2026-08-18', 'cash'),
    makeExpense('sep-1', 'Morning Bunna', 'food_coffee', 4800, '2026-09-04', 'cash'),
    makeExpense('sep-2', 'Afternoon Tea', 'food_coffee', 5200, '2026-09-19', 'cash'),
    makeExpense('oct-1', 'Morning Bunna', 'food_coffee', 5000, '2026-10-03', 'cash'),
    makeExpense('oct-2', 'Macchiato', 'food_coffee', 5200, '2026-10-15', 'cash'),
    makeExpense('oct-g1', 'Protein Shake', 'Gym & Fitness', 22000, '2026-10-10', 'telebirr'),
    makeExpense('oct-g2', 'Gym Coach Session', 'Gym & Fitness', 45000, '2026-10-20', 'telebirr'),
    // Weekly Ethio 100 habit across Nov
    makeExpense('nov-m1', 'Ethio 100', 'mobile', 10000, '2026-11-01', 'telebirr'),
    makeExpense('nov-m2', 'Ethio 100', 'mobile', 10000, '2026-11-08', 'telebirr'),
    makeExpense('nov-m3', 'Ethio 100', 'mobile', 10000, '2026-11-15', 'telebirr'),
    makeExpense('nov-m4', 'Ethio 100', 'mobile', 10000, '2026-11-22', 'telebirr'),
    // Spike in food_coffee in Nov (~350 ETB vs ~102 ETB 3-month baseline)
    makeExpense('nov-c1', 'Morning Bunna', 'food_coffee', 15000, '2026-11-05', 'cash'),
    makeExpense('nov-c2', 'Tomoca Macchiato', 'food_coffee', 20000, '2026-11-18', 'cash'),
  ];

  it('predicts standard and custom categories, payment method, and typical amount from personal history', () => {
    const coffeePred = predictPersonalExpenseDefaults({
      title: 'Morning Bunna',
      expenses: history,
      customCategories,
      todayDate: '2026-11-24',
    });

    expect(coffeePred).not.toBeNull();
    expect(coffeePred?.suggestedCategory).toBe('food_coffee');
    expect(coffeePred?.suggestedPaymentMethod).toBe('cash');
    expect(coffeePred?.suggestedAmountSantim).toBeGreaterThan(0);

    const gymPred = predictPersonalExpenseDefaults({
      title: 'Protein Shake',
      expenses: history,
      customCategories,
      todayDate: '2026-11-24',
    });

    expect(gymPred).not.toBeNull();
    expect(gymPred?.suggestedCategory).toBe('Gym & Fitness');
    expect(gymPred?.suggestedPaymentMethod).toBe('telebirr');
    expect(gymPred?.suggestedAmountSantim).toBe(22000);
  });

  it('uses cold-start priors when user has minimal history', () => {
    const pred = predictPersonalExpenseDefaults({
      title: 'Feres ride Bole',
      expenses: [],
      customCategories: [],
      todayDate: '2026-11-24',
    });

    expect(pred).not.toBeNull();
    expect(pred?.suggestedCategory).toBe('transport');
  });

  it('surfaces multi-month Z-score anomalies, forecast bounds, and recurring due-soon insights', () => {
    const analytics = computeMonthlyPersonalAnalytics(
      history,
      '2026-11',
      '2026-11-27',
      customCategories
    );

    expect(analytics.forecast.lowTotalSantim).toBeLessThanOrEqual(
      analytics.forecast.projectedTotalSantim
    );
    expect(analytics.anomalies.some((a) => a.category === 'food_coffee')).toBe(true);
    expect(analytics.recurringHabits.some((r) => r.label === 'Ethio 100')).toBe(true);

    const insightIds = analytics.insights.map((i) => i.id);
    expect(insightIds).toContain('ml-anomaly-food_coffee');
    expect(insightIds).toContain('ml-recurring-mobile::ethio 100');
  });
});
