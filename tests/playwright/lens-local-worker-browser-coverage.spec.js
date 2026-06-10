import { expect, test } from './coverage-fixture.js';

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

    const worker = new Worker('/js/lens-local-worker.js?mock=1', { type: 'module' });
    const roundTrip = (msg, expectedType, timeoutMs = 5000) => new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        worker.removeEventListener('message', onMessage);
        reject(new Error(`worker did not respond with ${expectedType}`));
      }, timeoutMs);
      const onMessage = (event) => {
        const data = event.data || {};
        events.push(data);
        if (data.type === 'progress') return;
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
        && events.some(event => event.type === 'progress' && event.stage === 'embed'));

      const stats = await roundTrip({ type: 'stats' }, 'stats_result');
      check('stats reflect ingest and model metadata',
        stats.total_chunks === ingest.stats.chunks_indexed
        && stats.documents?.length === 3
        && stats.dim === 384
        && stats.model === 'Xenova/all-MiniLM-L6-v2'
        && (stats.backend === 'wasm' || stats.backend === 'webgpu'));

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
        && afterDelete.total_chunks === stats.total_chunks - deleted.deleted_chunks
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
