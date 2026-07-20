// @ts-check
// pii.js — PII obfuscation (Ollama + regex), diff viewer

import { showNotification, escapeHTML } from './utils.js';
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
import { openModalOverlay, removeModalOverlay, trapModalFocus } from './modal-lifecycle.js';
import { state } from './state.js';

export { checkOllama, checkOpenAICompatible };

// ═══════════════════════════════════════════════
// PII OBFUSCATION — Fake data generators & sanitization
// ═══════════════════════════════════════════════
export function detectSexFromPDF(text) {
  // Check for sex/gender labels in Czech and English lab reports
  // Note: \b doesn't work with accented chars (í,ž), so use [\s:] boundary instead
  if (/(?:pohlav[ií]|sex|gender)[\s:]+(?:ž|žena|female|f)(?:\s|$)/im.test(text)) return 'female';
  if (/(?:pohlav[ií]|sex|gender)[\s:]+(?:m|muž|male)(?:\s|$)/im.test(text)) return 'male';
  // Czech birth numbers: month 51-62 = female (month + 50)
  const bn = text.match(/\b\d{2}(5[1-9]|6[0-2])\d{2}\/\d{3,4}\b/);
  if (bn) return 'female';
  return null;
}
export function fakeName(sex) { return sex === 'female' ? 'Jana Nováková' : 'Jan Novák'; }
export const FAKE_STREETS = [
  'Sokolská 17', 'Národní 8', 'Lidická 32', 'Husova 5', 'Květná 12',
  'Nádražní 44', 'Masarykova 19', 'Palackého 7', 'Riegrova 23', 'Zahradní 3'
];
export const FAKE_CITIES = ['Brno', 'Olomouc', 'Plzeň', 'Ostrava', 'Liberec', 'České Budějovice', 'Hradec Králové', 'Pardubice'];
export const FAKE_DOCTORS = [
  'MUDr. Dvořák', 'MUDr. Procházka', 'MUDr. Horáková', 'MUDr. Novák',
  'MUDr. Šimková', 'MUDr. Veselý', 'MUDr. Kopecký', 'MUDr. Marková'
];

export function randomPick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
export function randomDigits(n) { let s = ''; for (let i = 0; i < n; i++) s += Math.floor(Math.random() * 10); return s; }
export function fakeBirthNumber() {
  const y = 50 + Math.floor(Math.random() * 50);
  const m = 1 + Math.floor(Math.random() * 12);
  const d = 1 + Math.floor(Math.random() * 28);
  return `${String(y).padStart(2,'0')}${String(m).padStart(2,'0')}${String(d).padStart(2,'0')}/${randomDigits(4)}`;
}
export function fakePhone() { return `+420 7${randomDigits(2)} ${randomDigits(3)} ${randomDigits(3)}`; }
export function fakeEmail() { return `user${randomDigits(4)}@mail.com`; }
export function fakeDate() {
  const y = 1960 + Math.floor(Math.random() * 40);
  const m = 1 + Math.floor(Math.random() * 12);
  const d = 1 + Math.floor(Math.random() * 28);
  return `${String(d).padStart(2,'0')}.${String(m).padStart(2,'0')}.${y}`;
}
export function fakePatientId() { return randomDigits(10); }

export function isOllamaPIIEnabled() {
  return localStorage.getItem('labcharts-ollama-pii-enabled') === 'true';
}

export function setOllamaPIIEnabled(enabled) {
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

function normalizePIIComparison(text) {
  return String(text || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function extractSensitiveValues(text) {
  const values = [];
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

function labNumberPreservationRatio(input, output) {
  const numbers = text => String(text || '').split(/\r?\n/)
    .filter(line => LAB_UNIT_RE.test(line) && !SENSITIVE_LABEL_RE.test(line))
    .flatMap(line => line.match(/[-+]?\d+(?:[.,]\d+)?/g) || [])
    .map(value => value.replace(',', '.'));
  const original = numbers(input);
  if (original.length === 0) return 1;
  const remaining = new Map();
  for (const value of numbers(output)) remaining.set(value, (remaining.get(value) || 0) + 1);
  let kept = 0;
  for (const value of original) {
    const count = remaining.get(value) || 0;
    if (count > 0) { kept++; remaining.set(value, count - 1); }
  }
  return kept / original.length;
}

function extractProtectedReportDates(text) {
  const dates = [];
  const datePattern = /\b\d{4}[-/.]\d{2}[-/.]\d{2}\b|\b\d{1,2}[./]\d{1,2}[./]\d{4}\b/g;
  const reportDateLabel = /\b(?:collection|collected|sample|specimen|report(?:ed)?|result(?:ed)?|drawn|odb[eě]r|datum\s*odb[eě]ru|vzork|nasb[ií]r)\b/i;
  for (const line of String(text || '').split(/\r?\n/)) {
    if (!reportDateLabel.test(line) || /\b(?:date\s*of\s*birth|datum\s*narozen|DOB)\b/i.test(line)) continue;
    dates.push(...(line.match(datePattern) || []));
  }
  return [...new Set(dates)];
}

export function validatePIIResult(result, pdfText) {
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

export function finalizePIIResult(result, pdfText) {
  const validationError = validatePIIResult(result, pdfText);
  if (validationError) throw new Error(validationError);
  const deterministic = obfuscatePDFText(result).obfuscated;
  const normalizedFinal = normalizePIIComparison(deterministic);
  const retained = extractSensitiveValues(pdfText).filter(value => normalizedFinal.includes(value));
  if (retained.length > 0) throw new Error(`Privacy check found ${retained.length} original identifier${retained.length === 1 ? '' : 's'} still present`);
  const finalValidationError = validatePIIResult(deterministic, pdfText);
  if (finalValidationError) throw new Error(finalValidationError);
  return deterministic;
}

function ensurePIIModelEligible(model) {
  if (!isPIIEligibleModel(model)) {
    throw new Error(`Privacy model "${model}" is not a self-hosted text model. Cloud-tagged and embedding models cannot be used for PII protection.`);
  }
}

function createThinkingContentFilter(onText, onThinking) {
  let buffer = '';
  let inThinking = false;
  const openTag = '<think>';
  const closeTag = '</think>';
  const emitThinking = text => { if (text && onThinking) onThinking(text); };
  const emitText = text => { if (text) onText(text); };
  const drain = final => {
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
    push(content) { buffer += content; drain(false); },
    flush() { drain(true); },
  };
}

export async function sanitizeWithOllamaStreaming(pdfText, onChunk, signal, onThinking) {
  const piiUrl = getOllamaPIIUrl();
  const piiModel = getOllamaPIIModel();
  ensurePIIModelEligible(piiModel);
  const apiKey = getOllamaPIIApiKey();
  const promptText = PII_PROMPT_PREFIX + pdfText;
  const baseUrl = piiUrl.replace(/\/+$/, '');
  const headers = { 'Content-Type': 'application/json' };
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
    let probeSignal;
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
      const fwd = (s) => s.addEventListener('abort', () => ctl.abort(s.reason), { once: true });
      if (signal.aborted) ctl.abort(signal.reason); else fwd(signal);
      if (timeoutSig.aborted) ctl.abort(timeoutSig.reason); else fwd(timeoutSig);
      probeSignal = ctl.signal;
    } else {
      probeSignal = timeoutSig;
    }
    const probe = await fetch(`${baseUrl}/v1/models`, { headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {}, signal: probeSignal });
    if (!probe.ok) throw new Error(`HTTP ${probe.status}`);
  } catch (e) {
    throw new Error(`Local PII server unreachable at ${baseUrl} — falling back to regex obfuscation. (${e.message})`);
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
    signal
  }, 30000);
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
  const readWithStall = () => new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      try { reader.cancel(); } catch (e) {}
      reject(new Error(`Local PII stream stalled — no data for ${Math.round(STALL_MS / 1000)}s. Stop and use regex instead.`));
    }, STALL_MS);
    reader.read().then(
      (r) => { clearTimeout(t); resolve(r); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });

  const processLine = line => {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.startsWith('data:')) return false;
    const payload = trimmed.slice(5).trimStart();
    if (payload === '[DONE]') return true;
    const json = JSON.parse(payload);
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
      buffer = lines.pop(); // keep incomplete line
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

export async function sanitizeWithOllama(pdfText) {
  const piiUrl = getOllamaPIIUrl();
  const piiModel = getOllamaPIIModel();
  ensurePIIModelEligible(piiModel);
  const apiKey = getOllamaPIIApiKey();
  const promptText = PII_PROMPT_PREFIX + pdfText;
  try {
    const baseUrl = piiUrl.replace(/\/+$/, '');
    const headers = { 'Content-Type': 'application/json' };
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
    const data = await resp.json();
    const result = (data.choices?.[0]?.message?.content || '').trim();
    return finalizePIIResult(result, pdfText);
  } catch (e) {
    if (e.name === 'TimeoutError' || e.message.includes('timed out')) {
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
export function obfuscatePDFText(pdfText) {
  let text = pdfText;
  let replacements = 0;
  const original = pdfText;
  const pdfSex = detectSexFromPDF(pdfText) || state.profileSex;

  // Unit keywords that indicate a result line — never strip digits from these
  const unitKeywords = /\b(mmol|µmol|µkat|umol|ukat|g\/l|mg\/l|ng\/l|µg|ug|mU\/l|pmol|nmol|ml\/s|fL|pg|×10|10\^|u\/l|iu\/l|%|sec|s\/1|mg\/dL|ng\/dL|mIU\/mL|mEq\/L|mcg|cells\/uL|thou\/uL|mill\/uL)\b/i;
  // Collection date line — protect entirely
  const collectionDateLine = /^.*\b(odb[eě]r|collect|datum|sample|vzork|nasb[ií]r|drawn)\b.*$/gim;
  const protectedLines = new Set();
  let m;
  while ((m = collectionDateLine.exec(pdfText)) !== null) {
    protectedLines.add(m.index);
  }

  function isProtectedLine(matchIndex) {
    // Check if this match falls on a collection date line
    const lineStart = text.lastIndexOf('\n', matchIndex) + 1;
    return protectedLines.has(lineStart) || protectedLines.has(matchIndex);
  }

  // Phase 1 — Label-based: lines with PII-identifying labels
  const labelReplacements = [
    { pattern: /^(.*?\b(?:jm[eé]no|name|pacient|patient|p[rř][ií]jmen[ií]|surname)\b[:\s]+)(.+)$/gim, gen: () => fakeName(pdfSex) },
    { pattern: /^(.*?\b(?:adresa|address|bydli[sš]t[eě]|residence)\b[:\s]+)(.+)$/gim, gen: () => `${randomPick(FAKE_STREETS)}, ${randomPick(FAKE_CITIES)}` },
    { pattern: /^(.*?\b(?:datum\s*narozen|date\s*of\s*birth|nar(?:ozen[ií])?\.?|DOB)\b[:\s]+)(.+)$/gim, gen: () => fakeDate() },
    { pattern: /^(.*?\b(?:l[eé]ka[rř]|doctor|phy?sician|o[sš]et[rř]uj[ií]c[ií]|ordering|provider|referring)\b\.?[:\s]+)(.+)$/gim, gen: () => randomPick(FAKE_DOCTORS) },
    { pattern: /^(.*?\b(?:rodn[eé]\s*[cč][ií]slo|birth\s*number|r[\.\s]?[cč][\.\s]?)\b[:\s]+)(.+)$/gim, gen: () => fakeBirthNumber() },
    { pattern: /^(.*?\b(?:[cč][ií]slo\s*(?:poji[sš]t[eě]n|insurance)|insurance\s*(?:no|number|id)|poji[sš][tť]ovna|member\s*id|group\s*(?:no|number|id)|policy)\b[:\s]+)(.+)$/gim, gen: () => randomDigits(10) },
    { pattern: /^(.*?\b(?:id\s*pacienta|patient\s*id|[cč][ií]slo\s*pacienta|account\s*(?:no|number)|acct|MRN|medical\s*record)\b[:\s]+)(.+)$/gim, gen: () => fakePatientId() },
    { pattern: /^(.*?\b(?:specimen\s*(?:id|no|number)|accession\s*(?:no|number)|control\s*(?:id|no|number)|requisition)\b[:\s]+)(.+)$/gim, gen: () => randomDigits(10) },
    { pattern: /^(.*?\b(?:age|v[eě]k)\b[:\s]+)(\d{1,3}\b.*)$/gim, gen: () => `${20 + Math.floor(Math.random() * 50)}` },
  ];

  for (const { pattern, gen } of labelReplacements) {
    text = text.replace(pattern, (match, label, value, offset) => {
      if (isProtectedLine(offset)) return match;
      replacements++;
      return label + gen();
    });
  }

  // Phase 2 — Pattern-based: anywhere in text
  // Czech/Slovak birth number (YYMMDD/XXXX)
  text = text.replace(/\b(\d{2})(0[1-9]|1[0-2]|5[1-9]|6[0-2])(0[1-9]|[12]\d|3[01])\/(\d{3,4})\b/g, (match, _y, _m, _d, _s, offset) => {
    if (isProtectedLine(offset)) return match;
    replacements++;
    return fakeBirthNumber();
  });

  // SSN (XXX-XX-XXXX)
  text = text.replace(/\b\d{3}-\d{2}-\d{4}\b/g, (match, offset) => {
    if (isProtectedLine(offset)) return match;
    replacements++;
    return `${randomDigits(3)}-${randomDigits(2)}-${randomDigits(4)}`;
  });

  // US phone: (XXX) XXX-XXXX (with optional label)
  text = text.replace(/(?:(?:tel|phone|fax|ph)\.?[\s:]+)?\(\d{3}\)[\s.-]\d{3}[\s.-]\d{4}\b/gi, (match, offset) => {
    if (isProtectedLine(offset)) return match;
    const lineStart = text.lastIndexOf('\n', offset) + 1;
    const lineEnd = text.indexOf('\n', offset);
    const line = text.substring(lineStart, lineEnd === -1 ? text.length : lineEnd);
    if (unitKeywords.test(line)) return match;
    replacements++;
    return `(${randomDigits(3)}) ${randomDigits(3)}-${randomDigits(4)}`;
  });

  // Email
  text = text.replace(/\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g, (match, offset) => {
    if (isProtectedLine(offset)) return match;
    replacements++;
    return fakeEmail();
  });

  // Phone numbers (international and local)
  // Require +country code OR leading tel/phone/fax label to avoid matching reference ranges like "150-380"
  text = text.replace(/(?:(?:\+\d{1,3}[\s-]?)\(?\d{2,3}\)?[\s.-]?\d{3}[\s.-]?\d{3,4}\b)|(?:(?:tel|phone|fax|mobil|telefon)\.?[\s:]+\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{3,4}\b)/gi, (match, offset) => {
    if (isProtectedLine(offset)) return match;
    const lineStart = text.lastIndexOf('\n', offset) + 1;
    const lineEnd = text.indexOf('\n', offset);
    const line = text.substring(lineStart, lineEnd === -1 ? text.length : lineEnd);
    // Skip result lines and lines already handled by label-based phase (IDs, birth numbers)
    if (unitKeywords.test(line)) return match;
    if (/\b(id\s*pacienta|patient\s*id|rodn[eé]\s*[cč][ií]slo|birth\s*number|[cč][ií]slo\s*pacienta|i[cč]p)\b/i.test(line)) return match;
    replacements++;
    return fakePhone();
  });

  // Long digit sequences (8+ digits) on non-result lines — likely patient/sample IDs
  text = text.replace(/\b\d{8,}\b/g, (match, offset) => {
    if (isProtectedLine(offset)) return match;
    const lineStart = text.lastIndexOf('\n', offset) + 1;
    const lineEnd = text.indexOf('\n', offset);
    const line = text.substring(lineStart, lineEnd === -1 ? text.length : lineEnd);
    if (unitKeywords.test(line)) return match;
    // Skip page headers
    if (/===\s*Page/i.test(line)) return match;
    replacements++;
    return randomDigits(match.length);
  });

  return { obfuscated: text, original, replacements };
}

// ═══════════════════════════════════════════════
// PII DIFF VIEWER (debug mode)
// ═══════════════════════════════════════════════
function wordDiff(origLine, newLine) {
  // Split into words preserving whitespace as separate tokens
  const tokenize = s => s.match(/\S+|\s+/g) || [];
  const origTokens = tokenize(origLine);
  const newTokens = tokenize(newLine);
  // Simple LCS-based diff for short lines
  const n = origTokens.length, m = newTokens.length;
  if (n === 0 && m === 0) return { left: '&nbsp;', right: '&nbsp;' };
  // For very long lines, fall back to line-level highlight
  if (n > 200 || m > 200) {
    return {
      left: `<span class="pii-word-removed">${escapeHTML(origLine)}</span>`,
      right: `<span class="pii-word-added">${escapeHTML(newLine)}</span>`
    };
  }
  // Build LCS table
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = 1; i <= n; i++)
    for (let j = 1; j <= m; j++)
      dp[i][j] = origTokens[i-1] === newTokens[j-1] ? dp[i-1][j-1] + 1 : Math.max(dp[i-1][j], dp[i][j-1]);
  // Backtrack
  const ops = [];
  let i = n, j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && origTokens[i-1] === newTokens[j-1]) {
      ops.push({ type: 'equal', orig: origTokens[--i], new: newTokens[--j] });
    } else if (j > 0 && (i === 0 || dp[i][j-1] >= dp[i-1][j])) {
      ops.push({ type: 'add', new: newTokens[--j] });
    } else {
      ops.push({ type: 'del', orig: origTokens[--i] });
    }
  }
  ops.reverse();
  let left = '', right = '';
  for (const op of ops) {
    if (op.type === 'equal') { left += escapeHTML(op.orig); right += escapeHTML(op.new); }
    else if (op.type === 'del') { left += `<span class="pii-word-removed">${escapeHTML(op.orig)}</span>`; }
    else { right += `<span class="pii-word-added">${escapeHTML(op.new)}</span>`; }
  }
  return { left: left || '&nbsp;', right: right || '&nbsp;' };
}

export function buildPIIDiffHTML(originalText, obfuscatedText) {
  // Trim leading/trailing blank lines to prevent misalignment (e.g. from thinking models)
  const trimBlanks = s => s.replace(/^\n+/, '').replace(/\n+$/, '');
  const origLines = trimBlanks(originalText).split('\n');
  const obfLines = trimBlanks(obfuscatedText).split('\n');
  const maxLines = Math.max(origLines.length, obfLines.length);
  let leftHtml = '', rightHtml = '';
  for (let i = 0; i < maxLines; i++) {
    const origLine = origLines[i] || '';
    const obfLine = obfLines[i] || '';
    if (origLine === obfLine) {
      leftHtml += `<div>${escapeHTML(origLine) || '&nbsp;'}</div>`;
      rightHtml += `<div>${escapeHTML(obfLine) || '&nbsp;'}</div>`;
    } else {
      const { left, right } = wordDiff(origLine, obfLine);
      leftHtml += `<div class="pii-diff-highlight-removed">${left}</div>`;
      rightHtml += `<div class="pii-diff-highlight-added">${right}</div>`;
    }
  }
  return { leftHtml, rightHtml };
}

function openPIIOverlay(overlay, options = {}) {
  document.body.appendChild(overlay);
  requestAnimationFrame(() => {
    if (!overlay.isConnected) return;
    openModalOverlay(overlay, options);
    try { trapModalFocus(overlay, { closeOnEscape: false }); } catch (_) {}
  });
}

function closePIIOverlay(overlay) {
  removeModalOverlay(overlay);
}

export function showPIIDiffViewer(originalText, obfuscatedText) {
  const overlay = document.createElement('div');
  overlay.className = 'pii-warning-overlay';
  const { leftHtml, rightHtml } = buildPIIDiffHTML(originalText, obfuscatedText);
  overlay.innerHTML = `
    <div class="pii-diff-modal" role="dialog" aria-modal="true" aria-label="Privacy Diff">
      <button type="button" class="modal-close" aria-label="Close privacy diff">&times;</button>
      <h3>&#128269; Privacy Diff — Before / After</h3>
      <div class="pii-diff-viewer">
        <div class="pii-diff-left"><div class="pii-diff-header">Original</div>${leftHtml}</div>
        <div class="pii-diff-right"><div class="pii-diff-header">Obfuscated</div>${rightHtml}</div>
      </div>
      <div class="pii-review-actions pii-review-actions-simple">
        <button type="button" class="import-btn import-btn-secondary" data-pii-diff-close>Close</button>
      </div>
    </div>`;
  const close = () => closePIIOverlay(overlay);
  overlay.querySelector('.modal-close')?.addEventListener('click', close);
  overlay.querySelector('[data-pii-diff-close]')?.addEventListener('click', close);
  openPIIOverlay(overlay);
}

// extractPatientName dropped — too unreliable across PDF layouts

function nudgePIIOverlay(overlay) {
  const modal = overlay?.querySelector?.('.pii-diff-modal');
  if (!modal) return;
  modal.classList.add('modal-nudge');
  modal.addEventListener('animationend', () => modal.classList.remove('modal-nudge'), { once: true });
}

function wirePIIOverlayNudge(overlay) {
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) nudgePIIOverlay(overlay);
  });
}

export function reviewPIIBeforeSend(originalText, { obfuscatedText = '', streamFn = null } = {}) {
  return new Promise(resolve => {
    const isStreaming = typeof streamFn === 'function';
    const overlay = document.createElement('div');
    overlay.className = 'pii-warning-overlay';
    const { leftHtml } = buildPIIDiffHTML(originalText, obfuscatedText || originalText);
    const initialText = obfuscatedText ? escapeHTML(obfuscatedText) : '';
    overlay.innerHTML = `
      <div class="pii-diff-modal pii-review-modal" role="dialog" aria-modal="true" aria-label="PII Review">
        <div class="gb-modal-head pii-review-head">
          <div>
            <div class="gb-modal-kicker">Privacy review</div>
            <div class="gb-modal-title">Review &amp; Edit</div>
          </div>
        </div>
        <p class="pii-review-intro">Personal information has been replaced with fake data before the analysis model sees the report. Review the text that will be sent and edit anything that still looks identifying.</p>
        <div class="pii-search-bar">
          <input type="text" class="pii-search-input" id="pii-search-input" placeholder="Search for your name, address, phone\u2026" autocomplete="off">
          <span class="pii-search-count" id="pii-search-count"></span>
        </div>
        <details class="pii-mobile-original">
          <summary>Original report (comparison only)</summary>
          <div class="pii-mobile-original-body">${leftHtml}</div>
        </details>
        <div class="pii-diff-viewer pii-review-viewer">
          <div class="pii-diff-left"><div class="pii-diff-header">Original report (comparison only)</div>${leftHtml}</div>
          <div class="pii-diff-right">
            <div class="pii-diff-header">Sent to analysis AI <button class="pii-edit-btn" id="pii-edit-btn" type="button">&#9998; Edit</button></div>
            ${isStreaming ? '<details class="pii-thinking-section" id="pii-thinking-section" hidden><summary>Thinking\u2026</summary><pre class="pii-thinking-content" id="pii-thinking-content"></pre></details>' : ''}
            <textarea class="pii-edit-textarea" id="pii-edit-textarea" spellcheck="false"${isStreaming ? ' readonly' : ''}>${initialText}</textarea>
            ${isStreaming ? '<div class="pii-stream-status pii-stream-waiting" id="pii-stream-status">Waiting for model response\u2026</div>' : ''}
          </div>
        </div>
        <div class="pii-review-actions">
          <button type="button" class="import-btn import-btn-secondary" id="pii-review-regex" title="Run regex-based obfuscation instead">Use regex instead</button>
          ${isStreaming ? '<button type="button" class="import-btn import-btn-secondary" id="pii-stream-stop">Stop</button>' : ''}
          ${isStreaming ? '<button type="button" class="import-btn import-btn-secondary" id="pii-stream-retry" hidden>Retry</button>' : ''}
          <span class="pii-action-spacer"></span>
          <button type="button" class="import-btn import-btn-secondary" id="pii-review-cancel">Cancel Import</button>
          <button type="button" class="import-btn import-btn-primary" id="pii-review-send"${isStreaming ? ' disabled' : ''}>Send to AI</button>
        </div>
      </div>`;
    wirePIIOverlayNudge(overlay);
    openPIIOverlay(overlay);

    const searchInput = /** @type {HTMLInputElement} */ (overlay.querySelector('#pii-search-input'));
    const searchCount = /** @type {HTMLElement} */ (overlay.querySelector('#pii-search-count'));
    const textarea = /** @type {HTMLTextAreaElement} */ (overlay.querySelector('#pii-edit-textarea'));
    const sendBtn = /** @type {HTMLButtonElement} */ (overlay.querySelector('#pii-review-send'));
    const statusEl = /** @type {HTMLElement | null} */ (overlay.querySelector('#pii-stream-status'));
    const stopBtn = /** @type {HTMLButtonElement | null} */ (overlay.querySelector('#pii-stream-stop'));
    const leftPanel = /** @type {HTMLElement | null} */ (overlay.querySelector('.pii-review-viewer > .pii-diff-left'));
    const mobileOriginal = /** @type {HTMLElement | null} */ (overlay.querySelector('.pii-mobile-original-body'));
    let dirty = false;

    // Search handler
    searchInput.addEventListener('input', () => {
      const query = searchInput.value.trim();
      if (!query || query.length < 2) {
        searchCount.textContent = '';
        searchCount.className = 'pii-search-count';
        return;
      }
      const regex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      const matches = textarea.value.match(regex);
      const total = matches ? matches.length : 0;
      if (total > 0) {
        searchCount.textContent = `${total} found \u2014 PII may still be present`;
        searchCount.className = 'pii-search-count pii-search-warn';
      } else {
        searchCount.textContent = 'Not found';
        searchCount.className = 'pii-search-count pii-search-clear';
      }
    });

    // Dirty flag — update button text when user edits
    textarea.addEventListener('input', () => {
      if (!dirty) { dirty = true; sendBtn.textContent = 'Save & Send to AI'; }
    });

    // Re-show diff preview on blur so highlights return after editing
    textarea.addEventListener('blur', () => {
      if (textarea.readOnly || !textarea.value) return;
      setTimeout(() => {
        if (document.activeElement !== textarea && overlay.parentElement) {
          showDiffPreview(textarea.value);
        }
      }, 150);
    });

    // Switch from highlighted diff view back to editable textarea
    function switchToEditMode(event) {
      const diffView = /** @type {HTMLElement | null} */ (overlay.querySelector('.pii-diff-preview'));
      if (!diffView) return;
      // Find which line was clicked to position cursor there
      let lineIdx = -1;
      if (event && event.target && diffView.contains(/** @type {Node} */ (event.target))) {
        let el = /** @type {Node | null} */ (event.target);
        while (el && el.parentNode !== diffView) el = /** @type {Node | null} */ (el.parentNode);
        if (el instanceof Element) {
          lineIdx = Array.from(diffView.children).indexOf(el);
        }
      }
      // Preserve scroll position across view switch
      const scrollParent = diffView.parentElement;
      const scrollTop = scrollParent?.scrollTop ?? 0;
      diffView.style.display = 'none';
      textarea.style.display = '';
      if (lineIdx >= 0) {
        const textLines = textarea.value.split('\n');
        let offset = 0;
        for (let i = 0; i < lineIdx && i < textLines.length; i++) offset += textLines[i].length + 1;
        textarea.setSelectionRange(offset, offset);
      }
      textarea.focus({ preventScroll: true });
      if (textarea.parentElement) textarea.parentElement.scrollTop = scrollTop;
    }

    // Show highlighted diff preview, hiding the textarea
    function showDiffPreview(obfuscatedText) {
      const { leftHtml, rightHtml } = buildPIIDiffHTML(originalText, obfuscatedText);
      if (leftPanel) leftPanel.innerHTML = `<div class="pii-diff-header">Original report (comparison only)</div>${leftHtml}`;
      if (mobileOriginal) mobileOriginal.innerHTML = leftHtml;
      textarea.style.display = 'none';
      let diffView = /** @type {HTMLElement | null} */ (overlay.querySelector('.pii-diff-preview'));
      if (!diffView) {
        const textareaParent = textarea.parentElement;
        if (!textareaParent) return;
        diffView = document.createElement('div');
        diffView.className = 'pii-diff-preview';
        textareaParent.insertBefore(diffView, textarea);
      }
      diffView.innerHTML = rightHtml;
      diffView.style.display = '';
    }

    // Edit button
    /** @type {HTMLButtonElement} */ (overlay.querySelector('#pii-edit-btn')).addEventListener('click', (e) => switchToEditMode(e));

    // Regex fallback button
    /** @type {HTMLButtonElement} */ (overlay.querySelector('#pii-review-regex')).addEventListener('click', () => {
      const result = obfuscatePDFText(originalText);
      textarea.value = result.obfuscated;
      textarea.readOnly = false;
      sendBtn.disabled = false;
      if (statusEl) statusEl.textContent = `Regex applied \u2014 ${result.replacements} replacement${result.replacements !== 1 ? 's' : ''}`;
      if (stopBtn) stopBtn.hidden = true;
      if (abortController) { abortController.abort(); abortController = null; }
      unloadOllamaPIIModel();
      showDiffPreview(result.obfuscated);
      sendBtn.textContent = 'Send to AI';
      dirty = false;
    });

    // Send & cancel
    sendBtn.addEventListener('click', () => { closePIIOverlay(overlay); resolve(textarea.value); });
    /** @type {HTMLButtonElement} */ (overlay.querySelector('#pii-review-cancel')).addEventListener('click', () => {
      if (abortController) abortController.abort();
      unloadOllamaPIIModel();
      closePIIOverlay(overlay);
      resolve('cancel');
    });

    // Streaming mode
    let abortController = null;
    if (isStreaming) {
      if (!statusEl || !stopBtn) {
        closePIIOverlay(overlay);
        resolve('cancel');
        return;
      }
      const retryBtn = /** @type {HTMLButtonElement | null} */ (overlay.querySelector('#pii-stream-retry'));
      if (!retryBtn) {
        closePIIOverlay(overlay);
        resolve('cancel');
        return;
      }
      const expectedLen = originalText.length;

      const thinkingSection = /** @type {HTMLDetailsElement | null} */ (overlay.querySelector('#pii-thinking-section'));
      const thinkingContent = /** @type {HTMLElement | null} */ (overlay.querySelector('#pii-thinking-content'));

      const startStream = () => {
        // Reset state
        abortController = new AbortController();
        textarea.value = '';
        textarea.style.display = '';
        textarea.readOnly = true;
        sendBtn.disabled = true;
        stopBtn.hidden = false;
        retryBtn.hidden = true;
        // Clear previous diff preview so streaming is visible
        const prevDiff = /** @type {HTMLElement | null} */ (overlay.querySelector('.pii-diff-preview'));
        if (prevDiff) prevDiff.style.display = 'none';
        statusEl.className = 'pii-stream-status pii-stream-waiting';
        statusEl.textContent = 'Waiting for model response\u2026';
        if (thinkingSection && thinkingContent) { thinkingSection.hidden = true; thinkingContent.textContent = ''; }
        let charCount = 0;
        let rafPending = false;
        let pendingText = '';
        let pendingThinking = '';
        let hasThinking = false;

        const flushToTextarea = () => {
          if (pendingThinking && thinkingSection && thinkingContent) {
            if (!hasThinking) { thinkingSection.hidden = false; thinkingSection.open = true; hasThinking = true; }
            thinkingContent.textContent += pendingThinking;
            pendingThinking = '';
            thinkingContent.scrollTop = thinkingContent.scrollHeight;
            if (!pendingText) statusEl.textContent = 'Thinking\u2026';
          }
          if (pendingText) {
            textarea.value += pendingText;
            charCount += pendingText.length;
            pendingText = '';
            statusEl.classList.remove('pii-stream-waiting');
            const pct = Math.min(99, Math.round(charCount / expectedLen * 100));
            statusEl.textContent = `Streaming\u2026 ${pct}% (${charCount.toLocaleString()} / ~${expectedLen.toLocaleString()} chars)`;
            textarea.scrollTop = textarea.scrollHeight;
          }
          rafPending = false;
        };

        const onThinking = (chunk) => {
          pendingThinking += chunk;
          if (!rafPending) { rafPending = true; requestAnimationFrame(flushToTextarea); }
        };

        streamFn(
          (chunk) => {
            pendingText += chunk;
            if (!rafPending) { rafPending = true; requestAnimationFrame(flushToTextarea); }
          },
          abortController.signal,
          onThinking // passed to sanitizeWithOllamaStreaming
        ).then(() => {
          flushToTextarea();
          textarea.readOnly = false;
          sendBtn.disabled = false;
          if (statusEl) statusEl.textContent = `Complete \u2014 ${charCount.toLocaleString()} chars \u2014 click text to edit`;
          stopBtn.hidden = true;
          retryBtn.hidden = false;
          if (thinkingSection && hasThinking) {
            thinkingSection.open = false;
            const summary = thinkingSection.querySelector('summary');
            if (summary) summary.textContent = 'Thinking (done)';
          }
          showDiffPreview(textarea.value);
        }).catch(err => {
          flushToTextarea();
          if (err.name === 'AbortError') return; // stop button already handled
          textarea.readOnly = false;
          sendBtn.disabled = true;
          if (statusEl) statusEl.textContent = `Error: ${err.message} Use Regex fallback or retry before sending.`;
          stopBtn.hidden = true;
          retryBtn.hidden = false;
        });
      };

      // Stop button
      stopBtn.addEventListener('click', () => {
        abortController.abort();
        abortController = null;
        textarea.readOnly = false;
        sendBtn.disabled = true;
        statusEl.textContent = 'Stopped \u2014 partial output cannot be sent. Use Regex fallback or retry.';
        stopBtn.hidden = true;
        retryBtn.hidden = false;
        unloadOllamaPIIModel();
      });

      // Retry button
      retryBtn.addEventListener('click', startStream);

      startStream();
    }
  });
}
