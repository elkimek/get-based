// pii.js — Stable facade for PII obfuscation, local sanitization, and review UI.

import type { PIIReviewOptions } from './pii-review.js';

interface PrivacyCompletion {
  error?: { message?: string } | null;
  choices?: Array<{
    delta?: { content?: string; reasoning_content?: string; reasoning?: string };
    message?: { content?: string | null };
  }> | null;
}

import { getErrorMessage, getErrorName } from './caught-error.js';
import { showNotification } from './utils.js';
import { getOllamaPIIApiKey, getOllamaPIIModel, getOllamaPIIUrl } from './api.js';
import {
  checkOllama,
  checkOpenAICompatible,
  discoverLocalAI,
  filterPIIEligibleModels,
  getCachedLocalAiDiscovery,
  isCloudModel,
  isPIIEligibleModel,
} from './local-ai-discovery.js';
import { createInitialResponseTimeout } from './api-transport.js';
import { getLocalAiProviderAdapter } from './local-ai-provider-registry.js';
import { state } from './state.js';
import { profileStorageKey } from './profile-storage-key.js';
import { redactReportText } from './pii-redaction.js';
import {
  buildPIIDiffHTML,
  reviewPIIBeforeSend as reviewPIIBeforeSendUI,
  showPIIDiffViewer,
} from './pii-review.js';

export { checkOllama, checkOpenAICompatible };
export { buildPIIDiffHTML, showPIIDiffViewer };

// ═══════════════════════════════════════════════
// PII OBFUSCATION — Fake data generators & sanitization
// ═══════════════════════════════════════════════
export function detectSexFromPDF(text: string) {
  // Check for sex/gender labels in Czech and English lab reports
  // Note: \b doesn't work with accented chars (í,ž), so use [\s:] boundary instead
  if (/(?:pohlav[ií]|sex|gender)[\s:]+(?:ž|žena|female|f)(?:\s|$)/im.test(text)) return 'female';
  if (/(?:pohlav[ií]|sex|gender)[\s:]+(?:m|muž|male)(?:\s|$)/im.test(text)) return 'male';
  // Czech birth numbers: month 51-62 = female (month + 50)
  const bn = text.match(/\b\d{2}(5[1-9]|6[0-2])\d{2}\/\d{3,4}\b/);
  if (bn) return 'female';
  return null;
}
export function fakeName(sex: unknown) { return sex === 'female' ? 'Jana Nováková' : 'Jan Novák'; }
export const FAKE_STREETS = [
  'Sokolská 17', 'Národní 8', 'Lidická 32', 'Husova 5', 'Květná 12',
  'Nádražní 44', 'Masarykova 19', 'Palackého 7', 'Riegrova 23', 'Zahradní 3'
];
export const FAKE_CITIES = ['Brno', 'Olomouc', 'Plzeň', 'Ostrava', 'Liberec', 'České Budějovice', 'Hradec Králové', 'Pardubice'];
export const FAKE_DOCTORS = [
  'MUDr. Dvořák', 'MUDr. Procházka', 'MUDr. Horáková', 'MUDr. Novák',
  'MUDr. Šimková', 'MUDr. Veselý', 'MUDr. Kopecký', 'MUDr. Marková'
];

const UINT32_RANGE = 0x100000000;

export function secureRandomInt(maxExclusive: number) {
  if (!Number.isSafeInteger(maxExclusive) || maxExclusive < 1 || maxExclusive > UINT32_RANGE) {
    throw new RangeError('secureRandomInt requires an integer between 1 and 2^32');
  }
  const unbiasedLimit = Math.floor(UINT32_RANGE / maxExclusive) * maxExclusive;
  const sample = new Uint32Array(1);
  do crypto.getRandomValues(sample); while (sample[0]! >= unbiasedLimit);
  return sample[0]! % maxExclusive;
}

export function randomPick<T>(arr: readonly T[]) { return arr.length ? arr[secureRandomInt(arr.length)] : undefined; }
export function randomDigits(n: number) { let s = ''; for (let i = 0; i < n; i++) s += secureRandomInt(10); return s; }
export function fakeBirthNumber() {
  const y = 50 + secureRandomInt(50);
  const m = 1 + secureRandomInt(12);
  const d = 1 + secureRandomInt(28);
  return `${String(y).padStart(2,'0')}${String(m).padStart(2,'0')}${String(d).padStart(2,'0')}/${randomDigits(4)}`;
}
export function fakePhone() { return `+420 7${randomDigits(2)} ${randomDigits(3)} ${randomDigits(3)}`; }
export function fakeEmail() { return `user${randomDigits(4)}@mail.com`; }
export function fakeDate() {
  const y = 1960 + secureRandomInt(40);
  const m = 1 + secureRandomInt(12);
  const d = 1 + secureRandomInt(28);
  return `${String(d).padStart(2,'0')}.${String(m).padStart(2,'0')}.${y}`;
}
export function fakePatientId() { return randomDigits(10); }

export function isOllamaPIIEnabled() {
  return localStorage.getItem('labcharts-ollama-pii-enabled') === 'true';
}

export function setOllamaPIIEnabled(enabled: unknown) {
  localStorage.setItem('labcharts-ollama-pii-enabled', enabled ? 'true' : 'false');
}

export async function checkOllamaPII() {
  if (!isOllamaPIIEnabled()) return { available: false, models: [] };
  const url = getOllamaPIIUrl();
  const result = await discoverLocalAI(url, getOllamaPIIApiKey());
  const models = filterPIIEligibleModels(result.models);
  return {
    ...result,
    available: result.available && models.length > 0,
    models,
    modelDetails: (result.modelDetails || []).filter(model => models.includes(model.name)),
    blockedCloudModels: (result.models || []).filter(isCloudModel),
  };
}

export function unloadOllamaPIIModel() {
  const piiUrl = getOllamaPIIUrl();
  const apiKey = getOllamaPIIApiKey();
  const discovery = getCachedLocalAiDiscovery(piiUrl, apiKey);
  let providerId = discovery?.provider || '';
  if (!providerId) {
    try { providerId = new URL(piiUrl).port === '11434' ? 'ollama' : ''; } catch { return; }
  }
  const adapter = getLocalAiProviderAdapter(providerId);
  if (!adapter.unload) return;
  const piiModel = getOllamaPIIModel();
  adapter.unload({ baseUrl: piiUrl, apiKey, model: piiModel }).catch(() => {});
}

const PII_PROMPT_PREFIX = `TASK: Replace ONLY personal identifiers in this lab report. Output the FULL text with minimal changes.

REPLACE these with fake data:
- Patient names → fictional names
- Dates of birth → fictional dates in the same format
- Birth numbers (e.g. 850115/1234) → random numbers in same format
- Addresses → fictional addresses
- Phone numbers → random phone numbers
- Emails → fictional emails
- Doctor names → fictional doctor names
- Patient IDs → random numbers

Bracketed placeholders such as [PATIENT], [PHYSICIAN-AB12], [ADDRESS-AB12] or [PHONE-AB12] are already anonymized — copy them exactly and never replace them.

DO NOT CHANGE (copy exactly as-is):
- Collection dates, sample dates, and report dates — these are critical. Only dates of birth should change
- ALL "=== Page N ===" headers
- ALL lab test names, numeric values, units, reference ranges
- ALL line structure and formatting

Output ONLY the modified text. No explanations, no markdown, no commentary.

TEXT TO PROCESS:
`;

const SENSITIVE_LABEL_RE = /\b(?:jm[eé]no|name|pacient|patient|p[rř][ií]jmen[ií]|surname|adresa|address|bydli[sš]t[eě]|residence|datum\s*narozen|date\s*of\s*birth|DOB|rodn[eé]\s*[cč][ií]slo|birth\s*number|patient\s*id|member\s*id|medical\s*record|MRN|email|phone|telephone|tel\.?|doctor|physician|ordering|provider|referring)\b/i;
const LAB_UNIT_RE = /\b(?:mmol|[uµμ]mol|[uµμ]kat|g\/l|mg\/(?:l|dl)|ng\/(?:l|dl|ml)|pg|pmol|nmol|mU\/l|U\/l|IU\/l|mEq\/l|fL|cells\/uL|thou\/uL|mill\/uL)\b|%/i;

function normalizePIIComparison(text: unknown) {
  return String(text || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function extractSensitiveValues(text: unknown) {
  const values: string[] = [];
  for (const line of String(text || '').split(/\r?\n/)) {
    if (!SENSITIVE_LABEL_RE.test(line)) continue;
    const value = line.split(/[:=]/).slice(1).join(':').trim();
    if (value.length >= 3) values.push(value);
  }
  const patterns = [
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
    /\b\d{3}-\d{2}-\d{4}\b/g,
    /\b\d{2}(?:0[1-9]|1[0-2]|5[1-9]|6[0-2])(?:0[1-9]|[12]\d|3[01])\/\d{3,4}\b/g,
  ];
  for (const pattern of patterns) values.push(...(String(text || '').match(pattern) || []));
  return [...new Set(values.map(value => normalizePIIComparison(value)).filter(value => value.length >= 3))];
}

function labNumberPreservationRatio(input: unknown, output: unknown) {
  const numbers = (text: unknown) => String(text || '').split(/\r?\n/)
    .filter(line => LAB_UNIT_RE.test(line) && !SENSITIVE_LABEL_RE.test(line))
    .flatMap(line => line.match(/[-+]?\d+(?:[.,]\d+)?/g) || [])
    .map(value => value.replace(',', '.'));
  const original = numbers(input);
  if (original.length === 0) return 1;
  const remaining = new Map<string, number>();
  for (const value of numbers(output)) remaining.set(value, (remaining.get(value) || 0) + 1);
  let kept = 0;
  for (const value of original) {
    const count = remaining.get(value) || 0;
    if (count > 0) { kept++; remaining.set(value, count - 1); }
  }
  return kept / original.length;
}

function extractProtectedReportDates(text: unknown) {
  const dates: string[] = [];
  const datePattern = /\b\d{4}[-/.]\d{2}[-/.]\d{2}\b|\b\d{1,2}[./]\d{1,2}[./]\d{4}\b/g;
  const reportDateLabel = /\b(?:collection|collected|sample|specimen|report(?:ed)?|result(?:ed)?|drawn|odb[eě]r|datum\s*odb[eě]ru|vzork|nasb[ií]r)\b/i;
  for (const line of String(text || '').split(/\r?\n/)) {
    if (!reportDateLabel.test(line) || /\b(?:date\s*of\s*birth|datum\s*narozen|DOB)\b/i.test(line)) continue;
    dates.push(...(line.match(datePattern) || []));
  }
  return [...new Set(dates)];
}

export function validatePIIResult(result: string | null | undefined, pdfText: string) {
  if (!result) return 'Local AI returned empty response';
  if (result.length < pdfText.length * 0.25) return `Local AI output too short (${result.length} vs ${pdfText.length} chars)`;
  if (normalizePIIComparison(result) === normalizePIIComparison(pdfText)) return 'Local AI returned the original text without removing personal information';
  const inputDates = pdfText.match(/\b\d{4}[-/.]\d{2}[-/.]\d{2}\b|\b\d{1,2}[./]\d{1,2}[./]\d{4}\b/g) || [];
  const outputDates = result.match(/\b\d{4}[-/.]\d{2}[-/.]\d{2}\b|\b\d{1,2}[./]\d{1,2}[./]\d{4}\b/g) || [];
  if (inputDates.length > 0 && outputDates.length === 0) return 'Local AI lost all dates from the text';
  const missingReportDates = extractProtectedReportDates(pdfText).filter(date => !result.includes(date));
  if (missingReportDates.length > 0) return 'Local AI changed or removed a collection/report date';
  if (labNumberPreservationRatio(pdfText, result) < 0.85) return 'Local AI changed or removed too many lab values';
  return null;
}

export function finalizePIIResult(result: string, pdfText: string) {
  const validationError = validatePIIResult(result, pdfText);
  if (validationError) throw new Error(validationError);
  // The model saw the deterministic pre-pass output; keep those replacements as they are
  // so the second pass only catches what the model left behind.
  const deterministic = obfuscatePDFText(result, obfuscatePDFText(pdfText).produced ?? []).obfuscated;
  const normalizedFinal = normalizePIIComparison(deterministic);
  const retained = extractSensitiveValues(pdfText).filter(value => normalizedFinal.includes(value));
  if (retained.length > 0) throw new Error(`Privacy check found ${retained.length} original identifier${retained.length === 1 ? '' : 's'} still present`);
  const finalValidationError = validatePIIResult(deterministic, pdfText);
  if (finalValidationError) throw new Error(finalValidationError);
  return deterministic;
}

function ensurePIIModelEligible(model: unknown) {
  if (!isPIIEligibleModel(model)) {
    throw new Error(`Privacy model "${model}" is not a self-hosted text model. Cloud-tagged and embedding models cannot be used for PII protection.`);
  }
}

function createThinkingContentFilter(onText: (text: string) => void, onThinking: ((text: string) => void) | null | undefined) {
  let buffer = '';
  let inThinking = false;
  const openTag = '<think>';
  const closeTag = '</think>';
  const emitThinking = (text: string) => { if (text && onThinking) onThinking(text); };
  const emitText = (text: string) => { if (text) onText(text); };
  const drain = (final: boolean) => {
    while (buffer) {
      const tag = inThinking ? closeTag : openTag;
      const index = buffer.toLowerCase().indexOf(tag);
      if (index >= 0) {
        const before = buffer.slice(0, index);
        if (inThinking) emitThinking(before); else emitText(before);
        buffer = buffer.slice(index + tag.length);
        inThinking = !inThinking;
        continue;
      }
      if (final) {
        if (inThinking) emitThinking(buffer); else emitText(buffer);
        buffer = '';
        return;
      }
      const keep = tag.length - 1;
      if (buffer.length <= keep) return;
      const safe = buffer.slice(0, buffer.length - keep);
      if (inThinking) emitThinking(safe); else emitText(safe);
      buffer = buffer.slice(-keep);
      return;
    }
  };
  return {
    push(content: string) { buffer += content; drain(false); },
    flush() { drain(true); },
  };
}

export async function sanitizeWithOllamaStreaming(pdfText: string, onChunk: (chunk: string) => void, signal: AbortSignal | null | undefined, onThinking: ((chunk: string) => void) | null | undefined) {
  const piiUrl = getOllamaPIIUrl();
  const piiModel = getOllamaPIIModel();
  ensurePIIModelEligible(piiModel);
  const apiKey = getOllamaPIIApiKey();
  // Deterministic redaction first so the local model only handles leftovers and
  // repeated identifiers stay consistent across pages and reports.
  const promptText = PII_PROMPT_PREFIX + obfuscatePDFText(pdfText).obfuscated;
  const baseUrl = piiUrl.replace(/\/+$/, '');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

  // Quick reachability probe with a 5s timeout BEFORE issuing the
  // streaming request. If Ollama is unreachable (server stopped,
  // airplane mode, etc.) the caller can fall back to regex without
  // waiting for the long streaming timeout to fire. The probe signal
  // composes the caller's `signal` with the 5s deadline so a user-
  // initiated abort (e.g., closing the import dialog mid-probe) takes
  // effect immediately instead of waiting up to 5s for the timeout
  // to fire. Mirrors the AbortSignal.any-with-polyfill pattern used
  // in api.js's _fetchWithRetry. Greptile PR #178 P2 comment.
  try {
    let probeSignal: AbortSignal | null | undefined;
    const hasTimeout = typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function';
    const timeoutSig = hasTimeout ? AbortSignal.timeout(5000) : null;
    if (!timeoutSig) {
      // No timeout API at all — use caller's signal alone. Loses the
      // 5s deadline but at least doesn't spuriously fail the probe on
      // a healthy server when Ollama responds in <5s anyway.
      probeSignal = signal;
    } else if (signal && typeof AbortSignal.any === 'function') {
      probeSignal = AbortSignal.any([signal, timeoutSig]);
    } else if (signal) {
      const ctl = new AbortController();
      const fwd = (s: AbortSignal) => s.addEventListener('abort', () => ctl.abort(s.reason), { once: true });
      if (signal.aborted) ctl.abort(signal.reason); else fwd(signal);
      if (timeoutSig.aborted) ctl.abort(timeoutSig.reason); else fwd(timeoutSig);
      probeSignal = ctl.signal;
    } else {
      probeSignal = timeoutSig;
    }
    const probe = await fetch(`${baseUrl}/v1/models`, { headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {}, signal: probeSignal as AbortSignal | null });
    if (!probe.ok) throw new Error(`HTTP ${probe.status}`);
  } catch (e) {
    throw new Error(`Local PII server unreachable at ${baseUrl} — falling back to regex obfuscation. (${getErrorMessage(e)})`);
  }

  const requestState = createInitialResponseTimeout({
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: piiModel,
      messages: [{ role: 'user', content: promptText }],
      stream: true,
      temperature: 0,
      reasoning_effort: 'none',
    }),
    // Fetch treats an explicit undefined signal as omitted; DOM exact optional types omit that case.
    signal
  } as RequestInit, 30000);
  let resp;
  try {
    resp = await fetch(`${baseUrl}/v1/chat/completions`, requestState.fetchOptions);
  } finally {
    requestState.clearRequestTimeout();
  }
  if (!resp.ok) throw new Error(`Local server error: ${resp.status}`);
  if (!resp.body) throw new Error('Local server returned no response stream');

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let accumulated = '';
  let buffer = '';
  const contentFilter = createThinkingContentFilter(content => {
    accumulated += content;
    onChunk(content);
  }, onThinking);
  let streamDone = false;
  // Per-chunk stall timeout — local Ollama can hang mid-stream if the
  // model crashes / OOMs / loses GPU access; fail loud after 45s so
  // the user can fall back to regex instead of waiting forever.
  const STALL_MS = 45000;
  const readWithStall = () => new Promise<ReadableStreamReadResult<Uint8Array>>((resolve, reject) => {
    const t = setTimeout(() => {
      try { reader.cancel(); } catch (e) {}
      reject(new Error(`Local PII stream stalled — no data for ${Math.round(STALL_MS / 1000)}s. Stop and use regex instead.`));
    }, STALL_MS);
    reader.read().then(
      (r) => { clearTimeout(t); resolve(r); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });

  const processLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.startsWith('data:')) return false;
    const payload = trimmed.slice(5).trimStart();
    if (payload === '[DONE]') return true;
    const json = JSON.parse(payload) as PrivacyCompletion;
    if (json.error) throw new Error(json.error.message || String(json.error));
    const delta = json.choices?.[0]?.delta;
    if (!delta) return false;
    const reasoning = delta.reasoning_content || delta.reasoning;
    if (reasoning && onThinking) onThinking(reasoning);
    if (delta.content) contentFilter.push(delta.content);
    return false;
  };

  try {
    while (!streamDone) {
      const { done, value } = await readWithStall();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // keep incomplete line
      for (const line of lines) {
        if (processLine(line)) { streamDone = true; break; }
      }
    }
    buffer += decoder.decode();
    if (!streamDone && buffer.trim()) processLine(buffer);
    contentFilter.flush();
  } finally {
    reader.releaseLock();
    unloadOllamaPIIModel();
  }

  return finalizePIIResult(accumulated.trim(), pdfText);
}

export async function sanitizeWithOllama(pdfText: string) {
  const piiUrl = getOllamaPIIUrl();
  const piiModel = getOllamaPIIModel();
  ensurePIIModelEligible(piiModel);
  const apiKey = getOllamaPIIApiKey();
  // Deterministic redaction first so the local model only handles leftovers and
  // repeated identifiers stay consistent across pages and reports.
  const promptText = PII_PROMPT_PREFIX + obfuscatePDFText(pdfText).obfuscated;
  try {
    const baseUrl = piiUrl.replace(/\/+$/, '');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
    const resp = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: piiModel,
        messages: [{ role: 'user', content: promptText }],
        stream: false,
        temperature: 0,
        reasoning_effort: 'none',
      }),
      signal: AbortSignal.timeout(90000)
    });
    if (!resp.ok) throw new Error(`Local server error: ${resp.status}`);
    const data = await resp.json() as PrivacyCompletion;
    const result = (data.choices?.[0]?.message?.content || '').trim();
    return finalizePIIResult(result, pdfText);
  } catch (e) {
    if (getErrorName(e) === 'TimeoutError' || getErrorMessage(e).includes('timed out')) {
      showNotification(`PII model "${piiModel}" timed out. Falling back to regex. Try a smaller model in Settings → Privacy.`, 'info', 6000);
    }
    throw e;
  } finally {
    unloadOllamaPIIModel();
  }
}

// ═══════════════════════════════════════════════
// REGEX PII OBFUSCATION (fallback when no Ollama)
// ═══════════════════════════════════════════════
// Replacements are keyed per profile (see pii-redaction.ts) so the same
// original value gets the same replacement on every page and in every report.
const PII_PSEUDONYM_KEY_SUFFIX = 'pii-pseudonym-key';
let sessionPseudonymKey = '';

function randomKeyHex() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

/** Per-profile random redaction key. Holds no report content; falls back to a session key without storage. */
export function getPIIPseudonymKey(profileId: string = state.currentProfile || 'default') {
  const storageKey = profileStorageKey(profileId, PII_PSEUDONYM_KEY_SUFFIX);
  try {
    const existing = localStorage.getItem(storageKey);
    if (existing && /^[0-9a-f]{64}$/.test(existing)) return existing;
    const created = randomKeyHex();
    localStorage.setItem(storageKey, created);
    return created;
  } catch {
    if (!sessionPseudonymKey) sessionPseudonymKey = randomKeyHex();
    return sessionPseudonymKey;
  }
}

function currentProfileName() {
  const profiles = Array.isArray(state.profiles) ? state.profiles : [];
  const active = profiles.find(profile => profile?.id === state.currentProfile);
  return typeof active?.name === 'string' ? active.name : null;
}

export function obfuscatePDFText(pdfText: string, preserve?: Iterable<string>): { obfuscated: string; original: string; replacements: number; produced?: readonly string[] } {
  const original = pdfText;
  const { text, replacements, produced } = redactReportText(pdfText, {
    key: () => getPIIPseudonymKey(),
    profileName: currentProfileName(),
    profileDob: state.profileDob,
    preserve,
  });
  return { obfuscated: text, original, replacements, produced };
}

// extractPatientName dropped — too unreliable across PDF layouts

export function reviewPIIBeforeSend(originalText: string, { obfuscatedText = '', streamFn = null }: PIIReviewOptions = {}) {
  return reviewPIIBeforeSendUI(originalText, { obfuscatedText, streamFn }, {
    obfuscatePDFText,
    unloadOllamaPIIModel,
  });
}
