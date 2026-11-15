export type TrendObservation = { year: string; value: number };

export type TrendAnalysis = {
  count: number;
  firstYear: number;
  lastYear: number;
  olsSlope: number;
  olsIntercept: number;
  olsSlopeCiLow: number;
  olsSlopeCiHigh: number;
  senSlope: number;
  senSlopeCiLow: number;
  senSlopeCiHigh: number;
  kendallTau: number;
  mannKendallZ: number;
  mannKendallP: number;
  direction: 'increasing' | 'decreasing' | 'no-trend';
  significantAt05: boolean;
};

function median(values: number[]): number {
  if (!values.length) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function erf(value: number): number {
  const sign = value < 0 ? -1 : 1;
  const x = Math.abs(value);
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return sign * y;
}

function normalCdf(value: number): number {
  return 0.5 * (1 + erf(value / Math.SQRT2));
}

/**
 * Calculates an OLS linear trend, Sen's median slope and the classical
 * Mann-Kendall statistic. Mann-Kendall p-values use the normal approximation;
 * seasonal/autocorrelation-corrected variants are not applied here.
 */
export function analyzeAnnualTrend(rows: TrendObservation[]): TrendAnalysis | null {
  const data = rows
    .map((row) => ({ year: Number(row.year), value: Number(row.value) }))
    .filter((row) => Number.isFinite(row.year) && Number.isFinite(row.value))
    .sort((a, b) => a.year - b.year);

  if (data.length < 3) return null;
  const unique = new Map<number, number>();
  data.forEach((row) => unique.set(row.year, row.value));
  const points = [...unique.entries()].map(([year, value]) => ({ year, value }));
  if (points.length < 3) return null;

  const n = points.length;
  const meanX = points.reduce((sum, point) => sum + point.year, 0) / n;
  const meanY = points.reduce((sum, point) => sum + point.value, 0) / n;
  const sxx = points.reduce((sum, point) => sum + (point.year - meanX) ** 2, 0);
  if (!sxx) return null;
  const sxy = points.reduce((sum, point) => sum + (point.year - meanX) * (point.value - meanY), 0);
  const olsSlope = sxy / sxx;
  const olsIntercept = meanY - olsSlope * meanX;
  const residualSumSquares = points.reduce((sum, point) => sum + (point.value - (olsIntercept + olsSlope * point.year)) ** 2, 0);
  const residualVariance = residualSumSquares / Math.max(1, n - 2);
  const slopeStandardError = Math.sqrt(residualVariance / sxx);

  const pairwiseSlopes: number[] = [];
  let score = 0;
  for (let i = 0; i < n - 1; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      const difference = points[j].value - points[i].value;
      score += Math.sign(difference);
      pairwiseSlopes.push(difference / (points[j].year - points[i].year));
    }
  }

  const tiedGroups = new Map<number, number>();
  points.forEach(({ value }) => tiedGroups.set(value, (tiedGroups.get(value) || 0) + 1));
  const tieCorrection = [...tiedGroups.values()].reduce((sum, groupSize) =>
    sum + groupSize * (groupSize - 1) * (2 * groupSize + 5), 0);
  const variance = (n * (n - 1) * (2 * n + 5) - tieCorrection) / 18;
  const z = variance <= 0 ? 0 : score > 0 ? (score - 1) / Math.sqrt(variance) : score < 0 ? (score + 1) / Math.sqrt(variance) : 0;
  const p = Math.min(1, 2 * (1 - normalCdf(Math.abs(z))));
  const senSlope = median(pairwiseSlopes);
  const criticalSen = 1.959963984540054 * Math.sqrt(Math.max(0, variance));
  const lowerSenRank = Math.max(0, Math.min(pairwiseSlopes.length - 1, Math.floor((pairwiseSlopes.length - criticalSen) / 2) - 1));
  const upperSenRank = Math.max(0, Math.min(pairwiseSlopes.length - 1, Math.ceil((pairwiseSlopes.length + criticalSen) / 2) - 1));
  const orderedSlopes = [...pairwiseSlopes].sort((a, b) => a - b);
  const significantAt05 = p < 0.05;

  return {
    count: n,
    firstYear: points[0].year,
    lastYear: points[n - 1].year,
    olsSlope,
    olsIntercept,
    olsSlopeCiLow: olsSlope - 1.96 * slopeStandardError,
    olsSlopeCiHigh: olsSlope + 1.96 * slopeStandardError,
    senSlope,
    senSlopeCiLow: orderedSlopes[lowerSenRank],
    senSlopeCiHigh: orderedSlopes[upperSenRank],
    kendallTau: score / (n * (n - 1) / 2),
    mannKendallZ: z,
    mannKendallP: p,
    direction: !significantAt05 ? 'no-trend' : score > 0 ? 'increasing' : score < 0 ? 'decreasing' : 'no-trend',
    significantAt05,
  };
}
