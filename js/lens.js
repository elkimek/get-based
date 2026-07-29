// @ts-check
// lens.js — Custom Knowledge Source
// User-configured RAG endpoint that backs the Interpretive Lens with retrieved chunks.
import { getErrorMessage, getErrorName } from './caught-error.js';
import { state } from './state.js';
import { getCachedKey, updateKeyCache, encryptedSetItem } from './crypto.js';
import { hashString, isDebugMode, showNotification } from './utils.js';
import { hasAIProvider, callClaudeAPI } from './api.js';
import { isValidLensUrl as isValidLensUrlImpl } from './lens-url.js';
import { clearLensCache as clearLensCacheImpl, getLensCacheEntry, setLensCacheEntry } from './lens-cache.js';
import { updateChatHeaderModelRuntime } from './chat-runtime.js';
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
//                       user runs themselves (contract documented at
//                       docs.getbased.health/developers/lens-endpoint-contract)
//                       or someone they trust.
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
// External-server RAG query timeout. 30s was too generous for a chat
// flow (user thinks the app is hung); 10s is enough headroom for slow
// HuggingFace-style local backends and surfaces offline state quickly.
const TIMEOUT_MS = 10000;
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
  updateChatHeaderModelRuntime();
  return next;
}
export function getLensKey() { return getCachedKey(SECRET_KEY) || ''; }
export async function saveLensKey(key) {
  await encryptedSetItem(SECRET_KEY, key);
  updateKeyCache(SECRET_KEY, key);
  clearLensCache();
  // External-server hasLens() gates on getLensKey(); refresh the chat header
  // immediately so first-time KB key saves surface the AI Context chip without
  // waiting for an unrelated model/config refresh.
  updateChatHeaderModelRuntime();
}
export async function removeLens() {
  localStorage.removeItem(CONFIG_KEY);
  await encryptedSetItem(SECRET_KEY, '');
  updateKeyCache(SECRET_KEY, '');
  clearLensCache();
  updateLensStatus({ state: 'idle', lastChunkCount: 0, lastError: null, sourceName: '' });
  updateChatHeaderModelRuntime();
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
export function isValidLensUrl(url) { return isValidLensUrlImpl(url); }

// ─── Query cache ──────────────────────────────────────────────
export function clearLensCache() { clearLensCacheImpl(); }

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
    if (isDebugMode?.()) console.warn('[lens] multi-query rewrite failed:', getErrorMessage(e, e));
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
  const cached = getLensCacheEntry(backendKey, topK, profileId, hint);
  if (cached) {
    if (isDebugMode()) console.log('[Lens] cache hit', backendKey);
    updateLensStatus({ state: 'active', lastChunkCount: cached.chunks.length, lastError: null, sourceName });
    return cached;
  }
  try {
    const rawChunks = await fetchFn();
    const chunks = Array.isArray(rawChunks) ? rawChunks : [];
    const result = { chunks, sourceName };
    setLensCacheEntry(backendKey, topK, profileId, hint, result);
    updateLensStatus({ state: 'active', lastChunkCount: chunks.length, lastError: null, sourceName });
    return result;
  } catch (e) {
    const msg = (e && getErrorName(e) === 'AbortError') ? 'timeout' : (getErrorMessage(e)) || 'unknown error';
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
// KNOWLEDGE BASE SUMMARY + LAZY UI FACADE
// ═══════════════════════════════════════════════

// The dashboard summary must stay synchronous and cold-safe. The UI reports
// richer local-library stats after it loads; until then the localStorage count
// used by hasLens() is enough to distinguish configured from empty.
let lastLocalLensStats = null;

function recordLocalLensStats(stats) {
  lastLocalLensStats = stats;
}

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
    if (configured && lastLocalLensStats) {
      summary.docCount = Array.isArray(lastLocalLensStats.documents)
        ? lastLocalLensStats.documents.length
        : null;
      summary.chunkCount = typeof lastLocalLensStats.total_chunks === 'number'
        ? lastLocalLensStats.total_chunks
        : null;
    }
  } else {
    let label = (cfg.name || '').trim();
    if (!label && cfg.url) {
      try { label = new URL(cfg.url).host; } catch { label = cfg.url; }
    }
    summary.displayName = label || 'Knowledge Base';
  }
  return summary;
}

/** @typedef {ReturnType<typeof import('./lens-knowledge-base-ui.js').createLensKnowledgeBaseUi>} LensKnowledgeBaseUi */
/** @type {Promise<LensKnowledgeBaseUi> | null} */
let lensKnowledgeBaseUiPromise = null;
/** @type {LensKnowledgeBaseUi | null} */
let lensKnowledgeBaseUi = null;
let useLensKnowledgeBaseUiRetryUrl = false;

const lensKnowledgeBaseUiDeps = {
  defaultTestProbe: DEFAULT_TEST_PROBE,
  getLensConfig,
  saveLensConfig,
  getLensKey,
  saveLensKey,
  removeLens,
  clearLensCache,
  getLensStatus,
  updateLensStatus,
  updateLensIndicator,
  isValidLensUrl,
  testLensConnection,
  recordLocalLensStats,
};

export function isLensKnowledgeBaseUiLoaded() {
  return lensKnowledgeBaseUi !== null;
}

function loadLensKnowledgeBaseUiRetryModule() {
  // @ts-expect-error TypeScript resolves only the query-free source path.
  return import('./lens-knowledge-base-ui.js?lazy-retry=1');
}

/** @returns {Promise<LensKnowledgeBaseUi>} */
export function loadLensKnowledgeBaseUi() {
  if (lensKnowledgeBaseUiPromise) return lensKnowledgeBaseUiPromise;
  const load = useLensKnowledgeBaseUiRetryUrl
    ? loadLensKnowledgeBaseUiRetryModule()
    : import('./lens-knowledge-base-ui.js');
  const promise = load
    .then(module => {
      const ui = module.createLensKnowledgeBaseUi(lensKnowledgeBaseUiDeps);
      lensKnowledgeBaseUi = ui;
      return ui;
    })
    .catch(err => {
      lensKnowledgeBaseUiPromise = null;
      lensKnowledgeBaseUi = null;
      useLensKnowledgeBaseUiRetryUrl = true;
      throw err;
    });
  lensKnowledgeBaseUiPromise = promise;
  return promise;
}

/**
 * @param {keyof LensKnowledgeBaseUi} name
 * @param {any[]} args
 * @param {boolean} [shouldLoad]
 */
function runLensKnowledgeBaseUiAction(name, args, shouldLoad = true) {
  const run = (/** @type {LensKnowledgeBaseUi} */ ui) => {
    const action = ui[name];
    if (typeof action !== 'function') {
      throw new Error(`Knowledge Base UI action ${String(name)} is unavailable`);
    }
    return Reflect.apply(action, ui, args);
  };
  if (!lensKnowledgeBaseUi && !shouldLoad) return undefined;
  try {
    if (lensKnowledgeBaseUi) return run(lensKnowledgeBaseUi);
    return loadLensKnowledgeBaseUi()
      .then(run)
      .catch(err => {
        console.error(`[lens] Could not run ${String(name)}:`, err);
        showNotification('Knowledge Base controls could not be loaded. Try again.', 'error');
        return false;
      });
  } catch (err) {
    console.error(`[lens] Could not run ${String(name)}:`, err);
    if (shouldLoad) showNotification('Knowledge Base controls could not be loaded. Try again.', 'error');
    return shouldLoad ? false : undefined;
  }
}

export function renderCustomLensSection() {
  if (lensKnowledgeBaseUi) return lensKnowledgeBaseUi.renderCustomLensSection();
  void loadLensKnowledgeBaseUi()
    .then(ui => {
      const section = document.getElementById('custom-lens-section');
      if (section?.querySelector('[data-lens-ui-loading]')) {
        section.innerHTML = ui.renderCustomLensSection();
      }
    })
    .catch(() => {});
  return '<div class="settings-loading-placeholder" data-lens-ui-loading>Loading Knowledge Base controls…</div>';
}

export function openKnowledgeBaseModal() {
  return runLensKnowledgeBaseUiAction('openKnowledgeBaseModal', []);
}

export function closeKnowledgeBaseModal() {
  return runLensKnowledgeBaseUiAction('closeKnowledgeBaseModal', [], false);
}

export function handleSaveLensConfig() {
  return runLensKnowledgeBaseUiAction('handleSaveLensConfig', []);
}

export function handleLensBackendChange(backend) {
  return runLensKnowledgeBaseUiAction('handleLensBackendChange', [backend]);
}

export function handleLocalLensDeleteDoc(source) {
  return runLensKnowledgeBaseUiAction('handleLocalLensDeleteDoc', [source]);
}

export function handleLocalLensClear() {
  return runLensKnowledgeBaseUiAction('handleLocalLensClear', []);
}

export function handleLibraryActivate(libraryId) {
  return runLensKnowledgeBaseUiAction('handleLibraryActivate', [libraryId]);
}

export function handleLibraryNew() {
  return runLensKnowledgeBaseUiAction('handleLibraryNew', []);
}

export function handleLibraryRename() {
  return runLensKnowledgeBaseUiAction('handleLibraryRename', []);
}

export function handleLibraryDelete() {
  return runLensKnowledgeBaseUiAction('handleLibraryDelete', []);
}

export function handleToggleLens(checked) {
  return runLensKnowledgeBaseUiAction('handleToggleLens', [checked]);
}

export function handleClearLensCache() {
  return runLensKnowledgeBaseUiAction('handleClearLensCache', []);
}

export function handleRemoveLens() {
  return runLensKnowledgeBaseUiAction('handleRemoveLens', []);
}
