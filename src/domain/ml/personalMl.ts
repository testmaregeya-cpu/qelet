import { getAddisAbabaDateString, shiftYearMonth } from '../billing';
import { formatEtb } from '../../lib/money';
import {
  EXPENSE_CATEGORIES,
  getCategoryMeta,
  type PaymentMethod,
  type PersonalCategory,
  type PersonalExpense,
} from '../../types/personalExpense';
import {
  estimateMedianAmountSantim,
  predictWithNaiveBayes,
  recencyWeight,
  tokenizeText,
  type TrainingSample,
} from './textClassifier';
import {
  detectAnomalyZScore,
  detectRecurringCadence,
  diffCalendarDays,
  forecastPeriodEnd,
  type AnomalySignal,
  type PeriodForecast,
  type RecurringPattern,
} from './timeSeriesAndAnomalies';

export interface PersonalExpensePrediction {
  suggestedCategory: string;
  suggestedCategoryLabel: string;
  categoryConfidence: number;
  suggestedPaymentMethod: PaymentMethod | null;
  suggestedAmountSantim: number | null;
  sampleCount: number;
}

export interface CategoryBaselineAnomaly {
  category: string;
  label: string;
  signal: AnomalySignal;
}

export interface PersonalMlSummary {
  forecast: PeriodForecast;
  anomalies: CategoryBaselineAnomaly[];
  recurringHabits: RecurringPattern[];
}

const COLD_START_PRIORS: readonly { text: string; label: string }[] = [
  { text: 'feres ride taxi minibus bajaj lada yego transport bus', label: 'transport' },
  { text: 'ethio airtime mobile card data package safaricom internet', label: 'mobile' },
  { text: 'bunna coffee macchiato tea pastry sambusa snack juice', label: 'food_coffee' },
  { text: 'lunch dinner shiro tibs beyaynet burger pizza restaurant', label: 'lunch_dining' },
  { text: 'supermarket groceries milk bread egg fruit vegetables meat', label: 'groceries' },
  { text: 'electric power water bill wifi rent laundry service', label: 'utilities' },
  { text: 'clothes shoes haircut salon cosmetics shopping electronics', label: 'shopping' },
  { text: 'pharmacy medicine clinic doctor dentist vitamins', label: 'health' },
  { text: 'cinema movie outing game football drinks weekend', label: 'entertainment' },
];

/**
 * Predicts likely category, payment channel, and typical ETB amount from typed text
 * using an on-device Multinomial Naive Bayes model trained on the user's private history.
 */
export function predictPersonalExpenseDefaults(params: {
  title: string;
  note?: string;
  expenses: readonly PersonalExpense[];
  customCategories?: readonly PersonalCategory[];
  todayDate?: string;
}): PersonalExpensePrediction | null {
  const query = `${params.title} ${params.note ?? ''}`.trim();
  if (query.length < 2) return null;

  const today = params.todayDate ?? getAddisAbabaDateString();
  const samples: TrainingSample<string>[] = [];

  for (const exp of params.expenses) {
    const text = `${exp.title} ${exp.note ?? ''}`.trim();
    if (!text) continue;
    const age = Math.max(0, diffCalendarDays(exp.expense_date, today));
    samples.push({
      text,
      label: exp.category,
      weight: recencyWeight(age, 90),
    });
  }

  // Add custom category names as light keyword anchors so newly created categories match immediately
  for (const cat of params.customCategories ?? []) {
    samples.push({
      text: cat.name,
      label: cat.name,
      weight: 0.65,
    });
  }

  // Weak cold-start priors help brand-new users without overriding personal history
  const hasRichHistory = params.expenses.length >= 12;
  if (!hasRichHistory) {
    for (const prior of COLD_START_PRIORS) {
      samples.push({
        text: prior.text,
        label: prior.label,
        weight: 0.35,
      });
    }
  }

  const classification = predictWithNaiveBayes(query, samples);
  if (!classification || classification.confidence < 0.42) {
    return null;
  }

  const predictedKey = classification.bestLabel;
  const meta = getCategoryMeta(predictedKey, [...(params.customCategories ?? [])]);

  // Estimate typical payment method and ETB amount from matching historical rows
  const queryTokens = new Set(tokenizeText(query));
  const categoryExpenses = params.expenses.filter(
    (e) => e.category.toLowerCase() === predictedKey.toLowerCase()
  );

  const tokenMatchedExpenses = categoryExpenses.filter((e) => {
    const expTokens = tokenizeText(`${e.title} ${e.note ?? ''}`);
    return expTokens.some((t) => queryTokens.has(t));
  });

  const amountSource =
    tokenMatchedExpenses.length > 0 ? tokenMatchedExpenses : categoryExpenses;
  const suggestedAmountSantim =
    tokenMatchedExpenses.length > 0
      ? estimateMedianAmountSantim(amountSource.map((e) => e.amount_santim))
      : null;

  const pmWeights = new Map<PaymentMethod, number>();
  let totalPmWeight = 0;
  for (const exp of amountSource) {
    const age = Math.max(0, diffCalendarDays(exp.expense_date, today));
    const w = recencyWeight(age, 90);
    pmWeights.set(exp.payment_method, (pmWeights.get(exp.payment_method) ?? 0) + w);
    totalPmWeight += w;
  }

  let suggestedPaymentMethod: PaymentMethod | null = null;
  let bestPmShare = 0;
  for (const [pm, w] of pmWeights.entries()) {
    const share = totalPmWeight > 0 ? w / totalPmWeight : 0;
    if (share > bestPmShare) {
      bestPmShare = share;
      suggestedPaymentMethod = pm;
    }
  }
  if (bestPmShare < 0.5) {
    suggestedPaymentMethod = null;
  }

  const userSampleCount = categoryExpenses.length;

  return {
    suggestedCategory: predictedKey,
    suggestedCategoryLabel: meta.label,
    categoryConfidence: Number(classification.confidence.toFixed(2)),
    suggestedPaymentMethod,
    suggestedAmountSantim,
    sampleCount: userSampleCount,
  };
}

/**
 * Computes multi-month statistical baselines, weekday/weekend weighted month-end forecast,
 * and recurring habit cadence for Personal Deep Analysis.
 */
export function computePersonalMlInsights(params: {
  expenses: readonly PersonalExpense[];
  targetMonth: string;
  todayDate: string;
  elapsedDays: number;
  customCategories?: readonly PersonalCategory[];
}): PersonalMlSummary {
  const { expenses, targetMonth, todayDate, elapsedDays, customCategories = [] } = params;

  const dailySeries = expenses.map((e) => ({
    date: e.expense_date,
    amountSantim: e.amount_santim,
  }));

  const forecast = forecastPeriodEnd({
    targetMonthYm: targetMonth,
    currentDayOfMonth: elapsedDays,
    dailySeries,
  });

  // Build active historical months (up to 6 months prior to targetMonth where user logged expenses)
  const activeMonths = new Set<string>();
  const totalsByMonthAndCat = new Map<string, Map<string, number>>();
  const allCats = new Set<string>(Object.keys(EXPENSE_CATEGORIES));

  for (const exp of expenses) {
    if (!exp.expense_date || exp.expense_date.length < 7) continue;
    const ym = exp.expense_date.slice(0, 7);
    allCats.add(exp.category);
    if (ym < targetMonth) {
      activeMonths.add(ym);
    }
    let catMap = totalsByMonthAndCat.get(ym);
    if (!catMap) {
      catMap = new Map<string, number>();
      totalsByMonthAndCat.set(ym, catMap);
    }
    catMap.set(exp.category, (catMap.get(exp.category) ?? 0) + exp.amount_santim);
  }

  const priorMonths: string[] = [];
  let cursor = shiftYearMonth(targetMonth, -1);
  for (let i = 0; i < 6; i++) {
    if (activeMonths.has(cursor)) {
      priorMonths.push(cursor);
    }
    cursor = shiftYearMonth(cursor, -1);
  }

  const anomalies: CategoryBaselineAnomaly[] = [];
  const currentCatMap = totalsByMonthAndCat.get(targetMonth);

  if (currentCatMap && priorMonths.length >= 3) {
    for (const [catKey, currentAmount] of currentCatMap.entries()) {
      if (currentAmount <= 0) continue;
      const historyValues = priorMonths.map(
        (ym) => totalsByMonthAndCat.get(ym)?.get(catKey) ?? 0
      );
      const signal = detectAnomalyZScore(currentAmount, historyValues, {
        minHistory: 3,
        zThreshold: 1.65,
        minAbsoluteDelta: 5000, // 50 ETB
        minPercentDelta: 25,
      });
      if (signal) {
        const meta = getCategoryMeta(catKey, [...customCategories]);
        anomalies.push({
          category: catKey,
          label: meta.label,
          signal,
        });
      }
    }
    anomalies.sort((a, b) => Math.abs(b.signal.zScore) - Math.abs(a.signal.zScore));
  }

  const recurringHabits = detectRecurringCadence(
    expenses.map((e) => ({
      key: `${e.category}::${e.title.trim().toLowerCase()}`,
      label: e.title.trim(),
      date: e.expense_date,
      amountSantim: e.amount_santim,
    })),
    todayDate
  ).slice(0, 4);

  return {
    forecast,
    anomalies,
    recurringHabits,
  };
}

export function formatPersonalAnomalySummary(anomaly: CategoryBaselineAnomaly): string {
  const directionWord = anomaly.signal.direction === 'spike' ? 'above' : 'below';
  const pct = Math.abs(anomaly.signal.percentDelta);
  return `${formatEtb(anomaly.signal.currentValue)} is ${pct}% ${directionWord} your ${formatEtb(anomaly.signal.baselineMean)} monthly average.`;
}
