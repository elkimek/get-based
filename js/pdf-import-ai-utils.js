// @ts-check
// pdf-import-ai-utils.js - AI request retry, JSON parsing, and accounting helpers.

import { callClaudeAPI, AI_IMPORT_REQUEST_TIMEOUT_MS } from './api.js';
import { getAIProvider, getOllamaMainModel } from './api-provider-storage.js';
import { isDebugMode } from './utils.js';

export const IMPORT_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    testType: { type: ['string', 'null'] },
    date: { type: ['string', 'null'] },
    sampleTime: { type: ['string', 'null'] },
    fasting: { type: ['boolean', 'null'] },
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
  required: ['testType', 'date', 'sampleTime', 'fasting', 'markers'],
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

// ── Phase-aware AI analysis progress ──
// Before the first streamed token the model is prefilling ("reading") — a
// dense local model can sit there for minutes with zero bytes. After the
// first token it is generating ("writing"). Observed per-model performance is
// persisted so later imports show a real time estimate during prefill.
const IMPORT_AI_PERF_KEY = 'labcharts-import-ai-perf';
const READING_PCT_START = 15;
const READING_PCT_END = 40;
const WRITING_PCT_END = 90;

export function importAIPerfKey() {
  const provider = getAIProvider();
  return provider === 'ollama' ? `local:${getOllamaMainModel()}` : provider;
}

function readImportAIPerf() {
  try { return JSON.parse(localStorage.getItem(IMPORT_AI_PERF_KEY) || '{}') || {}; }
  catch { return {}; }
}

/**
 * @param {string} perfKey
 * @param {{
 *   usage?: ImportUsage,
 *   diagnostics?: { performance?: { timeToFirstTokenMs?: number, tokensPerSecond?: number } }
 * }} [result]
 */
export function saveImportAIPerf(perfKey, { usage, diagnostics } = {}) {
  if (!perfKey) return;
  const perf = diagnostics?.performance;
  const inputTokens = Number(usage?.inputTokens) || 0;
  const ttftMs = Number(perf?.timeToFirstTokenMs) || 0;
  const genTps = Number(perf?.tokensPerSecond) || 0;
  if (!(inputTokens > 0 && ttftMs > 500) && !(genTps > 0)) return;
  const all = readImportAIPerf();
  const next = { ...(all[perfKey] || {}), at: Date.now() };
  if (inputTokens > 0 && ttftMs > 500) next.prefillTps = Math.round(inputTokens / (ttftMs / 1000));
  if (genTps > 0) next.genTps = Math.round(genTps * 10) / 10;
  all[perfKey] = next;
  const keys = Object.keys(all);
  while (keys.length > 12) {
    keys.sort((a, b) => (all[a]?.at || 0) - (all[b]?.at || 0));
    const oldestKey = keys.shift();
    if (!oldestKey) break;
    delete all[oldestKey];
  }
  try { localStorage.setItem(IMPORT_AI_PERF_KEY, JSON.stringify(all)); } catch {}
}

function remainingTimeLabel(ms) {
  if (ms >= 90000) return `about ${Math.round(ms / 60000)} min left`;
  if (ms > 0) return `about ${Math.max(5, Math.round(ms / 5000) * 5)}s left`;
  return '';
}

export function createImportAIProgress({ perfKey, estimatedPromptTokens = 0, onProgress }) {
  if (!onProgress) return { onStream: undefined, start() {}, finish() {} };
  const perf = readImportAIPerf()[perfKey] || {};
  const prefillEtaMs = perf.prefillTps > 0 && estimatedPromptTokens > 0
    ? (estimatedPromptTokens / perf.prefillTps) * 1000
    : 0;
  let ticker = null;
  let startedAt = 0;
  let lastPct = 0;
  const report = (pct, label) => {
    pct = Math.round(Math.max(READING_PCT_START, Math.min(WRITING_PCT_END, pct)));
    if (pct < lastPct) pct = lastPct;
    lastPct = pct;
    onProgress(pct, label);
  };
  const stopTicker = () => { if (ticker) { clearInterval(ticker); ticker = null; } };
  return {
    start() {
      startedAt = Date.now();
      report(READING_PCT_START, 'Model is reading the report');
      const span = READING_PCT_END - READING_PCT_START;
      ticker = setInterval(() => {
        const elapsed = Date.now() - startedAt;
        // A measured prefill rate makes the bar track real time; without one
        // it creeps asymptotically so slow dense models never look stuck.
        const frac = prefillEtaMs > 0
          ? Math.min(elapsed / prefillEtaMs, 1)
          : 1 - Math.exp(-elapsed / 90000);
        const left = prefillEtaMs > 0 ? Math.max(prefillEtaMs - elapsed, 0) : 0;
        report(READING_PCT_START + frac * span, `Model is reading the report${left > 3000 ? ' — ' + remainingTimeLabel(left) : ''}`);
      }, 1000);
    },
    onStream(text) {
      stopTicker();
      // Output length is unknown up front; approach the ceiling asymptotically.
      const frac = 1 - Math.exp(-text.length / 9000);
      report(READING_PCT_END + frac * (WRITING_PCT_END - READING_PCT_END), 'Model is writing the results');
    },
    finish() { stopTicker(); },
  };
}

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
