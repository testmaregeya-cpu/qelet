/**
 * Lightweight, zero-dependency on-device Multinomial Naive Bayes text classifier
 * and robust amount estimator. Works offline across English & Ethiopic scripts.
 */

export interface TrainingSample<Label extends string> {
  text: string;
  label: Label;
  weight?: number;
}

export interface RankedClassPrediction<Label extends string> {
  label: Label;
  confidence: number;
  sampleCount: number;
}

export interface ClassificationResult<Label extends string> {
  bestLabel: Label;
  confidence: number;
  matchedTokenCount: number;
  ranked: RankedClassPrediction<Label>[];
}

const SPLIT_RE = /[\s/\\.,:;!?()[\]{}"'`~@#%^&*+=<>|_-]+/;

/**
 * Extracts normalized unigrams and adjacent word bigrams from free text.
 */
export function tokenizeText(input: string): string[] {
  const normalized = input.trim().toLowerCase();
  if (!normalized) return [];

  const words = normalized
    .split(SPLIT_RE)
    .map((w) => w.trim())
    .filter((w) => w.length >= 2 || /^\d+$/.test(w));

  if (words.length === 0) return [];

  const tokens = [...words];
  for (let i = 0; i < words.length - 1; i++) {
    tokens.push(`${words[i]}_${words[i + 1]}`);
  }
  return tokens;
}

/**
 * Predicts the most likely class label for `queryText` using recency-weighted
 * Multinomial Naive Bayes with Laplace smoothing (alpha = 1.0).
 */
export function predictWithNaiveBayes<Label extends string>(
  queryText: string,
  samples: readonly TrainingSample<Label>[],
  options: { alpha?: number; minMatchedTokens?: number } = {}
): ClassificationResult<Label> | null {
  if (samples.length === 0) return null;

  const queryTokens = tokenizeText(queryText);
  if (queryTokens.length === 0) return null;

  const alpha = options.alpha ?? 0.15;
  const minMatchedTokens = options.minMatchedTokens ?? 1;

  const vocab = new Set<string>();
  const classDocWeight = new Map<Label, number>();
  const classSampleCount = new Map<Label, number>();
  const classTokenTotal = new Map<Label, number>();
  const classTokenCounts = new Map<Label, Map<string, number>>();
  let totalDocWeight = 0;

  for (const sample of samples) {
    const tokens = tokenizeText(sample.text);
    if (tokens.length === 0) continue;

    const w = sample.weight !== undefined && sample.weight > 0 ? sample.weight : 1;
    totalDocWeight += w;
    classDocWeight.set(sample.label, (classDocWeight.get(sample.label) ?? 0) + w);
    classSampleCount.set(sample.label, (classSampleCount.get(sample.label) ?? 0) + 1);

    let tokenMap = classTokenCounts.get(sample.label);
    if (!tokenMap) {
      tokenMap = new Map<string, number>();
      classTokenCounts.set(sample.label, tokenMap);
    }

    let tokenSum = classTokenTotal.get(sample.label) ?? 0;
    for (const token of tokens) {
      vocab.add(token);
      tokenMap.set(token, (tokenMap.get(token) ?? 0) + w);
      tokenSum += w;
    }
    classTokenTotal.set(sample.label, tokenSum);
  }

  const classes = Array.from(classDocWeight.keys());
  if (classes.length === 0 || vocab.size === 0 || totalDocWeight <= 0) {
    return null;
  }

  // Count how many query tokens exist anywhere in the learned vocabulary
  let matchedTokenCount = 0;
  for (const token of queryTokens) {
    if (vocab.has(token)) {
      matchedTokenCount += 1;
    }
  }
  if (matchedTokenCount < minMatchedTokens) {
    return null;
  }

  const vocabSize = vocab.size;
  const logScores = new Map<Label, number>();
  let maxLogScore = -Infinity;

  for (const label of classes) {
    const prior = Math.log((classDocWeight.get(label) ?? 0) / totalDocWeight);
    const denom = (classTokenTotal.get(label) ?? 0) + alpha * vocabSize;
    const tokenMap = classTokenCounts.get(label);

    let logLikelihood = 0;
    for (const token of queryTokens) {
      const count = tokenMap?.get(token) ?? 0;
      logLikelihood += Math.log((count + alpha) / denom);
    }

    const totalScore = prior + logLikelihood;
    logScores.set(label, totalScore);
    if (totalScore > maxLogScore) {
      maxLogScore = totalScore;
    }
  }

  // Softmax normalization in log-space for numerical stability
  let expSum = 0;
  const expByClass = new Map<Label, number>();
  for (const label of classes) {
    const expVal = Math.exp((logScores.get(label) ?? maxLogScore) - maxLogScore);
    expByClass.set(label, expVal);
    expSum += expVal;
  }

  const ranked: RankedClassPrediction<Label>[] = classes
    .map((label) => ({
      label,
      confidence: expSum > 0 ? (expByClass.get(label) ?? 0) / expSum : 0,
      sampleCount: classSampleCount.get(label) ?? 0,
    }))
    .sort((a, b) => b.confidence - a.confidence || b.sampleCount - a.sampleCount);

  return {
    bestLabel: ranked[0].label,
    confidence: ranked[0].confidence,
    matchedTokenCount,
    ranked,
  };
}

/**
 * Computes exponential recency weight given an age in days.
 * A half-life / decay scale of 90 days keeps recent spending habits dominant
 * without ignoring long-term history.
 */
export function recencyWeight(daysAgo: number, scaleDays = 90): number {
  const clamped = Math.max(0, daysAgo);
  return Math.exp(-clamped / Math.max(1, scaleDays));
}

/**
 * Returns the median integer amount from historical santim amounts (robust to one-off outliers).
 */
export function estimateMedianAmountSantim(amounts: readonly number[]): number | null {
  const valid = amounts.filter((a) => Number.isFinite(a) && a > 0).sort((a, b) => a - b);
  if (valid.length === 0) return null;

  const mid = Math.floor(valid.length / 2);
  if (valid.length % 2 === 1) {
    return Math.round(valid[mid]);
  }
  return Math.round((valid[mid - 1] + valid[mid]) / 2);
}
