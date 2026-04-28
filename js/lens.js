// lens.js — Custom Knowledge Source
// User-configured RAG endpoint that backs the Interpretive Lens with retrieved chunks.

import { state } from './state.js';
import { getCachedKey, updateKeyCache, encryptedSetItem } from './crypto.js';
import { hashString, showNotification, showConfirmDialog, showPromptDialog, isDebugMode, escapeHTML, escapeAttr } from './utils.js';
import { hasAIProvider, callClaudeAPI } from './api.js';

const CONFIG_KEY = 'labcharts-lens-config';
const SECRET_KEY = 'labcharts-lens-key';

// testProbe — per-user "canary" query used by Save + connect to verify the
// endpoint. Default is health-themed because getbased's audience typically
// indexes health research, but any user with a different domain corpus (legal
// docs, code docs, recipes…) can change it so the test result reflects their
// actual content instead of always looking like "0 passages returned".
const DEFAULT_TEST_PROBE = 'vitamin D deficiency supplementation';
// Two backends under one UI:
//   'in-browser'      — MiniLM in a Web Worker, vectors in OPFS. Works in
//                       every browser. No install; first use downloads the
//                       ~100 MB model.
//   'external-server' — user-configured URL + Bearer key. For a server the
//                       user runs themselves (contract documented in
//                       docs/guide/interpretive-lens.md) or someone they trust.
//
// Legacy names ('remote' → 'external-server', 'local-browser' → 'in-browser',
// 'desktop-engine' → 'external-server' when url is the old 127.0.0.1:8322, else
// 'in-browser') migrate on read in getLensConfig.
const DEFAULT_CONFIG = {
  name: '',
  url: '',
  enabled: false,
  topK: 5,
  testProbe: DEFAULT_TEST_PROBE,
  backend: 'in-browser',
  // Multi-query rewrite: ask the chat LLM to paraphrase the question into
  // 2-3 vocabulary-diverse variants (Latin/common-name pairs, conceptually
  // related terms), embed each, then fuse results with reciprocal-rank
  // scoring. Closes the "Black Seed Oil → Nigella Sativa" recall gap that
  // raw embedding similarity misses. Off → single-query (original behavior).
  multiQuery: true,
};
const TIMEOUT_MS = 30000;
const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX = 20;
const MAX_CHUNKS = 10;
const MAX_RESPONSE_BYTES = 32 * 1024;

// ─── Config storage ───────────────────────────────────────────
export function getLensConfig() {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (!raw) return { ...DEFAULT_CONFIG };
    const saved = JSON.parse(raw);
    // Pre-v1.21.0 configs had no `backend` field — only the single external
    // RAG endpoint existed. Infer what they meant from whether a URL was
    // saved: a populated URL means they configured a Custom Knowledge
    // Source → promote to 'external-server' so their working setup keeps
    // working. Empty URL means no RAG was configured → take the modern
    // default ('in-browser'). Without this, v1.20.x users silently lose
    // their lens on upgrade because DEFAULT_CONFIG.backend would spread
    // into the gap as 'in-browser'.
    if (!saved.backend) {
      saved.backend = saved.url ? 'external-server' : 'in-browser';
    }
    return migrateLensConfig({ ...DEFAULT_CONFIG, ...saved });
  } catch { return { ...DEFAULT_CONFIG }; }
}

/// Rename/rebucket legacy backend values. 'desktop-engine' (Electron-only,
/// removed) migrates to 'external-server' iff the user already had the
/// Python lens URL saved — they can keep pointing at it if they kept a
/// compatible lens server running outside Electron. Otherwise fall back
/// to the in-browser engine so chat still works.
function migrateLensConfig(cfg) {
  if (cfg.backend === 'remote') {
    cfg.backend = 'external-server';
  } else if (cfg.backend === 'local-browser') {
    cfg.backend = 'in-browser';
  } else if (cfg.backend === 'desktop-engine') {
    cfg.backend = cfg.url ? 'external-server' : 'in-browser';
  }
  return cfg;
}

export function saveLensConfig(partial) {
  const prev = getLensConfig();
  const next = { ...prev, ...partial };
  localStorage.setItem(CONFIG_KEY, JSON.stringify(next));
  const urlChanged = partial.url !== undefined && partial.url !== prev.url;
  const topKChanged = partial.topK !== undefined && partial.topK !== prev.topK;
  if (urlChanged || topKChanged) clearLensCache();
  // Ping listeners so the indicator re-evaluates visibility (without clobbering state)
  updateLensStatus({});
  return next;
}

export function getLensKey() { return getCachedKey(SECRET_KEY) || ''; }

export async function saveLensKey(key) {
  await encryptedSetItem(SECRET_KEY, key);
  updateKeyCache(SECRET_KEY, key);
  clearLensCache();
}

export async function removeLens() {
  localStorage.removeItem(CONFIG_KEY);
  await encryptedSetItem(SECRET_KEY, '');
  updateKeyCache(SECRET_KEY, '');
  clearLensCache();
  updateLensStatus({ state: 'idle', lastChunkCount: 0, lastError: null, sourceName: '' });
}

export function hasLens() {
  const cfg = getLensConfig();
  if (!cfg.enabled) return false;
  if (cfg.backend === 'in-browser') {
    // In-browser needs OPFS + Workers AND at least one indexed chunk.
    // Without the count check, hasLens() would be true on a fresh
    // install and every chat query would spin the worker pointlessly —
    // the UI indicator would read "active" but `injectLensChunks`
    // silently no-ops on empty results. peekLocalCorpusSize reads a
    // localStorage shadow written by lens-local.js after each state
    // change.
    if (typeof navigator === 'undefined' || !navigator.storage || typeof Worker === 'undefined') return false;
    try {
      const n = Number(localStorage.getItem('labcharts-lens-local-count')) || 0;
      return n > 0;
    } catch { return false; }
  }
  // external-server: URL + bearer key
  return !!(cfg.url && getLensKey());
}

// ─── URL validation ───────────────────────────────────────────
// http:// is accepted for hosts that can't leak the Bearer token across the
// public internet: loopback, RFC1918 LAN, link-local, Tailscale CGNAT, mDNS.
// Everything else must be https://.
function _isPrivateHost(host) {
  if (!host) return false;
  if (host === 'localhost') return true;
  if (host === '::1' || host === '[::1]') return true;
  if (host.endsWith('.local') || host.endsWith('.local.')) return true;
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return false;
  const a = +m[1], b = +m[2], c = +m[3], d = +m[4];
  if (a > 255 || b > 255 || c > 255 || d > 255) return false;
  if (a === 10) return true;                           // 10.0.0.0/8
  if (a === 127) return true;                          // loopback
  if (a === 169 && b === 254) return true;             // link-local 169.254.0.0/16
  if (a === 172 && b >= 16 && b <= 31) return true;    // 172.16.0.0/12
  if (a === 192 && b === 168) return true;             // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true;   // Tailscale CGNAT 100.64.0.0/10
  return false;
}

export function isValidLensUrl(url) {
  if (typeof url !== 'string' || !url) return false;
  let u;
  try { u = new URL(url); } catch { return false; }
  if (u.protocol === 'https:') return true;
  if (u.protocol === 'http:') return _isPrivateHost(u.hostname);
  return false;
}

// ─── Query cache ──────────────────────────────────────────────
const _cache = new Map(); // key → { value, at }
function cacheKey(url, topK, profileId, hint) { return `${hashString(url)}|${topK}|${profileId}|${hint}`; }
function cacheGet(k) {
  const row = _cache.get(k);
  if (!row) return null;
  if (Date.now() - row.at > CACHE_TTL_MS) { _cache.delete(k); return null; }
  return row.value;
}
function cacheSet(k, v) {
  if (_cache.size >= CACHE_MAX) {
    const oldest = _cache.keys().next().value;
    _cache.delete(oldest);
  }
  _cache.set(k, { value: v, at: Date.now() });
}
export function clearLensCache() { _cache.clear(); }

// ─── Status tracking ─────────────────────────────────────────
let _status = { state: 'idle', lastChunkCount: 0, lastError: null, sourceName: '' };
const _statusListeners = new Set();

function updateLensStatus(partial) {
  _status = { ..._status, ...partial };
  for (const fn of _statusListeners) {
    try { fn(_status); } catch (e) { if (isDebugMode()) console.warn('[Lens] listener failed:', e); }
  }
}

export function getLensStatus() { return { ..._status }; }

export function subscribeLensStatus(fn) {
  _statusListeners.add(fn);
  return () => _statusListeners.delete(fn);
}

// ─── Query ────────────────────────────────────────────────────
export async function queryLens(queryHint, opts = {}) {
  if (!hasLens()) return null;
  const cfg = getLensConfig();
  const topK = typeof opts.topK === 'number' ? opts.topK : cfg.topK;
  const hint = String(queryHint || '').trim();
  if (!hint) return null;
  if (cfg.backend === 'in-browser') {
    const sourceName = cfg.name || 'Knowledge Base';
    return queryWithCache('in-browser', sourceName, hint, topK, async () => {
      const mod = await import('./lens-local.js');
      const result = await mod.queryLensLocal(hint, { topK });
      if (!result) return [];
      return result.chunks.map((c) => ({ text: c.text, source: c.source }));
    });
  }
  // external-server
  const url = cfg.url;
  const key = getLensKey();
  if (!url || !key) return null;
  const sourceName = cfg.name || 'Lens';
  return queryWithCache(url, sourceName, hint, topK,
    () => _fetchRemoteChunks(url, key, hint, topK, opts));
}

// ─── Multi-query rewrite ──────────────────────────────────────
//
// Wraps queryLens() with LLM-driven paraphrase expansion to close the
// vocabulary gap between user phrasing and note phrasing. Falls back to
// single-query when no AI provider is configured, when the rewrite fails,
// or when multiQuery is toggled off in settings.
//
// Pipeline:
//   1. Ask the active chat LLM to rewrite the question as N variants.
//   2. Run queryLens() once per variant + once for the original. Each
//      ranked result list contributes via reciprocal-rank fusion (RRF).
//   3. Dedupe by (source + text) and sort by fused score; cap at topK.
//
// Latency: +500ms-2s for the rewrite on cold queries. Hot queries (same
// question asked again in the same session) are fully cached.

const MULTI_QUERY_VARIANTS = 3;
const MULTI_QUERY_MAX_TOKENS = 200;
const RRF_K = 60; // standard reciprocal-rank-fusion constant
const _rewriteCache = new Map(); // hash(query) → string[] of variants
const REWRITE_CACHE_MAX = 100;

const REWRITE_SYSTEM_PROMPT =
  'Rewrite the user\'s question as 3 distinct search queries that target the same intent ' +
  'using vocabulary the user\'s notes might actually contain. ' +
  'Cover at least: (a) scientific/Latin names where applicable (e.g. "Nigella Sativa" for ' +
  '"Black Seed Oil"), (b) common synonyms and alternate phrasings, (c) conceptually related ' +
  'terms a researcher would use. Output exactly 3 lines, each a complete search query, ' +
  'no numbering, no quotes, no explanation. Keep each query under 12 words.';

export async function queryLensMulti(queryHint, opts = {}) {
  if (!hasLens()) return null;
  const cfg = getLensConfig();
  const hint = String(queryHint || '').trim();
  if (!hint) return null;

  const enabled = opts.multiQuery !== undefined ? !!opts.multiQuery : cfg.multiQuery !== false;
  // Single-query path: no AI provider, or feature disabled, or short query
  // (1-2 word queries are usually proper nouns / lab names where rewriting
  // adds noise without helping).
  if (!enabled || !hasAIProvider() || hint.split(/\s+/).length < 3) {
    return queryLens(hint, opts);
  }

  let variants = [];
  try {
    variants = await _rewriteQuery(hint, opts.signal);
  } catch (e) {
    if (isDebugMode?.()) console.warn('[lens] multi-query rewrite failed:', e?.message || e);
  }

  // Always include the original — protects against rewrites drifting too
  // far from intent. Dedupe (case-insensitive) so an LLM that just echoes
  // the question doesn't waste a search.
  const queries = _dedupeQueries([hint, ...variants]);
  if (queries.length === 1) return queryLens(hint, opts);

  const topK = typeof opts.topK === 'number' ? opts.topK : cfg.topK;
  // Each sub-query asks for the per-query topK; RRF reranks across the
  // union. We don't oversample here — the underlying queryLens() already
  // does a per-backend oversample (the in-browser worker does 3× for MMR;
  // external servers handle it server-side).
  const subResults = await Promise.all(queries.map(q =>
    queryLens(q, { ...opts, topK }).catch(() => null)
  ));

  // Find a non-null envelope to inherit cache/source metadata from. If
  // every sub-query failed (network down, server 500), fall back to the
  // existing single-query behavior so the caller still sees something.
  const first = subResults.find(r => r != null);
  if (!first) return queryLens(hint, opts);

  const fusedChunks = _fuseChunksRRF(subResults.map(r => r?.chunks || []), topK);
  return { ...first, chunks: fusedChunks };
}

// Calls the active chat LLM with a tight system prompt asking for N
// paraphrases. Returns an array of strings (may be empty on parse
// failure). Cached for the session by query hash so repeating the same
// question doesn't re-bill the provider.
async function _rewriteQuery(hint, signal) {
  const key = hashString(hint);
  if (_rewriteCache.has(key)) return _rewriteCache.get(key);

  const { text } = await callClaudeAPI({
    system: REWRITE_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: hint }],
    maxTokens: MULTI_QUERY_MAX_TOKENS,
    signal,
  });
  const variants = String(text || '')
    .split(/\r?\n/)
    .map(s => s.replace(/^[\s\-*\d.)]+/, '').trim()) // strip "1." / "- " etc. if model adds them
    .filter(s => s && s.length >= 3 && s.length <= 200)
    .slice(0, MULTI_QUERY_VARIANTS);

  // LRU eviction — small cache, simple delete-oldest.
  if (_rewriteCache.size >= REWRITE_CACHE_MAX) {
    const oldestKey = _rewriteCache.keys().next().value;
    if (oldestKey !== undefined) _rewriteCache.delete(oldestKey);
  }
  _rewriteCache.set(key, variants);
  return variants;
}

function _dedupeQueries(queries) {
  const seen = new Set();
  const out = [];
  for (const q of queries) {
    const norm = String(q || '').trim().toLowerCase();
    if (!norm || seen.has(norm)) continue;
    seen.add(norm);
    out.push(String(q).trim());
  }
  return out;
}

// Reciprocal-rank fusion: each ranked list contributes 1/(k + rank) per
// chunk. Stable, parameter-light, no calibration needed. Identical chunks
// across lists accumulate score, which is exactly what we want — a chunk
// that surfaces under multiple paraphrases is more likely to be relevant.
function _fuseChunksRRF(chunkLists, topK) {
  const scores = new Map(); // dedup-key → { score, chunk }
  for (const list of chunkLists) {
    if (!Array.isArray(list)) continue;
    list.forEach((chunk, idx) => {
      if (!chunk || typeof chunk.text !== 'string') return;
      const dedupKey = `${chunk.source || ''}|${chunk.text}`;
      const contribution = 1 / (RRF_K + idx + 1);
      const prev = scores.get(dedupKey);
      if (prev) prev.score += contribution;
      else scores.set(dedupKey, { score: contribution, chunk });
    });
  }
  return Array.from(scores.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, topK))
    .map(({ chunk }) => chunk);
}

// Test surface — never used by production code.
export function _resetRewriteCache() { _rewriteCache.clear(); }
export function _fuseChunksRRFForTest(chunkLists, topK) { return _fuseChunksRRF(chunkLists, topK); }
export function _dedupeQueriesForTest(queries) { return _dedupeQueries(queries); }

/// Shared cache + status envelope for every backend. `fetchFn(abortCtl)`
/// returns a Promise<chunks[]>; caller shapes its own errors via throw.
/// Keeping cache + status plumbing here means adding a third backend is
/// just a third fetchFn — no re-plumbing of observability per call.
async function queryWithCache(backendKey, sourceName, hint, topK, fetchFn) {
  const profileId = state.currentProfile || 'default';
  const ck = cacheKey(backendKey, topK, profileId, hint);
  const cached = cacheGet(ck);
  if (cached) {
    if (isDebugMode()) console.log('[Lens] cache hit', backendKey);
    updateLensStatus({ state: 'active', lastChunkCount: cached.chunks.length, lastError: null, sourceName });
    return cached;
  }
  try {
    const rawChunks = await fetchFn();
    const chunks = Array.isArray(rawChunks) ? rawChunks : [];
    const result = { chunks, sourceName };
    cacheSet(ck, result);
    updateLensStatus({ state: 'active', lastChunkCount: chunks.length, lastError: null, sourceName });
    return result;
  } catch (e) {
    const msg = (e && e.name === 'AbortError') ? 'timeout' : (e?.message) || 'unknown error';
    if (isDebugMode()) console.warn('[Lens] query failed:', backendKey, msg);
    updateLensStatus({ state: 'error', lastError: msg });
    return null;
  }
}

/// Remote-server backend — HTTP POST with bearer auth, strict transport
/// settings (no credentials, no referrer, no redirects). Returns a flat
/// array of chunks in the shared envelope shape.
async function _fetchRemoteChunks(url, key, hint, topK, opts) {
  const outerSignal = opts?.signal;
  const timeoutCtl = new AbortController();
  const timer = setTimeout(() => timeoutCtl.abort(), TIMEOUT_MS);
  const signal = anySignal(outerSignal, timeoutCtl.signal);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`,
      },
      body: JSON.stringify({ version: 1, query: hint, top_k: topK }),
      signal,
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      redirect: 'error',
    });
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try { const err = await res.json(); if (err && err.error) msg = String(err.error); } catch {}
      throw new Error(msg);
    }
    const text = await res.text();
    if (text.length > MAX_RESPONSE_BYTES) throw new Error(`Response exceeds ${MAX_RESPONSE_BYTES} bytes`);
    const data = JSON.parse(text);
    return Array.isArray(data && data.chunks) ? data.chunks.slice(0, MAX_CHUNKS)
      .map((c) => ({ text: String(c && c.text || '').slice(0, 4000), source: c && c.source ? String(c.source).slice(0, 200) : '' }))
      .filter((c) => c.text) : [];
  } finally {
    clearTimeout(timer);
  }
}

function anySignal(...signals) {
  const ctl = new AbortController();
  for (const s of signals) {
    if (!s) continue;
    if (s.aborted) { ctl.abort(); break; }
    s.addEventListener('abort', () => ctl.abort(), { once: true });
  }
  return ctl.signal;
}

// ─── Formatting ───────────────────────────────────────────────
export function buildLensSnippet(result) {
  if (!result || !Array.isArray(result.chunks) || !result.chunks.length) return '';
  const lines = [`### Retrieved from your knowledge source (${result.sourceName}):`];
  result.chunks.forEach((c, i) => {
    const cite = c.source ? ` — ${c.source}` : '';
    lines.push(`${i + 1}. ${c.text}${cite}`);
  });
  lines.push('When your interpretation draws on these excerpts, cite the source. When it does not, say so.');
  return lines.join('\n');
}

// ─── Test connection ──────────────────────────────────────────
// Tests the configured URL + key regardless of the enabled toggle
// (users explicitly asking to test shouldn't be blocked by the toggle state).
//
// Returns { ok, chunkCount, firstSource, error } where `ok` reflects
// CONNECTIVITY ONLY — a 200 response with valid schema counts as pass
// even if chunkCount is 0. Passage count is informational: a server that
// answers correctly but returns no chunks is "working" from a transport
// perspective; the user still needs to evaluate whether their probe is
// relevant to their corpus. This separation keeps Custom Knowledge Source
// generic across domains — users with legal / code / recipe RAGs don't see
// "connection failed" just because the default health probe doesn't match.
export async function testLensConnection() {
  const cfg = getLensConfig();
  const key = getLensKey();
  if (!cfg.url || !key) return { ok: false, error: 'URL and API key required' };
  clearLensCache();
  updateLensStatus({ state: 'idle', lastError: null });
  const probe = (cfg.testProbe && cfg.testProbe.trim()) || DEFAULT_TEST_PROBE;
  const result = await queryWithCache(cfg.url, cfg.name || 'Lens', probe, Math.max(cfg.topK, 3),
    () => _fetchRemoteChunks(cfg.url, key, probe, Math.max(cfg.topK, 3), {}));
  if (!result) return { ok: false, error: getLensStatus().lastError || 'unknown error' };
  return { ok: true, chunkCount: result.chunks.length, firstSource: result.chunks[0]?.source || '' };
}

// ═══════════════════════════════════════════════
// CHAT-HEADER INDICATOR
// ═══════════════════════════════════════════════
export function updateLensIndicator() {
  const btn = document.getElementById('chat-lens-indicator');
  const live = document.getElementById('chat-lens-status');
  if (!btn) return;
  btn.classList.remove('active', 'error');
  if (!hasLens()) { btn.style.display = 'none'; if (live) live.textContent = ''; return; }
  btn.style.display = '';
  const s = getLensStatus();
  if (s.state === 'active') btn.classList.add('active');
  else if (s.state === 'error') btn.classList.add('error');
  const cfg = getLensConfig();
  const tip = s.state === 'error'
    ? `Knowledge source error: ${s.lastError || 'unknown'}`
    : s.state === 'active'
      ? `Knowledge source active${cfg.name ? ': ' + cfg.name : ''} · ${s.lastChunkCount || 0} excerpts`
      : `Knowledge source ready${cfg.name ? ': ' + cfg.name : ''}`;
  btn.title = tip;
  if (live) live.textContent = tip;
}

subscribeLensStatus(updateLensIndicator);

// ═══════════════════════════════════════════════
// SETTINGS PANEL
// ═══════════════════════════════════════════════
export function renderCustomLensSection() {
  const cfg = getLensConfig();
  // Schedule on-device init on the next animation frame. The caller
  // (settings.js or _rerenderLensSection) sets innerHTML with the
  // string we return, so the #lens-local-stats + #lens-library-select
  // elements don't exist yet at this point. rAF defers until after
  // that assignment paints.
  if (cfg.backend === 'in-browser' && typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => {
      try { _loadLibraryPicker(); } catch {}
      try { _loadLocalLensStats(); } catch {}
    });
  }
  const keySet = !!getLensKey();

  const isBrowser = cfg.backend === 'in-browser';
  const isExternal = cfg.backend === 'external-server';

  const connected = isBrowser || (isExternal && cfg.url && keySet);
  const status = getLensStatus();
  const statusChip = !connected
    ? '<span style="color:var(--text-muted)">Not connected</span>'
    : status.state === 'error'
      ? `<span style="color:#fbbf24">&#9888; Error${cfg.name ? ' · ' + escapeHTML(cfg.name) : ''}</span>`
      : cfg.enabled
        ? `<span style="color:var(--green)">&#10003; Connected${cfg.name ? ' · ' + escapeHTML(cfg.name) : ''}</span>`
        : `<span style="color:var(--text-muted)">Configured (disabled)</span>`;
  const lastInfo = status.state === 'error' && status.lastError
    ? `<div style="font-size:11px;color:#fbbf24;margin-top:4px">Last error: ${escapeHTML(status.lastError)}</div>`
    : connected && status.lastChunkCount
      ? `<div style="font-size:11px;color:var(--text-muted);margin-top:4px">Last query: ${status.lastChunkCount} excerpt${status.lastChunkCount !== 1 ? 's' : ''}${status.sourceName ? ' from ' + escapeHTML(status.sourceName) : ''}</div>`
      : '';

  // Per-backend field visibility. The radio handler swaps display:none
  // so we don't have to re-render the whole panel on toggle — preserves
  // scroll position + focus.
  const browserFieldsStyle = isBrowser ? '' : 'display:none';
  const externalFieldsStyle = isExternal ? '' : 'display:none';

  return `<div class="ai-provider-panel">
    <div class="ai-provider-desc">Optional. A Knowledge Base grounds the AI's answers in documents you provide — research papers, clinical guides, personal notes. Add your documents below and the AI cites them when answering chat questions. <a href="/docs/guide/interpretive-lens.html" target="_blank" rel="noopener" style="color:var(--accent)">Learn more →</a></div>
    <div class="api-key-status" id="lens-status-chip">${statusChip}${lastInfo}</div>

    <div style="margin-top:10px">
      <div style="font-size:12px;color:var(--text-muted);margin-bottom:6px">Where to run it</div>
      <div class="ctx-btn-group" role="radiogroup" aria-label="Knowledge Base engine">
        <button type="button" class="ctx-btn-option ${isBrowser ? 'active' : ''}" role="radio" aria-checked="${isBrowser}" onclick="handleLensBackendChange('in-browser')">On this device</button>
        <button type="button" class="ctx-btn-option ${isExternal ? 'active' : ''}" role="radio" aria-checked="${isExternal}" onclick="handleLensBackendChange('external-server')">External server</button>
      </div>
      <div style="font-size:11px;color:var(--text-muted);margin-top:6px">
        ${isBrowser
          ? 'Runs entirely in this browser. No install — first use downloads a small AI model (~100 MB); after that it works offline. Good for a few hundred documents.'
          : 'Connect to a RAG server on your machine or LAN. Best for large corpora (thousands of files) and hardware-accelerated retrieval.'}
      </div>
    </div>

    <div style="margin-top:10px;display:flex;align-items:center;gap:10px">
      <label class="toggle-switch" for="lens-enabled-toggle">
        <input type="checkbox" id="lens-enabled-toggle" ${cfg.enabled ? 'checked' : ''} onchange="handleToggleLens(this.checked)">
        <span class="toggle-slider"></span>
      </label>
      <label for="lens-enabled-toggle" style="font-size:13px;cursor:pointer">Enable Knowledge Source</label>
    </div>

    ${isBrowser ? `
    <!-- Library picker — in-browser only. external-server has no library
         concept; it's a single remote endpoint.
         The select is populated lazily after mount because the backend
         is async. -->
    <div id="lens-library-picker" style="margin-top:12px">
      <label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:4px" for="lens-library-select">Library</label>
      <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
        <select id="lens-library-select" onchange="handleLibraryActivate(this.value)"
                style="flex:1;min-width:180px;padding:6px 8px;background:var(--bg-secondary);color:var(--text-primary);border:1px solid var(--border);border-radius:4px;font-size:13px">
          <option value="">Loading…</option>
        </select>
        <button class="import-btn import-btn-secondary" onclick="handleLibraryNew()" style="font-size:12px;padding:6px 10px" title="New library">+ New</button>
        <button class="import-btn import-btn-secondary" onclick="handleLibraryRename()" style="font-size:12px;padding:6px 10px" title="Rename active library">Rename</button>
        <button class="import-btn import-btn-secondary" onclick="handleLibraryDelete()" style="font-size:12px;padding:6px 10px" title="Delete active library">Delete</button>
      </div>
      <div style="font-size:11px;color:var(--text-muted);margin-top:4px">Keep different collections separate — research papers, clinical guides, personal notes. Chat grounds its answers in the active library only.</div>
    </div>
    ` : ''}

    <div id="lens-remote-fields" style="${externalFieldsStyle}">
      <!-- One-command install via curl | bash, served from the landing
           site's Vercel deploy. Hits the same pipx/uv → agent-stack →
           systemd-user-services flow a user would do by hand, just
           scripted. Linux-only for now — the installer degrades on
           macOS/containers (unit files land but don't activate) but
           auto-start is a systemd-only feature. Source is public so
           security-conscious users can audit before running. -->
      <details class="lens-setup-details" style="margin-top:8px;padding:12px 14px;background:var(--bg-secondary);border:1px solid var(--border);border-radius:6px;font-size:12px;color:var(--text-muted);line-height:1.6" open>
        <summary style="cursor:pointer;color:var(--text-primary);font-weight:600;font-size:13px;user-select:none;list-style:none">🚀 New here? One-command setup (Linux)</summary>
        <div style="margin-top:10px">
          <div style="margin-bottom:10px"><strong style="color:var(--text-primary)">1. Install the agent stack:</strong></div>
          <div style="font-family:var(--font-mono,monospace);font-size:11.5px;background:var(--bg-primary);padding:8px 12px;border-radius:4px;color:var(--text-primary);line-height:1.8;overflow-wrap:anywhere">curl -sSL https://getbased.health/install.sh | bash</div>
          <div style="font-size:11px;margin-top:4px;opacity:0.85">Installs via <code style="font-family:var(--font-mono,monospace);font-size:11px">pipx</code> or <code style="font-family:var(--font-mono,monospace);font-size:11px">uv</code> (auto-detected), starts rag + dashboard as systemd user services. <strong>Linux only</strong> — macOS and Windows aren't supported yet (the script installs but services won't auto-start).</div>
        </div>
        <div style="margin-top:14px">
          <div style="margin-bottom:10px"><strong style="color:var(--text-primary)">2. Open the dashboard</strong> — the script prints a <a href="/docs/guide/interpretive-lens.html#one-click-login" target="_blank" rel="noopener" style="color:var(--accent);text-decoration:underline">one-click login URL</a> at the end.</div>
          <div style="font-size:12px;line-height:1.7">
            • <strong>Knowledge</strong> tab — create a library, drop files in, wait for indexing<br>
            • <strong>MCP</strong> tab → <strong>Environment</strong> panel — copy <code style="font-family:var(--font-mono,monospace);font-size:11px">LENS_API_KEY</code>
          </div>
        </div>
        <div style="margin-top:14px">
          <div><strong style="color:var(--text-primary)">3. Paste the bearer</strong> into <em>API key</em> below, hit <em>Save + connect</em>.</div>
        </div>
        <!-- Audit/verification block — the audience is security-conscious
             by definition (they care about grounding health data on their
             own RAG), so curl | bash deserves an honest review-first path
             rather than pretending HTTPS is all anyone needs. -->
        <div style="margin-top:14px;font-size:11px;padding-top:10px;border-top:1px dashed var(--border);line-height:1.55">
          <strong style="color:var(--text-primary)">Cautious?</strong> Read the script first or verify its hash:<br>
          <code style="font-family:var(--font-mono,monospace);font-size:11px;display:inline-block;margin-top:4px">curl -sSL https://getbased.health/install.sh | less</code><br>
          <code style="font-family:var(--font-mono,monospace);font-size:11px;display:inline-block;margin-top:2px">curl -sSL https://getbased.health/install.sh.sha256 | sha256sum -c</code><br>
          <a href="https://github.com/elkimek/get-based-site/blob/main/install.sh" target="_blank" rel="noopener" style="color:var(--accent);text-decoration:underline">Source on GitHub →</a>
        </div>
        <div style="margin-top:10px;font-size:11px">Already have a server? Skip this and fill in the fields below.</div>
      </details>
      <!-- Display name: only meaningful for external-server, which is a
           remote endpoint rather than a named library. in-browser derives
           the chip label from the active library name. -->
      <div style="margin-top:12px">
        <label style="font-size:12px;color:var(--text-muted)" for="lens-name-input">Display name</label>
        <input type="text" class="api-key-input" id="lens-name-input" value="${escapeAttr(cfg.name)}" placeholder="e.g. Functional Medicine Library" style="margin-top:4px">
        <div style="font-size:11px;color:var(--text-muted);margin-top:4px">Shown in the chat-header badge when this source is feeding answers.</div>
      </div>
      <div style="margin-top:10px">
        <label style="font-size:12px;color:var(--text-muted)" for="lens-url-input">Endpoint URL</label>
        <input type="text" class="api-key-input" id="lens-url-input" value="${escapeAttr(cfg.url)}" placeholder="http://127.0.0.1:8322/query" style="margin-top:4px">
        <div style="font-size:11px;color:var(--text-muted);margin-top:4px">Include the <code style="font-family:var(--font-mono,monospace);font-size:11px">/query</code> path — it's the specific endpoint the chat hits, not the server root.</div>
      </div>
      <div style="margin-top:10px">
        <label style="font-size:12px;color:var(--text-muted)" for="lens-key-input">API key</label>
        <input type="password" class="api-key-input" id="lens-key-input" value="${escapeAttr(keySet ? '••••••••' : '')}" placeholder="Bearer token" style="margin-top:4px">
        <div style="font-size:11px;color:var(--text-muted);margin-top:4px">Paste from the dashboard's <em>MCP → Environment</em> panel, or run <code style="font-family:var(--font-mono,monospace);font-size:11px">lens key</code> in a terminal on the server. Encrypted at rest on this device; never sent to any third party.</div>
      </div>
      <div style="margin-top:10px">
        <label style="font-size:12px;color:var(--text-muted)" for="lens-test-probe-input">Test query</label>
        <input type="text" class="api-key-input" id="lens-test-probe-input" value="${escapeAttr(cfg.testProbe || DEFAULT_TEST_PROBE)}" placeholder="${escapeAttr(DEFAULT_TEST_PROBE)}" style="margin-top:4px">
        <div style="font-size:11px;color:var(--text-muted);margin-top:4px">Sent to your endpoint on <strong>Save + connect</strong> to verify the connection. Pick a query your documents should have good matches for.</div>
      </div>
      <!-- Footnote: the panel points at a server; the server's libraries
           are managed in the dashboard. Integrated flow covers this in
           step 3, so the once-separate callout is now a terse reminder. -->
      <div style="margin-top:14px;padding:8px 12px;border-left:3px solid var(--accent);background:var(--bg-secondary);font-size:11.5px;color:var(--text-muted);line-height:1.5">
        Chat grounds on the server's <strong>active library</strong>. Switch or create libraries from the dashboard — this panel only says which server to talk to.
      </div>
    </div>

    <div id="lens-local-fields" style="${browserFieldsStyle}">
      <div id="lens-local-stats" style="margin-top:10px;padding:10px 14px;background:var(--bg-secondary);border-radius:6px;font-size:13px;color:var(--text-muted)">Loading stats…</div>
      <div id="lens-local-drop"
           role="button" tabindex="0"
           aria-label="Add documents — drop files here or press Enter to open the file picker"
           style="margin-top:10px;padding:18px;border:2px dashed var(--border);border-radius:8px;text-align:center;font-size:13px;color:var(--text-muted);cursor:pointer;transition:border-color 0.15s"
           onclick="document.getElementById('lens-local-filepick').click()">
        <div style="font-size:20px;pointer-events:none" aria-hidden="true">📁</div>
        <div style="margin-top:4px;pointer-events:none">Drop documents or click to add</div>
        <div style="font-size:11px;margin-top:2px;opacity:0.7;pointer-events:none">PDF · Markdown · Text · Word · JSON · ZIP</div>
      </div>
      <input type="file" id="lens-local-filepick" multiple style="display:none" accept=".txt,.md,.markdown,.rst,.json,.csv,.log,.pdf,.docx,.zip">
      <div id="lens-local-progress-wrap" style="display:none;margin-top:8px">
        <progress id="lens-local-progress" value="0" max="100" style="width:100%;height:8px" aria-label="Indexing progress"></progress>
        <div id="lens-local-progress-text" role="status" aria-live="polite" style="font-size:11px;color:var(--text-muted);margin-top:4px"></div>
      </div>
      <div id="lens-local-doc-list" style="margin-top:10px"></div>
    </div>

    <div style="margin-top:10px">
      <label style="font-size:12px;color:var(--text-muted)" for="lens-topk-input">Excerpts per question</label>
      <input type="number" class="api-key-input" id="lens-topk-input" value="${cfg.topK || 5}" min="1" max="10" style="margin-top:4px;width:100px">
      <div style="font-size:11px;color:var(--text-muted);margin-top:4px">How many of the most relevant excerpts the AI sees with each chat question.</div>
    </div>

    <div style="margin-top:14px">
      <label style="display:flex;align-items:flex-start;gap:8px;cursor:pointer">
        <input type="checkbox" id="lens-multi-query-checkbox" ${cfg.multiQuery !== false ? 'checked' : ''} style="margin-top:3px">
        <span style="font-size:12px;color:var(--text-primary)">
          Improve recall with query rewriting
          <div style="font-size:11px;color:var(--text-muted);margin-top:2px;line-height:1.4">
            Before searching, your AI provider rephrases the question to cover Latin names, synonyms, and related terms — so a search for "Black Seed Oil" still finds notes titled "Nigella Sativa". Adds ~1s on the first matching question.
          </div>
        </span>
      </label>
    </div>

    <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
      <button class="import-btn import-btn-primary" onclick="handleSaveLensConfig()">${isExternal ? 'Save + connect' : 'Save'}</button>
      ${connected ? '<button class="import-btn import-btn-secondary" onclick="handleClearLensCache()">Clear cache</button>' : ''}
      ${connected ? '<button class="import-btn import-btn-secondary" onclick="handleRemoveLens()">Remove</button>' : ''}
    </div>

    <div class="api-key-notice" style="margin-top:12px">
      ${isBrowser
        ? 'Your documents and questions never leave this device. First use downloads a small AI model (about 100 MB); after that it works offline.'
        : 'Your questions are sent directly to the server you configure. Only connect to servers you control or trust.'}
    </div>
  </div>`;
}

function _rerenderLensSection() {
  const section = document.getElementById('custom-lens-section');
  if (section) section.innerHTML = renderCustomLensSection();
}

// ─── Dedicated Knowledge Base modal ────────────────────────────
//
// KB lives in its own modal as of v1.3.24 — pulled out of Settings →
// AI because it's conceptually distinct (your documents, your local
// embeddings) from "which API answers chat questions". The dashboard
// "Connect a knowledge base" CTA opens this directly. Same DOM IDs as
// the previous in-Settings render path, so handleSaveLensConfig and
// _loadLocalLensStats keep working without changes.
export function openKnowledgeBaseModal() {
  let overlay = document.getElementById('kb-modal-overlay');
  let modal = document.getElementById('kb-modal');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'kb-modal-overlay';
    overlay.className = 'modal-overlay';
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeKnowledgeBaseModal(); });
  }
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'kb-modal';
    modal.className = 'modal kb-modal';
    overlay.appendChild(modal);
  }
  modal.innerHTML = `
    <button class="modal-close" onclick="closeKnowledgeBaseModal()" aria-label="Close">&times;</button>
    <h3 style="display:flex;align-items:center;gap:8px;margin-top:0">
      <span aria-hidden="true">&#128218;</span>
      <span>Knowledge Base</span>
    </h3>
    <div class="settings-section" id="custom-lens-section">
      ${renderCustomLensSection()}
    </div>
  `;
  overlay.classList.add('show');
  document.addEventListener('keydown', _kbModalKeydown);
  // Hydrate stats async without blocking the open.
  if (getLensConfig().backend === 'in-browser') {
    _loadLocalLensStats().catch(() => {});
  }
  // Move focus into the modal so keyboard users land inside, not on
  // the trigger button. Defer one tick so the .show class transition
  // doesn't fight the focus call.
  setTimeout(() => {
    const firstFocusable = modal.querySelector('input:not([disabled]),button:not([disabled]),[tabindex="0"]');
    firstFocusable?.focus();
  }, 50);
}

export function closeKnowledgeBaseModal() {
  const overlay = document.getElementById('kb-modal-overlay');
  if (overlay) overlay.classList.remove('show');
  document.removeEventListener('keydown', _kbModalKeydown);
}

function _kbModalKeydown(e) {
  if (e.key === 'Escape') closeKnowledgeBaseModal();
}

// Update only the status chip without blowing away input fields
function _updateLensStatusChip() {
  const chip = document.getElementById('lens-status-chip');
  if (!chip) return;
  const cfg = getLensConfig();
  const keySet = !!getLensKey();
  const isBrowser = cfg.backend === 'in-browser';
  const connected = isBrowser || (cfg.backend === 'external-server' && cfg.url && keySet);
  const status = getLensStatus();
  const statusChip = !connected
    ? '<span style="color:var(--text-muted)">Not connected</span>'
    : status.state === 'error'
      ? `<span style="color:#fbbf24">&#9888; Error${cfg.name ? ' · ' + escapeHTML(cfg.name) : ''}</span>`
      : cfg.enabled
        ? `<span style="color:var(--green)">&#10003; Connected${cfg.name ? ' · ' + escapeHTML(cfg.name) : ''}</span>`
        : `<span style="color:var(--text-muted)">Configured (disabled)</span>`;
  const lastInfo = status.state === 'error' && status.lastError
    ? `<div style="font-size:11px;color:#fbbf24;margin-top:4px">Last error: ${escapeHTML(status.lastError)}</div>`
    : connected && status.lastChunkCount
      ? `<div style="font-size:11px;color:var(--text-muted);margin-top:4px">Last query: ${status.lastChunkCount} excerpt${status.lastChunkCount !== 1 ? 's' : ''}${status.sourceName ? ' from ' + escapeHTML(status.sourceName) : ''}</div>`
      : '';
  chip.innerHTML = statusChip + lastInfo;
}

export async function handleSaveLensConfig() {
  const topK = Math.max(1, Math.min(10, parseInt(document.getElementById('lens-topk-input')?.value, 10) || 5));
  const enabled = !!document.getElementById('lens-enabled-toggle')?.checked;
  const multiQuery = !!document.getElementById('lens-multi-query-checkbox')?.checked;
  // Backend is set by the pill buttons via handleLensBackendChange and
  // persisted immediately — read it from config rather than DOM.
  const backend = getLensConfig().backend || 'in-browser';

  if (backend === 'in-browser') {
    // On-device: display name is auto-derived from active library, not
    // a user-facing field anymore. Preserve whatever _loadLibraryPicker
    // last synced.
    saveLensConfig({ enabled, topK, backend, multiQuery });
    _rerenderLensSection();
    _loadLocalLensStats();
    showNotification('Saved. Your documents stay on this device.', 'success');
    return;
  }

  // external-server: only backend where a user-entered display name is
  // meaningful (it's a remote endpoint, not a named library).
  const name = (document.getElementById('lens-name-input')?.value || '').trim();
  const url = (document.getElementById('lens-url-input')?.value || '').trim().replace(/\/+$/, '');
  const keyRaw = document.getElementById('lens-key-input')?.value || '';
  const testProbe = (document.getElementById('lens-test-probe-input')?.value || '').trim() || DEFAULT_TEST_PROBE;

  if (!url) { showNotification('Please enter an endpoint URL', 'error'); return; }
  if (!isValidLensUrl(url)) { showNotification('URL must be https:// (or http:// to localhost / LAN / .local)', 'error'); return; }

  const key = (keyRaw === '••••••••') ? getLensKey() : keyRaw.trim();
  if (!key) { showNotification('Please enter an API key', 'error'); return; }

  saveLensConfig({ name, url, enabled, topK, testProbe, backend, multiQuery });
  if (keyRaw !== '••••••••') await saveLensKey(key);

  const result = await testLensConnection();
  _rerenderLensSection();
  if (result.ok) {
    const n = result.chunkCount;
    const msg = n > 0
      ? `Connected — found ${n} good excerpt${n !== 1 ? 's' : ''} for the test query`
      : `Connected — your endpoint works, but the test query didn't find any close matches. Try a query more specific to what you've indexed.`;
    showNotification(msg, 'success');
  } else {
    showNotification(`Connection failed: ${result.error}`, 'error');
  }
}

/// Backend radio handler — saves the choice immediately (so a reload
/// keeps the selection). Re-renders the whole panel since the per-backend
/// sections have structurally different layouts.
export function handleLensBackendChange(backend) {
  saveLensConfig({ backend });
  _rerenderLensSection();
  if (backend === 'in-browser') _loadLocalLensStats();
  _updateLensStatusChip();
  updateLensIndicator();
}

/// Populate the local-corpus stats line + doc list + wire the drop handler.
/// Lazy-imports lens-local.js so remote-only users don't pay the cost.
/// Idempotent — called on panel render, backend toggle, and after ingest.
///
/// No local cache here: `openLocalLens()` memoizes its own `_ready`
/// Promise, so repeated `await openLocalLens()` is free. One source of
/// truth; no drift possible.
async function _getLocalLens() {
  const mod = await import('./lens-local.js');
  return mod.openLocalLens();
}

// Module-level cache of the most recent in-browser lens stats. Used by
// getLensSummary() so the dashboard's Knowledge Base row can render
// synchronously without re-awaiting the worker on every paint. Refreshed
// every time _loadLocalLensStats() runs successfully.
let _lastLocalStats = null;

async function _loadLocalLensStats() {
  const stats = document.getElementById('lens-local-stats');
  const list = document.getElementById('lens-local-doc-list');
  // Even when no Settings panel is open we still want the cache hot for
  // the dashboard summary — keep going if the DOM nodes aren't present.
  try {
    const lens = await _getLocalLens();
    const s = await lens.getStats();
    _lastLocalStats = s;
    // Notify dashboard listeners that summary numbers may have changed.
    updateLensStatus({});
    if (!stats) return;
    if (s.total_chunks === 0) {
      stats.innerHTML = '<span style="color:var(--text-muted)">No documents indexed yet.</span>';
    } else {
      const modelLabel = /minilm/i.test(s.model)
        ? `MiniLM · ${s.dim}-dim`
        : /bge-m3/i.test(s.model) ? `BGE-M3 · ${s.dim}-dim` : `${s.model} · ${s.dim}-dim`;
      // Surface the active transformers.js backend. WebGPU is 3-10× faster
      // than WASM for embedding inference; showing it makes the speed gap
      // legible to users debugging "why is my query slow" and advertises
      // the upgrade path (switch to a modern Chrome for WebGPU).
      const backendLabel = s.backend === 'webgpu' ? 'WebGPU' : 'WASM';
      stats.innerHTML = `<span style="color:var(--green)">&#9679;</span> ${s.total_chunks.toLocaleString()} excerpt${s.total_chunks !== 1 ? 's' : ''} from ${s.documents.length} document${s.documents.length !== 1 ? 's' : ''} · <span title="${escapeAttr(s.model)}">${escapeHTML(backendLabel)} · ${escapeHTML(modelLabel)}</span>`;
    }
    if (list) list.innerHTML = _renderLocalDocList(s.documents);
    _attachLocalLensDropHandlers();
  } catch (e) {
    if (stats) stats.innerHTML = `<span style="color:#fbbf24">Failed to load stats: ${escapeHTML(e?.message || String(e))}</span>`;
  }
}

// Synchronous summary used by the dashboard Knowledge Base row.
// Returns enough to render a one-line status without awaiting the
// worker. Numbers are best-effort — if no successful stats fetch has
// happened yet, docCount/chunkCount come back as null and the caller
// can render a softer "loading…" affordance.
export function getLensSummary() {
  const cfg = getLensConfig();
  const configured = hasLens();
  const aiAvailable = hasAIProvider();
  const summary = {
    configured,
    backend: cfg.backend,
    enabled: !!cfg.enabled,
    multiQueryOn: configured && aiAvailable && cfg.multiQuery !== false,
    aiAvailable,
    displayName: '',
    docCount: null,
    chunkCount: null,
  };
  if (cfg.backend === 'in-browser') {
    summary.displayName = (cfg.name || '').trim() || 'My Library';
    // Only surface doc/chunk counts when there's actually a configured
    // library — otherwise stale cache from a prior session would leak
    // numbers into the dashboard's empty-state stub.
    if (configured && _lastLocalStats) {
      summary.docCount = Array.isArray(_lastLocalStats.documents) ? _lastLocalStats.documents.length : null;
      summary.chunkCount = typeof _lastLocalStats.total_chunks === 'number' ? _lastLocalStats.total_chunks : null;
    }
  } else {
    // external-server: take the user-named label, or fall back to the URL host
    let label = (cfg.name || '').trim();
    if (!label && cfg.url) {
      try { label = new URL(cfg.url).host; } catch { label = cfg.url; }
    }
    summary.displayName = label || 'Knowledge Base';
  }
  return summary;
}

function _renderLocalDocList(docs) {
  if (!docs || docs.length === 0) return '';
  const rows = docs.map((d) => `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:6px 10px;border-bottom:1px solid var(--border);font-size:12px">
      <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escapeAttr(d.source)}">${escapeHTML(d.source)}</span>
      <span style="color:var(--text-muted);margin:0 10px;font-variant-numeric:tabular-nums">${d.chunks}</span>
      <button class="kb-doc-delete" onclick="handleLocalLensDeleteDoc(${JSON.stringify(d.source).replace(/"/g, '&quot;')})" aria-label="Delete ${escapeAttr(d.source)}" title="Delete" style="background:transparent;border:0;color:var(--text-muted);cursor:pointer;font-size:16px;padding:2px 6px">×</button>
    </div>
  `).join('');
  return `
    <div style="margin-top:4px;max-height:220px;overflow-y:auto;border:1px solid var(--border);border-radius:6px">${rows}</div>
    <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">
      <button class="import-btn import-btn-secondary" onclick="handleLocalLensClear()" style="font-size:12px;padding:4px 10px">Clear all</button>
    </div>
  `;
}

function _attachLocalLensDropHandlers() {
  const drop = document.getElementById('lens-local-drop');
  const picker = document.getElementById('lens-local-filepick');
  if (!drop || !picker) return;
  if (drop.dataset.wired === '1') return;
  drop.dataset.wired = '1';
  drop.addEventListener('dragenter', (e) => { e.preventDefault(); drop.style.borderColor = 'var(--accent)'; });
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.style.borderColor = 'var(--accent)'; });
  drop.addEventListener('dragleave', () => { drop.style.borderColor = 'var(--border)'; });
  drop.addEventListener('drop', (e) => { e.preventDefault(); drop.style.borderColor = 'var(--border)'; _handleLocalLensIngest(e.dataTransfer?.files); });
  drop.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); picker.click(); }
  });
  picker.addEventListener('change', (e) => { _handleLocalLensIngest(e.target.files); e.target.value = ''; });
}

// Fixed-position progress pill that lives outside any modal. Ingest can
// take many minutes for large corpora; users need to close Settings and
// keep working while embedding runs in the worker. This pill survives
// modal open/close/re-render cycles and is the canonical progress UI.
// The in-modal progress bar (if the modal is open) mirrors the same
// events so existing markup keeps working — both are hydrated fresh on
// every progress event so a mid-ingest modal reopen rebinds cleanly.
function _ensureIngestPill() {
  let pill = document.getElementById('lens-ingest-pill');
  if (pill) return pill;
  pill = document.createElement('div');
  pill.id = 'lens-ingest-pill';
  pill.setAttribute('role', 'status');
  pill.setAttribute('aria-live', 'polite');
  pill.style.cssText = [
    'position:fixed',
    'bottom:88px',
    'right:20px',
    'z-index:9999',
    'min-width:260px',
    'max-width:360px',
    'padding:12px 14px',
    'background:var(--bg-elev, #1e1e1e)',
    'border:1px solid var(--border, #333)',
    'border-radius:12px',
    'box-shadow:var(--shadow-lg, 0 8px 32px rgba(0,0,0,0.4))',
    'font-size:12px',
    'color:var(--text-primary, #eee)',
    'pointer-events:auto',
  ].join(';');
  pill.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;gap:8px">
      <strong style="font-size:11px;letter-spacing:0.04em;text-transform:uppercase;color:var(--text-muted,#888)">Indexing knowledge base</strong>
      <button id="lens-ingest-pill-dismiss" title="Hide (ingest keeps running)" style="background:none;border:none;color:var(--text-muted,#888);cursor:pointer;padding:0 4px;font-size:16px;line-height:1">&times;</button>
    </div>
    <div id="lens-ingest-pill-text" style="margin-bottom:8px;font-size:12px;color:var(--text-secondary,#bbb);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">Preparing…</div>
    <progress id="lens-ingest-pill-bar" value="0" max="1" style="width:100%;height:6px;margin-bottom:8px"></progress>
    <button id="lens-ingest-pill-cancel" style="width:100%;padding:6px;background:transparent;border:1px solid var(--border,#333);border-radius:6px;color:var(--text-secondary,#bbb);font-size:11px;cursor:pointer">Cancel</button>
  `;
  document.body.appendChild(pill);
  pill.querySelector('#lens-ingest-pill-dismiss').addEventListener('click', () => {
    pill.style.display = 'none';
  });
  pill.querySelector('#lens-ingest-pill-cancel').addEventListener('click', async () => {
    const btn = pill.querySelector('#lens-ingest-pill-cancel');
    btn.disabled = true;
    btn.textContent = 'Cancelling…';
    try {
      const lens = await _getLocalLens();
      lens.abort();
    } catch {}
  });
  return pill;
}

function _removeIngestPill() {
  const pill = document.getElementById('lens-ingest-pill');
  if (pill) pill.remove();
}

async function _handleLocalLensIngest(fileList) {
  // Snapshot IMMEDIATELY — FileList from an <input type=file>.files is a
  // LIVE reference, and the picker's change handler clears input.value
  // right after calling us. Awaiting the dynamic import below would give
  // the clear a chance to empty the FileList mid-flight. Array.from copies
  // the File handles off the live list; each File itself stays valid.
  const incoming = fileList ? Array.from(fileList) : [];
  if (incoming.length === 0) return;

  const pill = _ensureIngestPill();
  pill.style.display = '';
  const pillText = pill.querySelector('#lens-ingest-pill-text');
  const pillBar = pill.querySelector('#lens-ingest-pill-bar');
  pillText.textContent = 'Reading files…';

  // Parse main-thread, hand text to worker (see lens-local-parsers.js for
  // why: module worker can't cleanly import the UMD parser bundles).
  const { extractFromFile } = await import('./lens-local-parsers.js');
  const files = [];
  for (const f of incoming) {
    try {
      const extracted = await extractFromFile(f);
      for (const e of extracted) files.push(e);
    } catch (err) { console.warn('[lens-local] extract failed:', f.name, err); }
  }
  if (files.length === 0) {
    pillText.textContent = 'No usable files.';
    setTimeout(() => _removeIngestPill(), 3000);
    return;
  }

  const lens = await _getLocalLens();
  const { subscribeProgress } = await import('./lens-local.js');
  const t0 = performance.now();
  const unsub = subscribeProgress((p) => {
    // Re-query the in-modal elements on every event so a mid-ingest
    // Settings reopen (which rerenders innerHTML) rebinds cleanly to
    // the new DOM nodes instead of updating detached ones.
    const modalBar = document.getElementById('lens-local-progress');
    const modalText = document.getElementById('lens-local-progress-text');
    const modalWrap = document.getElementById('lens-local-progress-wrap');
    if (modalWrap) modalWrap.style.display = '';
    if (p.stage === 'start') {
      pillBar.max = p.total; pillBar.value = 0;
      pillText.textContent = `Preparing ${p.total} excerpts…`;
      if (modalBar) modalBar.max = p.total;
      if (modalText) modalText.textContent = `Preparing ${p.total} excerpts across ${files.length} file${files.length !== 1 ? 's' : ''}…`;
    } else if (p.stage === 'embed') {
      const rate = p.index / ((performance.now() - t0) / 1000);
      pillBar.max = p.total;
      pillBar.value = p.index;
      pillText.textContent = `${p.index}/${p.total} · ${rate.toFixed(1)}/s`;
      // Set max on every tick — when Settings is reopened mid-ingest the
      // fresh <progress> markup starts at max=100, so without this the
      // bar jumps to 100% even at small p.index values.
      if (modalBar) { modalBar.max = p.total; modalBar.value = p.index; }
      if (modalText) modalText.textContent = `Indexing ${p.index}/${p.total} · ${rate.toFixed(1)}/s · ${p.source}`;
    }
  });
  window._lensIngestRunning = true;
  try {
    const stats = await lens.ingest(files);
    const dur = ((performance.now() - t0) / 1000).toFixed(1);
    const planned = stats.chunks_planned ?? stats.chunks_indexed;
    const doneMsg = stats.cancelled
      ? `Cancelled — indexed ${stats.chunks_indexed} of ${planned} excerpts in ${dur}s.`
      : `Indexed ${stats.chunks_indexed} excerpts from ${stats.files_seen} file${stats.files_seen !== 1 ? 's' : ''} in ${dur}s.`;
    pillText.textContent = doneMsg;
    const modalText = document.getElementById('lens-local-progress-text');
    if (modalText) modalText.textContent = doneMsg;
    showNotification(doneMsg, stats.cancelled ? 'info' : 'success');
  } catch (e) {
    const errMsg = `Couldn't index: ${e.message || e}`;
    pillText.textContent = errMsg;
    const modalText = document.getElementById('lens-local-progress-text');
    if (modalText) modalText.textContent = errMsg;
    showNotification(errMsg, 'error');
  } finally {
    window._lensIngestRunning = false;
    unsub();
    setTimeout(() => {
      _removeIngestPill();
      const modalWrap = document.getElementById('lens-local-progress-wrap');
      if (modalWrap) modalWrap.style.display = 'none';
    }, 3000);
    await _loadLocalLensStats();
  }
}

export function handleLocalLensDeleteDoc(source) {
  if (!source) return;
  showConfirmDialog(`Remove "${source}" from your knowledge base?`, async () => {
    try {
      const lens = await _getLocalLens();
      const deleted = await lens.deleteDocument(source);
      showNotification(`Removed ${deleted} excerpt${deleted !== 1 ? 's' : ''}.`, 'success');
      await _loadLocalLensStats();
    } catch (e) {
      showNotification(`Couldn't delete that document: ${e?.message || e}.`, 'error');
    }
  });
}

export function handleLocalLensClear() {
  showConfirmDialog('Clear every document from your knowledge base? This can\'t be undone.', async () => {
    try {
      const lens = await _getLocalLens();
      await lens.clear();
      clearLensCache();
      showNotification('Knowledge base cleared.', 'success');
      await _loadLocalLensStats();
    } catch (e) {
      showNotification(`Couldn't clear the knowledge base: ${e?.message || e}.`, 'error');
    }
  });
}

// ── Library management handlers ────────────────────────────────
// in-browser only. external-server has no library concept (it's a single
// remote endpoint), so handlers no-op there.

async function _libList() {
  const cfg = getLensConfig();
  if (cfg.backend === 'in-browser') {
    const lens = await _getLocalLens();
    return lens.listLibraries(); // {libraries, activeId}
  }
  return { libraries: [], activeId: '' };
}

async function _libCreate(name, model) {
  const cfg = getLensConfig();
  if (cfg.backend === 'in-browser') {
    const lens = await _getLocalLens();
    const created = await lens.createLibrary(name, model);
    await lens.activateLibrary(created.id);
    return created;
  }
  throw new Error('Libraries are not supported for this backend');
}

async function _libActivate(id) {
  const cfg = getLensConfig();
  if (cfg.backend === 'in-browser') {
    const lens = await _getLocalLens();
    return lens.activateLibrary(id);
  }
}

async function _libRename(id, name) {
  const cfg = getLensConfig();
  if (cfg.backend === 'in-browser') {
    const lens = await _getLocalLens();
    return lens.renameLibrary(id, name);
  }
}

async function _libDelete(id) {
  const cfg = getLensConfig();
  if (cfg.backend === 'in-browser') {
    const lens = await _getLocalLens();
    return lens.deleteLibrary(id);
  }
}

/// Populate #lens-library-select from the active backend and sync the
/// stored display name with the active library. Safe to call repeatedly.
async function _loadLibraryPicker() {
  const sel = document.getElementById('lens-library-select');
  try {
    const { libraries, activeId } = await _libList();
    const active = libraries?.find((l) => l.id === activeId);
    if (active && getLensConfig().name !== active.name) {
      saveLensConfig({ name: active.name });
      _updateLensStatusChip();
    }
    if (!sel) return;
    if (!libraries || libraries.length === 0) {
      sel.innerHTML = '<option value="">No libraries yet</option>';
      return;
    }
    sel.innerHTML = libraries.map((l) =>
      `<option value="${escapeAttr(l.id)}" ${l.id === activeId ? 'selected' : ''}>${escapeHTML(l.name)}</option>`
    ).join('');
  } catch (e) {
    if (sel) sel.innerHTML = '<option value="">(engine not ready)</option>';
  }
}

export async function handleLibraryActivate(libraryId) {
  if (!libraryId) return;
  try {
    await _libActivate(libraryId);
    clearLensCache();
    updateLensIndicator();
    showNotification('Switched library.', 'info');
    await _loadLibraryPicker();
    const cfg = getLensConfig();
    if (cfg.backend === 'in-browser') await _loadLocalLensStats();
    _updateLensStatusChip();
  } catch (e) {
    showNotification(`Couldn't switch library: ${e?.message || e}.`, 'error');
  }
}

export async function handleLibraryNew() {
  // Pull the model catalog + tier verdict from the already-booted worker
  // so the dialog can highlight a device-appropriate default. If the
  // worker isn't ready yet (user opens the dialog the instant they
  // switch backends), fall back to a plain name-only prompt — we can
  // always create with DEFAULT_MODEL_KEY.
  let embedder = null;
  let models = null;
  try {
    const lens = await _getLocalLens();
    embedder = lens.embedder;
    models = lens.models;
  } catch { /* backend not ready — fall through to plain prompt */ }

  const picked = (models && Object.keys(models).length > 0)
    ? await _showLibraryCreateDialog(embedder, models)
    : await _plainNamePrompt();
  if (!picked) return;
  try {
    const created = await _libCreate(picked.name, picked.model);
    clearLensCache();
    updateLensIndicator();
    showNotification(`Created "${created?.name || picked.name}". Drop documents to index them.`, 'success');
    await _loadLibraryPicker();
    const cfg = getLensConfig();
    if (cfg.backend === 'in-browser') await _loadLocalLensStats();
    _updateLensStatusChip();
  } catch (e) {
    showNotification(`Couldn't create library: ${e?.message || e}.`, 'error');
  }
}

/// Fallback when the worker isn't ready / models catalog is empty.
/// Preserves the pre-step-3 UX exactly so existing tests don't break.
async function _plainNamePrompt() {
  const name = await showPromptDialog('Name for the new library?', {
    placeholder: 'e.g. Research Papers',
    okLabel: 'Create',
  });
  return name ? { name, model: undefined } : null;
}

/// Library-creation modal: name + model picker. Highlights a
/// recommended model based on the benchmark verdict (embedder.tier)
/// so users with modern hardware default to a stronger model than
/// MiniLM. Returns {name, model} or null on cancel.
///
/// Mirrors the structure of showPromptDialog in utils.js — same
/// overlay + dialog classes so theming and escape-to-cancel come
/// for free — but with a radio group of model options inside.
function _showLibraryCreateDialog(embedder, models) {
  // Pick the recommended model: highest-tier option that fits within
  // the detected tier. No benchmark verdict (old browsers, init
  // hiccup) → recommend the default (tier-1 MiniLM, universally
  // works). Within a tier, prefer English BGE over multilingual-E5
  // for the default highlight — English health research is getbased's
  // modal case. Users with multilingual corpora can one-click over.
  const detectedTier = embedder?.tier || 1;
  const entries = Object.entries(models); // [[key, spec], ...]
  const byTier = { 1: [], 2: [], 3: [] };
  for (const [key, spec] of entries) {
    const t = spec.tier || 1;
    if (t <= 3) byTier[t]?.push({ key, spec });
  }
  // Recommended = highest-tier eligible for the device, English
  // preferred. If nothing at the detected tier, step down.
  let recommendedKey = null;
  for (let t = detectedTier; t >= 1; t--) {
    const candidates = byTier[t] || [];
    const english = candidates.find((c) => c.spec.language === 'en');
    const pick = english || candidates[0];
    if (pick) { recommendedKey = pick.key; break; }
  }
  if (!recommendedKey) recommendedKey = entries[0]?.[0];

  const tierLine = embedder
    ? `Your device: ${embedder.msPerEmbed.toFixed(0)} ms/embed on ${embedder.backend} &rarr; tier ${embedder.tier}.`
    : 'Device not yet benchmarked — recommending the universally-compatible default.';

  return new Promise((resolve) => {
    let overlay = document.getElementById('lens-library-create-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'lens-library-create-overlay';
      overlay.className = 'confirm-overlay';
      document.body.appendChild(overlay);
    }

    // Render radio buttons for each model. Highlight the recommended
    // one with a badge + default-checked. Each row shows label, size,
    // dim, and language scope so users can make an informed choice.
    const radiosHtml = entries.map(([key, spec]) => {
      const isRecommended = key === recommendedKey;
      const border = isRecommended ? 'var(--accent)' : 'var(--border)';
      const shadow = isRecommended ? 'box-shadow:0 0 0 2px rgba(124,58,237,0.15);' : '';
      const badge = isRecommended
        ? '<span style="margin-left:8px;padding:2px 6px;font-size:10px;background:var(--accent);color:#fff;border-radius:3px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px">Recommended</span>'
        : '';
      const langLabel = spec.language === 'multi' ? '100+ languages' : 'English';
      return `<label style="display:block;padding:10px 12px;margin:6px 0;border:1px solid ${border};border-radius:6px;cursor:pointer;${shadow}">
        <div style="display:flex;align-items:center">
          <input type="radio" name="lens-create-model" value="${escapeAttr(key)}" ${isRecommended ? 'checked' : ''} style="margin-right:10px">
          <strong style="color:var(--text-primary);font-size:13px">${escapeHTML(spec.label)}</strong>
          ${badge}
        </div>
        <div style="margin-top:4px;margin-left:23px;font-size:11px;color:var(--text-muted);line-height:1.5">
          ${spec.downloadMB}&nbsp;MB download &middot; ${spec.dim}-dim &middot; ${langLabel}<br>
          ${escapeHTML(spec.notes || '')}
        </div>
      </label>`;
    }).join('');

    overlay.innerHTML = `<div class="confirm-dialog" role="dialog" aria-modal="true" aria-label="New library" style="max-width:520px">
      <p class="confirm-message" style="margin-bottom:4px">New library</p>
      <div style="font-size:11px;color:var(--text-muted);margin-bottom:12px;line-height:1.4">${tierLine}</div>
      <label style="display:block;font-size:12px;color:var(--text-muted);margin-bottom:4px">Library name</label>
      <input type="text" id="lens-create-name" class="api-key-input"
             placeholder="e.g. Research Papers"
             style="width:100%;margin-bottom:14px;box-sizing:border-box"
             aria-label="Library name">
      <div style="font-size:12px;color:var(--text-muted);margin-bottom:6px">Embedding model (locked at creation — switching model later means re-indexing every document)</div>
      <div style="max-height:320px;overflow-y:auto;margin-bottom:14px">${radiosHtml}</div>
      <div class="confirm-actions">
        <button class="confirm-btn confirm-btn-cancel" id="lens-create-cancel">Cancel</button>
        <button class="confirm-btn confirm-btn-danger" id="lens-create-ok" style="background:var(--accent)">Create</button>
      </div></div>`;
    overlay.classList.add('show');

    const nameInput = document.getElementById('lens-create-name');
    const ok = document.getElementById('lens-create-ok');
    const cancel = document.getElementById('lens-create-cancel');

    const close = (result) => {
      overlay.classList.remove('show');
      document.removeEventListener('keydown', onKey);
      resolve(result);
    };
    const submit = () => {
      const name = nameInput.value.trim();
      if (!name) { nameInput.focus(); return; }
      const chosen = overlay.querySelector('input[name="lens-create-model"]:checked');
      close({ name, model: chosen?.value || recommendedKey });
    };
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); close(null); }
      else if (e.key === 'Enter' && e.target === nameInput) { e.preventDefault(); submit(); }
    };

    ok.onclick = submit;
    cancel.onclick = () => close(null);
    overlay.onclick = (e) => { if (e.target === overlay) close(null); };
    document.addEventListener('keydown', onKey);
    setTimeout(() => nameInput.focus(), 0);
  });
}

export async function handleLibraryRename() {
  try {
    const { libraries, activeId } = await _libList();
    const active = libraries.find((l) => l.id === activeId);
    const current = active?.name || '';
    const next = await showPromptDialog('Rename library:', {
      defaultValue: current,
      okLabel: 'Rename',
    });
    if (!next || next === current) return;
    await _libRename(activeId, next);
    showNotification(`Renamed to "${next}".`, 'info');
    await _loadLibraryPicker();
    _updateLensStatusChip();
  } catch (e) {
    showNotification(`Couldn't rename library: ${e?.message || e}.`, 'error');
  }
}

export function handleLibraryDelete() {
  showConfirmDialog('Delete the active library? Every document in it will be removed. This can\'t be undone.', async () => {
    try {
      const { libraries, activeId } = await _libList();
      if (!activeId) return;
      await _libDelete(activeId);
      clearLensCache();
      updateLensIndicator();
      const remaining = libraries.length - 1;
      showNotification(
        remaining === 0
          ? 'Library deleted. A fresh one will be created automatically.'
          : 'Library deleted.',
        'info',
      );
      await _loadLibraryPicker();
      const cfg = getLensConfig();
      if (cfg.backend === 'in-browser') await _loadLocalLensStats();
      _updateLensStatusChip();
    } catch (e) {
      showNotification(`Couldn't delete library: ${e?.message || e}.`, 'error');
    }
  });
}

export function handleToggleLens(checked) {
  saveLensConfig({ enabled: checked });
  _updateLensStatusChip();
  updateLensIndicator();
}

export function handleClearLensCache() {
  clearLensCache();
  showNotification('Lens cache cleared', 'info');
}

export function handleRemoveLens() {
  const cfg = getLensConfig();
  const isBrowser = cfg.backend === 'in-browser';
  const prompt = isBrowser
    ? 'Remove Knowledge Source? This also deletes every document you indexed in the browser. This can\'t be undone.'
    : 'Remove Knowledge Source? Your server URL and API key will be deleted.';
  showConfirmDialog(prompt, async () => {
    await removeLens();
    if (isBrowser) {
      try {
        const lens = await _getLocalLens();
        await lens.clear();
      } catch (e) {
        console.warn('[lens] local corpus clear failed:', e);
      }
    }
    _rerenderLensSection();
    showNotification(
      isBrowser ? 'Knowledge Source and indexed documents removed.'
      : 'Knowledge Source removed.',
      'info',
    );
  });
}

Object.assign(window, {
  getLensConfig, saveLensConfig, getLensKey, saveLensKey, removeLens,
  hasLens, queryLens, queryLensMulti, buildLensSnippet, testLensConnection, clearLensCache,
  openKnowledgeBaseModal, closeKnowledgeBaseModal,
  subscribeLensStatus, getLensStatus, isValidLensUrl,
  renderCustomLensSection, handleSaveLensConfig, handleToggleLens,
  handleClearLensCache, handleRemoveLens, updateLensIndicator,
  handleLensBackendChange,
  handleLocalLensDeleteDoc, handleLocalLensClear,
  handleLibraryActivate, handleLibraryNew, handleLibraryRename, handleLibraryDelete,
});
