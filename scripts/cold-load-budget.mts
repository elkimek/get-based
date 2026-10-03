type ColdLoadMetric = 'requests' | 'transferBytes' | 'decodedBytes';
type RawColdLoadMetrics = Partial<Record<ColdLoadMetric, unknown>>;
type RawResourceEntry = { name?: unknown; transferSize?: unknown; decodedBodySize?: unknown };
type MeasuredResourceEntries = {
  length: unknown;
  reduce: (callback: (total: number, entry: RawResourceEntry) => number, initial: number) => unknown;
};
type ResourceEntriesReader = { filter: (predicate: (entry: RawResourceEntry | null | undefined) => boolean) => MeasuredResourceEntries };
const METRICS: ReadonlyArray<readonly [ColdLoadMetric, string]> = [
  ['requests', 'requests'],
  ['transferBytes', 'compressed transfer bytes'],
  ['decodedBytes', 'decoded bytes'],
];

function requireNonNegativeNumber(value: unknown, label: string) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new Error(`${label} must be a non-negative number.`);
  }
  return number;
}

function requirePositiveNumber(value: unknown, label: string) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw new Error(`${label} must be a number greater than zero.`);
  }
  return number;
}

function isMeasuredAppResource(entry: RawResourceEntry | null | undefined, appOrigin: string) {
  try {
    const url = new URL((entry?.name || '') as string);
    if (url.origin !== appOrigin) return false;
    return url.pathname !== '/proxy' && !url.pathname.startsWith('/api/');
  } catch {
    return false;
  }
}

export function summarizeColdLoad(entries: unknown, appOrigin: string) {
  if (!Array.isArray(entries)) {
    throw new Error('Cold-load resource entries must be an array.');
  }
  const origin = new URL(appOrigin).origin;
  const measured = (entries as ResourceEntriesReader).filter(entry => isMeasuredAppResource(entry, origin));
  return {
    requests: measured.length,
    transferBytes: measured.reduce(
      (total, entry) => total + requireNonNegativeNumber(entry.transferSize, 'resource transferSize'),
      0,
    ),
    decodedBytes: measured.reduce(
      (total, entry) => total + requireNonNegativeNumber(entry.decodedBodySize, 'resource decodedBodySize'),
      0,
    ),
  };
}

export function enforceColdLoadBudget(metrics: RawColdLoadMetrics | null | undefined, budget: { maximums?: RawColdLoadMetrics | null } | null | undefined) {
  const maximums = budget?.maximums;
  const failures: string[] = [];
  const result: Partial<Record<ColdLoadMetric, { actual: number; maximum: number; remaining: number }>> = {};

  for (const [key, label] of METRICS) {
    const actual = requireNonNegativeNumber(metrics?.[key], `cold-load ${key}`);
    const maximum = requirePositiveNumber(maximums?.[key], `cold-load maximums.${key}`);
    result[key] = {
      actual,
      maximum,
      remaining: maximum - actual,
    };
    if (actual > maximum) {
      failures.push(`${label} ${actual} exceeds ${maximum}`);
    }
  }

  if (failures.length) {
    throw new Error(`Cold-load budget exceeded: ${failures.join('; ')}.`);
  }
  return result as Record<ColdLoadMetric, { actual: number; maximum: number; remaining: number }>;
}

export function formatColdLoadSummary(metrics: RawColdLoadMetrics) {
  const kib = (bytes: number) => `${(bytes / 1024).toFixed(1)} KiB`;
  return [
    `${metrics.requests} requests`,
    `${kib(metrics.transferBytes as number)} compressed`,
    `${kib(metrics.decodedBytes as number)} decoded`,
  ].join(', ');
}
