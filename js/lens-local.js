// @ts-check
// js/lens-local.js — browser-side lens engine, main-thread API.
//
// Implements the same surface as js/lens.js's queryLens(query) so the chat
// callsites don't care which backend is serving them. Delegates all real
// work to js/lens-local-worker.js — model inference, OPFS I/O, embedding.
//
// Usage:
//   const lens = await openLocalLens();
//   await lens.ingest([{name: 'notes.md', text: '…'}]);
//   const { chunks } = await lens.query('vitamin D', 10);
//   const stats = await lens.getStats();
//
// Single worker per tab, lazily initialised on first call. Messages queue
// so a query issued during an ingest waits its turn rather than racing.

/** @type {Worker | null} */
let _worker = null;
/** @type {Promise<any> | null} */
let _ready = null;
/** @type {{ type: string, resolve: (value: any) => void, reject: (reason?: any) => void } | null} */
let _inflight = null;
/** @type {Set<(msg: any) => void>} */
const _progressSubs = new Set();

/** @returns {Worker} */
function ensureWorker() {
  if (_worker) return _worker;
  _worker = new Worker(new URL('./lens-local-worker.js', import.meta.url), {
    type: 'module',
  });
  _worker.addEventListener('message', (e) => {
    const msg = e.data || {};
    switch (msg.type) {
      case 'progress':
        for (const fn of _progressSubs) { try { fn(msg); } catch {} }
        // The worker pauses at the saving boundary. Notify subscribers first
        // so the UI disables Stop, then acknowledge the commit. Worker message
        // ordering ensures a Stop already clicked is processed before this.
        if (msg.stage === 'saving') {
          try { _worker?.postMessage({ type: 'commit_ingest' }); } catch {}
        }
        return;
      case 'ready':
      case 'ingest_done':
      case 'query_result':
      case 'stats_result':
      case 'delete_done':
      case 'clear_done':
      case 'libraries_list':
      case 'library_created':
      case 'library_renamed':
      case 'library_deleted':
        if (_inflight) { _inflight.resolve(msg); _inflight = null; }
        return;
      case 'error':
        if (_inflight) { _inflight.reject(new Error(msg.message)); _inflight = null; }
        return;
    }
  });
  _worker.addEventListener('error', (e) => {
    if (_inflight) {
      _inflight.reject(new Error(e.message || 'Worker error'));
      _inflight = null;
    }
  });
  return _worker;
}

// Simple serial queue — enforces one request at a time. transformers.js
// doesn't tolerate reentrant inference calls, and OPFS writes can race
// against each other, so strict serialization is the safe default.
/** @type {Promise<any>} */
let _queue = Promise.resolve();
/**
 * @param {{ type: string, [key: string]: any }} msg
 * @returns {Promise<any>}
 */
function send(msg) {
  _queue = _queue.then(() => new Promise((resolve, reject) => {
    _inflight = { type: msg.type, resolve, reject };
    ensureWorker().postMessage(msg);
  }));
  return _queue;
}

// localStorage shadow of the current corpus chunk count. hasLens() in
// lens.js is synchronous and can't await a worker round-trip, so we keep
// a cache here, written on ready / ingest / delete / clear, read by
// peekLocalCorpusSize(). Survives reloads — if the tab closes before
// a write, the worker's OPFS-backed manifest is still canonical and the
// next init will overwrite.
const CORPUS_COUNT_KEY = 'labcharts-lens-local-count';

function writeCachedCount(n) {
  try { localStorage.setItem(CORPUS_COUNT_KEY, String(Number(n) || 0)); } catch {}
}

/// Synchronous peek at the last known corpus size. Returns 0 if unknown.
/// Used by lens.js's hasLens() so an empty local corpus doesn't pretend
/// the lens is "active" — every chat query would otherwise spin the
/// worker, get back [], and silently no-op on injection.
export function peekLocalCorpusSize() {
  try { return Number(localStorage.getItem(CORPUS_COUNT_KEY)) || 0; }
  catch { return 0; }
}

export async function openLocalLens() {
  if (_ready) return _ready;
  _ready = (async () => {
    const ready = await send({ type: 'init' });
    writeCachedCount(ready.numChunks);
    return {
      // Initial state snapshot. Mutable on the wire — callers get the
      // latest via getStats / listLibraries; the `numChunks`/`numDocs`
      // here only reflect the moment of init.
      numChunks: ready.numChunks,
      numDocs: ready.numDocs,
      libraries: ready.libraries || [],
      activeId: ready.activeId,
      activeName: ready.activeName,
      activeModel: ready.activeModel,
      // Embedder-tier benchmark — used by the library-creation UI to
      // default-select a model matched to the user's hardware. Null
      // until the benchmark completes.
      embedder: ready.embedder || null,
      // Static catalog of pickable models (keyed by short id). Frozen
      // at worker-boot time; library creation reads this to render
      // the picker.
      models: ready.models || {},

      // Corpus ops — all scope to the active library.
      ingest: async (files) => {
        const r = await send({ type: 'ingest', files });
        const s = await send({ type: 'stats' });
        writeCachedCount(s.total_chunks);
        return r.stats;
      },
      // Fire-and-forget side-channel signal. Skips the serial queue so
      // it can interrupt an in-flight ingest; the worker polls the flag
      // between batches and discards the pending transaction.
      abort: () => { try { ensureWorker().postMessage({ type: 'abort' }); } catch {} },
      query: (text, topK = 10) => send({ type: 'query', text, topK }).then((r) => r.chunks),
      getStats: async () => {
        const r = await send({ type: 'stats' });
        writeCachedCount(r.total_chunks);
        return {
          total_chunks: r.total_chunks,
          documents: r.documents,
          dim: r.dim,
          model: r.model,
          backend: r.backend || 'wasm',
          ms_per_embed: r.ms_per_embed,
        };
      },
      deleteDocument: async (source) => {
        const deleted = await send({ type: 'delete', source }).then((r) => r.deleted_chunks);
        const s = await send({ type: 'stats' });
        writeCachedCount(s.total_chunks);
        return deleted;
      },
      clear: async () => {
        await send({ type: 'clear' });
        writeCachedCount(0);
      },

      // Library management — metadata ops on the library registry.
      listLibraries: async () => {
        const r = await send({ type: 'list_libraries' });
        return { libraries: r.libraries, activeId: r.activeId };
      },
      activateLibrary: async (libraryId) => {
        const r = await send({ type: 'activate_library', libraryId });
        writeCachedCount(r.numChunks);
        return {
          libraries: r.libraries,
          activeId: r.activeId,
          activeName: r.activeName,
          numChunks: r.numChunks,
          numDocs: r.numDocs,
        };
      },
      createLibrary: async (name, model) => {
        const r = await send({ type: 'create_library', name, model });
        return { id: r.id, name: r.name, model: r.model, libraries: r.libraries };
      },
      renameLibrary: async (libraryId, name) => {
        const r = await send({ type: 'rename_library', libraryId, name });
        return { id: r.id, name: r.name, libraries: r.libraries };
      },
      deleteLibrary: async (libraryId) => {
        const r = await send({ type: 'delete_library', libraryId });
        writeCachedCount(r.numChunks);
        return {
          libraries: r.libraries,
          activeId: r.activeId,
          numChunks: r.numChunks,
          numDocs: r.numDocs,
        };
      },
    };
  })();
  return _ready;
}

/// Subscribe to ingest progress events. Returns an unsubscribe function.
/// Emits { stage: 'start', total } once, then repeated
/// { stage: 'embed', index, total, source } during the embed pass, then
/// { stage: 'saving', total } at the final non-cancellable commit boundary.
export function subscribeProgress(fn) {
  _progressSubs.add(fn);
  return () => _progressSubs.delete(fn);
}

/// Drop-in for the existing queryLens() in js/lens.js. Returns the same
/// shape (or null if not configured) so chat.js doesn't need to know
/// which backend answered. sourceName reflects the ACTIVE library's name
/// so chat citations show which collection the excerpts came from.
export async function queryLensLocal(queryHint, opts = {}) {
  const hint = String(queryHint || '').trim();
  if (!hint) return null;
  const lens = await openLocalLens();
  const chunks = await lens.query(hint, opts.topK || 10);
  // Filter against a minimum similarity — mirrors the server's
  // similarity_floor env. 0.3 is permissive enough for MiniLM.
  const floor = typeof opts.floor === 'number' ? opts.floor : 0.3;
  const kept = chunks.filter((c) => c.score >= floor);
  // Re-query libraries to get the current active name (it may have been
  // renamed since init); cheap — just a metadata read in the worker.
  const { libraries, activeId } = await lens.listLibraries();
  const activeName = libraries.find((l) => l.id === activeId)?.name || 'On this device';
  return { chunks: kept, sourceName: activeName };
}
