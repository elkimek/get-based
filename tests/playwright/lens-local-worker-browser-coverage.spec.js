import { expect, test } from './coverage-fixture.js';

const TRANSFORMERS_STUB = `
export const env = { backends: { onnx: { wasm: {} } } };

export async function pipeline(task, modelId, options = {}) {
  const dim = modelId.includes('bge-base') ? 768 : 384;
  return async function embed(text, embedOptions = {}) {
    const data = new Float32Array(dim);
    const seed = Array.from(String(text || '')).reduce((sum, ch) => sum + ch.charCodeAt(0), 0) || 1;
    for (let i = 0; i < dim; i += 1) {
      data[i] = ((seed + i * 17) % 97) / 97;
    }
    return { data };
  };
}
`;

test('lens local worker browser coverage exercises mocked protocol and libraries', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  const failures = await page.evaluate(async () => {
    const failures = [];
    const events = [];
    const check = (name, condition, detail = '') => {
      if (!condition) failures.push(detail ? `${name}: ${detail}` : name);
    };

    try {
      const root = await navigator.storage.getDirectory();
      await root.removeEntry('lens-local', { recursive: true }).catch(() => {});
    } catch (error) {
      failures.push(`opfs setup failed: ${error?.message || String(error)}`);
      return failures;
    }
    localStorage.removeItem('labcharts-lens-local-count');

    let worker = new Worker('/js/lens-local-worker.js?mock=1&benchmark=1', { type: 'module' });
    const roundTrip = (msg, expectedType, timeoutMs = 5000) => new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        worker.removeEventListener('message', onMessage);
        reject(new Error(`worker did not respond with ${expectedType}`));
      }, timeoutMs);
      const onMessage = (event) => {
        const data = event.data || {};
        events.push(data);
        if (data.type === 'progress') {
          if (data.stage === 'saving') {
            if (msg.abortAtSaving) worker.postMessage({ type: 'abort' });
            worker.postMessage({ type: 'commit_ingest' });
          }
          return;
        }
        clearTimeout(timer);
        worker.removeEventListener('message', onMessage);
        if (data.type === 'error') reject(new Error(data.message || 'worker error'));
        else if (data.type === expectedType) resolve(data);
        else reject(new Error(`expected ${expectedType}, got ${data.type || 'unknown'}`));
      };
      worker.addEventListener('message', onMessage);
      worker.postMessage(msg);
    });
    const expectWorkerError = async (msg, pattern) => {
      try {
        await roundTrip(msg, '__not_expected__', 1500);
        return { ok: false, message: 'no error returned' };
      } catch (error) {
        const message = error?.message || String(error);
        return { ok: pattern.test(message), message };
      }
    };

    try {
      const ready = await roundTrip({ type: 'init' }, 'ready');
      check('init starts with empty default library',
        ready.numChunks === 0
        && ready.numDocs === 0
        && ready.activeId === 'default'
        && ready.activeModel === 'all-minilm'
        && ready.models?.['all-minilm']?.dim === 384
        && ready.embedder?.backend === 'wasm'
        && ready.embedder?.modelKey === 'all-minilm'
        && ready.embedder?.dim === 384
        && Number.isFinite(ready.embedder?.msPerEmbed)
        && ready.embedder?.tier >= 1
        && ready.embedder?.tier <= 3
        && typeof ready.embedder?.tierLabel === 'string'
        && ready.libraries?.some(lib => lib.id === 'default'));

      const unknownType = await expectWorkerError({ type: 'not-a-real-worker-message' }, /unknown message type/i);
      check('unknown message type reports error', unknownType.ok, unknownType.message);

      const files = [
        { name: 'vitamin-d.md', text: 'Vitamin D and UVB signaling support circadian timing. '.repeat(24) },
        { name: 'mitochondria.md', text: 'Near infrared light and cytochrome c oxidase support mitochondrial signaling. '.repeat(24) },
        { name: 'sleep.md', text: 'Blue light around 480 nanometers suppresses melatonin at night. '.repeat(24) },
      ];
      const ingest = await roundTrip({ type: 'ingest', files }, 'ingest_done', 10000);
      check('ingest indexes chunks and emits progress',
        ingest.stats?.files_seen === 3
        && ingest.stats?.chunks_indexed > 0
        && ingest.stats?.chunks_planned >= ingest.stats?.chunks_indexed
        && ingest.stats?.cancelled === false
        && events.some(event => event.type === 'progress' && event.stage === 'start')
        && events.some(event => event.type === 'progress' && event.stage === 'embed')
        && events.some(event => event.type === 'progress' && event.stage === 'saving'));

      const stats = await roundTrip({ type: 'stats' }, 'stats_result');
      check('stats reflect ingest and model metadata',
        stats.total_chunks === ingest.stats.chunks_indexed
        && stats.documents?.length === 3
        && stats.dim === 384
        && stats.model === 'Xenova/all-MiniLM-L6-v2'
        && (stats.backend === 'wasm' || stats.backend === 'webgpu'));

      const unchanged = await roundTrip({ type: 'ingest', files }, 'ingest_done', 10000);
      const afterUnchanged = await roundTrip({ type: 'stats' }, 'stats_result');
      check('re-import skips documents whose content is unchanged',
        unchanged.stats?.chunks_indexed === 0
        && unchanged.stats?.skipped?.length === files.length
        && afterUnchanged.total_chunks === stats.total_chunks
        && afterUnchanged.documents.length === stats.documents.length);

      const replacementFile = {
        name: 'vitamin-d.md',
        text: 'Updated vitamin D document with dosing, UVB, and circadian evidence. '.repeat(38),
      };
      const oldVitaminChunks = stats.documents.find(doc => doc.source === replacementFile.name)?.chunks || 0;
      const replacement = await roundTrip({ type: 'ingest', files: [replacementFile] }, 'ingest_done', 10000);
      const afterReplacement = await roundTrip({ type: 'stats' }, 'stats_result');
      check('re-import transaction replaces an existing document instead of appending duplicates',
        replacement.stats?.replaced_documents === 1
        && replacement.stats?.chunks_indexed > 0
        && afterReplacement.documents.length === stats.documents.length
        && afterReplacement.documents.filter(doc => doc.source === replacementFile.name).length === 1
        && afterReplacement.total_chunks === stats.total_chunks - oldVitaminChunks + replacement.stats.chunks_indexed);

      const lateStopped = await roundTrip({
        type: 'ingest',
        abortAtSaving: true,
        files: [{ name: 'late-stop.md', text: 'Stop at the saving boundary. '.repeat(36) }],
      }, 'ingest_done', 10000);
      const afterLateStop = await roundTrip({ type: 'stats' }, 'stats_result');
      check('a Stop queued before the commit acknowledgement cancels the replacement',
        lateStopped.stats?.cancelled === true
        && lateStopped.stats?.chunks_indexed === 0
        && afterLateStop.total_chunks === afterReplacement.total_chunks
        && !afterLateStop.documents.some(doc => doc.source === 'late-stop.md'));

      await roundTrip({ type: 'test_fail_next_corpus_persist' }, 'test_ack');
      const failedPersist = await expectWorkerError({
        type: 'ingest',
        files: [{ name: 'torn-write.md', text: 'A simulated torn corpus generation. '.repeat(36) }],
      }, /test corpus persist failure/i);
      const afterFailedPersist = await roundTrip({ type: 'stats' }, 'stats_result');
      check('failed generation commit leaves the in-memory corpus unchanged',
        failedPersist.ok
        && afterFailedPersist.total_chunks === afterReplacement.total_chunks
        && !afterFailedPersist.documents.some(doc => doc.source === 'torn-write.md'),
      failedPersist.message);

      worker.terminate();
      worker = new Worker('/js/lens-local-worker.js?mock=1&benchmark=1', { type: 'module' });
      const recovered = await roundTrip({ type: 'init' }, 'ready');
      const recoveredStats = await roundTrip({ type: 'stats' }, 'stats_result');
      check('restart ignores a torn inactive generation and loads the prior commit',
        recovered.numChunks === afterReplacement.total_chunks
        && recoveredStats.total_chunks === afterReplacement.total_chunks
        && !recoveredStats.documents.some(doc => doc.source === 'torn-write.md'));

      const beforeCancelled = afterReplacement.total_chunks;
      const cancelling = roundTrip({
        type: 'ingest',
        files: [{ name: 'cancelled.md', text: 'Pending indexing transaction. '.repeat(1200) }],
      }, 'ingest_done', 10000);
      setTimeout(() => worker.postMessage({ type: 'abort' }), 0);
      const cancelled = await cancelling;
      const afterCancelled = await roundTrip({ type: 'stats' }, 'stats_result');
      check('stopping indexing discards the pending transaction',
        cancelled.stats?.cancelled === true
        && cancelled.stats?.chunks_indexed === 0
        && afterCancelled.total_chunks === beforeCancelled
        && !afterCancelled.documents.some(doc => doc.source === 'cancelled.md'));

      const query = await roundTrip({ type: 'query', text: 'vitamin D light mitochondria', topK: 2 }, 'query_result');
      const firstChunk = query.chunks?.[0];
      check('query returns scored chunk matches',
        query.chunks?.length > 0
        && query.chunks.length <= 2
        && typeof firstChunk?.text === 'string'
        && typeof firstChunk?.source === 'string'
        && typeof firstChunk?.score === 'number'
        && firstChunk.score >= -1
        && firstChunk.score <= 1);

      const missingDelete = await roundTrip({ type: 'delete', source: 'missing.md' }, 'delete_done');
      check('delete missing source is a no-op', missingDelete.deleted_chunks === 0);

      const deleted = await roundTrip({ type: 'delete', source: 'mitochondria.md' }, 'delete_done');
      const afterDelete = await roundTrip({ type: 'stats' }, 'stats_result');
      check('delete removes source chunks and stats',
        deleted.deleted_chunks > 0
        && afterDelete.total_chunks === afterReplacement.total_chunks - deleted.deleted_chunks
        && !afterDelete.documents.some(doc => doc.source === 'mitochondria.md'));

      await roundTrip({ type: 'clear' }, 'clear_done');
      const emptyQuery = await roundTrip({ type: 'query', text: 'anything', topK: 5 }, 'query_result');
      check('clear empties corpus and empty query returns no chunks',
        Array.isArray(emptyQuery.chunks) && emptyQuery.chunks.length === 0);

      const bge = await roundTrip({ type: 'create_library', name: 'Research', model: 'bge-small-en' }, 'library_created');
      const fallback = await roundTrip({ type: 'create_library', name: '', model: 'typo-model' }, 'library_created');
      const unnamed = await roundTrip({ type: 'create_library' }, 'library_created');
      check('create library persists model choices and fallback labels',
        bge.name === 'Research'
        && bge.model === 'bge-small-en'
        && fallback.name === 'Untitled library'
        && fallback.model === 'all-minilm'
        && unnamed.name === 'Untitled library'
        && unnamed.model === 'all-minilm');

      const listed = await roundTrip({ type: 'list_libraries' }, 'libraries_list');
      check('list libraries includes valid model metadata',
        listed.libraries.length >= 4
        && listed.libraries.every(lib => typeof lib.model === 'string'));

      const renamed = await roundTrip({ type: 'rename_library', libraryId: bge.id, name: 'Kruse Research' }, 'library_renamed');
      const activeBge = await roundTrip({ type: 'activate_library', libraryId: bge.id }, 'ready');
      const sameActive = await roundTrip({ type: 'activate_library', libraryId: bge.id }, 'ready');
      check('rename and activate library update active context',
        renamed.name === 'Kruse Research'
        && activeBge.activeId === bge.id
        && activeBge.activeModel === 'bge-small-en'
        && sameActive.activeId === bge.id);

      const missingActivate = await expectWorkerError({ type: 'activate_library', libraryId: 'missing-library' }, /no library/i);
      const missingRename = await expectWorkerError({ type: 'rename_library', libraryId: 'missing-library', name: 'Nope' }, /no library/i);
      const missingDeleteLibrary = await expectWorkerError({ type: 'delete_library', libraryId: 'missing-library' }, /no library/i);
      check('missing activate library reports error', missingActivate.ok, missingActivate.message);
      check('missing rename library reports error', missingRename.ok, missingRename.message);
      check('missing delete library reports error', missingDeleteLibrary.ok, missingDeleteLibrary.message);

      await roundTrip({ type: 'activate_library', libraryId: 'default' }, 'ready');
      const deleteFallback = await roundTrip({ type: 'delete_library', libraryId: fallback.id }, 'library_deleted');
      const deleteUnnamed = await roundTrip({ type: 'delete_library', libraryId: unnamed.id }, 'library_deleted');
      check('delete library removes non-active libraries',
        !deleteFallback.libraries.some(lib => lib.id === fallback.id)
        && !deleteUnnamed.libraries.some(lib => lib.id === unnamed.id));

      await roundTrip({ type: 'clear' }, 'clear_done');
    } catch (error) {
      failures.push(error?.message || String(error));
    }

    return failures;
  });

  expect(failures, failures.join('\n')).toEqual([]);
});

test('lens local worker browser coverage exercises production embedder loading with stubbed transformers', async ({ page, context }) => {
  await context.route('https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.1.0', route => route.fulfill({
    status: 200,
    contentType: 'text/javascript',
    headers: {
      'access-control-allow-origin': '*',
      'cache-control': 'no-store',
    },
    body: TRANSFORMERS_STUB,
  }));
  await page.goto('/app', { waitUntil: 'load' });

  const failures = await page.evaluate(async () => {
    const failures = [];
    const check = (name, condition, detail = '') => {
      if (!condition) failures.push(detail ? `${name}: ${detail}` : name);
    };
    const checkEqual = (name, actual, expected) => {
      if (actual !== expected) failures.push(`${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    };
    try {
      const root = await navigator.storage.getDirectory();
      await root.removeEntry('lens-local', { recursive: true }).catch(() => {});
    } catch (error) {
      failures.push(`opfs setup failed: ${error?.message || String(error)}`);
      return failures;
    }

    const worker = new Worker('/js/lens-local-worker.js', { type: 'module' });
    const roundTrip = (msg, expectedType, timeoutMs = 5000) => new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        worker.removeEventListener('message', onMessage);
        reject(new Error(`worker did not respond with ${expectedType}`));
      }, timeoutMs);
      const onMessage = (event) => {
        const data = event.data || {};
        if (data.type === 'progress') {
          if (data.stage === 'saving') worker.postMessage({ type: 'commit_ingest' });
          return;
        }
        clearTimeout(timer);
        worker.removeEventListener('message', onMessage);
        if (data.type === 'error') reject(new Error(data.message || 'worker error'));
        else if (data.type === expectedType) resolve(data);
        else reject(new Error(`expected ${expectedType}, got ${data.type || 'unknown'}`));
      };
      worker.addEventListener('message', onMessage);
      worker.postMessage(msg);
    });

    try {
      const ready = await roundTrip({ type: 'init' }, 'ready', 10000);
      checkEqual('production init active library', ready.activeId, 'default');
      checkEqual('production init active model', ready.activeModel, 'all-minilm');
      checkEqual('production init embedder model key', ready.embedder?.modelKey, 'all-minilm');
      checkEqual('production init embedder model id', ready.embedder?.modelId, 'Xenova/all-MiniLM-L6-v2');
      checkEqual('production init embedder dimension', ready.embedder?.dim, 384);
      check('production init benchmark is finite', Number.isFinite(ready.embedder?.msPerEmbed));
      checkEqual('production model catalog exposes BGE-base dimension', ready.models?.['bge-base-en']?.dim, 768);

      const defaultIngest = await roundTrip({
        type: 'ingest',
        files: [{ name: 'default-model.md', text: 'MiniLM default library content. '.repeat(30) }],
      }, 'ingest_done', 10000);
      const defaultStats = await roundTrip({ type: 'stats' }, 'stats_result');
      check('production default library ingests before model switch',
        defaultIngest.stats?.chunks_indexed > 0
        && defaultStats.total_chunks === defaultIngest.stats.chunks_indexed
        && defaultStats.dim === 384
        && defaultStats.model === 'Xenova/all-MiniLM-L6-v2');

      const bge = await roundTrip({ type: 'create_library', name: 'BGE Base', model: 'bge-base-en' }, 'library_created');
      const activeBge = await roundTrip({ type: 'activate_library', libraryId: bge.id }, 'ready', 10000);
      const bgeStats = await roundTrip({ type: 'stats' }, 'stats_result');
      checkEqual('created library model key', bge.model, 'bge-base-en');
      checkEqual('activated BGE library id', activeBge.activeId, bge.id);
      checkEqual('activated BGE model key', activeBge.activeModel, 'bge-base-en');
      checkEqual('activated BGE embedder model key', activeBge.embedder?.modelKey, 'bge-base-en');
      checkEqual('activated BGE embedder model id', activeBge.embedder?.modelId, 'Xenova/bge-base-en-v1.5');
      checkEqual('activated BGE embedder dimension', activeBge.embedder?.dim, 768);
      checkEqual('BGE stats dimension', bgeStats.dim, 768);
      checkEqual('BGE stats model id', bgeStats.model, 'Xenova/bge-base-en-v1.5');

      const bgeIngest = await roundTrip({
        type: 'ingest',
        files: [{ name: 'bge-model.md', text: 'BGE base library content. '.repeat(30) }],
      }, 'ingest_done', 10000);
      const bgeAfterIngest = await roundTrip({ type: 'stats' }, 'stats_result');
      check('production BGE library ingests with BGE dimensions',
        bgeIngest.stats?.chunks_indexed > 0
        && bgeAfterIngest.total_chunks === bgeIngest.stats.chunks_indexed
        && bgeAfterIngest.dim === 768
        && bgeAfterIngest.model === 'Xenova/bge-base-en-v1.5');

      const deletedActiveBge = await roundTrip({ type: 'delete_library', libraryId: bge.id }, 'library_deleted', 10000);
      const defaultAfterActiveDelete = await roundTrip({ type: 'stats' }, 'stats_result');
      check('deleting active cross-model library reloads remaining library before manifest load',
        deletedActiveBge.activeId === 'default'
        && deletedActiveBge.numChunks === defaultStats.total_chunks
        && defaultAfterActiveDelete.total_chunks === defaultStats.total_chunks
        && defaultAfterActiveDelete.dim === 384
        && defaultAfterActiveDelete.model === 'Xenova/all-MiniLM-L6-v2');

      await roundTrip({ type: 'clear' }, 'clear_done');
    } catch (error) {
      failures.push(error?.message || String(error));
    } finally {
      worker.terminate();
      try {
        const root = await navigator.storage.getDirectory();
        await root.removeEntry('lens-local', { recursive: true }).catch(() => {});
      } catch {}
    }
    return failures;
  });

  expect(failures, failures.join('\n')).toEqual([]);
});
