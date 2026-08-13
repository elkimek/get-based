// @ts-check
// js/lens-local-worker.js — browser-side lens engine (no Python, no server).
//
// Runs in a module Web Worker. Owns all OPFS I/O and all calls into
// transformers.js so the main thread stays responsive while a multi-minute
// ingest pass is running.
//
// Layout on disk (OPFS, origin-scoped, persistent):
//   /lens-local/_libraries.json — {activeId, libraries:[{id,name,createdAt,model}]}
//   /lens-local/<libraryId>/{manifest,vectors,chunks}.{a,b}.{json,bin}
//
// Persistence strategy: load the full corpus into RAM on first query for this
// worker session, then serve every query from memory (cosine over 10k chunks
// is 10 ms — linear scan is fine up to ~100k). Vectors re-dehydrate from
// OPFS on worker restart.
//
// Message protocol (main ↔ worker):
//   IN:  {type: 'init'}                   → loads model, opens OPFS
//        {type: 'ingest', files: [{name, text}]}
//                                         → chunks + embeds + replaces by source
//        {type: 'commit_ingest'}           → acknowledges the saving boundary
//        {type: 'query', text, topK}      → returns top-K matches
//        {type: 'stats'}                  → per-source counts
//        {type: 'delete', source}         → drops one doc
//        {type: 'clear'}                  → wipes the store
//   OUT: {type: 'ready'}
//        {type: 'progress', stage, index, total, source?}
//        {type: 'ingest_done', stats}
//        {type: 'query_result', chunks: [{text, source, score}]}
//        {type: 'stats_result', ...}
//        {type: 'error', message}
//
// Each library locks one model from lens-local-embedder-config.js. MiniLM
// remains the compatibility default; new libraries can choose balanced,
// multilingual, or higher-recall profiles. Browser caches weights after use.

import { getErrorMessage } from './caught-error.js';
import { BENCHMARK_TEXTS, DEFAULT_MODEL_KEY, MODELS, createMockEmbedding } from './lens-local-embedder-config.js';
import { buildLocalIngestTransaction } from './lens-local-ingest.js';
import { LensLocalLibraryRegistry } from './lens-local-library-registry.js';
import { mmrSelect } from './lens-local-utils.js';
import {
  OPFS_SUBDIR,
  readLatestCorpusSnapshot,
  writeBinaryTo,
  writeCorpusSnapshot,
} from './lens-local-store.js';
/// Current model driving the embedder. These are mutable because the
/// active library dictates which model gets loaded — switching library
/// can trigger a model swap. See _applyModelSpec().
let _modelKey = DEFAULT_MODEL_KEY;
let MODEL_ID = MODELS[DEFAULT_MODEL_KEY].id;
let DIM = MODELS[DEFAULT_MODEL_KEY].dim;

function _applyModelSpec(modelKey) {
  const spec = MODELS[modelKey] || MODELS[DEFAULT_MODEL_KEY];
  _modelKey = MODELS[modelKey] ? modelKey : DEFAULT_MODEL_KEY;
  MODEL_ID = spec.id;
  DIM = spec.dim;
}

// Retrieval tunables
const MMR_LAMBDA = 0.5;            // 0 = max diversity, 1 = pure relevance
const MMR_OVERSAMPLE_FACTOR = 3;   // multiplier on topK before MMR re-rank
const MMR_OVERSAMPLE_FLOOR = 30;   // never oversample below this many chunks

let _embedder = null;
let _embedderBackend = 'wasm';  // 'webgpu' | 'wasm' — whichever transformers.js actually booted
let _benchmarkVerdict = null;   // Latest benchmark result for the currently-loaded model; null until first load
const _benchmarkCache = new Map(); // model/backend → verdict; avoids repeating warmups when switching libraries
let _transformersModule = null; // Lazy-cached transformers.js module so library swaps don't re-import
let _abortRequested = false;    // set by 'abort' message, checked between embeds in handleIngest
let _rootDir = null;            // OPFS FileSystemDirectoryHandle at /lens-local/
let _libraryRegistry = null;    // Active library metadata + revisioned registry persistence
let _corpusSlot = null;         // crash-safe corpus generation slot ('a' | 'b' | legacy null)
let _corpusRevision = 0;
/** @type {(() => void) | null} */
let _ingestCommitResolve = null;
let _failNextCorpusPersistForTest = false;

// MessageChannel-based macrotask yield. Between embed calls the worker
// would otherwise only yield to the microtask queue (a chain of awaits
// on fast-resolving promises), which starves the message queue — incoming
// 'abort' messages never dispatch and cancel becomes a no-op. Posting to a
// MessageChannel port gives a real task boundary without setTimeout's 4ms
// clamp, so the queue gets pumped between every chunk at near-zero cost.
const _yieldChannel = new MessageChannel();
/** @returns {Promise<void>} */
function macroYield() {
  return new Promise((resolve) => {
    _yieldChannel.port1.onmessage = () => resolve();
    _yieldChannel.port2.postMessage(null);
  });
}
let _manifest = null;           // Active library's manifest (loaded on activate)
let _vectors = null;            // Active library's packed Float32Array
let _chunks = null;             // Active library's [{source, text}]

// ── Message dispatch ───────────────────────────────────────────────
//
// Every handler (ingest, query, stats, delete, clear) scopes to the ACTIVE
// library. Library-management handlers (activate, create, rename, delete,
// list) delegate registry metadata + OPFS subdirectories to their owner.

self.addEventListener('message', async (e) => {
  // Same-origin guard. Browsers only deliver messages to a Worker from
  // its spawning origin, but the codepaths here (file ingest, library
  // delete) are destructive enough that an explicit check is cheap
  // defense-in-depth against future regressions / weird embed contexts.
  // Same-origin postMessage to a dedicated Worker yields e.origin === ''.
  if (e.origin && e.origin !== self.location.origin) return;
  const msg = e.data || {};
  try {
    switch (msg.type) {
      case 'init':              return await handleInit();
      case 'ingest':            return await handleIngest(msg.files || []);
      case 'query':             return await handleQuery(msg.text, msg.topK || 10);
      case 'stats':             return handleStats();
      case 'delete':            return await handleDelete(msg.source);
      case 'clear':             return await handleClear();
      case 'list_libraries':    return handleListLibraries();
      case 'activate_library':  return await handleActivateLibrary(msg.libraryId);
      case 'create_library':    return await handleCreateLibrary(msg.name, msg.model);
      case 'rename_library':    return await handleRenameLibrary(msg.libraryId, msg.name);
      case 'delete_library':    return await handleDeleteLibrary(msg.libraryId);
      case 'commit_ingest': {
        const resolve = _ingestCommitResolve;
        _ingestCommitResolve = null;
        resolve?.();
        return;
      }
      case 'test_fail_next_registry_persist':
        if (isMockMode()) {
          _libraryRegistry.failNextPersist();
          self.postMessage({ type: 'test_ack' });
          return;
        }
        throw new Error(`Unknown message type: ${msg.type}`);
      case 'test_fail_next_corpus_persist':
        if (isMockMode()) {
          _failNextCorpusPersistForTest = true;
          self.postMessage({ type: 'test_ack' });
          return;
        }
        throw new Error(`Unknown message type: ${msg.type}`);
      // Abort is a side-channel signal — skips the serial queue on the
      // main thread so it can interrupt an in-flight ingest. handleIngest
      // polls _abortRequested between batches. Ingest is transactional:
      // stopping discards the pending batch and leaves the library intact.
      case 'abort':             _abortRequested = true; return;
      default:                  throw new Error(`Unknown message type: ${msg.type}`);
    }
  } catch (err) {
    self.postMessage({ type: 'error', message: getErrorMessage(err, String(err)) });
  }
});

function isMockMode() {
  return new URLSearchParams(self.location.search || '').has('mock');
}

// ── Init: load model + open OPFS ───────────────────────────────────

async function handleInit() {
  // Test hook — `?mock=1` on the worker URL skips the real transformers.js
  // load + WebGPU probe. Uses a deterministic text-hash stub embedder so
  // tests/test-lens-local-worker.js can exercise the full message protocol
  // + OPFS roundtrip in ~50 ms without the ~15s model download. Production
  // path is unchanged.
  const params = new URLSearchParams(self.location.search || '');
  if (params.has('mock')) {
    _embedder = (text) => createMockEmbedding(text, DIM);
    console.log('[lens-local] mock embedder active (test mode)');
    if (params.has('benchmark')) {
      try {
        _benchmarkVerdict = await _benchmarkEmbedder();
        /** @type {any} */ (self)._lensLocalBenchmark = _benchmarkVerdict;
      } catch (err) {
        console.warn('[lens-local] mock benchmark failed:', getErrorMessage(err, err));
        _benchmarkVerdict = null;
      }
    }
    await openOpfs();
    await loadCorpusIntoMemory();
    self.postMessage(readyPayload());
    return;
  }

  // Library registry must load BEFORE the embedder — the active library's
  // model field determines which model we boot. Previously this ran in
  // the opposite order and MODEL_ID was a compile-time constant; after
  // step 2 (per-library models) the active library picks the model.
  await openOpfs();

  const modelKey = _libraryModelKey(_libraryRegistry.activeId);
  await _loadEmbedder(modelKey);

  // Corpus load AFTER embedder so MODEL_ID + DIM reflect the active
  // library's configured model.
  await loadCorpusIntoMemory();
  self.postMessage(readyPayload());
}

/// Lazy-cache the transformers.js module. Library swaps that trigger a
/// model reload shouldn't re-import the ~2 MB bundle.
async function _ensureTransformers() {
  if (_transformersModule) return _transformersModule;
  // Library loads from jsdelivr — the npm-dist bundle has bare module
  // specifiers (`onnxruntime-web/webgpu` etc.) that browsers can't resolve
  // without a bundler, and jsdelivr auto-rewrites them. Pin @4.1.0 for
  // reproducibility. Browsers cache the bundle indefinitely after first
  // load; SW can cache too.
  //
  // No Subresource Integrity on this import: dynamic `import()` has no
  // integrity attribute (the spec intentionally omits it — SRI belongs
  // on <script> / <link>). The durable fix is to vendor the resolved
  // ESM locally via a bundler pass at vendor-update time; tracked as
  // phase 2c in project_browser_local_lens.md. Until then, trust is
  // rooted in jsdelivr + our CSP's cdn.jsdelivr.net allowlist.
  const transformersUrl = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.1.0';
  const mod = await import(transformersUrl);
  // ORT picks one of 4 WASM variants at runtime (plain / asyncify / jsep /
  // jspi) based on what the browser supports — SharedArrayBuffer gates
  // threaded, cross-origin isolation headers gate jsep, etc. Vendoring
  // all four is ~75 MB; picking one is fragile because the "right" one
  // varies per browser + per deployment (COOP/COEP headers matter). For
  // now ORT fetches from its default (bundled CDN reference) which covers
  // every variant. Full vendor requires a bundler pass, tracked as phase
  // 2c — see project_browser_local_lens.md.
  // Running inside a Worker. ORT's default spawns a NESTED worker for
  // inference which is 10-15× slower than in-worker execution.
  // https://onnxruntime.ai/docs/tutorials/web/env-flags.html#envwasmproxy
  mod.env.backends.onnx.wasm.proxy = false;
  _transformersModule = mod;
  return mod;
}

/// Load (or reload) the embedder for the given model key. Handles
/// WebGPU detection with diagnostic logging, slow-shader-compile
/// fallback, and the tier-benchmark pass. Updates module-level
/// MODEL_ID / DIM / _embedder / _embedderBackend / _benchmarkVerdict.
async function _loadEmbedder(modelKey) {
  _applyModelSpec(modelKey);
  console.log(`[lens-local] Loading embedder: ${_modelKey} (${MODEL_ID}, ${DIM}d)`);
  const { pipeline } = await _ensureTransformers();

  // Try WebGPU first. On a Polaris AMD box + Intel iGPU, WebGPU through
  // ANGLE typically runs 3-10× faster than WASM for transformer
  // inference. Falls back to WASM if the adapter isn't available or the
  // pipeline init throws (some browsers expose navigator.gpu but fail at
  // shader compile for MiniLM's ops).
  let device = 'wasm';
  // Emit a diag line on every branch so users reporting "WebGPU didn't
  // fire on my system" can tell us which early-exit they hit. Without
  // this the silent-fall-to-WASM path is indistinguishable from "the
  // worker picked WASM and never thought about it", which has come up
  // during tier-benchmark calibration.
  if (typeof navigator === 'undefined' || !navigator.gpu) {
    console.log('[lens-local] navigator.gpu unavailable in this Worker context — WASM only');
  } else {
    try {
      const adapter = await navigator.gpu.requestAdapter();
      if (adapter) {
        device = 'webgpu';
      } else {
        console.log('[lens-local] navigator.gpu.requestAdapter() returned null — WASM only');
      }
    } catch (e) {
      console.log('[lens-local] navigator.gpu.requestAdapter() threw — WASM only:', getErrorMessage(e, e));
    }
  }
  try {
    _embedder = await pipeline('feature-extraction', MODEL_ID, { device });
    _embedderBackend = device;
    console.log(`[lens-local] Embedder ready on ${device}`);
  } catch (e) {
    if (device !== 'wasm') {
      console.warn(`[lens-local] ${device} init failed, falling back to WASM:`, getErrorMessage(e, e));
      _embedder = await pipeline('feature-extraction', MODEL_ID);
      _embedderBackend = 'wasm';
      device = 'wasm';
      console.log('[lens-local] Embedder ready on wasm (fallback)');
    } else {
      throw e;
    }
  }

  // Sanity-check WebGPU: some driver combos (AMD Polaris + unvalidated
  // Mesa, certain Linux/Chrome builds with enable-unsafe-webgpu) expose
  // a working adapter, init the pipeline without errors, then embed at
  // <1 token/s because shader compile falls into a slow path. A single
  // warmup embed catches this — healthy WebGPU does one in ~20-50 ms;
  // broken paths take seconds. Threshold 600 ms is generous; anything
  // above that is a broken backend, not just a cold cache.
  if (device === 'webgpu') {
    const t0 = performance.now();
    try {
      await _embedder('warmup', { pooling: 'mean', normalize: true });
      const dt = performance.now() - t0;
      if (dt > 600) {
        console.warn(`[lens-local] WebGPU pathologically slow (${dt.toFixed(0)} ms/embed), falling back to WASM`);
        _embedder = await pipeline('feature-extraction', MODEL_ID, { device: 'wasm' });
        _embedderBackend = 'wasm';
      } else {
        console.log(`[lens-local] WebGPU warmup ${dt.toFixed(0)} ms — backend confirmed`);
      }
    } catch (err) {
      console.warn('[lens-local] WebGPU warmup threw, falling back to WASM:', getErrorMessage(err, err));
      _embedder = await pipeline('feature-extraction', MODEL_ID, { device: 'wasm' });
      _embedderBackend = 'wasm';
    }
  }

  // Embedding-tier benchmark — measures ms/embed on the final (post-
  // fallback) backend with real-chunk-sized text. Verdict gets stashed
  // at _benchmarkVerdict and propagated through readyPayload so the
  // main thread can surface a tier recommendation in the library-
  // creation UI (step 3).
  try {
    const benchmarkKey = `${_modelKey}:${_embedderBackend}`;
    _benchmarkVerdict = _benchmarkCache.get(benchmarkKey) || await _benchmarkEmbedder();
    _benchmarkCache.set(benchmarkKey, _benchmarkVerdict);
    console.log(
      `[lens-local] Embedding benchmark: ${_modelKey} on ${_embedderBackend}, ` +
      `${_benchmarkVerdict.msPerEmbed.toFixed(0)} ms/embed median → tier ${_benchmarkVerdict.tier} (${_benchmarkVerdict.tierLabel})`
    );
    /** @type {any} */ (self)._lensLocalBenchmark = _benchmarkVerdict; // devtools inspection
  } catch (err) {
    console.warn('[lens-local] benchmark failed:', getErrorMessage(err, err));
    _benchmarkVerdict = null;
  }
}

// Three synthetic chunks at ~500-600 char lengths are enough for a stable
// median after pipeline initialization and cut repeat model-start latency.
// The full corpus remains in the config so future calibration can rotate it.
// text we actually feed the embedder during ingest (see `chunk()` in
// lens-local-utils.js; target_size defaults to 512 tokens ≈ 2-2.5 KB
// of prose but real ingested chunks land around this character range).
// Mixing topics keeps any per-text caching honest.
/// Measure ms/embed on the currently-loaded embedder. Runs 3 embeds on
/// varied realistic text, returns the median. Thresholds pick a tier
/// target for per-library model selection (step 1 spike — values are
/// initial guesses to be calibrated against real user hardware).
async function _benchmarkEmbedder() {
  const timings = [];
  for (const text of BENCHMARK_TEXTS.slice(0, 3)) {
    const t0 = performance.now();
    await _embedder(text, { pooling: 'mean', normalize: true });
    timings.push(performance.now() - t0);
  }
  const sorted = timings.slice().sort((a, b) => a - b);
  const msPerEmbed = sorted[Math.floor(sorted.length / 2)];
  let tier, tierLabel;
  // Tiers describe the measured current model. Recommendation policy lives
  // in lens-library.js and deliberately caps CPU/WASM auto-selection at the
  // balanced profile; MiniLM speed is not a reliable estimate for BGE-base.
  if (msPerEmbed < 50) {
    tier = 3;
    tierLabel = 'recent HW — larger model viable';
  } else if (msPerEmbed < 150) {
    tier = 2;
    tierLabel = 'modern HW — small/medium model';
  } else {
    tier = 1;
    tierLabel = 'slower HW — small model only';
  }
  return {
    backend: _embedderBackend,
    msPerEmbed,
    timings,
    tier,
    tierLabel,
  };
}

/// Shape of the `ready` message + the response from any library-management
/// op. Keeps libraries + active context in one place — every state change
/// (activate, ingest, delete, clear) re-emits this so the renderer always
/// has the current picture without re-polling.
function readyPayload() {
  const libraries = _libraryRegistry.libraries;
  const activeId = _libraryRegistry.activeId;
  return {
    type: 'ready',
    libraries: libraries.slice(),
    activeId,
    activeName: libraries.find((l) => l.id === activeId)?.name || '',
    // activeModel = the LIBRARY's configured model, not the loaded
    // embedder's. In normal operation these are the same (handleInit
    // and handleActivateLibrary sync them via _loadEmbedder), but on
    // any code path that activates without reloading (mock-mode tests,
    // future "lazy swap" optimizations) the library's registry field
    // is the source of truth for the UI.
    activeModel: _libraryModelKey(activeId),
    numChunks: _manifest?.numChunks || 0,
    numDocs: _manifest?.docs?.length || 0,
    // Embedder metadata so the main thread can surface "recommended for
    // your device" hints in the library-creation UI without running a
    // second benchmark. Null if benchmark hasn't completed yet or failed.
    embedder: _benchmarkVerdict
      ? {
          backend: _embedderBackend,
          modelKey: _modelKey,
          modelId: MODEL_ID,
          dim: DIM,
          msPerEmbed: _benchmarkVerdict.msPerEmbed,
          tier: _benchmarkVerdict.tier,
          tierLabel: _benchmarkVerdict.tierLabel,
        }
      : null,
    // Catalog is static (compile-time) but we pass it through so the
    // renderer doesn't need to duplicate the model list.
    models: MODELS,
  };
}

/// Look up a library's configured model key with a back-compat fallback
/// to DEFAULT_MODEL_KEY. Accepts an id or a library object.
function _libraryModelKey(libOrId) {
  return _libraryRegistry.modelKey(libOrId);
}

async function openOpfs() {
  const root = await navigator.storage.getDirectory();
  _rootDir = await root.getDirectoryHandle(OPFS_SUBDIR, { create: true });
  _libraryRegistry = new LensLocalLibraryRegistry(_rootDir, MODELS, DEFAULT_MODEL_KEY);

  // Request persistent storage so the browser doesn't evict our data under
  // disk pressure. Silent if already granted; origins on localhost usually
  // get auto-granted. Best-effort — if the request fails we still proceed.
  try { await navigator.storage.persist?.(); } catch {}

  // Load or initialise the library registry. The registry lives at
  // /lens-local/_libraries.json and is the source of truth for which
  // libraries exist + which is active. Each library's data lives in two
  // checksummed generations under /lens-local/<libraryId>/.
  await _libraryRegistry.loadOrMigrate();
  console.log('[lens-local] Libraries:', _libraryRegistry.libraries.map((l) => `${l.id}=${l.name}`).join(', '),
              'active:', _libraryRegistry.activeId);

}

async function loadCorpusIntoMemory() {
  const dir = await activeLibraryDir();
  const snapshot = await readLatestCorpusSnapshot(dir, { dim: DIM, modelId: MODEL_ID });
  if (snapshot) {
    _corpusSlot = snapshot.slot;
    _corpusRevision = snapshot.revision;
    _manifest = snapshot.state.manifest;
    _vectors = snapshot.state.vectors;
    _chunks = snapshot.state.chunks;
    return;
  }
  _corpusSlot = null;
  _corpusRevision = 0;
  _manifest = emptyManifest();
  _vectors = new Float32Array(0);
  _chunks = [];
}

/// Resolve the active library's directory handle. Creates if missing
/// (shouldn't happen after init, but defensive against orphaned registry
/// entries from a partial delete).
async function activeLibraryDir() {
  if (!_libraryRegistry.activeId) throw new Error('No active library');
  return _rootDir.getDirectoryHandle(_libraryRegistry.activeId, { create: true });
}

// ── Ingest ────────────────────────────────────────────────────────

async function handleIngest(files) {
  if (!_embedder) throw new Error('Worker not initialized');
  _abortRequested = false;
  const transaction = await buildLocalIngestTransaction({
    files,
    embedder: _embedder,
    backend: _embedderBackend,
    dim: DIM,
    current: { vectors: _vectors, chunks: _chunks, manifest: _manifest },
    postProgress: (progress) => self.postMessage({ type: 'progress', ...progress }),
    yieldTask: macroYield,
    isAbortRequested: () => _abortRequested,
  });

  if (transaction.nextState) {
    // Establish a message-queue boundary with the main thread: it disables
    // Stop and acknowledges commit_ingest only after progress subscribers
    // have processed the saving state. Any earlier Stop message is ordered
    // before that acknowledgement and is observed here.
    /** @type {Promise<void>} */
    const commitReady = new Promise((resolve) => { _ingestCommitResolve = () => resolve(); });
    self.postMessage({ type: 'progress', stage: 'saving', total: transaction.stats.chunks_planned });
    await commitReady;
    if (_abortRequested) {
      _abortRequested = false;
      self.postMessage({
        type: 'ingest_done',
        stats: {
          ...transaction.stats,
          documents_indexed: 0,
          chunks_indexed: 0,
          replaced_documents: 0,
          cancelled: true,
        },
      });
      return;
    }
    const committed = await persistCorpusState(transaction.nextState);
    _vectors = committed.vectors;
    _chunks = committed.chunks;
    _manifest = committed.manifest;
  }
  _abortRequested = false;
  self.postMessage({ type: 'ingest_done', stats: transaction.stats });
}

// ── Query ─────────────────────────────────────────────────────────

async function handleQuery(text, topK) {
  if (!_embedder) throw new Error('Worker not initialized');
  if (_manifest.numChunks === 0) {
    self.postMessage({ type: 'query_result', chunks: [] });
    return;
  }

  const qout = await _embedder(text, { pooling: 'mean', normalize: true });
  const q = qout.data;

  // Oversample by 3× for MMR: naive top-K by cosine alone concentrates
  // matches on whichever token dominates the query's embedding (seen in
  // "vitamin D + circadian + cold" returning 2x vit-D chunks instead of
  // mixing across all three topics). MMR picks the highest-scoring
  // candidate first, then each subsequent pick penalizes similarity to
  // already-picked chunks — spreads results across topics at a small
  // relevance cost.
  const OVERSAMPLE = Math.max(topK * MMR_OVERSAMPLE_FACTOR, MMR_OVERSAMPLE_FLOOR);
  const cap = Math.min(OVERSAMPLE, _manifest.numChunks);
  const candHeap = []; // sorted ascending so head is min
  for (let i = 0; i < _manifest.numChunks; i++) {
    const base = i * DIM;
    let s = 0;
    for (let j = 0; j < DIM; j++) s += q[j] * _vectors[base + j];
    if (candHeap.length < cap) {
      candHeap.push({ i, score: s });
      candHeap.sort((a, b) => a.score - b.score);
    } else if (s > candHeap[0].score) {
      candHeap[0] = { i, score: s };
      candHeap.sort((a, b) => a.score - b.score);
    }
  }
  const candidates = candHeap.reverse(); // descending by score
  // getVec returns a live subarray view into the packed store — no copy
  // per MMR iteration, hot path stays cheap.
  const chosen = mmrSelect(candidates, topK, MMR_LAMBDA,
    (i) => _vectors.subarray(i * DIM, (i + 1) * DIM));
  const result = chosen.map((r) => ({
    text: _chunks[r.i].text,
    source: _chunks[r.i].source,
    score: r.score,
  }));
  self.postMessage({ type: 'query_result', chunks: result });
}

// ── Stats / Delete / Clear ─────────────────────────────────────────

function handleStats() {
  self.postMessage({
    type: 'stats_result',
    total_chunks: _manifest.numChunks,
    documents: _manifest.docs.map((doc) => ({ source: doc.source, chunks: doc.chunks })),
    dim: DIM,
    model: MODEL_ID,
    backend: _embedderBackend,
    ms_per_embed: _benchmarkVerdict?.msPerEmbed ?? null,
  });
}

async function handleDelete(source) {
  if (!_manifest || _manifest.numChunks === 0) {
    self.postMessage({ type: 'delete_done', deleted_chunks: 0 });
    return;
  }
  // Rebuild vectors + chunks, skipping rows that match the source. Simpler
  // than a delete-mask + compact — a big store takes ~ms/1k chunks.
  const keep = new Uint8Array(_manifest.numChunks);
  let deleted = 0;
  for (let i = 0; i < _chunks.length; i++) {
    if (_chunks[i].source === source) deleted += 1;
    else keep[i] = 1;
  }
  if (deleted === 0) {
    self.postMessage({ type: 'delete_done', deleted_chunks: 0 });
    return;
  }
  const newCount = _manifest.numChunks - deleted;
  const newVec = new Float32Array(newCount * DIM);
  const newChunks = new Array(newCount);
  let w = 0;
  for (let i = 0; i < _manifest.numChunks; i++) {
    if (!keep[i]) continue;
    newVec.set(_vectors.subarray(i * DIM, (i + 1) * DIM), w * DIM);
    newChunks[w] = _chunks[i];
    w += 1;
  }
  const committed = await persistCorpusState({
    vectors: newVec,
    chunks: newChunks,
    manifest: {
      ..._manifest,
      numChunks: newCount,
      docs: _manifest.docs.filter((d) => d.source !== source),
    },
  });
  _vectors = committed.vectors;
  _chunks = committed.chunks;
  _manifest = committed.manifest;
  self.postMessage({ type: 'delete_done', deleted_chunks: deleted });
}

async function handleClear() {
  const committed = await persistCorpusState({
    vectors: new Float32Array(0),
    chunks: [],
    manifest: emptyManifest(),
  });
  _vectors = committed.vectors;
  _chunks = committed.chunks;
  _manifest = committed.manifest;
  self.postMessage({ type: 'clear_done' });
}

// ── Library management ──────────────────────────────────────────

function handleListLibraries() {
  self.postMessage({
    type: 'libraries_list',
    libraries: _libraryRegistry.libraries.slice(),
    activeId: _libraryRegistry.activeId,
  });
}

/// Swap the active library. Loads the new library's manifest + corpus
/// into memory; the previous library's memory is released for GC.
/// If the new library uses a different embedding model than the
/// currently-loaded one, reload the embedder first — 1-2s on a
/// browser-cached model, longer if it needs to be downloaded.
async function handleActivateLibrary(libraryId) {
  const changed = await _libraryRegistry.activate(libraryId);
  if (!changed) {
    self.postMessage(readyPayload());
    return;
  }

  await ensureActiveLibraryEmbedderLoaded();

  await loadCorpusIntoMemory();
  self.postMessage(readyPayload());
}

async function ensureActiveLibraryEmbedderLoaded() {
  // Reload embedder if the active library uses a different model.
  // Skip for mock mode (tests pin _embedder to mockEmbedder and don't
  // want it replaced by a jsdelivr import).
  const targetModelKey = _libraryModelKey(_libraryRegistry.activeId);
  if (targetModelKey !== _modelKey && !isMockMode()) {
    console.log(`[lens-local] Library model change: ${_modelKey} → ${targetModelKey}, reloading embedder`);
    await _loadEmbedder(targetModelKey);
  }
}

/// Create a new library with the given display name and (optional)
/// embedding model. Generates a random id for the directory —
/// decoupled from the user-facing name so renames don't require moving
/// data. Model is locked at creation time: existing chunks are embedded
/// with whatever the library was created under, and switching model
/// would require re-embedding every document. The UI (step 3) offers
/// the choice at this gate.
async function handleCreateLibrary(name, modelKey) {
  const library = await _libraryRegistry.create(name, modelKey);
  self.postMessage({
    type: 'library_created',
    id: library.id,
    name: library.name,
    model: library.model,
    libraries: _libraryRegistry.libraries.slice(),
    activeId: _libraryRegistry.activeId,
  });
}

async function handleRenameLibrary(libraryId, name) {
  const nextName = await _libraryRegistry.rename(libraryId, name);
  self.postMessage({
    type: 'library_renamed',
    id: libraryId, name: nextName,
    libraries: _libraryRegistry.libraries.slice(),
    activeId: _libraryRegistry.activeId,
  });
}

/// Remove a library's on-disk data + registry entry. If the active
/// library is deleted, switch to the first remaining library. If this
/// would leave zero libraries, auto-create a default so the UI always
/// has something to show.
async function handleDeleteLibrary(libraryId) {
  const { wasActive } = await _libraryRegistry.delete(libraryId);
  if (wasActive || _libraryRegistry.libraries.length === 1) {
    await ensureActiveLibraryEmbedderLoaded();
    await loadCorpusIntoMemory();
  }
  self.postMessage({
    type: 'library_deleted',
    id: libraryId,
    libraries: _libraryRegistry.libraries.slice(),
    activeId: _libraryRegistry.activeId,
    numChunks: _manifest?.numChunks || 0,
    numDocs: _manifest?.docs?.length || 0,
  });
}

// ── OPFS I/O ──────────────────────────────────────────────────────
// Uses FileSystemSyncAccessHandle — worker-only API, synchronous reads
// and writes, explicit flush(). More reliable than createWritable() for
// binary data and gives us a deterministic persistence boundary. Per MDN,
// SyncAccessHandle "is designed to provide fast, direct access to the
// file's contents from Web Workers" and is what the Evolu SQLite WASM
// worker uses under the hood.

function emptyManifest() {
  return {
    numChunks: 0,
    dim: DIM,
    modelId: MODEL_ID,
    indexedAt: null,
    docs: [],
  };
}

async function persistCorpusState(state) {
  const dir = await activeLibraryDir();
  /** @type {typeof writeBinaryTo} */
  let writeBytes = writeBinaryTo;
  if (_failNextCorpusPersistForTest) {
    _failNextCorpusPersistForTest = false;
    let writeCount = 0;
    writeBytes = async (targetDir, name, bytes) => {
      writeCount += 1;
      if (writeCount === 3) throw new Error('Test corpus persist failure');
      return writeBinaryTo(targetDir, name, bytes);
    };
  }
  const committed = await writeCorpusSnapshot(dir, state, {
    activeSlot: _corpusSlot,
    revision: _corpusRevision,
    writeBytes,
  });
  _corpusSlot = committed.slot;
  _corpusRevision = committed.revision;
  return committed.state;
}
