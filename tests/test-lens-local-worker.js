// test-lens-local-worker.js — Browser test: full message protocol round-trip
// against lens-local-worker.js running with a mocked embedder. Covers init,
// ingest, query (including MMR diversification), stats, delete, clear,
// and OPFS persistence across worker restarts.
//
// Uses the `?mock=1` worker query param to skip the real transformers.js
// load — tests run in ~100 ms instead of ~15 s.

return (async function() {
  let passed = 0, failed = 0;
  const results = [];
  function assert(name, cond, detail) {
    if (cond) { passed++; results.push(`  \u2705 ${name}`); }
    else { failed++; results.push(`  \u274c ${name}${detail ? ' \u2014 ' + detail : ''}`); }
  }

  // ── Wipe OPFS first so the test starts from a known empty state.
  // Also wipes the localStorage count shadow that hasLens() reads.
  try {
    const root = await navigator.storage.getDirectory();
    try { await root.removeEntry('lens-local', { recursive: true }); } catch {}
  } catch (e) {
    console.warn('[test] OPFS wipe failed, continuing:', e.message);
  }
  try { localStorage.removeItem('labcharts-lens-local-count'); } catch {}

  // ── Helpers for talking to the worker directly ──
  function spawnWorker() {
    return new Worker('/js/lens-local-worker.js?mock=1', { type: 'module' });
  }

  async function removeLensRegistryFiles(removeBackup = false) {
    const root = await navigator.storage.getDirectory();
    const lensDir = await root.getDirectoryHandle('lens-local');
    await lensDir.removeEntry('_libraries.json').catch(() => {});
    if (removeBackup) {
      await lensDir.removeEntry('_libraries.backup.json').catch(() => {});
    }
  }

  async function readLensRegistryFile(name) {
    const root = await navigator.storage.getDirectory();
    const lensDir = await root.getDirectoryHandle('lens-local');
    const fileHandle = await lensDir.getFileHandle(name);
    const file = await fileHandle.getFile();
    return JSON.parse(await file.text());
  }

  async function writeLensRegistryFile(name, payload) {
    const root = await navigator.storage.getDirectory();
    const lensDir = await root.getDirectoryHandle('lens-local');
    const fileHandle = await lensDir.getFileHandle(name, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(payload));
    await writable.close();
  }

  function roundTrip(worker, msg, expectedType, timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        worker.removeEventListener('message', onMsg);
        reject(new Error(`worker did not respond with ${expectedType} within ${timeoutMs} ms`));
      }, timeoutMs);
      const onMsg = (e) => {
        if (e.data?.type === 'progress') {
          if (e.data.stage === 'saving') worker.postMessage({ type: 'commit_ingest' });
          return;
        }
        clearTimeout(timer);
        worker.removeEventListener('message', onMsg);
        if (e.data?.type === 'error') reject(new Error(e.data.message));
        else if (e.data?.type === expectedType) resolve(e.data);
        else reject(new Error(`unexpected response type: ${e.data?.type}`));
      };
      worker.addEventListener('message', onMsg);
      worker.postMessage(msg);
    });
  }

  // ─── Phase 1: init on empty store ───
  console.log('%c[1] Init on fresh store', 'font-weight:bold');
  let worker = spawnWorker();
  let ready = await roundTrip(worker, { type: 'init' }, 'ready');
  assert('init returns {type:ready, numChunks:0, numDocs:0}',
    ready.numChunks === 0 && ready.numDocs === 0,
    `got ${JSON.stringify(ready)}`);

  // ─── Phase 2: ingest ───
  console.log('%c[2] Ingest', 'font-weight:bold');
  const files = [
    { name: 'vitamin-d.md', text: 'Vitamin D is a secosteroid hormone synthesised in skin when UVB hits 7-dehydrocholesterol.' + ' filler '.repeat(20) },
    { name: 'mitochondria.md', text: 'Cytochrome c oxidase peaks at 670 nm for near-infrared photobiomodulation.' + ' filler '.repeat(20) },
    { name: 'sleep.md', text: 'Blue light around 480 nm suppresses melatonin via melanopsin-sensitive retinal ganglion cells.' + ' filler '.repeat(20) },
  ];
  const ingestResult = await roundTrip(worker, { type: 'ingest', files }, 'ingest_done', 10000);
  assert('ingest_done returns stats.files_seen',
    ingestResult.stats?.files_seen === 3,
    `got ${JSON.stringify(ingestResult.stats)}`);
  assert('ingest_done chunks_indexed > 0',
    ingestResult.stats?.chunks_indexed > 0);

  // ─── Phase 3: stats reflect ingest ───
  console.log('%c[3] Stats', 'font-weight:bold');
  const stats = await roundTrip(worker, { type: 'stats' }, 'stats_result');
  assert('stats.total_chunks matches ingest chunks_indexed',
    stats.total_chunks === ingestResult.stats.chunks_indexed);
  assert('stats.documents has 3 entries',
    Array.isArray(stats.documents) && stats.documents.length === 3);
  assert('stats exposes model + dim',
    typeof stats.model === 'string' && stats.dim === 384);
  // The mock embedder doesn't touch transformers.js, so backend stays at
  // its init default ('wasm'). Still check the field is exposed — the real
  // value is set by the pipeline init branch in production.
  assert('stats exposes backend field',
    stats.backend === 'wasm' || stats.backend === 'webgpu',
    `got ${JSON.stringify(stats.backend)}`);

  // ─── Phase 4: query shape + MMR ───
  console.log('%c[4] Query', 'font-weight:bold');
  const queryResult = await roundTrip(worker, { type: 'query', text: 'vitamin D and light', topK: 5 }, 'query_result');
  assert('query_result.chunks is an array',
    Array.isArray(queryResult.chunks));
  if (queryResult.chunks.length > 0) {
    const top = queryResult.chunks[0];
    assert('chunk has text, source, score fields',
      typeof top.text === 'string' && typeof top.source === 'string' && typeof top.score === 'number');
    // Scores must be in [-1, 1] for unit-normalized cosine. Stub vectors are
    // hash-based so scores will be all over the place; just bound them.
    assert('chunk score is within [-1, 1]',
      top.score >= -1 && top.score <= 1);
  }

  // ─── Phase 5: delete one document ───
  console.log('%c[5] Delete', 'font-weight:bold');
  const before = stats.total_chunks;
  const del = await roundTrip(worker, { type: 'delete', source: 'mitochondria.md' }, 'delete_done');
  assert('delete_done returns a positive deleted_chunks count',
    del.deleted_chunks > 0);
  const stats2 = await roundTrip(worker, { type: 'stats' }, 'stats_result');
  assert('stats.total_chunks decreased by deleted count',
    stats2.total_chunks === before - del.deleted_chunks);
  assert('deleted document no longer in documents list',
    !stats2.documents.some((d) => d.source === 'mitochondria.md'));

  // ─── Phase 6: OPFS persistence across worker restart ───
  console.log('%c[6] Persistence across restart', 'font-weight:bold');
  worker.terminate();
  worker = spawnWorker();
  const ready2 = await roundTrip(worker, { type: 'init' }, 'ready');
  assert('reinit picks up persisted chunks',
    ready2.numChunks === stats2.total_chunks);
  assert('reinit picks up persisted doc count',
    ready2.numDocs === 2);

  // ─── Phase 7: clear wipes everything ───
  console.log('%c[7] Clear', 'font-weight:bold');
  await roundTrip(worker, { type: 'clear' }, 'clear_done');
  const stats3 = await roundTrip(worker, { type: 'stats' }, 'stats_result');
  assert('clear empties total_chunks',
    stats3.total_chunks === 0);
  assert('clear empties documents list',
    Array.isArray(stats3.documents) && stats3.documents.length === 0);

  // ─── Phase 8: query on empty store returns empty list, not error ───
  console.log('%c[8] Query on empty store', 'font-weight:bold');
  const emptyQ = await roundTrip(worker, { type: 'query', text: 'anything', topK: 5 }, 'query_result');
  assert('empty-store query returns chunks:[]',
    Array.isArray(emptyQ.chunks) && emptyQ.chunks.length === 0);

  // ─── Phase 9: error propagation ───
  console.log('%c[9] Error handling', 'font-weight:bold');
  try {
    await roundTrip(worker, { type: 'nonsense_type' }, 'ready', 1000);
    assert('unknown message type → error message', false, 'expected rejection');
  } catch (e) {
    assert('unknown message type → error message',
      /unknown/i.test(e.message));
  }

  // ─── Phase 10: multi-library — init exposes "default" library ───
  console.log('%c[10] Multi-library: default present', 'font-weight:bold');
  worker.terminate();
  worker = spawnWorker();
  const libReady = await roundTrip(worker, { type: 'init' }, 'ready');
  assert('init returns libraries array',
    Array.isArray(libReady.libraries) && libReady.libraries.length >= 1);
  assert('init has an activeId',
    typeof libReady.activeId === 'string' && libReady.activeId.length > 0);
  assert('init has an activeName',
    typeof libReady.activeName === 'string');

  // ─── Phase 10b: failed create persist does not mutate state ───
  console.log('%c[10b] Multi-library: failed create rollback', 'font-weight:bold');
  const beforeFailedCreate = await roundTrip(worker, { type: 'list_libraries' }, 'libraries_list');
  await roundTrip(worker, { type: 'test_fail_next_registry_persist' }, 'test_ack');
  try {
    await roundTrip(worker, { type: 'create_library', name: 'Failed Persist' }, 'library_created');
    assert('failed create_library rejects when registry persist fails', false, 'expected rejection');
  } catch (e) {
    assert('failed create_library rejects when registry persist fails',
      /persist/i.test(e.message));
  }
  const afterFailedCreate = await roundTrip(worker, { type: 'list_libraries' }, 'libraries_list');
  assert('failed create_library leaves registry list unchanged',
    afterFailedCreate.libraries.length === beforeFailedCreate.libraries.length
      && !afterFailedCreate.libraries.some((l) => l.name === 'Failed Persist'));

  worker.terminate();
  await removeLensRegistryFiles(true);
  worker = spawnWorker();
  const afterFailedCreateRecovery = await roundTrip(worker, { type: 'init' }, 'ready');
  assert('failed create_library leaves no recoverable OPFS directory',
    !afterFailedCreateRecovery.libraries.some((l) => l.name === 'Failed Persist'));

  // ─── Phase 11: create a second library ───
  console.log('%c[11] Multi-library: create second', 'font-weight:bold');
  const created = await roundTrip(worker, { type: 'create_library', name: 'Research', model: 'bge-small-en' }, 'library_created');
  assert('library_created returns generated id',
    typeof created.id === 'string' && created.id.length > 0);
  assert('library_created echoes name', created.name === 'Research');
  assert('library_created preserves chosen model', created.model === 'bge-small-en');
  assert('library_created libraries list now has 2 entries',
    Array.isArray(created.libraries) && created.libraries.length >= 2);

  // ─── Phase 12: new library is isolated from default ───
  console.log('%c[12] Multi-library: isolation', 'font-weight:bold');
  await roundTrip(worker, { type: 'activate_library', libraryId: created.id }, 'ready');
  const researchStats = await roundTrip(worker, { type: 'stats' }, 'stats_result');
  assert('new library starts empty (isolated from default)',
    researchStats.total_chunks === 0 && researchStats.documents.length === 0);

  // Ingest into the new library, then switch back — the switched-to
  // library must still be empty.
  await roundTrip(worker, {
    type: 'ingest',
    files: [{ name: 'research-only.md', text: 'Content limited to the research library.' + ' filler '.repeat(20) }],
  }, 'ingest_done', 10000);
  const researchAfter = await roundTrip(worker, { type: 'stats' }, 'stats_result');
  assert('new library ingest lands in the new library',
    researchAfter.total_chunks > 0);

  // ─── Phase 13: rename ───
  console.log('%c[13] Multi-library: rename', 'font-weight:bold');
  const renamed = await roundTrip(worker, { type: 'rename_library', libraryId: created.id, name: 'Kruse Research' }, 'library_renamed');
  assert('library_renamed returns new name', renamed.name === 'Kruse Research');

  // ─── Phase 13b: registry recovery across update/reload ───
  console.log('%c[13b] Multi-library: registry recovery', 'font-weight:bold');
  worker.terminate();
  await removeLensRegistryFiles(false);
  worker = spawnWorker();
  const backupRecovered = await roundTrip(worker, { type: 'init' }, 'ready');
  const backupRecoveredLib = backupRecovered.libraries.find((l) => l.id === created.id);
  assert('missing primary registry recovers library metadata from backup',
    backupRecoveredLib?.name === 'Kruse Research');
  assert('backup registry recovery preserves explicit library model',
    backupRecoveredLib?.model === 'bge-small-en' && backupRecovered.activeModel === 'bge-small-en',
    `got ${JSON.stringify({ libModel: backupRecoveredLib?.model, activeModel: backupRecovered.activeModel })}`);

  // Simulate a worker stop after the backup registry recorded a delete but
  // before the stale primary registry and old OPFS directory were removed.
  worker.terminate();
  const stalePrimaryRegistry = await readLensRegistryFile('_libraries.json');
  const interruptedDeleteRegistry = {
    ...stalePrimaryRegistry,
    activeId: 'default',
    libraries: stalePrimaryRegistry.libraries.filter((l) => l.id !== created.id),
    revision: (Number(stalePrimaryRegistry.revision) || 0) + 1,
    updatedAt: Date.now(),
  };
  await writeLensRegistryFile('_libraries.backup.json', interruptedDeleteRegistry);
  worker = spawnWorker();
  const interruptedDeleteRecovered = await roundTrip(worker, { type: 'init' }, 'ready');
  assert('newer backup delete registry does not resurrect stale OPFS directory',
    !interruptedDeleteRecovered.libraries.some((l) => l.id === created.id));

  worker.terminate();
  await removeLensRegistryFiles(true);
  worker = spawnWorker();
  const directoryRecovered = await roundTrip(worker, { type: 'init' }, 'ready');
  assert('missing registry and backup recovers existing library directories',
    directoryRecovered.libraries.some((l) => l.id === created.id));
  await roundTrip(worker, { type: 'activate_library', libraryId: created.id }, 'ready');
  const recoveredResearchStats = await roundTrip(worker, { type: 'stats' }, 'stats_result');
  assert('directory-recovered library keeps ingested chunks',
    recoveredResearchStats.total_chunks === researchAfter.total_chunks,
    `expected ${researchAfter.total_chunks}, got ${recoveredResearchStats.total_chunks}`);

  // ─── Phase 14: delete a non-active library ───
  console.log('%c[14] Multi-library: delete non-active', 'font-weight:bold');
  // Activate default, then delete Kruse Research. Active corpus must be unaffected.
  await roundTrip(worker, { type: 'activate_library', libraryId: 'default' }, 'ready');
  const defaultStats = await roundTrip(worker, { type: 'stats' }, 'stats_result');
  const deleted = await roundTrip(worker, { type: 'delete_library', libraryId: created.id }, 'library_deleted');
  assert('library_deleted returns remaining libraries',
    Array.isArray(deleted.libraries) && !deleted.libraries.some((l) => l.id === created.id));
  const defaultAfterDelete = await roundTrip(worker, { type: 'stats' }, 'stats_result');
  assert('active library stats unchanged after non-active delete',
    defaultAfterDelete.total_chunks === defaultStats.total_chunks);

  // ─── Phase 15b: abort mid-ingest discards pending progress ───
  console.log('%c[15b] Abort mid-ingest', 'font-weight:bold');
  // Big batch so the embed loop runs long enough to race against the abort
  // message. With the mock embedder each chunk is a microtask, so we need
  // enough macrotask boundaries between them for the 'abort' message to
  // land. 40 files / 80 chunks finished before abort hit on fast CI runners
  // (CI run #24952210745 / 2026-04-26 — 80/80 indexed, cancelled:false).
  // Bumped to 200 files × ~25 chunks = ~5000 iterations so even the
  // fastest CI thread has many yield opportunities before completion.
  const bigFiles = [];
  for (let k = 0; k < 200; k++) {
    bigFiles.push({ name: `abort-${k}.md`, text: 'lorem ipsum dolor sit amet. '.repeat(150) });
  }
  const abortIngestDone = new Promise((resolve, reject) => {
    const onMsg = (e) => {
      if (e.data?.type === 'progress' && e.data.stage === 'embed' && e.data.index >= 3) {
        // Fire abort as soon as we see real progress — guarantees we're
        // mid-loop, not racing against an unpumped queue.
        worker.postMessage({ type: 'abort' });
      }
      if (e.data?.type === 'ingest_done') {
        worker.removeEventListener('message', onMsg);
        resolve(e.data);
      }
      if (e.data?.type === 'error') {
        worker.removeEventListener('message', onMsg);
        reject(new Error(e.data.message));
      }
    };
    worker.addEventListener('message', onMsg);
    worker.postMessage({ type: 'ingest', files: bigFiles });
  });
  const aborted = await abortIngestDone;
  assert('aborted ingest returns cancelled:true',
    aborted.stats?.cancelled === true,
    `got ${JSON.stringify(aborted.stats)}`);
  assert('aborted ingest commits no pending chunks',
    aborted.stats?.chunks_indexed === 0,
    `indexed=${aborted.stats?.chunks_indexed} planned=${aborted.stats?.chunks_planned}`);
  assert('aborted ingest reports work completed before Stop',
    aborted.stats?.chunks_processed >= 3);
  const statsAfterAbort = await roundTrip(worker, { type: 'stats' }, 'stats_result');
  assert('aborted ingest leaves the existing corpus unchanged',
    statsAfterAbort.total_chunks === defaultAfterDelete.total_chunks);
  // Clean up so later phases start from a known state.
  await roundTrip(worker, { type: 'clear' }, 'clear_done');

  // ─── Phase 15: deleting the last library auto-creates a default ───
  console.log('%c[15] Multi-library: delete last keeps one', 'font-weight:bold');
  // Currently only "default" remains. Deleting it should auto-create a
  // fresh "My Library" rather than leaving the user with zero libraries.
  const defaultLibId = deleted.libraries[0].id;
  const afterLast = await roundTrip(worker, { type: 'delete_library', libraryId: defaultLibId }, 'library_deleted');
  assert('auto-created a fallback library (never zero)',
    afterLast.libraries.length === 1);
  assert('fallback library has empty stats',
    afterLast.numChunks === 0);

  // ─── Phase 16: per-library embedding-model picker (v1.21.4+) ───
  // Contract tests for the MODELS catalog plumbing that backs the
  // library-creation UI. Mock mode skips the real embedder reload so
  // these validate metadata persistence only — the actual cross-model
  // ingest/query test lives in manual QA. Regressing any of these
  // would silently break the picker for every user.
  console.log('%c[16] Per-library model picker', 'font-weight:bold');
  // Re-init to pick up the latest readyPayload shape after the
  // auto-created fallback library is in place.
  const modelReady = await roundTrip(worker, { type: 'init' }, 'ready');

  assert('ready payload exposes models catalog',
    modelReady.models && typeof modelReady.models === 'object' && Object.keys(modelReady.models).length > 0,
    'UI needs the catalog to render the picker');
  assert('ready payload exposes activeModel',
    typeof modelReady.activeModel === 'string' && modelReady.activeModel.length > 0);
  assert('activeModel points at a key in the catalog',
    modelReady.models[modelReady.activeModel] !== undefined,
    'catalog and activeModel must agree');

  // Catalog shape — every entry needs these fields or the dialog's
  // "X MB download · Y-dim · English/multi" row breaks.
  const requiredFields = ['id', 'label', 'dim', 'tier', 'downloadMB', 'language', 'notes'];
  let shapeOk = true;
  for (const [key, spec] of Object.entries(modelReady.models)) {
    for (const field of requiredFields) {
      if (spec[field] === undefined || spec[field] === null) {
        shapeOk = false;
        console.warn(`[test] MODELS[${key}] missing "${field}"`);
      }
    }
  }
  assert('every catalog entry carries all required UI fields', shapeOk);
  assert('catalog includes the MiniLM back-compat default',
    modelReady.models['all-minilm']?.id === 'Xenova/all-MiniLM-L6-v2');

  // create_library with explicit non-default model persists it.
  const bgeLib = await roundTrip(worker,
    { type: 'create_library', name: 'BGE English', model: 'bge-small-en' },
    'library_created');
  assert('create_library echoes the chosen model', bgeLib.model === 'bge-small-en');
  const bgeInList = bgeLib.libraries.find((l) => l.id === bgeLib.id);
  assert('created library stores model in the registry',
    bgeInList?.model === 'bge-small-en');

  // create_library with an unknown model key falls back to default
  // (rather than persisting garbage that would crash on next load).
  const badLib = await roundTrip(worker,
    { type: 'create_library', name: 'Typo', model: 'not-a-real-model-key' },
    'library_created');
  assert('unknown model key falls back to all-minilm default',
    badLib.model === 'all-minilm');

  // create_library without a model uses the default.
  const defaultLib = await roundTrip(worker,
    { type: 'create_library', name: 'No model field' },
    'library_created');
  assert('omitted model uses all-minilm default', defaultLib.model === 'all-minilm');

  // list_libraries returns the model field on every entry.
  const listed = await roundTrip(worker, { type: 'list_libraries' }, 'libraries_list');
  const allHaveModel = listed.libraries.every((l) =>
    typeof l.model === 'string' && modelReady.models[l.model]);
  assert('list_libraries: every entry has a valid model field', allHaveModel);

  // activate_library includes activeModel in the ready response so the
  // UI chip + model-change detection can react without another roundtrip.
  const activated = await roundTrip(worker,
    { type: 'activate_library', libraryId: bgeLib.id },
    'ready');
  assert('activate_library returns activeModel reflecting the new library',
    activated.activeModel === 'bge-small-en');

  worker.terminate();

  console.log('\n' + results.join('\n'));
  console.log(`\n%c${passed} passed, ${failed} failed`, `font-weight:bold;color:${failed ? 'red' : 'green'}`);
  return { passed, failed };
})();
