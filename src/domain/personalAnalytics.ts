import type Feather from '@expo/vector-icons/Feather';
import { formatBillMonthLabel, getAddisAbabaDateString, shiftYearMonth } from './billing';
import { formatEtb } from '../lib/money';
import {
  computePersonalMlInsights,
  formatPersonalAnomalySummary,
  type CategoryBaselineAnomaly,
} from './ml/personalMl';
import type { PeriodForecast, RecurringPattern } from './ml/timeSeriesAndAnomalies';
import {
  EXPENSE_CATEGORIES,
  getCategoryMeta,
  type PersonalCategory,
  type PersonalExpense,
} from '../types/personalExpense';

export interface MonthlyCategoryStats {
  category: string;
  label: string;
  icon: keyof typeof Feather.glyphMap;
  color: string;
  bgColor: string;
  totalSantim: number;
  count: number;
  pctOfTotal: number;
  changeFromLastMonthPct: number | null;
  lastMonthTotalSantim: number;
}

export interface SpendingInsight {
  id: string;
  type: 'surge' | 'frequent' | 'top_item' | 'pace' | 'saving' | 'pattern' | 'anomaly' | 'recurring';
  severity: 'alert' | 'info' | 'positive';
  title: string;
  body: string;
  metric?: string;
  categoryKey?: string;
}

/**
 * Returns expenses matching a category key (case-insensitive), optionally filtered to a YYYY-MM month,
 * ordered most recent date first and highest amount second for clean category drilldown.
 */
export function getExpensesForCategory(
  expenses: readonly PersonalExpense[],
  categoryKey: string,
  targetMonth?: string
): PersonalExpense[] {
  const needle = categoryKey.trim().toLowerCase();
  return expenses
    .filter((exp) => {
      if (targetMonth && !exp.expense_date?.startsWith(targetMonth)) {
        return false;
      }
      return exp.category.trim().toLowerCase() === needle;
    })
    .sort((a, b) => {
      const dateCmp = b.expense_date.localeCompare(a.expense_date);
      if (dateCmp !== 0) return dateCmp;
      const amountCmp = b.amount_santim - a.amount_santim;
      if (amountCmp !== 0) return amountCmp;
      return b.created_at.localeCompare(a.created_at);
    });
}

export interface PersonalMonthlyAnalytics {
  currentMonth: string; // YYYY-MM
  previousMonth: string; // YYYY-MM
  monthLabel: string;
  totalSpentSantim: number;
  previousMonthTotalSantim: number;
  momChangePct: number | null;
  expenseCount: number;
  dailyAverageSantim: number;
  projectedMonthEndSantim: number;
  forecast: PeriodForecast;
  anomalies: CategoryBaselineAnomaly[];
  recurringHabits: RecurringPattern[];
  categories: MonthlyCategoryStats[];
  topCategory: MonthlyCategoryStats | null;
  topExpense: PersonalExpense | null;
  insights: SpendingInsight[];
}

export function getDaysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function getAvailableExpenseMonths(
  expenses: PersonalExpense[],
  todayDate: string = getAddisAbabaDateString()
): string[] {
  const set = new Set<string>();
  const currentYm = todayDate.slice(0, 7);
  set.add(currentYm);
  set.add(shiftYearMonth(currentYm, -1));

  for (const exp of expenses) {
    if (exp.expense_date && exp.expense_date.length >= 7) {
      set.add(exp.expense_date.slice(0, 7));
    }
  }

  return Array.from(set).sort().reverse();
}

export function computeMonthlyPersonalAnalytics(
  expenses: PersonalExpense[],
  targetMonth: string,
  todayDate: string = getAddisAbabaDateString(),
  customCategories: PersonalCategory[] = []
): PersonalMonthlyAnalytics {
  const previousMonth = shiftYearMonth(targetMonth, -1);
  const monthLabel = formatBillMonthLabel(targetMonth);

  const currentExpenses = expenses.filter(
    (e) => e.expense_date && e.expense_date.startsWith(targetMonth)
  );
  const previousExpenses = expenses.filter(
    (e) => e.expense_date && e.expense_date.startsWith(previousMonth)
  );

  const totalSpentSantim = currentExpenses.reduce((sum, e) => sum + e.amount_santim, 0);
  const previousMonthTotalSantim = previousExpenses.reduce(
    (sum, e) => sum + e.amount_santim,
    0
  );

  let momChangePct: number | null = null;
  if (previousMonthTotalSantim > 0) {
    momChangePct = Math.round(
      ((totalSpentSantim - previousMonthTotalSantim) / previousMonthTotalSantim) * 100
    );
  } else if (previousMonthTotalSantim === 0 && totalSpentSantim > 0) {
    momChangePct = null;
  } else {
    momChangePct = 0;
  }

  const [tYear, tMonth] = targetMonth.split('-').map((n) => Number.parseInt(n, 10));
  const totalDaysInMonth = getDaysInMonth(tYear, tMonth);

  let daysElapsed = totalDaysInMonth;
  if (targetMonth === todayDate.slice(0, 7)) {
    const todayDay = Number.parseInt(todayDate.slice(8, 10), 10);
    daysElapsed = Math.min(totalDaysInMonth, Math.max(1, todayDay));
  }

  const dailyAverageSantim =
    daysElapsed > 0 ? Math.round(totalSpentSantim / daysElapsed) : 0;

  const mlSummary = computePersonalMlInsights({
    expenses,
    targetMonth,
    todayDate,
    elapsedDays: daysElapsed,
    customCategories,
  });
  const projectedMonthEndSantim = mlSummary.forecast.projectedTotalSantim;

  // Previous month category maps
  const prevCategoryTotals = new Map<string, number>();
  for (const e of previousExpenses) {
    prevCategoryTotals.set(
      e.category,
      (prevCategoryTotals.get(e.category) ?? 0) + e.amount_santim
    );
  }

  // Current month category maps
  const currentCategoryTotals = new Map<string, number>();
  const currentCategoryCounts = new Map<string, number>();
  for (const e of currentExpenses) {
    currentCategoryTotals.set(
      e.category,
      (currentCategoryTotals.get(e.category) ?? 0) + e.amount_santim
    );
    currentCategoryCounts.set(
      e.category,
      (currentCategoryCounts.get(e.category) ?? 0) + 1
    );
  }

  const allCategoryKeys = Array.from(
    new Set<string>([
      ...Object.keys(EXPENSE_CATEGORIES),
      ...customCategories.map((c) => c.name),
      ...currentCategoryTotals.keys(),
      ...prevCategoryTotals.keys(),
    ])
  );

  const categories: MonthlyCategoryStats[] = allCategoryKeys.map((catKey) => {
    const meta = getCategoryMeta(catKey, customCategories);
    const catTotal = currentCategoryTotals.get(catKey) ?? 0;
    const catCount = currentCategoryCounts.get(catKey) ?? 0;
    const prevCatTotal = prevCategoryTotals.get(catKey) ?? 0;
    const pctOfTotal =
      totalSpentSantim > 0 ? Math.round((catTotal / totalSpentSantim) * 100) : 0;

    let changeFromLastMonthPct: number | null = null;
    if (prevCatTotal > 0) {
      changeFromLastMonthPct = Math.round(
        ((catTotal - prevCatTotal) / prevCatTotal) * 100
      );
    } else if (prevCatTotal === 0 && catTotal > 0) {
      changeFromLastMonthPct = null;
    } else {
      changeFromLastMonthPct = 0;
    }

    return {
      category: catKey,
      label: meta.label,
      icon: meta.icon,
      color: meta.color,
      bgColor: meta.bgColor,
      totalSantim: catTotal,
      count: catCount,
      pctOfTotal,
      changeFromLastMonthPct,
      lastMonthTotalSantim: prevCatTotal,
    };
  });

  // Sort descending by total spend, then by count
  categories.sort((a, b) => b.totalSantim - a.totalSantim || b.count - a.count);

  const topCategory = categories[0] && categories[0].totalSantim > 0 ? categories[0] : null;

  let topExpense: PersonalExpense | null = null;
  for (const exp of currentExpenses) {
    if (!topExpense || exp.amount_santim > topExpense.amount_santim) {
      topExpense = exp;
    }
  }

  // Generate deep insights
  const insights: SpendingInsight[] = [];

  // 1. Overall Pace / Velocity
  if (previousMonthTotalSantim > 0 && momChangePct !== null) {
    if (momChangePct >= 20) {
      insights.push({
        id: 'pace-alert',
        type: 'pace',
        severity: 'alert',
        title: 'Spending Up vs Last Month',
        body: `You have spent ${momChangePct}% more this month than at this point in ${formatBillMonthLabel(previousMonth)}.`,
        metric: `+${momChangePct}%`,
      });
    } else if (momChangePct <= -15) {
      insights.push({
        id: 'saving-good',
        type: 'saving',
        severity: 'positive',
        title: 'Under Budget',
        body: `Great job! Your spending is down ${Math.abs(momChangePct)}% compared to last month.`,
        metric: `${momChangePct}%`,
      });
    }
  }

  // 2. Category Surges (>25% increase and >= 10% of total spend)
  for (const cat of categories) {
    if (
      cat.changeFromLastMonthPct !== null &&
      cat.changeFromLastMonthPct >= 25 &&
      cat.pctOfTotal >= 10 &&
      cat.totalSantim >= 5000 // At least 50 ETB
    ) {
      insights.push({
        id: `surge-${cat.category}`,
        type: 'surge',
        severity: 'alert',
        title: `${cat.label} Spike`,
        body: `You spent ${formatEtb(cat.totalSantim)} on ${cat.label}, up ${cat.changeFromLastMonthPct}% from last month.`,
        metric: `+${cat.changeFromLastMonthPct}%`,
        categoryKey: cat.category,
      });
    }
  }

  // 3. Frequency Habits (Mobile card, Taxi, Bunna)
  const mobileCat = categories.find((c) => c.category === 'mobile');
  if (mobileCat && mobileCat.count >= 4) {
    insights.push({
      id: 'frequent-mobile',
      type: 'frequent',
      severity: 'info',
      title: 'Frequent Mobile Card Buys',
      body: `You bought mobile cards/data ${mobileCat.count} times this month (${formatEtb(mobileCat.totalSantim)} total).`,
      metric: `${mobileCat.count}x`,
      categoryKey: mobileCat.category,
    });
  }

  const transportCat = categories.find((c) => c.category === 'transport');
  if (transportCat && transportCat.count >= 5) {
    insights.push({
      id: 'frequent-transport',
      type: 'frequent',
      severity: 'info',
      title: 'Regular Taxi & Rides',
      body: `You took ${transportCat.count} rides this month totaling ${formatEtb(transportCat.totalSantim)}.`,
      metric: `${transportCat.count} rides`,
      categoryKey: transportCat.category,
    });
  }

  const coffeeCat = categories.find((c) => c.category === 'food_coffee');
  if (coffeeCat && coffeeCat.count >= 6) {
    insights.push({
      id: 'frequent-coffee',
      type: 'frequent',
      severity: 'info',
      title: 'Coffee & Snacks Habit',
      body: `Logged coffee and quick snacks ${coffeeCat.count} times (${formatEtb(coffeeCat.totalSantim)}).`,
      metric: `${coffeeCat.count}x`,
      categoryKey: coffeeCat.category,
    });
  }

  // Frequency in custom / other categories
  for (const cat of categories) {
    if (
      !['mobile', 'transport', 'food_coffee'].includes(cat.category) &&
      cat.count >= 4 &&
      cat.totalSantim > 0
    ) {
      insights.push({
        id: `frequent-${cat.category}`,
        type: 'frequent',
        severity: 'info',
        title: `Regular ${cat.label}`,
        body: `Logged ${cat.label} ${cat.count} times this month (${formatEtb(cat.totalSantim)} total).`,
        metric: `${cat.count}x`,
        categoryKey: cat.category,
      });
    }
  }

  // 4. Large Single Splurge
  if (
    topExpense &&
    totalSpentSantim > 0 &&
    topExpense.amount_santim / totalSpentSantim >= 0.25 &&
    topExpense.amount_santim >= 10000
  ) {
    const splurgePct = Math.round((topExpense.amount_santim / totalSpentSantim) * 100);
    insights.push({
      id: 'top-splurge',
      type: 'top_item',
      severity: 'info',
      title: 'Largest Single Expense',
      body: `"${topExpense.title}" (${formatEtb(topExpense.amount_santim)}) took up ${splurgePct}% of this month's budget.`,
      metric: `${splurgePct}%`,
      categoryKey: topExpense.category,
    });
  }

  // 5. Weekday vs. Weekend Split (if at least 4 expenses)
  if (currentExpenses.length >= 4 && totalSpentSantim > 0) {
    let weekdaySantim = 0;
    let weekendSantim = 0;

    for (const exp of currentExpenses) {
      const [y, m, d] = exp.expense_date.split('-').map((n) => Number.parseInt(n, 10));
      const dayOfWeek = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
      // 0 = Sunday, 6 = Saturday
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        weekendSantim += exp.amount_santim;
      } else {
        weekdaySantim += exp.amount_santim;
      }
    }

    const weekdayPct = Math.round((weekdaySantim / totalSpentSantim) * 100);
    const weekendPct = Math.round((weekendSantim / totalSpentSantim) * 100);

    if (weekdayPct >= 70) {
      insights.push({
        id: 'pattern-weekday',
        type: 'pattern',
        severity: 'info',
        title: 'Workday Concentrated',
        body: `${weekdayPct}% of your spending (${formatEtb(weekdaySantim)}) happens on weekdays (Monday through Friday).`,
        metric: `${weekdayPct}%`,
      });
    } else if (weekendPct >= 40) {
      insights.push({
        id: 'pattern-weekend',
        type: 'pattern',
        severity: 'info',
        title: 'Active Weekend Spender',
        body: `${weekendPct}% of your spending (${formatEtb(weekendSantim)}) happens over Saturday and Sunday.`,
        metric: `${weekendPct}%`,
      });
    }
  }

  // 6. Learned Multi-Month Baseline Anomalies (Z-score)
  for (const anomaly of mlSummary.anomalies.slice(0, 2)) {
    insights.push({
      id: `ml-anomaly-${anomaly.category}`,
      type: 'anomaly',
      severity: anomaly.signal.direction === 'spike' ? 'alert' : 'positive',
      title:
        anomaly.signal.direction === 'spike'
          ? `${anomaly.label} Above Baseline`
          : `${anomaly.label} Below Baseline`,
      body: formatPersonalAnomalySummary(anomaly),
      metric: `${anomaly.signal.zScore > 0 ? '+' : ''}${anomaly.signal.zScore}σ`,
      categoryKey: anomaly.category,
    });
  }

  // 7. Due-Soon Recurring Habit Alert
  const dueSoonHabit = mlSummary.recurringHabits.find((h) => h.isDueSoon);
  if (dueSoonHabit) {
    insights.push({
      id: `ml-recurring-${dueSoonHabit.key}`,
      type: 'recurring',
      severity: 'info',
      title: `Expected Soon: ${dueSoonHabit.label}`,
      body: `${dueSoonHabit.cadenceLabel} habit (~${formatEtb(dueSoonHabit.typicalAmountSantim)} each, ~${formatEtb(dueSoonHabit.estimatedMonthlySantim)}/mo). Expected around ${dueSoonHabit.nextExpectedDate}.`,
      metric: dueSoonHabit.cadenceLabel,
    });
  }

  return {
    currentMonth: targetMonth,
    previousMonth,
    monthLabel,
    totalSpentSantim,
    previousMonthTotalSantim,
    momChangePct,
    expenseCount: currentExpenses.length,
    dailyAverageSantim,
    projectedMonthEndSantim,
    forecast: mlSummary.forecast,
    anomalies: mlSummary.anomalies,
    recurringHabits: mlSummary.recurringHabits,
    categories,
    topCategory,
    topExpense,
    insights,
  };
}
