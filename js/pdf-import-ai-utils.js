// @ts-check
// pdf-import-ai-utils.js - AI request retry, JSON parsing, and accounting helpers.

import { callClaudeAPI, AI_IMPORT_REQUEST_TIMEOUT_MS } from './api.js';
import { isDebugMode } from './utils.js';

export const IMPORT_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    testType: { type: ['string', 'null'] },
    date: { type: ['string', 'null'] },
    markers: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          rawName: { type: 'string' },
          value: { type: ['number', 'string'] },
          mappedKey: { type: ['string', 'null'] },
          suggestedKey: { type: ['string', 'null'] },
          suggestedName: { type: ['string', 'null'] },
          suggestedCategoryLabel: { type: ['string', 'null'] },
          suggestedGroup: { type: ['string', 'null'] },
          unit: { type: ['string', 'null'] },
          refMin: { type: ['number', 'null'] },
          refMax: { type: ['number', 'null'] },
        },
        required: ['rawName', 'value', 'mappedKey', 'unit', 'refMin', 'refMax'],
      },
    },
  },
  required: ['testType', 'date', 'markers'],
};

export const IMPORT_CLASSIFICATION_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    testType: { type: 'string' },
    labName: { type: ['string', 'null'] },
  },
  required: ['testType'],
};

export function compactMarkerReference(markerRef) {
  return Object.entries(markerRef || {}).map(([key, def]) => {
    const name = String(def?.name || '').replace(/[|\n\r]/g, ' ');
    const unit = String(def?.unit || '').replace(/[|\n\r]/g, ' ');
    return `${key}|${name}|${unit}`;
  }).join('\n');
}

/**
 * @typedef {{
 *   inputTokens?: number,
 *   outputTokens?: number
 * }} ImportUsage
 */

export function isAIStreamAbortError(err) {
  const message = String(err?.message || err || '').toLowerCase();
  const name = String(err?.name || '').toLowerCase();
  return message.includes('bodystreambuffer was aborted')
    || message.includes('aborted by user')
    || (message.includes('body') && message.includes('stream') && message.includes('abort'))
    || name === 'aborterror';
}

export async function callImportAIWithStreamFallback(request, label) {
  try {
    return await callClaudeAPI(request);
  } catch (err) {
    if (!request.onStream || request.signal?.aborted || !isAIStreamAbortError(err)) throw err;
    if (isDebugMode()) console.warn(`[Import] ${label} stream aborted; retrying without streaming`, err);
    try {
      const result = await callClaudeAPI({ ...request, onStream: undefined, forceNonStream: true, requestTimeoutMs: AI_IMPORT_REQUEST_TIMEOUT_MS });
      return {
        ...result,
        diagnostics: { ...result?.diagnostics, streamFallback: true },
      };
    } catch (retryErr) {
      if (isAIStreamAbortError(retryErr)) {
        throw new Error('AI analysis request was aborted after retrying without streaming. The PDF text extracted correctly; try another model/provider if this persists.');
      }
      throw retryErr;
    }
  }
}

export function formatImportError(err) {
  if (isAIStreamAbortError(err)) {
    return 'AI analysis request was interrupted after privacy review. Try again, or switch provider/model if it repeats.';
  }
  return err?.message || String(err);
}

export function getUsageTokens(usage) {
  const u = /** @type {ImportUsage} */ (usage || {});
  return {
    inputTokens: Number(u.inputTokens) || 0,
    outputTokens: Number(u.outputTokens) || 0,
  };
}

export function tryParseJSON(str) {
  try { return JSON.parse(str); } catch {}
  // Try trimming to last complete object (handles truncated output)
  const lastBrace = str.lastIndexOf('}');
  if (lastBrace > 0 && lastBrace < str.length - 1) {
    try { return JSON.parse(str.slice(0, lastBrace + 1)); } catch {}
  }
  // Attempt to repair truncated JSON from local models
  let s = str;
  // Close any unterminated string
  const quotes = (s.match(/"/g) || []).length;
  if (quotes % 2 !== 0) s += '"';
  // Try closing open arrays and objects
  const opens = { '{': 0, '[': 0 };
  let inString = false;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '"' && (i === 0 || s[i - 1] !== '\\')) { inString = !inString; continue; }
    if (inString) continue;
    if (s[i] === '{') opens['{']++;
    if (s[i] === '}') opens['{']--;
    if (s[i] === '[') opens['[']++;
    if (s[i] === ']') opens['[']--;
  }
  // Remove trailing comma before closing
  s = s.replace(/,\s*$/, '');
  // Close unclosed brackets/braces
  for (let i = 0; i < opens['[']; i++) s += ']';
  for (let i = 0; i < opens['{']; i++) s += '}';
  try {
    const result = JSON.parse(s);
    if (isDebugMode()) console.log('[PDF Parse] Repaired truncated JSON from model');
    return result;
  } catch (e2) {
    throw new Error(`Model returned invalid JSON that could not be repaired. Try a more capable model.`);
  }
}
