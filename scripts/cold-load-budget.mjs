const METRICS = [
  ['requests', 'requests'],
  ['transferBytes', 'compressed transfer bytes'],
  ['decodedBytes', 'decoded bytes'],
];

function requireNonNegativeNumber(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new Error(`${label} must be a non-negative number.`);
  }
  return number;
}

function requirePositiveNumber(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw new Error(`${label} must be a number greater than zero.`);
  }
  return number;
}

function isMeasuredAppResource(entry, appOrigin) {
  try {
    const url = new URL(entry?.name || '');
    if (url.origin !== appOrigin) return false;
    return url.pathname !== '/proxy' && !url.pathname.startsWith('/api/');
  } catch {
    return false;
  }
}

export function summarizeColdLoad(entries, appOrigin) {
  if (!Array.isArray(entries)) {
    throw new Error('Cold-load resource entries must be an array.');
  }
  const origin = new URL(appOrigin).origin;
  const measured = entries.filter(entry => isMeasuredAppResource(entry, origin));
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

export function enforceColdLoadBudget(metrics, budget) {
  const maximums = budget?.maximums;
  const failures = [];
  const result = {};

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
  return result;
}

export function formatColdLoadSummary(metrics) {
  const kib = bytes => `${(bytes / 1024).toFixed(1)} KiB`;
  return [
    `${metrics.requests} requests`,
    `${kib(metrics.transferBytes)} compressed`,
    `${kib(metrics.decodedBytes)} decoded`,
  ].join(', ');
}
