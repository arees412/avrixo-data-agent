export interface GroundingResult {
  grounded: boolean;
  unsupportedNumbers: number[];
  evidence: number[];
}

function collectNumbers(value: unknown, target: number[]): void {
  if (typeof value === "number" && Number.isFinite(value)) {
    target.push(value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry) => collectNumbers(entry, target));
    return;
  }
  if (value && typeof value === "object") {
    Object.values(value).forEach((entry) => collectNumbers(entry, target));
  }
}

function approximatelyEqual(left: number, right: number): boolean {
  const tolerance = Math.max(0.01, Math.abs(right) * 0.0001);
  return Math.abs(left - right) <= tolerance;
}

export function checkNumericalGrounding(
  narrative: string,
  rows: Array<Record<string, unknown>>,
  computedAnalytics: unknown[] = [],
): GroundingResult {
  const evidence: number[] = [];
  collectNumbers(rows, evidence);
  collectNumbers(computedAnalytics, evidence);
  evidence.push(rows.length);

  const mentioned = [...narrative.matchAll(/(?<![\w-])-?\d+(?:\.\d+)?/g)].map(
    (match) => Number(match[0]),
  );
  const unsupportedNumbers = mentioned.filter(
    (number) =>
      !evidence.some((candidate) => approximatelyEqual(number, candidate)),
  );
  return {
    grounded: unsupportedNumbers.length === 0,
    unsupportedNumbers,
    evidence: [...new Set(evidence)],
  };
}
