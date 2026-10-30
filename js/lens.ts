// lens.js — Custom Knowledge Source
// User-configured RAG endpoint that backs the Interpretive Lens with retrieved chunks.
import { getErrorMessage, getErrorName } from './caught-error.js';
import { state } from './state.js';
import {
  encryptedRemoveItem,
  encryptedSetCredentialItem,
  getCachedKey,
  updateKeyCache,
} from './crypto.js';
import { hashString, isDebugMode, showNotification } from './utils.js';
import { callAssistantFeatureAI, hasAssistantFeatureProvider } from './ai-feature-routing.js';
import { isValidLensUrl as isValidLensUrlImpl } from './lens-url.js';
import { clearLensCache as clearLensCacheImpl, getLensCacheEntry, setLensCacheEntry } from './lens-cache.js';
import { updateChatHeaderModelRuntime } from './chat-runtime.js';
import { LENS_CONFIG_STORAGE_KEY, commitLensConfigValue, noteLegacyLensConfigWrite, readCommittedLensConfigRaw } from './lens-config-store.js';

import type { LensUiConfig } from './lens-knowledge-base-ui.js';
import type { LensCacheValue } from './lens-cache.js';
type LensKnowledgeBaseUi = ReturnType<typeof import('./lens-knowledge-base-ui.js').createLensKnowledgeBaseUi>;
interface LensStatus { state: string; lastChunkCount: number; lastError: string | null; sourceName: string }
interface LensQueryOptions { topK?: unknown; multiQuery?: unknown; signal?: AbortSignal | undefined; sourceRevision?: string }
interface LensFusionChunk { text?: unknown; source?: unknown }
interface LocalLensStats { documents?: unknown; total_chunks?: unknown }
type LensConnectionResult = { ok: true; chunkCount: number; firstSource: string } | { ok: false; error: string };

const CONFIG_KEY = LENS_CONFIG_STORAGE_KEY;
const SECRET_KEY = 'labcharts-lens-key';
// testProbe — per-user "canary" query used by Save + connect to verify the
// endpoint. Default is health-themed because getbased's audience typically
// indexes health research, but any user with a different domain corpus (legal
// docs, code docs, recipes…) can change it so the test result reflects their
// actual content instead of always looking like "0 passages returned".
let lastLocalLensStats: LocalLensStats | null = null;
let lastLocalLibraryName: string | null = null, libraryRefreshGeneration = 0;
let libraryNotifications: BroadcastChannel | null = null;

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
const DEFAULT_CONFIG: LensUiConfig = {
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
    const saved = JSON.parse(raw) as Partial<LensUiConfig>;
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
// Local display aliases do not change the saved corpus or its disclosure scope.
// This private identity retains all connection/settings fields for source gates.
export function getLensSourceIdentity() {
  const config = getLensConfig();
  if (config.backend !== 'in-browser') return localStorage.getItem(CONFIG_KEY) ?? '';
  const { name: _alias, ...source } = config;
  return JSON.stringify(Object.fromEntries(Object.entries(source).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)));
}
/// Rename/rebucket legacy backend values. 'desktop-engine' (Electron-only,
/// removed) migrates to 'external-server' iff the user already had the
/// Python lens URL saved — they can keep pointing at it if they kept a
/// compatible lens server running outside Electron. Otherwise fall back
/// to the in-browser engine so chat still works.
function migrateLensConfig(cfg: LensUiConfig) {
  if (cfg.backend === 'remote') {
    cfg.backend = 'external-server';
  } else if (cfg.backend === 'local-browser') {
    cfg.backend = 'in-browser';
  } else if (cfg.backend === 'desktop-engine') {
    cfg.backend = cfg.url ? 'external-server' : 'in-browser';
  }
  return cfg;
}
export function saveLensConfig(partial: Partial<LensUiConfig>) {
  return writeLensConfigMirror(partial, noteLegacyLensConfigWrite);
}
function writeLensConfigMirror(partial: Partial<LensUiConfig>, accepted?: () => void) {
  const prev = getLensConfig();
  const next = { ...prev, ...partial };
  localStorage.setItem(CONFIG_KEY, JSON.stringify(next));
  accepted?.();
  const urlChanged = partial.url !== undefined && partial.url !== prev.url;
  const topKChanged = partial.topK !== undefined && partial.topK !== prev.topK;
  const backendChanged = partial.backend !== undefined && partial.backend !== prev.backend;
  if (urlChanged || topKChanged || backendChanged) clearLensCache();
  if (backendChanged || partial.name !== undefined) lastLocalLibraryName = null;
  // A different source must not inherit the previous source's last-search
  // error. Other edits preserve useful search diagnostics in the settings UI.
  updateLensStatus(urlChanged || backendChanged
    ? { state: 'idle', lastChunkCount: 0, lastError: null, sourceName: '' }
    : {});
  return next;
}
/** Maintained UI and reviewed chat writes use the same acknowledged boundary. */
export function commitLensConfig(partial: Partial<LensUiConfig>, options: { expectedRaw?: string | null; canCommit?: () => boolean } = {}) {
  const expectedRaw = options.expectedRaw === undefined ? localStorage.getItem(CONFIG_KEY) : options.expectedRaw;
  return commitLensConfigValue(() => {
    const next = { ...getLensConfig(), ...partial };
    return { raw: JSON.stringify(next), value: next, publish: () => { writeLensConfigMirror(partial); } };
  }, { ...options, expectedRaw });
}
export function refreshLensConfigControls() { lensKnowledgeBaseUi?.refreshConfigControls(); }
export function hasKnowledgeLibraryDraft() { return lensKnowledgeBaseUi?.hasLibraryDraftOrBusy() ?? false; }
export function getLensKey() { return getCachedKey(SECRET_KEY) || ''; }
export async function saveLensKey(key: string) {
  await encryptedSetCredentialItem(SECRET_KEY, key);
  updateKeyCache(SECRET_KEY, key);
  clearLensCache();
  // External-server hasLens() gates on getLensKey(); refresh the chat header
  // immediately so first-time KB key saves surface the AI Context chip without
  // waiting for an unrelated model/config refresh.
  updateChatHeaderModelRuntime();
}
export async function removeLens() {
  const expectedRaw = localStorage.getItem(CONFIG_KEY);
  await commitLensConfigValue(() => ({ raw: null, value: undefined, publish: () => localStorage.removeItem(CONFIG_KEY) }), { expectedRaw, afterCommit: async () => {
    try { await encryptedRemoveItem(SECRET_KEY); } catch (error) { throw new Error('Knowledge Base settings were removed, but credential cleanup could not finish. Reopen settings to review it.', { cause: error }); }
    clearLensCache();
    updateLensStatus({ state: 'idle', lastChunkCount: 0, lastError: null, sourceName: '' });
  } });
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
export function isValidLensUrl(url: string) { return isValidLensUrlImpl(url); }

// ─── Query cache ──────────────────────────────────────────────
export function clearLensCache() { clearLensCacheImpl(); }

// ─── Status tracking ─────────────────────────────────────────
let _status: LensStatus = { state: 'idle', lastChunkCount: 0, lastError: null, sourceName: '' };
const _statusListeners = new Set<(status: LensStatus) => unknown>();

function updateLensStatus(partial: Partial<LensStatus>) {
  _status = { ..._status, ...partial };
  for (const fn of _statusListeners) {
    try { fn(_status); } catch (e) { if (isDebugMode()) console.warn('[Lens] listener failed:', e); }
  }
}

export function getLensStatus() { return { ..._status }; }

export function subscribeLensStatus(fn: (status: LensStatus) => unknown) {
  _statusListeners.add(fn);
  return () => _statusListeners.delete(fn);
}

// ─── Query ────────────────────────────────────────────────────
async function refreshQueryConfig(signal?: AbortSignal) {
  const active = () => { if (signal?.aborted) throw signal.reason ?? new DOMException('The request was aborted.', 'AbortError'); };
  active();
  try { await readCommittedLensConfigRaw(); active(); return true; }
  catch { active(); try { updateLensStatus({ state: 'error', lastError: 'Knowledge Base settings could not be read. Reopen settings or retry.' }); } catch { /* Optional source feedback cannot block chat. */ } return false; }
}
type LensScope = { profile: typeof state.currentProfile; root: typeof state.importedData; config: string | null };
function captureLensScope(): LensScope { return { profile: state.currentProfile, root: state.importedData, config: getLensSourceIdentity() }; }
async function lensScopeCurrent(scope: LensScope, signal?: AbortSignal) {
  if (signal?.aborted) throw signal.reason ?? new DOMException('The request was aborted.', 'AbortError');
  await readCommittedLensConfigRaw();
  if (signal?.aborted) throw signal.reason ?? new DOMException('The request was aborted.', 'AbortError');
  return scope.profile === state.currentProfile && scope.root === state.importedData && scope.config === getLensSourceIdentity();
}
export function canQueryLens() {
  const config = getLensConfig();
  return config.enabled && (config.backend === 'in-browser' ? typeof navigator !== 'undefined' && !!navigator.storage?.getDirectory && typeof Worker !== 'undefined' : hasLens());
}
export async function queryLens(queryHint: unknown, opts: LensQueryOptions = {}) {
  const owner = { profile: state.currentProfile, root: state.importedData };
  if (!await refreshQueryConfig(opts.signal) || owner.profile !== state.currentProfile || owner.root !== state.importedData || !canQueryLens()) return null;
  const cfg = getLensConfig(), scope = captureLensScope();
  const topK = typeof opts.topK === 'number' ? opts.topK : cfg.topK, hint = String(queryHint || '').trim();
  if (!hint) return null;
  if (cfg.backend === 'in-browser') {
    try {
      const { readLocalKnowledgeQuerySource } = await import('./knowledge-library-query.js');
      const before = await readLocalKnowledgeQuerySource();
      if (!before?.numChunks || opts.sourceRevision && before.revision !== opts.sourceRevision || !await lensScopeCurrent(scope, opts.signal)) return null;
      const result = await queryWithCache(`in-browser:${before.revision}`, before.name, hint, topK, async () => {
        const mod = await import('./lens-local.js');
        const response = await mod.queryLensLocal(hint, { topK, expectedLibraryId: before.libraryId, expectedSourceRevision: before.revision });
        return response?.chunks.map(chunk => ({ text: chunk.text, source: chunk.source })) ?? [];
      });
      const after = await readLocalKnowledgeQuerySource();
      if (before.revision !== after?.revision || !await lensScopeCurrent(scope, opts.signal)) {
        clearLensCache(); updateLensStatus({ state: 'error', lastChunkCount: 0, lastError: 'The Knowledge Base source changed during retrieval. Retry with its current library.', sourceName: '' }); return null;
      }
      return result;
    } catch (error) {
      if (opts.signal?.aborted) throw opts.signal.reason ?? error;
      if (getErrorName(error) === 'AbortError') throw error;
      clearLensCache(); updateLensStatus({ state: 'error', lastChunkCount: 0, lastError: 'Knowledge Base data could not be verified. Reopen Knowledge Base to review it.', sourceName: '' }); return null;
    }
  }
  const url = cfg.url, key = getLensKey(); if (!url || !key) return null;
  const result = await queryWithCache(url, cfg.name || 'Lens', hint, topK, () => _fetchRemoteChunks(url, key, hint, topK, opts));
  try { if (!await lensScopeCurrent(scope, opts.signal)) { clearLensCache(); return null; } }
  catch (error) { if (opts.signal?.aborted) throw opts.signal.reason ?? error; if (getErrorName(error) === 'AbortError') throw error; clearLensCache(); return null; }
  return result;
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
const _rewriteCache = new Map<string, string[]>(); // hash(query) → string[] of variants
const REWRITE_CACHE_MAX = 100;

const REWRITE_SYSTEM_PROMPT =
  'Rewrite the user\'s question as 3 distinct search queries that target the same intent ' +
  'using vocabulary the user\'s notes might actually contain. ' +
  'Cover at least: (a) scientific/Latin names where applicable (e.g. "Nigella Sativa" for ' +
  '"Black Seed Oil"), (b) common synonyms and alternate phrasings, (c) conceptually related ' +
  'terms a researcher would use. Output exactly 3 lines, each a complete search query, ' +
  'no numbering, no quotes, no explanation. Keep each query under 12 words.';

export async function queryLensMulti(queryHint: unknown, opts: LensQueryOptions = {}) {
  const owner = { profile: state.currentProfile, root: state.importedData };
  if (!await refreshQueryConfig(opts.signal) || owner.profile !== state.currentProfile || owner.root !== state.importedData || !canQueryLens()) return null;
  const cfg = getLensConfig(), scope = captureLensScope();
  let readSource: typeof import('./knowledge-library-query.js')['readLocalKnowledgeQuerySource'] | null = null, revision: string | null = null;
  if (cfg.backend === 'in-browser') {
    try { readSource = (await import('./knowledge-library-query.js')).readLocalKnowledgeQuerySource; const source = await readSource(); if (!source?.numChunks) return null; revision = source.revision; }
    catch { if (opts.signal?.aborted) throw opts.signal.reason; return null; }
  }
  const searchOptions = { ...opts, ...(revision ? { sourceRevision: revision } : {}) };
  const current = async () => { try { return await lensScopeCurrent(scope, opts.signal) && (!readSource || (await readSource())?.revision === revision); } catch (error) { if (opts.signal?.aborted) throw opts.signal.reason ?? error; if (getErrorName(error) === 'AbortError') throw error; return false; } };
  const finish = async <T>(result: T): Promise<T | null> => { if (!await current()) { clearLensCache(); return null; } return result; };
  if (!await current()) return null;
  const hint = String(queryHint || '').trim();
  if (!hint) return null;

  const enabled = opts.multiQuery !== undefined ? !!opts.multiQuery : cfg.multiQuery !== false;
  // Single-query path: no AI provider, or feature disabled, or short query
  // (1-2 word queries are usually proper nouns / lab names where rewriting
  // adds noise without helping).
  if (!enabled || !hasAssistantFeatureProvider() || hint.split(/\s+/).length < 3) {
    return finish(await queryLens(hint, searchOptions));
  }

  let variants: string[] = [];
  try {
    variants = await _rewriteQuery(hint, opts.signal);
  } catch (e) {
    if (getErrorName(e) === 'AbortError') throw e;
    if (isDebugMode?.()) console.warn('[lens] multi-query rewrite failed:', getErrorMessage(e, e));
  }

  // Always include the original — protects against rewrites drifting too
  // far from intent. Dedupe (case-insensitive) so an LLM that just echoes
  // the question doesn't waste a search.
  if (!await current()) return null;
  const queries = _dedupeQueries([hint, ...variants]);
  if (queries.length === 1) return finish(await queryLens(hint, searchOptions));

  const topK = typeof opts.topK === 'number' ? opts.topK : cfg.topK;
  // Each sub-query asks for the per-query topK; RRF reranks across the
  // union. We don't oversample here — the underlying queryLens() already
  // does a per-backend oversample (the in-browser worker does 3× for MMR;
  // external servers handle it server-side).
  const subResults = await Promise.all(queries.map(q =>
    queryLens(q, { ...searchOptions, topK }).catch((error) => {
      if (getErrorName(error) === 'AbortError') throw error;
      return null;
    })
  ));

  // Find a non-null envelope to inherit cache/source metadata from. If
  // every sub-query failed (network down, server 500), fall back to the
  // existing single-query behavior so the caller still sees something.
  const first = subResults.find(r => r != null);
  if (!first) return finish(await queryLens(hint, searchOptions));

  const fusedChunks = _fuseChunksRRF(subResults.map(r => r?.chunks || []), topK);
  return finish({ ...first, chunks: fusedChunks });
}

// Calls the active chat LLM with a tight system prompt asking for N
// paraphrases. Returns an array of strings (may be empty on parse
// failure). Cached for the session by query hash so repeating the same
// question doesn't re-bill the provider.
async function _rewriteQuery(hint: string, signal: AbortSignal | undefined) {
  const key = hashString(hint);
  if (_rewriteCache.has(key)) return _rewriteCache.get(key)!;

  const { text } = await callAssistantFeatureAI({
    system: REWRITE_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: hint }],
    maxTokens: MULTI_QUERY_MAX_TOKENS,
    signal,
  }) as { text?: unknown };
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

function _dedupeQueries(queries: readonly unknown[]) {
  const seen = new Set<string>();
  const out: string[] = [];
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
function _fuseChunksRRF<Chunk extends LensFusionChunk>(chunkLists: readonly (readonly (Chunk | null | undefined)[] | null | undefined)[], topK: number) {
  const scores = new Map<string, { score: number; chunk: Chunk }>(); // dedup-key → { score, chunk }
  for (const list of chunkLists) {
    if (!Array.isArray(list)) continue;
    list.forEach((chunk: Chunk | null | undefined, idx: number) => {
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
export function _fuseChunksRRFForTest(chunkLists: unknown[], topK: number) { return _fuseChunksRRF(chunkLists as Array<LensFusionChunk[] | null | undefined>, topK); }
export function _dedupeQueriesForTest(queries: readonly unknown[]) { return _dedupeQueries(queries); }

/// Shared cache + status envelope for every backend. `fetchFn(abortCtl)`
/// returns a Promise<chunks[]>; caller shapes its own errors via throw.
/// Keeping cache + status plumbing here means adding a third backend is
/// just a third fetchFn — no re-plumbing of observability per call.
async function queryWithCache(backendKey: string, sourceName: string, hint: string, topK: number, fetchFn: () => Promise<unknown>) {
  const profileId = state.currentProfile || 'default';
  const cached = getLensCacheEntry(backendKey, topK, profileId, hint);
  if (cached) {
    if (isDebugMode()) console.log('[Lens] cache hit', backendKey);
    updateLensStatus({ state: 'active', lastChunkCount: cached.chunks.length, lastError: null, sourceName });
    return cached;
  }
  try {
    const rawChunks = await fetchFn();
    const chunks = Array.isArray(rawChunks) ? rawChunks as LensCacheValue['chunks'] : [];
    const result = { chunks, sourceName };
    setLensCacheEntry(backendKey, topK, profileId, hint, result);
    updateLensStatus({ state: 'active', lastChunkCount: chunks.length, lastError: null, sourceName });
    return result;
  } catch (e) {
    // Stop means stop: callers use AbortError to end the chat generation.
    // Treating it as a retrieval timeout would make chat continue into the
    // answer request and leave a false Knowledge Base error behind.
    if (getErrorName(e) === 'AbortError') throw e;
    const msg = getErrorMessage(e) || 'unknown error';
    if (isDebugMode()) console.warn('[Lens] query failed:', backendKey, msg);
    updateLensStatus({ state: 'error', lastChunkCount: 0, lastError: msg, sourceName });
    return null;
  }
}

/// Remote-server backend — HTTP POST with bearer auth, strict transport
/// settings (no credentials, no referrer, no redirects). Returns a flat
/// array of chunks in the shared envelope shape.
async function _fetchRemoteChunks(url: string, key: string, hint: string, topK: number, opts: LensQueryOptions) {
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
      try { const err = await res.json() as { error?: unknown } | null; if (err && err.error) msg = String(err.error); } catch {}
      throw new Error(msg);
    }
    const text = await res.text();
    if (text.length > MAX_RESPONSE_BYTES) throw new Error(`Response exceeds ${MAX_RESPONSE_BYTES} bytes`);
    const data = JSON.parse(text) as { chunks?: unknown } | null;
    return Array.isArray(data && data.chunks) ? (data!.chunks as LensFusionChunk[]).slice(0, MAX_CHUNKS)
      .map((c: LensFusionChunk | null | undefined) => ({ text: String(c && c.text || '').slice(0, 4000), source: c && c.source ? String(c.source).slice(0, 200) : '' }))
      .filter((c) => c.text) : [];
  } catch (error) {
    if (getErrorName(error) === 'AbortError') {
      if (outerSignal?.aborted) throw error;
      if (timeoutCtl.signal.aborted) throw new Error('timeout');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function anySignal(...signals: Array<AbortSignal | null | undefined>) {
  const ctl = new AbortController();
  for (const s of signals) {
    if (!s) continue;
    if (s.aborted) { ctl.abort(); break; }
    s.addEventListener('abort', () => ctl.abort(), { once: true });
  }
  return ctl.signal;
}

// ─── Formatting ───────────────────────────────────────────────
export function buildLensSnippet(result: { chunks?: unknown; sourceName?: unknown } | null | undefined) {
  if (!result || !Array.isArray(result.chunks) || !result.chunks.length) return '';
  const lines = [`### Retrieved from your knowledge source (${result.sourceName}):`];
  result.chunks.forEach((c: LensFusionChunk, i: number) => {
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
export async function testLensConnection(): Promise<LensConnectionResult> {
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

// Retrieval state belongs to the unified AI Context control in the chat
// header. Keep that control current without mounting Chat when it is closed.
subscribeLensStatus(() => updateChatHeaderModelRuntime());

// ═══════════════════════════════════════════════
// KNOWLEDGE BASE SUMMARY + LAZY UI FACADE
// ═══════════════════════════════════════════════

// The dashboard summary must stay synchronous and cold-safe. The UI reports
// richer local-library stats after it loads; until then the localStorage count
// used by hasLens() is enough to distinguish configured from empty.
function getDisplayLensConfig() { const config = getLensConfig(); return config.backend === 'in-browser' && lastLocalLibraryName !== null ? { ...config, name: lastLocalLibraryName } : config; }
function ensureLibraryNotifications() {
  const browser = typeof window === 'undefined' ? undefined : window, Channel = browser?.BroadcastChannel;
  if (libraryNotifications || typeof Channel !== 'function') return;
  try { libraryNotifications = new Channel('getbased-knowledge-library'); libraryNotifications.onmessage = () => { clearLensCache(); void refreshKnowledgeLibraryMetadata().catch(() => {}); }; } catch { /* Read-time source proofs remain authoritative without notifications. */ }
}
export function notifyKnowledgeLibraryChange() { try { ensureLibraryNotifications(); libraryNotifications?.postMessage({ type: 'changed' }); } catch { /* An accepted data write does not depend on display notifications. */ } }
export async function refreshKnowledgeLibraryMetadata() {
  const generation = ++libraryRefreshGeneration, profile = state.currentProfile, root = state.importedData;
  if (hasKnowledgeLibraryDraft()) return false;
  await readCommittedLensConfigRaw();
  const configuration = getLensSourceIdentity();
  if (!getLensConfig().enabled || getLensConfig().backend !== 'in-browser') return false;
  const module = await import('./knowledge-library-metadata.js');
  if (state.currentProfile !== profile || state.importedData !== root) return false;
  const metadata = await module.readKnowledgeLibraryMetadata(), client = await import('./lens-local.js');
  await readCommittedLensConfigRaw();
  if (!metadata || generation !== libraryRefreshGeneration || state.currentProfile !== profile || state.importedData !== root || getLensSourceIdentity() !== configuration || !getLensConfig().enabled || getLensConfig().backend !== 'in-browser' || hasKnowledgeLibraryDraft()) return false;
  client.acceptLocalLibraryMetadata(metadata.stats.total_chunks); lastLocalLibraryName = metadata.activeName; recordLocalLensStats(metadata.stats);
  lensKnowledgeBaseUi?.refreshLibraryControls(metadata); updateLensStatus({ state: 'idle', lastChunkCount: 0, lastError: null, sourceName: metadata.activeName });
  return true;
}

function recordLocalLensStats(stats: LocalLensStats | null) {
  lastLocalLensStats = stats;
}

export function getLensSummary() {
  ensureLibraryNotifications();
  const cfg = getLensConfig();
  const configured = hasLens();
  const aiAvailable = hasAssistantFeatureProvider();
  const summary = {
    configured,
    backend: cfg.backend,
    enabled: !!cfg.enabled,
    multiQueryOn: configured && aiAvailable && cfg.multiQuery !== false,
    aiAvailable,
    displayName: '',
    docCount: null as number | null,
    chunkCount: null as number | null,
  };
  if (cfg.backend === 'in-browser') {
    summary.displayName = (lastLocalLibraryName ?? cfg.name ?? '').trim() || 'My Library';
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

let lensKnowledgeBaseUiPromise: Promise<LensKnowledgeBaseUi> | null = null;
let lensKnowledgeBaseUi: LensKnowledgeBaseUi | null = null;
let useLensKnowledgeBaseUiRetryUrl = false;

const lensKnowledgeBaseUiDeps = {
  defaultTestProbe: DEFAULT_TEST_PROBE,
  getLensConfig: getDisplayLensConfig,
  saveLensConfig: commitLensConfig,
  getLensKey,
  saveLensKey,
  removeLens,
  clearLensCache,
  getLensStatus,
  updateLensStatus,
  hasLens,
  isValidLensUrl,
  testLensConnection,
  recordLocalLensStats,
};

export function isLensKnowledgeBaseUiLoaded() {
  return lensKnowledgeBaseUi !== null;
}

function loadLensKnowledgeBaseUiRetryModule() {
  // @ts-expect-error TypeScript resolves only the query-free source path.
  return import('./lens-knowledge-base-ui.js?lazy-retry=1') as Promise<typeof import('./lens-knowledge-base-ui.js')>;
}

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

function runLensKnowledgeBaseUiAction(name: keyof LensKnowledgeBaseUi, args: unknown[], shouldLoad = true) {
  const run = (ui: LensKnowledgeBaseUi) => {
    const action = ui[name];
    if (typeof action !== 'function') {
      throw new Error(`Knowledge Base UI action ${String(name)} is unavailable`);
    }
    return Reflect.apply(action, ui, args) as unknown;
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

export async function openKnowledgeBaseModal(options: { source?: string; isCurrent?: () => boolean } = {}): Promise<unknown> {
  if (options.isCurrent?.() === false) return false;
  try { await readCommittedLensConfigRaw(); } catch { showNotification('Knowledge Base settings could not be read. Retry after storage is available.', 'error'); return false; }
  try {
    const ui = await loadLensKnowledgeBaseUi();
    if (options.isCurrent?.() === false) return false;
    return ui.openKnowledgeBaseModal(options);
  } catch (error) {
    if (options.isCurrent?.() === false) return false;
    console.error('[lens] Could not run openKnowledgeBaseModal:', error);
    showNotification('Knowledge Base controls could not be loaded. Try again.', 'error');
    return false;
  }
}

export function closeKnowledgeBaseModal() {
  return runLensKnowledgeBaseUiAction('closeKnowledgeBaseModal', [], false);
}

export function handleSaveLensConfig() {
  return runLensKnowledgeBaseUiAction('handleSaveLensConfig', []);
}

export function handleLensBackendChange(backend: string) {
  return runLensKnowledgeBaseUiAction('handleLensBackendChange', [backend]);
}

export function handleLocalLensDeleteDoc(source: string) {
  return runLensKnowledgeBaseUiAction('handleLocalLensDeleteDoc', [source]);
}

export function handleLocalLensClear() {
  return runLensKnowledgeBaseUiAction('handleLocalLensClear', []);
}

export function handleLibraryActivate(libraryId: string) {
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

export function handleToggleLens(checked: boolean) {
  return runLensKnowledgeBaseUiAction('handleToggleLens', [checked]);
}

export function handleClearLensCache() {
  return runLensKnowledgeBaseUiAction('handleClearLensCache', []);
}

export function handleRemoveLens() {
  return runLensKnowledgeBaseUiAction('handleRemoveLens', []);
}
