import {
  estimateMedianAmountSantim,
  predictWithNaiveBayes,
  recencyWeight,
  tokenizeText,
} from '../src/domain/ml/textClassifier';
import {
  computeRobustBaseline,
  detectAnomalyZScore,
  detectRecurringCadence,
  forecastPeriodEnd,
} from '../src/domain/ml/timeSeriesAndAnomalies';

describe('On-device ML Core Primitives', () => {
  describe('textClassifier (Naive Bayes + Tokenizer + Median)', () => {
    it('tokenizes English and Amharic words into unigrams and bigrams', () => {
      const tokens = tokenizeText('Feres ride Bole-Kazanchis!');
      expect(tokens).toContain('feres');
      expect(tokens).toContain('ride');
      expect(tokens).toContain('feres_ride');
      expect(tokens).toContain('bole_kazanchis');

      const ethiopic = tokenizeText('ዳቦ ቤት 100');
      expect(ethiopic).toContain('ዳቦ');
      expect(ethiopic).toContain('100');
      expect(ethiopic).toContain('ዳቦ_ቤት');
    });

    it('learns categories from historical examples with calibrated confidence', () => {
      const training = [
        { text: 'Feres ride to Bole', label: 'transport' },
        { text: 'Minibus taxi Megenagna', label: 'transport' },
        { text: 'Bajaj ride home', label: 'transport' },
        { text: 'Ethio 100 airtime card', label: 'mobile' },
        { text: 'Weekly mobile data package', label: 'mobile' },
        { text: 'Morning bunna macchiato', label: 'food_coffee' },
        { text: 'Tomoca coffee', label: 'food_coffee' },
      ];

      const ridePred = predictWithNaiveBayes('Feres ride Kazanchis', training);
      expect(ridePred).not.toBeNull();
      expect(ridePred?.bestLabel).toBe('transport');
      expect(ridePred!.confidence).toBeGreaterThan(0.6);

      const dataPred = predictWithNaiveBayes('Ethio data package', training);
      expect(dataPred?.bestLabel).toBe('mobile');

      const unknownPred = predictWithNaiveBayes('zzzzunseenwordqqq', training);
      expect(unknownPred).toBeNull();
    });

    it('computes robust median amount ignoring extreme outliers', () => {
      expect(estimateMedianAmountSantim([10000, 11000, 12000, 900000])).toBe(11500);
      expect(estimateMedianAmountSantim([])).toBeNull();
    });

    it('computes decaying recency weight cleanly', () => {
      expect(recencyWeight(0)).toBeCloseTo(1);
      expect(recencyWeight(90)).toBeLessThan(0.4);
    });
  });

  describe('timeSeriesAndAnomalies', () => {
    it('detects statistical Z-score spikes only with sufficient baseline history', () => {
      // Insufficient history (<3 months)
      expect(detectAnomalyZScore(50000, [10000, 12000])).toBeNull();

      // Clear spike over 4 historical months (~10k mean)
      const spike = detectAnomalyZScore(35000, [9500, 10000, 10500, 10000]);
      expect(spike).not.toBeNull();
      expect(spike?.direction).toBe('spike');
      expect(spike!.zScore).toBeGreaterThan(2);
      expect(spike?.percentDelta).toBe(250);

      // Normal spending within noise
      const normal = detectAnomalyZScore(11000, [9500, 10000, 10500, 10000]);
      expect(normal).toBeNull();

      // Robust baseline stats sanity
      const stats = computeRobustBaseline([10, 20, 30]);
      expect(stats.mean).toBe(20);
      expect(stats.median).toBe(20);
    });

    it('forecasts end-of-month total using weekday vs weekend weights and confidence bounds', () => {
      // Simulate historical October + current November up to Nov 15
      const dailySeries = [
        // Oct high weekend spender: weekends 200 ETB, weekdays 50 ETB
        { date: '2026-10-03', amountSantim: 20000 }, // Sat
        { date: '2026-10-04', amountSantim: 20000 }, // Sun
        { date: '2026-10-05', amountSantim: 5000 },  // Mon
        { date: '2026-10-10', amountSantim: 20000 }, // Sat
        { date: '2026-10-11', amountSantim: 20000 }, // Sun
        // Nov 1..15 (Sun Nov 1..Sun Nov 15)
        { date: '2026-11-01', amountSantim: 18000 }, // Sun
        { date: '2026-11-02', amountSantim: 5000 },  // Mon
        { date: '2026-11-07', amountSantim: 22000 }, // Sat
        { date: '2026-11-08', amountSantim: 20000 }, // Sun
        { date: '2026-11-14', amountSantim: 20000 }, // Sat
      ];

      const forecast = forecastPeriodEnd({
        targetMonthYm: '2026-11',
        currentDayOfMonth: 15,
        dailySeries,
      });

      expect(forecast.elapsedDays).toBe(15);
      expect(forecast.remainingDays).toBe(15); // Nov has 30 days
      expect(forecast.weekendDailyRateSantim).toBeGreaterThan(forecast.weekdayDailyRateSantim);
      expect(forecast.projectedTotalSantim).toBeGreaterThan(85000);
      expect(forecast.lowTotalSantim).toBeLessThanOrEqual(forecast.projectedTotalSantim);
      expect(forecast.highTotalSantim).toBeGreaterThanOrEqual(forecast.projectedTotalSantim);
      expect(forecast.confidence).toBe('medium');
    });

    it('detects weekly and monthly recurring patterns and due-soon dates', () => {
      const patterns = detectRecurringCadence(
        [
          { key: 'ethio 100', label: 'Ethio 100', date: '2026-11-01', amountSantim: 10000 },
          { key: 'ethio 100', label: 'Ethio 100', date: '2026-11-08', amountSantim: 10000 },
          { key: 'ethio 100', label: 'Ethio 100', date: '2026-11-15', amountSantim: 10000 },
          { key: 'ethio 100', label: 'Ethio 100', date: '2026-11-22', amountSantim: 10000 },
          // Irregular random purchase should NOT trigger
          { key: 'cinema', label: 'Cinema', date: '2026-11-02', amountSantim: 30000 },
          { key: 'cinema', label: 'Cinema', date: '2026-11-04', amountSantim: 30000 },
          { key: 'cinema', label: 'Cinema', date: '2026-11-26', amountSantim: 30000 },
        ],
        '2026-11-27'
      );

      expect(patterns).toHaveLength(1);
      expect(patterns[0]).toMatchObject({
        key: 'ethio 100',
        cadenceLabel: 'Weekly',
        typicalAmountSantim: 10000,
        nextExpectedDate: '2026-11-29',
        isDueSoon: true,
      });
    });
  });
});
