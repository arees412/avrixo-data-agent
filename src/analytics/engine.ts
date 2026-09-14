export interface DescriptiveStatistics {
  count: number;
  min: number;
  max: number;
  mean: number;
  median: number;
  standardDeviation: number;
}

export interface TrendPoint {
  label: string;
  value: number;
  change?: number;
  percentageChange?: number;
  anomaly: boolean;
}

export function percentageChange(
  previous: number,
  current: number,
): number | undefined {
  if (previous === 0) return undefined;
  return ((current - previous) / Math.abs(previous)) * 100;
}

export function descriptiveStatistics(values: number[]): DescriptiveStatistics {
  if (values.length === 0) {
    throw new Error("At least one value is required");
  }
  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((total, value) => total + value, 0);
  const mean = sum / sorted.length;
  const midpoint = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0
      ? (sorted[midpoint - 1] + sorted[midpoint]) / 2
      : sorted[midpoint];
  const variance =
    sorted.reduce((total, value) => total + (value - mean) ** 2, 0) /
    sorted.length;
  return {
    count: sorted.length,
    min: sorted[0],
    max: sorted.at(-1)!,
    mean,
    median,
    standardDeviation: Math.sqrt(variance),
  };
}

export function buildTrend(
  rows: Array<Record<string, unknown>>,
  labelColumn: string,
  valueColumn: string,
): TrendPoint[] {
  const points = rows.map((row) => ({
    label: String(row[labelColumn]),
    value: Number(row[valueColumn]),
  }));
  if (points.some((point) => !Number.isFinite(point.value))) {
    throw new Error(`Trend column is not numeric: ${valueColumn}`);
  }
  const stats = descriptiveStatistics(points.map((point) => point.value));
  return points.map((point, index) => {
    const previous = points[index - 1]?.value;
    const zScore =
      stats.standardDeviation === 0
        ? 0
        : Math.abs(point.value - stats.mean) / stats.standardDeviation;
    return {
      ...point,
      change: previous === undefined ? undefined : point.value - previous,
      percentageChange:
        previous === undefined
          ? undefined
          : percentageChange(previous, point.value),
      anomaly: zScore >= 2,
    };
  });
}

export function topN(
  rows: Array<Record<string, unknown>>,
  valueColumn: string,
  count: number,
): Array<Record<string, unknown>> {
  if (!Number.isInteger(count) || count < 1)
    throw new Error("count must be positive");
  return [...rows]
    .sort(
      (left, right) => Number(right[valueColumn]) - Number(left[valueColumn]),
    )
    .slice(0, count);
}
