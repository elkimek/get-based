// pii.js — PII obfuscation (Ollama + regex), diff viewer

import { showNotification, escapeHTML } from './utils.js';
import { getOllamaPIIModel, getOllamaPIIUrl } from './api.js';
import { getCachedKey, updateKeyCache, encryptedSetItem } from './crypto.js';
import { state } from './state.js';

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

// ═══════════════════════════════════════════════
// OLLAMA INTEGRATION
// ═══════════════════════════════════════════════
export function getOllamaConfig() {
  const defaults = { url: 'http://localhost:11434', model: 'llama3.2', mode: 'ollama', apiKey: '' };
  try { return { ...defaults, ...JSON.parse(getCachedKey('labcharts-ollama')) }; }
  catch { return defaults; }
}
export async function saveOllamaConfig(config) {
  const json = JSON.stringify(config);
  await encryptedSetItem('labcharts-ollama', json);
  updateKeyCache('labcharts-ollama', json);
}

export async function checkOllama(url) {
  const baseUrl = url || getOllamaConfig().url;
  try {
    const resp = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(3000) });
    if (!resp.ok) return { available: false, models: [] };
    const data = await resp.json();
    const raw = data.models || [];
    const models = raw.map(m => m.name || m.model).filter(Boolean);
    const modelDetails = raw.map(m => ({
      name: m.name || m.model,
      size: m.size || 0,
      paramSize: m.details?.parameter_size || '',
      quantLevel: m.details?.quantization_level || '',
      family: m.details?.family || '',
    })).filter(m => m.name);
    return { available: true, models, modelDetails };
  } catch {
    return { available: false, models: [] };
  }
}

export async function checkOpenAICompatible(url, apiKey) {
  const baseUrl = (url || getOllamaConfig().url).replace(/\/+$/, '');
  try {
    const headers = {};
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
    const resp = await fetch(`${baseUrl}/v1/models`, { headers, signal: AbortSignal.timeout(3000) });
    if (!resp.ok) return { available: false, models: [] };
    const data = await resp.json();
    const raw = data.data || [];
    const models = raw.map(m => m.id).filter(Boolean);
    // Extract model details when available (LM Studio, Ollama /v1/models, Jan)
    // Parse param size and quant from model name when API doesn't provide them
    // Estimate file size from params + quant when not reported by API
    const QUANT_BPW = { q2: 0.3, q3: 0.4, q4: 0.55, q5: 0.65, q6: 0.8, q8: 1.0, fp16: 2.0, fp32: 4.0, int4: 0.55, int8: 1.0 };
    const modelDetails = raw.map(m => {
      const id = m.id || '';
      const paramMatch = id.match(/[\-:](\d+\.?\d*)[bB]/);
      const quantMatch = id.match(/(Q\d+_K(?:_[A-Z]+)?|Q\d+|fp16|fp32|int[48])/i);
      const params = paramMatch ? parseFloat(paramMatch[1]) : 0;
      const quantKey = quantMatch ? quantMatch[1].toLowerCase().replace(/_.*/, '') : '';
      const bpw = QUANT_BPW[quantKey] || 0.55; // default to Q4 estimate
      const estimatedSize = params > 0 ? Math.round(params * bpw * 1e9) : 0;
      return {
        name: id,
        size: m.size || m.vram_required || estimatedSize,
        paramSize: m.parameter_size || (params > 0 ? params + 'B' : ''),
        quantLevel: m.quantization || (quantMatch ? quantMatch[1] : ''),
        family: m.owned_by || '',
      };
    }).filter(m => m.name);
    return { available: true, models, modelDetails };
  } catch {
    return { available: false, models: [] };
  }
}

export function isOllamaPIIEnabled() {
  return localStorage.getItem('labcharts-ollama-pii-enabled') === 'true';
}

export function setOllamaPIIEnabled(enabled) {
  localStorage.setItem('labcharts-ollama-pii-enabled', enabled ? 'true' : 'false');
}

export async function checkOllamaPII() {
  if (!isOllamaPIIEnabled()) return { available: false, models: [] };
  const config = getOllamaConfig();
  return checkOpenAICompatible(getOllamaPIIUrl(), config.apiKey);
}

export function unloadOllamaPIIModel() {
  // Ollama-specific: send keep_alive:0 to free VRAM. Only fires for Ollama servers (port 11434).
  const piiUrl = getOllamaPIIUrl();
  try { if (new URL(piiUrl).port !== '11434') return; } catch { return; }
  const piiModel = getOllamaPIIModel();
  fetch(`${piiUrl}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: piiModel, prompt: '', stream: false, keep_alive: 0 }),
    signal: AbortSignal.timeout(5000)
  }).catch(() => {});
}

const PII_PROMPT_PREFIX = `TASK: Replace ONLY personal identifiers in this lab report. Output the FULL text with minimal changes.

REPLACE these with fake data:
- Patient names → fictional names
- Birth numbers (e.g. 850115/1234) → random numbers in same format
- Addresses → fictional addresses
- Phone numbers → random phone numbers
- Emails → fictional emails
- Doctor names → fictional doctor names
- Patient IDs → random numbers

DO NOT CHANGE (copy exactly as-is):
- ALL dates (collection dates, sample dates, report dates) — these are critical
- ALL "=== Page N ===" headers
- ALL lab test names, numeric values, units, reference ranges
- ALL line structure and formatting

Output ONLY the modified text. No explanations, no markdown, no commentary.

TEXT TO PROCESS:
`;

function validatePIIResult(result, pdfText) {
  if (!result) return 'Local AI returned empty response';
  if (result.length < pdfText.length * 0.25) return `Local AI output too short (${result.length} vs ${pdfText.length} chars)`;
  const inputDates = pdfText.match(/\b\d{4}[-/.]\d{2}[-/.]\d{2}\b|\b\d{1,2}[./]\d{1,2}[./]\d{4}\b/g) || [];
  const outputDates = result.match(/\b\d{4}[-/.]\d{2}[-/.]\d{2}\b|\b\d{1,2}[./]\d{1,2}[./]\d{4}\b/g) || [];
  if (inputDates.length > 0 && outputDates.length === 0) return 'Local AI lost all dates from the text';
  return null;
}

export async function sanitizeWithOllamaStreaming(pdfText, onChunk, signal, onThinking) {
  const piiUrl = getOllamaPIIUrl();
  const piiModel = getOllamaPIIModel();
  const config = getOllamaConfig();
  const promptText = PII_PROMPT_PREFIX + pdfText;
  const baseUrl = piiUrl.replace(/\/+$/, '');
  const headers = { 'Content-Type': 'application/json' };
  if (config.apiKey) headers['Authorization'] = `Bearer ${config.apiKey}`;

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
    await fetch(`${baseUrl}/api/version`, { signal: probeSignal });
  } catch (e) {
    throw new Error(`Local PII server unreachable at ${baseUrl} — falling back to regex obfuscation. (${e.message})`);
  }

  const resp = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ model: piiModel, messages: [{ role: 'user', content: promptText }], stream: true }),
    signal
  });
  if (!resp.ok) throw new Error(`Local server error: ${resp.status}`);

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let accumulated = '';
  let buffer = '';
  let inThinkTag = false; // track <think>...</think> blocks in content
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

  try {
    while (true) {
      const { done, value } = await readWithStall();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // keep incomplete line
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const payload = trimmed.slice(6);
        if (payload === '[DONE]') break;
        try {
          const json = JSON.parse(payload);
          const delta = json.choices?.[0]?.delta;
          if (!delta) continue;

          // Handle reasoning_content field (OpenAI-style thinking)
          if (delta.reasoning_content && onThinking) {
            onThinking(delta.reasoning_content);
            continue;
          }

          const content = delta.content;
          if (!content) continue;

          // Handle <think>...</think> tags inline in content (Qwen/DeepSeek style)
          if (onThinking) {
            let remaining = content;
            while (remaining) {
              if (inThinkTag) {
                const closeIdx = remaining.indexOf('</think>');
                if (closeIdx === -1) { onThinking(remaining); remaining = ''; }
                else { onThinking(remaining.slice(0, closeIdx)); inThinkTag = false; remaining = remaining.slice(closeIdx + 8); }
              } else {
                const openIdx = remaining.indexOf('<think>');
                if (openIdx === -1) { accumulated += remaining; onChunk(remaining); remaining = ''; }
                else {
                  if (openIdx > 0) { accumulated += remaining.slice(0, openIdx); onChunk(remaining.slice(0, openIdx)); }
                  inThinkTag = true;
                  remaining = remaining.slice(openIdx + 7);
                }
              }
            }
          } else {
            accumulated += content;
            onChunk(content);
          }
        } catch { /* skip malformed chunks */ }
      }
    }
  } finally {
    reader.releaseLock();
  }

  const result = accumulated.trim();
  const validationError = validatePIIResult(result, pdfText);
  if (validationError) throw new Error(validationError);

  unloadOllamaPIIModel();
  return result;
}

export async function sanitizeWithOllama(pdfText) {
  const piiUrl = getOllamaPIIUrl();
  const piiModel = getOllamaPIIModel();
  const config = getOllamaConfig();
  const promptText = PII_PROMPT_PREFIX + pdfText;
  try {
    const baseUrl = piiUrl.replace(/\/+$/, '');
    const headers = { 'Content-Type': 'application/json' };
    if (config.apiKey) headers['Authorization'] = `Bearer ${config.apiKey}`;
    const resp = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model: piiModel, messages: [{ role: 'user', content: promptText }], stream: false }),
      signal: AbortSignal.timeout(90000)
    });
    if (!resp.ok) throw new Error(`Local server error: ${resp.status}`);
    const data = await resp.json();
    const result = (data.choices?.[0]?.message?.content || '').trim();

    const validationError = validatePIIResult(result, pdfText);
    if (validationError) throw new Error(validationError);

    unloadOllamaPIIModel();
    return result;
  } catch (e) {
    unloadOllamaPIIModel();
    if (e.name === 'TimeoutError' || e.message.includes('timed out')) {
      showNotification(`PII model "${piiModel}" timed out. Falling back to regex. Try a smaller model in Settings → Privacy.`, 'info', 6000);
    }
    throw e;
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

export function showPIIDiffViewer(originalText, obfuscatedText) {
  const overlay = document.createElement('div');
  overlay.className = 'pii-warning-overlay';
  const { leftHtml, rightHtml } = buildPIIDiffHTML(originalText, obfuscatedText);
  overlay.innerHTML = `
    <div class="pii-diff-modal" role="dialog" aria-modal="true" aria-label="Privacy Diff">
      <button class="modal-close" onclick="document.body.style.overflow='';this.closest('.pii-warning-overlay').remove()">&times;</button>
      <h3>&#128269; Privacy Diff — Before / After</h3>
      <div class="pii-diff-viewer">
        <div class="pii-diff-left"><div class="pii-diff-header">Original</div>${leftHtml}</div>
        <div class="pii-diff-right"><div class="pii-diff-header">Obfuscated</div>${rightHtml}</div>
      </div>
      <div style="display:flex;justify-content:flex-end;margin-top:12px">
        <button class="import-btn import-btn-secondary" onclick="document.body.style.overflow='';this.closest('.pii-warning-overlay').remove()">Close</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';
  requestAnimationFrame(() => overlay.classList.add('show'));
}

// extractPatientName dropped — too unreliable across PDF layouts

export function reviewPIIBeforeSend(originalText, { obfuscatedText, streamFn }) {
  return new Promise(resolve => {
    const isStreaming = typeof streamFn === 'function';
    const overlay = document.createElement('div');
    overlay.className = 'pii-warning-overlay';
    const { leftHtml } = buildPIIDiffHTML(originalText, obfuscatedText || originalText);
    const initialText = obfuscatedText ? escapeHTML(obfuscatedText) : '';
    overlay.innerHTML = `
      <div class="pii-diff-modal" role="dialog" aria-modal="true" aria-label="PII Review">
        <h3>&#128274; Review &amp; Edit — This is what AI will receive</h3>
        <p style="font-size:13px;color:var(--text-muted);margin:0 0 12px">Personal information on the left has been replaced with fake data on the right. You can edit the right side to fix any remaining PII before sending.</p>
        <div class="pii-search-bar">
          <input type="text" class="pii-search-input" id="pii-search-input" placeholder="Search for your name, address, phone\u2026" autocomplete="off">
          <span class="pii-search-count" id="pii-search-count"></span>
        </div>
        <div class="pii-diff-viewer">
          <div class="pii-diff-left"><div class="pii-diff-header">Original (stays local)</div>${leftHtml}</div>
          <div class="pii-diff-right">
            <div class="pii-diff-header">Sent to AI <button class="pii-edit-btn" id="pii-edit-btn" type="button">&#9998; Edit</button></div>
            ${isStreaming ? '<details class="pii-thinking-section" id="pii-thinking-section" style="display:none"><summary>Thinking\u2026</summary><pre class="pii-thinking-content" id="pii-thinking-content"></pre></details>' : ''}
            <textarea class="pii-edit-textarea" id="pii-edit-textarea" spellcheck="false"${isStreaming ? ' readonly' : ''}>${initialText}</textarea>
            ${isStreaming ? '<div class="pii-stream-status pii-stream-waiting" id="pii-stream-status">Waiting for model response\u2026</div>' : ''}
          </div>
        </div>
        <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:12px;flex-wrap:wrap">
          <button class="import-btn import-btn-secondary" id="pii-review-regex" title="Run regex-based obfuscation instead">Use regex instead</button>
          ${isStreaming ? '<button class="import-btn import-btn-secondary" id="pii-stream-stop">Stop</button>' : ''}
          ${isStreaming ? '<button class="import-btn import-btn-secondary" id="pii-stream-retry" style="display:none">Retry</button>' : ''}
          <span style="flex:1"></span>
          <button class="import-btn import-btn-secondary" id="pii-review-cancel">Cancel Import</button>
          <button class="import-btn" id="pii-review-send"${isStreaming ? ' disabled' : ''}>Send to AI</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => overlay.classList.add('show'));

    const searchInput = overlay.querySelector('#pii-search-input');
    const searchCount = overlay.querySelector('#pii-search-count');
    const textarea = overlay.querySelector('#pii-edit-textarea');
    const sendBtn = overlay.querySelector('#pii-review-send');
    const statusEl = overlay.querySelector('#pii-stream-status');
    const stopBtn = overlay.querySelector('#pii-stream-stop');
    const leftPanel = overlay.querySelector('.pii-diff-left');
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
        if (document.activeElement !== textarea && overlay.parentNode) {
          showDiffPreview(textarea.value);
        }
      }, 150);
    });

    // Switch from highlighted diff view back to editable textarea
    function switchToEditMode(event) {
      const diffView = overlay.querySelector('.pii-diff-preview');
      if (!diffView) return;
      // Find which line was clicked to position cursor there
      let lineIdx = -1;
      if (event && event.target && diffView.contains(event.target)) {
        let el = event.target;
        while (el && el.parentNode !== diffView) el = el.parentNode;
        if (el) {
          lineIdx = Array.from(diffView.children).indexOf(el);
        }
      }
      // Preserve scroll position across view switch
      const scrollTop = diffView.parentNode?.scrollTop ?? 0;
      diffView.style.display = 'none';
      textarea.style.display = '';
      if (lineIdx >= 0) {
        const textLines = textarea.value.split('\n');
        let offset = 0;
        for (let i = 0; i < lineIdx && i < textLines.length; i++) offset += textLines[i].length + 1;
        textarea.setSelectionRange(offset, offset);
      }
      textarea.focus({ preventScroll: true });
      textarea.parentNode.scrollTop = scrollTop;
    }

    // Show highlighted diff preview, hiding the textarea
    function showDiffPreview(obfuscatedText) {
      const { leftHtml, rightHtml } = buildPIIDiffHTML(originalText, obfuscatedText);
      if (leftPanel) leftPanel.innerHTML = `<div class="pii-diff-header">Original (stays local)</div>${leftHtml}`;
      textarea.style.display = 'none';
      let diffView = overlay.querySelector('.pii-diff-preview');
      if (!diffView) { diffView = document.createElement('div'); diffView.className = 'pii-diff-preview'; textarea.parentNode.insertBefore(diffView, textarea); }
      diffView.innerHTML = rightHtml;
      diffView.style.display = '';
    }

    // Edit button
    overlay.querySelector('#pii-edit-btn').addEventListener('click', (e) => switchToEditMode(e));

    // Regex fallback button
    overlay.querySelector('#pii-review-regex').addEventListener('click', () => {
      const result = obfuscatePDFText(originalText);
      textarea.value = result.obfuscated;
      textarea.readOnly = false;
      sendBtn.disabled = false;
      if (statusEl) statusEl.textContent = `Regex applied \u2014 ${result.replacements} replacement${result.replacements !== 1 ? 's' : ''}`;
      if (stopBtn) stopBtn.style.display = 'none';
      if (abortController) { abortController.abort(); abortController = null; }
      unloadOllamaPIIModel();
      showDiffPreview(result.obfuscated);
      sendBtn.textContent = 'Send to AI';
      dirty = false;
    });

    // Send & cancel
    sendBtn.addEventListener('click', () => { document.body.style.overflow = ''; overlay.remove(); resolve(textarea.value); });
    overlay.querySelector('#pii-review-cancel').addEventListener('click', () => {
      if (abortController) abortController.abort();
      unloadOllamaPIIModel();
      document.body.style.overflow = '';
      overlay.remove();
      resolve('cancel');
    });

    // Streaming mode
    let abortController = null;
    if (isStreaming) {
      const retryBtn = overlay.querySelector('#pii-stream-retry');
      const expectedLen = originalText.length;

      const thinkingSection = overlay.querySelector('#pii-thinking-section');
      const thinkingContent = overlay.querySelector('#pii-thinking-content');

      const startStream = () => {
        // Reset state
        abortController = new AbortController();
        textarea.value = '';
        textarea.style.display = '';
        textarea.readOnly = true;
        sendBtn.disabled = true;
        stopBtn.style.display = '';
        retryBtn.style.display = 'none';
        // Clear previous diff preview so streaming is visible
        const prevDiff = overlay.querySelector('.pii-diff-preview');
        if (prevDiff) prevDiff.style.display = 'none';
        statusEl.className = 'pii-stream-status pii-stream-waiting';
        statusEl.textContent = 'Waiting for model response\u2026';
        if (thinkingSection) { thinkingSection.style.display = 'none'; thinkingContent.textContent = ''; }
        let charCount = 0;
        let rafPending = false;
        let pendingText = '';
        let pendingThinking = '';
        let hasThinking = false;

        const flushToTextarea = () => {
          if (pendingThinking && thinkingSection) {
            if (!hasThinking) { thinkingSection.style.display = ''; thinkingSection.open = true; hasThinking = true; }
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
          stopBtn.style.display = 'none';
          retryBtn.style.display = '';
          if (thinkingSection && hasThinking) { thinkingSection.open = false; thinkingSection.querySelector('summary').textContent = 'Thinking (done)'; }
          showDiffPreview(textarea.value);
        }).catch(err => {
          flushToTextarea();
          if (err.name === 'AbortError') return; // stop button already handled
          textarea.readOnly = false;
          sendBtn.disabled = false;
          if (statusEl) statusEl.textContent = `Error: ${err.message}`;
          stopBtn.style.display = 'none';
          retryBtn.style.display = '';
        });
      };

      // Stop button
      stopBtn.addEventListener('click', () => {
        abortController.abort();
        abortController = null;
        textarea.readOnly = false;
        sendBtn.disabled = false;
        statusEl.textContent = 'Stopped \u2014 review partial result and edit below';
        stopBtn.style.display = 'none';
        retryBtn.style.display = '';
        unloadOllamaPIIModel();
      });

      // Retry button
      retryBtn.addEventListener('click', startStream);

      startStream();
    }
  });
}

Object.assign(window, { obfuscatePDFText, sanitizeWithOllama, sanitizeWithOllamaStreaming, checkOllamaPII, reviewPIIBeforeSend, getOllamaConfig, checkOllama, checkOpenAICompatible, showPIIDiffViewer, isOllamaPIIEnabled, setOllamaPIIEnabled });
