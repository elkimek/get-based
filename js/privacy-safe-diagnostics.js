// @ts-check
// privacy-safe-diagnostics.js — Metadata-only debug logging for PII workflows.

import { isDebugMode } from './utils.js';

const NUMERIC_FIELDS = new Set([
  'analysisMs',
  'durationMs',
  'fileIndex',
  'inputChars',
  'outputChars',
  'pageCount',
  'replacements',
  'totalFiles',
]);
const DIAGNOSTIC_EVENTS = new Set([
  'analysis-complete',
  'batch-analysis-complete',
  'batch-import-failed',
  'batch-local-sanitizer-fallback',
  'batch-retry-failed',
  'batch-transform-complete',
  'image-analysis-complete',
  'image-import-failed',
  'import-mode-selected',
  'local-sanitizer-complete',
  'local-sanitizer-fallback',
  'parse-failed',
  'transform-complete',
]);
const TOKEN_VALUES = new Map([
  ['errorName', new Set([
    'AbortError',
    'DataError',
    'Error',
    'NetworkError',
    'NotAllowedError',
    'QuotaExceededError',
    'RangeError',
    'SyntaxError',
    'TimeoutError',
    'TypeError',
  ])],
  ['method', new Set(['ollama', 'ollama+review', 'regex', 'unknown'])],
  ['mode', new Set(['cancel', 'image', 'text'])],
  ['quality', new Set(['empty', 'good', 'poor'])],
  ['stage', new Set(['analysis', 'extract', 'mode-selection', 'preflight', 'privacy'])],
]);

/**
 * Reduce diagnostic input to a small, non-content-bearing metadata object.
 * Unknown keys, objects, arrays, filenames, and free-form strings are dropped.
 *
 * @param {Record<string, unknown>} [details]
 */
export function sanitizePrivacyDiagnostic(details = {}) {
  /** @type {Record<string, number | string>} */
  const safe = {};
  for (const [key, value] of Object.entries(details)) {
    if (NUMERIC_FIELDS.has(key)) {
      if (typeof value === 'number' && Number.isFinite(value) && value >= 0) safe[key] = value;
      continue;
    }
    const allowedValues = TOKEN_VALUES.get(key);
    if (typeof value === 'string' && allowedValues?.has(value)) safe[key] = value;
  }
  return Object.freeze(safe);
}

/**
 * Emit a metadata-only diagnostic when the user explicitly enabled debug mode.
 *
 * @param {string} event
 * @param {Record<string, unknown>} [details]
 */
export function logPrivacyDiagnostic(event, details = {}) {
  if (!isDebugMode()) return null;
  const safeEvent = DIAGNOSTIC_EVENTS.has(event) ? event : 'event';
  const safeDetails = sanitizePrivacyDiagnostic(details);
  console.debug(`[privacy] ${safeEvent}`, safeDetails);
  return safeDetails;
}
