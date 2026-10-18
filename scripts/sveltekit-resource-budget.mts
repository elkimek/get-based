import fs from 'node:fs/promises';
import {constants as fsConstants} from 'node:fs';
import path from 'node:path';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';
import { parseAppShellEntries } from './app-shell-budget.mjs';

export interface SvelteKitResourceBudget {
  schemaVersion: 1;
  scenario: string;
  maximumDecodedBytes: number;
  maximumReferenceGrowthPercent: number;
  resourceCountWarning: number;
  reference: {
    version: string;
    buildId: string;
    measuredAt: string;
    resources: number;
    decodedBytes: number;
  };
}
export interface SvelteKitResourceMetrics {
  offlinePrecache: { resources: number; decodedBytes: number };
  generatedJavaScript: {
    files: number;
    decodedBytes: number;
    gzipBytes: number;
    brotliBytes: number;
  };
}

function object(value: unknown, keys: readonly string[], label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).sort().join(',') !== [...keys].sort().join(',')) {
    throw new Error(`${label} must have exactly these fields: ${keys.join(', ')}`);
  }
  return value as Record<string, unknown>;
}
function integer(value: unknown, label: string, minimum = 1): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum) {
    throw new Error(`${label} must be a safe integer >= ${minimum}`);
  }
  return value;
}
function text(value: unknown, pattern: RegExp, label: string): string {
  if (typeof value !== 'string' || !pattern.test(value)) throw new Error(`Invalid ${label}`);
  return value;
}

/** Closed policy parsing prevents missing, coerced or silently unused limits. */
export function parseSvelteKitResourceBudget(value: unknown): SvelteKitResourceBudget {
  const source = object(value, ['schemaVersion', 'scenario', 'maximumDecodedBytes',
    'maximumReferenceGrowthPercent', 'resourceCountWarning', 'reference'], 'SvelteKit resource budget');
  if (source.schemaVersion !== 1) throw new Error('Unsupported SvelteKit resource budget schemaVersion');
  const reference = object(source.reference, ['version', 'buildId', 'measuredAt', 'resources', 'decodedBytes'], 'SvelteKit reference');
  const measuredAt = text(reference.measuredAt, /^\d{4}-\d{2}-\d{2}$/, 'reference measuredAt');
  const date = new Date(measuredAt + 'T00:00:00.000Z');
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== measuredAt) {
    throw new Error('Invalid reference measuredAt calendar date');
  }
  const budget: SvelteKitResourceBudget = {
    schemaVersion: 1,
    scenario: text(source.scenario, /\S/, 'budget scenario'),
    maximumDecodedBytes: integer(source.maximumDecodedBytes, 'maximumDecodedBytes'),
    maximumReferenceGrowthPercent: integer(source.maximumReferenceGrowthPercent, 'maximumReferenceGrowthPercent'),
    resourceCountWarning: integer(source.resourceCountWarning, 'resourceCountWarning'),
    reference: {
      version: text(reference.version, /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/, 'reference version'),
      buildId: text(reference.buildId, /^[a-f0-9]{64}$/, 'reference buildId'),
      measuredAt,
      resources: integer(reference.resources, 'reference resources'),
      decodedBytes: integer(reference.decodedBytes, 'reference decodedBytes'),
    },
  };
  if (budget.maximumReferenceGrowthPercent > 100) throw new Error('maximumReferenceGrowthPercent must be <= 100');
  referenceGrowthMaximum(budget);
  return budget;
}

function referenceGrowthMaximum(budget: SvelteKitResourceBudget) {
  // Keep the integer numerator exact before applying the percentage floor.
  const numerator = budget.reference.decodedBytes * (100 + budget.maximumReferenceGrowthPercent);
  integer(numerator, 'Reference-growth byte calculation');
  return Math.floor(numerator / 100);
}

function assetRelativePath(url: string): string {
  const parsed = new URL(url, 'https://artifact.invalid');
  if (!url.startsWith('/') || url.startsWith('//') || parsed.origin !== 'https://artifact.invalid'
    || parsed.pathname !== url || parsed.search || parsed.hash || /[%\\\u0000-\u0020]/.test(url)
    || url.split('/').some(part => part === '.' || part === '..')) {
    throw new Error(`Invalid static resource URL: ${url}`);
  }
  const relative = ['/app', '/app/'].includes(url) ? 'index.html' : url.slice(1);
  if (!relative || relative.endsWith('/')) throw new Error(`Invalid static resource file: ${url}`);
  return relative;
}

/** Pin each read to one regular file descriptor and reject replaced path identities. */
async function readArtifactResource(root: string, relative: string, url: string): Promise<Buffer> {
  const target = path.join(root, relative);
  let handle: Awaited<ReturnType<typeof fs.open>>;
  try {
    handle = await fs.open(target, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW | fsConstants.O_NONBLOCK);
  } catch (cause) {
    throw new Error(`SvelteKit precache resource escapes artifact or is missing/non-regular: ${url}`, {cause});
  }
  try {
    const opened = await handle.stat();
    const file = await fs.realpath(target);
    if (!file.startsWith(root + path.sep) || file !== target || !opened.isFile()) {
      throw new Error(`SvelteKit precache resource escapes artifact or is not a file: ${url}`);
    }
    const located = await fs.stat(file);
    if (opened.dev !== located.dev || opened.ino !== located.ino) {
      throw new Error(`SvelteKit precache resource changed during measurement: ${url}`);
    }
    return await handle.readFile();
  } finally {
    await handle.close();
  }
}

/** Measure exact decoded Cache.put bodies; distinct document URLs each count. */
export async function measureSvelteKitResources({
  serviceWorkerSource,
  artifactRoot,
  generatedJavaScriptUrls,
}: {
  serviceWorkerSource: string;
  artifactRoot: string;
  generatedJavaScriptUrls: readonly string[];
}): Promise<SvelteKitResourceMetrics> {
  const urls = parseAppShellEntries(serviceWorkerSource);
  if (!urls.length) throw new Error('SvelteKit offline precache must not be empty');
  const root = await fs.realpath(artifactRoot);
  const bodies = new Map<string, Buffer>();
  for (const url of urls) {
    const relative = assetRelativePath(url);
    bodies.set(url, await readArtifactResource(root, relative, url));
  }
  const uniqueJavaScript = new Set(generatedJavaScriptUrls);
  if (uniqueJavaScript.size !== generatedJavaScriptUrls.length) throw new Error('Duplicate generated JavaScript resource URL');
  const generatedJavaScript = { files: uniqueJavaScript.size, decodedBytes: 0, gzipBytes: 0, brotliBytes: 0 };
  for (const url of generatedJavaScriptUrls) {
    assetRelativePath(url);
    if (!/\.(?:js|mjs)$/.test(url) || !bodies.has(url)) {
      throw new Error(`Generated JavaScript must be an existing precache script: ${url}`);
    }
    const body = bodies.get(url)!;
    generatedJavaScript.decodedBytes += body.length;
    generatedJavaScript.gzipBytes += gzipSync(body, { level: 9 }).length;
    generatedJavaScript.brotliBytes += brotliCompressSync(body, {
      params: { [constants.BROTLI_PARAM_QUALITY]: 9 },
    }).length;
  }
  return {
    offlinePrecache: { resources: urls.length, decodedBytes: [...bodies.values()].reduce((total, body) => total + body.length, 0) },
    generatedJavaScript,
  };
}

export function enforceSvelteKitResourceBudget(metrics: SvelteKitResourceMetrics, policy: unknown) {
  const budget = parseSvelteKitResourceBudget(policy);
  const offline = object(metrics.offlinePrecache, ['resources', 'decodedBytes'], 'Offline precache metrics');
  const scripts = object(metrics.generatedJavaScript, ['files', 'decodedBytes', 'gzipBytes', 'brotliBytes'], 'Generated JavaScript metrics');
  for (const [key, value] of Object.entries(offline)) integer(value, `offlinePrecache.${key}`, 0);
  for (const [key, value] of Object.entries(scripts)) integer(value, `generatedJavaScript.${key}`, 0);
  const referenceMaximum = referenceGrowthMaximum(budget);
  const actual = metrics.offlinePrecache.decodedBytes;
  const failures: string[] = [];
  if (actual > budget.maximumDecodedBytes) failures.push(`offline decoded bytes ${actual} exceeds hard maximum ${budget.maximumDecodedBytes}`);
  if (actual > referenceMaximum) failures.push(`offline decoded bytes ${actual} exceeds ${budget.maximumReferenceGrowthPercent}% reference-growth maximum ${referenceMaximum}`);
  if (failures.length) throw new Error(`SvelteKit resource budget exceeded: ${failures.join('; ')}.`);
  return {
    policy: budget,
    metrics,
    checks: {
      maximumDecodedBytes: budget.maximumDecodedBytes,
      maximumReferenceGrowthDecodedBytes: referenceMaximum,
      effectiveMaximumDecodedBytes: Math.min(budget.maximumDecodedBytes, referenceMaximum),
      remainingDecodedBytes: Math.min(budget.maximumDecodedBytes, referenceMaximum) - actual,
    },
    generatedJavaScriptCompression: { gzipLevel: 9, brotliQuality: 9, aggregation: 'sum of independently compressed files; not startup transfer' },
    warnings: metrics.offlinePrecache.resources > budget.resourceCountWarning
      ? [`SvelteKit offline precache has ${metrics.offlinePrecache.resources} resources; warning threshold is ${budget.resourceCountWarning}.`] : [],
  };
}
