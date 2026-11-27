import { shiftCalendarDays } from '../billing';
import { estimateMedianAmountSantim } from './textClassifier';

function getDaysInMonthUtc(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export interface RobustBaseline {
  count: number;
  mean: number;
  median: number;
  stdDev: number;
  mad: number;
}

export interface AnomalySignal {
  currentValue: number;
  baselineMean: number;
  baselineMedian: number;
  stdDev: number;
  zScore: number;
  percentDelta: number;
  direction: 'spike' | 'drop';
}

export interface DailySpendPoint {
  date: string; // YYYY-MM-DD
  amountSantim: number;
}

export interface PeriodForecast {
  projectedTotalSantim: number;
  lowTotalSantim: number;
  highTotalSantim: number;
  elapsedDays: number;
  remainingDays: number;
  weekdayDailyRateSantim: number;
  weekendDailyRateSantim: number;
  confidence: 'low' | 'medium' | 'high';
}

export interface RecurringEventInput {
  key: string;
  label: string;
  date: string; // YYYY-MM-DD
  amountSantim: number;
}

export interface RecurringPattern {
  key: string;
  label: string;
  occurrences: number;
  meanIntervalDays: number;
  cadenceLabel: string;
  typicalAmountSantim: number;
  estimatedMonthlySantim: number;
  lastDate: string;
  nextExpectedDate: string;
  isDueSoon: boolean;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function parseUtcDateMs(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map((n) => Number.parseInt(n, 10));
  return Date.UTC(y, m - 1, d);
}

export function diffCalendarDays(earlierDate: string, laterDate: string): number {
  return Math.round((parseUtcDateMs(laterDate) - parseUtcDateMs(earlierDate)) / MS_PER_DAY);
}

export function getDayOfWeekUtc(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map((n) => Number.parseInt(n, 10));
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function isWeekendDay(dayOfWeek: number): boolean {
  return dayOfWeek === 0 || dayOfWeek === 6;
}

/**
 * Computes mean, median, sample standard deviation, and MAD for a numeric series.
 */
export function computeRobustBaseline(values: readonly number[]): RobustBaseline {
  if (values.length === 0) {
    return { count: 0, mean: 0, median: 0, stdDev: 0, mad: 0 };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const count = sorted.length;
  const mean = sorted.reduce((sum, v) => sum + v, 0) / count;
  const mid = Math.floor(count / 2);
  const median = count % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;

  const variance =
    count > 1
      ? sorted.reduce((sum, v) => sum + (v - mean) * (v - mean), 0) / (count - 1)
      : 0;
  const stdDev = Math.sqrt(variance);

  const absDevs = sorted.map((v) => Math.abs(v - median)).sort((a, b) => a - b);
  const mad = count % 2 === 1 ? absDevs[mid] : (absDevs[mid - 1] + absDevs[mid]) / 2;

  return { count, mean, median, stdDev, mad };
}

/**
 * Detects whether `currentValue` is statistically anomalous relative to `historyValues`.
 * Handles zero-variance baselines cleanly when relative shift is significant.
 */
export function detectAnomalyZScore(
  currentValue: number,
  historyValues: readonly number[],
  options: {
    minHistory?: number;
    zThreshold?: number;
    minAbsoluteDelta?: number;
    minPercentDelta?: number;
  } = {}
): AnomalySignal | null {
  const minHistory = options.minHistory ?? 3;
  const zThreshold = options.zThreshold ?? 1.65;
  const minAbsoluteDelta = options.minAbsoluteDelta ?? 5000; // 50 ETB default
  const minPercentDelta = options.minPercentDelta ?? 20;

  if (historyValues.length < minHistory) return null;

  const baseline = computeRobustBaseline(historyValues);
  if (baseline.mean <= 0) return null;

  const absDelta = currentValue - baseline.mean;
  if (Math.abs(absDelta) < minAbsoluteDelta) return null;

  const percentDelta = Math.round((absDelta / baseline.mean) * 100);
  if (Math.abs(percentDelta) < minPercentDelta) return null;

  let zScore = 0;
  if (baseline.stdDev > 0) {
    zScore = absDelta / baseline.stdDev;
  } else {
    // Zero historical variance (e.g., identical baseline months): scale by 25% steps
    zScore = absDelta / Math.max(1, baseline.mean * 0.25);
  }

  if (Math.abs(zScore) < zThreshold) return null;

  return {
    currentValue,
    baselineMean: Math.round(baseline.mean),
    baselineMedian: Math.round(baseline.median),
    stdDev: Math.round(baseline.stdDev),
    zScore: Number(zScore.toFixed(2)),
    percentDelta,
    direction: absDelta >= 0 ? 'spike' : 'drop',
  };
}

/**
 * Forecasts end-of-month (or end-of-cycle up to `targetEndDay`) spend using learned
 * weekday vs. weekend spending weights blended smoothly via empirical shrinkage.
 */
export function forecastPeriodEnd(params: {
  targetMonthYm: string;
  currentDayOfMonth: number;
  targetEndDay?: number;
  dailySeries: readonly DailySpendPoint[];
}): PeriodForecast {
  const [y, m] = params.targetMonthYm.split('-').map((n) => Number.parseInt(n, 10));
  const daysInMonth = getDaysInMonthUtc(y, m);
  const targetEndDay = Math.min(daysInMonth, Math.max(1, params.targetEndDay ?? daysInMonth));
  const elapsedDays = Math.min(targetEndDay, Math.max(1, params.currentDayOfMonth));

  const totalsByDate = new Map<string, number>();
  for (const pt of params.dailySeries) {
    if (!pt.date || pt.amountSantim <= 0) continue;
    totalsByDate.set(pt.date, (totalsByDate.get(pt.date) ?? 0) + pt.amountSantim);
  }

  let currentTotalSantim = 0;
  let currentWeekdays = 0;
  let currentWeekdaySum = 0;
  let currentWeekends = 0;
  let currentWeekendSum = 0;

  for (let d = 1; d <= elapsedDays; d++) {
    const dateStr = `${params.targetMonthYm}-${String(d).padStart(2, '0')}`;
    const amt = totalsByDate.get(dateStr) ?? 0;
    currentTotalSantim += amt;
    if (isWeekendDay(getDayOfWeekUtc(dateStr))) {
      currentWeekends += 1;
      currentWeekendSum += amt;
    } else {
      currentWeekdays += 1;
      currentWeekdaySum += amt;
    }
  }

  // Learn historical weekday vs weekend averages from prior entries
  const cutoffDate = `${params.targetMonthYm}-01`;
  let histWeekdaySum = 0;
  let histWeekdayDays = 0;
  let histWeekendSum = 0;
  let histWeekendDays = 0;

  // Determine active date span prior to target month
  const priorDates = Array.from(totalsByDate.keys())
    .filter((d) => d < cutoffDate)
    .sort();
  if (priorDates.length > 0) {
    const firstPrior = priorDates[0];
    const lastPrior = shiftCalendarDays(cutoffDate, -1);
    const totalSpan = Math.min(180, Math.max(1, diffCalendarDays(firstPrior, lastPrior) + 1));
    const startScan = shiftCalendarDays(lastPrior, -(totalSpan - 1));
    for (let i = 0; i < totalSpan; i++) {
      const d = shiftCalendarDays(startScan, i);
      const amt = totalsByDate.get(d) ?? 0;
      if (isWeekendDay(getDayOfWeekUtc(d))) {
        histWeekendDays += 1;
        histWeekendSum += amt;
      } else {
        histWeekdayDays += 1;
        histWeekdaySum += amt;
      }
    }
  }

  const currentOverallDaily = elapsedDays > 0 ? currentTotalSantim / elapsedDays : 0;
  const histWeekdayRate = histWeekdayDays > 0 ? histWeekdaySum / histWeekdayDays : currentOverallDaily;
  const histWeekendRate = histWeekendDays > 0 ? histWeekendSum / histWeekendDays : currentOverallDaily;

  const currWeekdayRate = currentWeekdays > 0 ? currentWeekdaySum / currentWeekdays : currentOverallDaily;
  const currWeekendRate = currentWeekends > 0 ? currentWeekendSum / currentWeekends : currentOverallDaily;

  // Empirical shrinkage blends current month pace with prior learned day-of-week pattern
  const monthBlendWeight = Math.min(0.85, elapsedDays / 18);
  const hasHistory = priorDates.length >= 4;

  const weekdayRate = hasHistory
    ? monthBlendWeight * currWeekdayRate + (1 - monthBlendWeight) * histWeekdayRate
    : currentWeekdays >= 3
      ? 0.65 * currWeekdayRate + 0.35 * currentOverallDaily
      : currentOverallDaily;

  const weekendRate = hasHistory
    ? monthBlendWeight * currWeekendRate + (1 - monthBlendWeight) * histWeekendRate
    : currentWeekends >= 2
      ? 0.65 * currWeekendRate + 0.35 * currentOverallDaily
      : currentOverallDaily;

  let remainingWeekdays = 0;
  let remainingWeekends = 0;
  for (let d = elapsedDays + 1; d <= targetEndDay; d++) {
    const dateStr = `${params.targetMonthYm}-${String(d).padStart(2, '0')}`;
    if (isWeekendDay(getDayOfWeekUtc(dateStr))) {
      remainingWeekends += 1;
    } else {
      remainingWeekdays += 1;
    }
  }

  const remainingDays = remainingWeekdays + remainingWeekends;
  const expectedRemaining = remainingWeekdays * weekdayRate + remainingWeekends * weekendRate;
  const projectedTotalSantim = Math.round(currentTotalSantim + expectedRemaining);

  // Confidence band narrows as elapsedDays approaches targetEndDay
  const progressRatio = targetEndDay > 0 ? elapsedDays / targetEndDay : 1;
  const bandPct = Math.max(0, (1 - progressRatio) * 0.22);
  const lowTotalSantim = Math.max(
    currentTotalSantim,
    Math.round(currentTotalSantim + expectedRemaining * (1 - bandPct))
  );
  const highTotalSantim = Math.round(currentTotalSantim + expectedRemaining * (1 + bandPct));

  const confidence: PeriodForecast['confidence'] =
    elapsedDays >= 16 || progressRatio >= 0.7
      ? 'high'
      : elapsedDays >= 7
        ? 'medium'
        : 'low';

  return {
    projectedTotalSantim,
    lowTotalSantim,
    highTotalSantim,
    elapsedDays,
    remainingDays,
    weekdayDailyRateSantim: Math.round(weekdayRate),
    weekendDailyRateSantim: Math.round(weekendRate),
    confidence,
  };
}

function formatCadenceLabel(meanIntervalDays: number): string {
  const rounded = Math.round(meanIntervalDays);
  if (rounded >= 6 && rounded <= 8) return 'Weekly';
  if (rounded >= 13 && rounded <= 16) return 'Biweekly';
  if (rounded >= 27 && rounded <= 33) return 'Monthly';
  return `Every ~${rounded} days`;
}

/**
 * Detects recurring purchases/charges with consistent inter-arrival intervals (CV <= 0.40).
 */
export function detectRecurringCadence(
  events: readonly RecurringEventInput[],
  todayDate: string,
  options: { minOccurrences?: number; maxCv?: number } = {}
): RecurringPattern[] {
  const minOccurrences = options.minOccurrences ?? 3;
  const maxCv = options.maxCv ?? 0.4;

  const grouped = new Map<string, { label: string; byDate: Map<string, number> }>();

  for (const ev of events) {
    if (!ev.key || !ev.date || ev.amountSantim <= 0) continue;
    const normKey = ev.key.trim().toLowerCase();
    let entry = grouped.get(normKey);
    if (!entry) {
      entry = { label: ev.label, byDate: new Map<string, number>() };
      grouped.set(normKey, entry);
    }
    entry.byDate.set(ev.date, (entry.byDate.get(ev.date) ?? 0) + ev.amountSantim);
  }

  const patterns: RecurringPattern[] = [];

  for (const [key, group] of grouped.entries()) {
    const dates = Array.from(group.byDate.keys()).sort();
    if (dates.length < minOccurrences) continue;

    const gaps: number[] = [];
    for (let i = 1; i < dates.length; i++) {
      const gap = diffCalendarDays(dates[i - 1], dates[i]);
      if (gap > 0) gaps.push(gap);
    }
    if (gaps.length < minOccurrences - 1) continue;

    const gapStats = computeRobustBaseline(gaps);
    if (gapStats.mean < 2 || gapStats.mean > 45) continue;

    const cv = gapStats.mean > 0 ? gapStats.stdDev / gapStats.mean : 1;
    if (cv > maxCv) continue;

    const amounts = dates.map((d) => group.byDate.get(d) ?? 0);
    const typicalAmountSantim = estimateMedianAmountSantim(amounts) ?? 0;
    if (typicalAmountSantim <= 0) continue;

    const lastDate = dates[dates.length - 1];
    const roundedInterval = Math.max(1, Math.round(gapStats.mean));
    const nextExpectedDate = shiftCalendarDays(lastDate, roundedInterval);
    const daysUntilDue = diffCalendarDays(todayDate, nextExpectedDate);

    // Ignore stale series whose expected date passed over half a cycle + 14 days ago
    if (daysUntilDue < -(roundedInterval + 14)) continue;

    const isDueSoon = daysUntilDue >= -2 && daysUntilDue <= 4;
    const estimatedMonthlySantim = Math.round(typicalAmountSantim * (30 / gapStats.mean));

    patterns.push({
      key,
      label: group.label,
      occurrences: dates.length,
      meanIntervalDays: Number(gapStats.mean.toFixed(1)),
      cadenceLabel: formatCadenceLabel(gapStats.mean),
      typicalAmountSantim,
      estimatedMonthlySantim,
      lastDate,
      nextExpectedDate,
      isDueSoon,
    });
  }

  return patterns.sort((a, b) => b.estimatedMonthlySantim - a.estimatedMonthlySantim);
}
