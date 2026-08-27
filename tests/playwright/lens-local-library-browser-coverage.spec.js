import { expect, test } from './coverage-fixture.js';

function moduleUrl(path) {
  return `${path}?lensLocalLibraryCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function installFakeLensWorkerFactory(page) {
  await page.addInitScript(() => {
    window.__makeLensFakeWorker = ({
      state,
      calls,
      statsModel = 'static',
      statsBackend = null,
    }) => {
      const workers = [];

      class FakeWorker {
        constructor(url, options) {
          this.url = String(url || '');
          this.options = options || {};
          this.listeners = { message: [], error: [] };
          workers.push(this);
        }

        addEventListener(type, fn) {
          this.listeners[type]?.push(fn);
        }

        postMessage(msg) {
          calls.push({ ...msg });
          const send = data => {
            for (const fn of this.listeners.message) fn({ data });
          };
          const activeLibrary = () => state.libraries.find(l => l.id === state.activeId) || state.libraries[0];
          switch (msg.type) {
            case 'init':
              send({
                type: 'ready',
                numChunks: state.chunks,
                numDocs: state.docs.length,
                libraries: state.libraries,
                activeId: state.activeId,
                activeName: activeLibrary()?.name,
                activeModel: activeLibrary()?.model,
                embedder: state.embedder,
                models: state.models,
              });
              break;
            case 'ingest': {
              const files = Array.isArray(msg.files) ? msg.files : [];
              send({ type: 'progress', stage: 'start', total: files.length || 1 });
              files.forEach((file, index) => {
                send({ type: 'progress', stage: 'embed', index: index + 1, total: files.length, source: file.name });
                state.docs.push({ source: file.name, chunks: 1 });
              });
              state.chunks = state.docs.reduce((sum, doc) => sum + doc.chunks, 0);
              send({
                type: 'ingest_done',
                stats: {
                  chunks_indexed: files.length,
                  chunks_planned: files.length,
                  files_seen: files.length,
                  cancelled: false,
                },
              });
              break;
            }
            case 'stats':
              send({
                type: 'stats_result',
                total_chunks: state.chunks,
                documents: state.docs,
                dim: state.dim || 384,
                model: statsModel === 'active' ? activeLibrary()?.model || 'minilm' : state.model,
                backend: statsBackend || state.backend,
              });
              break;
            case 'query':
              send({
                type: 'query_result',
                chunks: [
                  { text: `match for ${msg.text}`, source: activeLibrary()?.name || 'Research Papers', score: 0.82 },
                  { text: 'below floor', source: 'archive.md', score: 0.12 },
                ],
              });
              break;
            case 'delete':
              state.docs = state.docs.filter(doc => doc.source !== msg.source);
              state.chunks = state.docs.reduce((sum, doc) => sum + doc.chunks, 0);
              send({ type: 'delete_done', deleted_chunks: 2 });
              break;
            case 'clear':
              state.docs = [];
              state.chunks = 0;
              send({ type: 'clear_done' });
              break;
            case 'list_libraries':
              send({ type: 'libraries_list', libraries: state.libraries, activeId: state.activeId });
              break;
            case 'activate_library':
              state.activeId = msg.libraryId;
              send({
                type: 'ready',
                libraries: state.libraries,
                activeId: state.activeId,
                activeName: activeLibrary()?.name,
                numChunks: state.chunks,
                numDocs: state.docs.length,
              });
              break;
            case 'create_library': {
              const id = `lib-${state.libraries.length + 1}`;
              const created = { id, name: msg.name, model: msg.model || 'minilm' };
              state.libraries.push(created);
              send({ type: 'library_created', id, name: created.name, model: created.model, libraries: state.libraries });
              break;
            }
            case 'rename_library': {
              const lib = state.libraries.find(l => l.id === msg.libraryId);
              if (lib) lib.name = msg.name;
              send({ type: 'library_renamed', id: msg.libraryId, name: msg.name, libraries: state.libraries });
              break;
            }
            case 'delete_library':
              state.libraries = state.libraries.filter(l => l.id !== msg.libraryId);
              state.activeId = state.libraries[0]?.id || '';
              send({
                type: 'library_deleted',
                libraries: state.libraries,
                activeId: state.activeId,
                numChunks: state.chunks,
                numDocs: state.docs.length,
              });
              break;
            case 'abort':
              break;
          }
        }
      }

      return { FakeWorker, workers };
    };
  });
}

test('local lens browser API serializes worker document and library operations', async ({ page }) => {
  await installFakeLensWorkerFactory(page);
  await page.goto('/app', { waitUntil: 'load' });

  const results = await page.evaluate(async ({ lensLocalUrl }) => {
    const outcomes = {};
    const originalWorker = window.Worker;
    const savedCount = localStorage.getItem('labcharts-lens-local-count');
    const calls = [];
    const progressEvents = [];
    const state = {
      docs: [{ source: 'seed.md', chunks: 2 }],
      chunks: 2,
      dim: 384,
      model: 'minilm',
      backend: 'wasm',
      libraries: [
        { id: 'lib-a', name: 'Research Papers', model: 'minilm' },
        { id: 'lib-b', name: 'Clinical Guides', model: 'bge-en' },
      ],
      activeId: 'lib-a',
      models: {
        minilm: { label: 'MiniLM L6', tier: 1, language: 'multi', downloadMB: 100, dim: 384, notes: 'Compact default.' },
        'bge-en': { label: 'BGE Small EN', tier: 2, language: 'en', downloadMB: 130, dim: 384, notes: 'Better English recall.' },
      },
      embedder: { tier: 2, msPerEmbed: 18, backend: 'webgpu' },
    };
    const { FakeWorker, workers } = window.__makeLensFakeWorker({ state, calls });

    try {
      window.Worker = FakeWorker;
      localStorage.removeItem('labcharts-lens-local-count');
      const local = await import(lensLocalUrl);
      const unsubscribe = local.subscribeProgress(event => progressEvents.push(event));
      const api = await local.openLocalLens();
      const initialStats = await api.getStats();
      const countAfterInitialStats = localStorage.getItem('labcharts-lens-local-count');
      const peekAfterInitialStats = local.peekLocalCorpusSize();
      const ingestStats = await api.ingest([
        { name: 'vitamin-d.md', text: 'Vitamin D notes.' },
        { name: 'magnesium.md', text: 'Magnesium notes.' },
      ]);
      const countAfterIngest = localStorage.getItem('labcharts-lens-local-count');
      const rawChunks = await api.query('vitamin d', 2);
      await api.activateLibrary('lib-b');
      const localQuery = await local.queryLensLocal('immune protocol', { topK: 3, floor: 0.3 });
      const created = await api.createLibrary('Protocols', 'bge-en');
      await api.renameLibrary(created.id, 'Protocols 2026');
      const librariesAfterRename = await api.listLibraries();
      const deleted = await api.deleteDocument('seed.md');
      await api.deleteLibrary(created.id);
      api.abort();
      await api.clear();
      const finalStats = await api.getStats();
      unsubscribe();

      outcomes.initStatsAndCachedCount = api.numChunks === 2
        && initialStats.total_chunks === 2
        && initialStats.documents[0]?.source === 'seed.md'
        && countAfterInitialStats === '2'
        && peekAfterInitialStats === 2;
      outcomes.ingestProgressAndQueueUpdatesCount = ingestStats.chunks_indexed === 2
        && progressEvents.some(event => event.stage === 'start' && event.total === 2)
        && progressEvents.some(event => event.stage === 'embed' && event.source === 'magnesium.md')
        && countAfterIngest === '4';
      outcomes.queryAndLocalAdapterFilterLowScores = rawChunks.length === 2
        && localQuery?.chunks.length === 1
        && localQuery?.chunks[0]?.text.includes('immune protocol')
        && localQuery?.sourceName === 'Clinical Guides';
      outcomes.documentAndLibraryMutationsRoundTrip = created.name === 'Protocols'
        && librariesAfterRename.libraries.some(lib => lib.name === 'Protocols 2026')
        && deleted === 2
        && finalStats.total_chunks === 0
        && localStorage.getItem('labcharts-lens-local-count') === '0';
      outcomes.workerContractUsesModuleWorkerAndAbortSideChannel = calls[0]?.type === 'init'
        && workers[0]?.options?.type === 'module'
        && calls.some(call => call.type === 'abort')
        && calls.some(call => call.type === 'create_library' && call.model === 'bge-en');
    } finally {
      window.Worker = originalWorker;
      if (savedCount === null) localStorage.removeItem('labcharts-lens-local-count');
      else localStorage.setItem('labcharts-lens-local-count', savedCount);
    }

    return outcomes;
  }, { lensLocalUrl: moduleUrl('/js/lens-local.js') });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('knowledge base modal covers local document ingest and library controls', async ({ page }) => {
  await installFakeLensWorkerFactory(page);
  await page.goto('/app', { waitUntil: 'load' });

  const results = await page.evaluate(async ({ lensUrl }) => {
    const outcomes = {};
    const originalWorker = window.Worker;
    const originalSetTimeout = window.setTimeout;
    const navigatorProto = Object.getPrototypeOf(navigator);
    const originalStorage = Object.getOwnPropertyDescriptor(navigatorProto, 'storage');
    const saved = {
      config: localStorage.getItem('labcharts-lens-config'),
      count: localStorage.getItem('labcharts-lens-local-count'),
    };
    const calls = [];
    let lens = null;
    const state = {
      docs: [
        { source: 'alpha "quote".md', chunks: 2 },
        { source: 'beta.md', chunks: 1 },
      ],
      chunks: 3,
      libraries: [
        { id: 'lib-alpha', name: 'Alpha Papers', model: 'minilm' },
        { id: 'lib-beta', name: 'Beta Protocols', model: 'bge-en' },
      ],
      activeId: 'lib-alpha',
      models: {
        minilm: { label: 'MiniLM L6', tier: 1, language: 'multi', downloadMB: 100, dim: 384, notes: 'Small universal model.' },
        'bge-en': { label: 'BGE Small English', tier: 2, language: 'en', downloadMB: 130, dim: 384, notes: 'Best for English health notes.' },
        e5: { label: 'Multilingual E5', tier: 2, language: 'multi', downloadMB: 140, dim: 384, notes: 'Good for multilingual corpora.' },
      },
      // A very fast CPU benchmark is still capped at the balanced model;
      // MiniLM timing must not silently auto-select the much heavier base model.
      embedder: { tier: 3, msPerEmbed: 16, backend: 'wasm' },
    };
    const { FakeWorker } = window.__makeLensFakeWorker({
      state,
      calls,
      statsModel: 'active',
      statsBackend: 'webgpu',
    });

    const waitFor = async (predicate, timeout = 1500) => {
      const start = performance.now();
      while (performance.now() - start < timeout) {
        if (predicate()) return true;
        await new Promise(resolve => originalSetTimeout(resolve, 20));
      }
      return false;
    };

    try {
      window.Worker = FakeWorker;
      window.setTimeout = (fn, ms, ...args) => originalSetTimeout(fn, ms === 3000 ? 1 : ms, ...args);
      try {
        Object.defineProperty(navigatorProto, 'storage', {
          configurable: true,
          get: () => ({ persisted: async () => true }),
        });
      } catch {}
      localStorage.setItem('labcharts-lens-config', JSON.stringify({
        name: 'Alpha Papers',
        enabled: true,
        topK: 4,
        backend: 'in-browser',
        multiQuery: true,
      }));
      localStorage.setItem('labcharts-lens-local-count', '3');

      lens = await import(lensUrl);
      await lens.openKnowledgeBaseModal();
      const initialRendered = await waitFor(() => document.getElementById('lens-local-doc-list')?.textContent.includes('alpha "quote".md')
        && document.getElementById('lens-local-stats')?.textContent.includes('3 excerpts from 2 documents')
        && document.getElementById('lens-library-select')?.textContent.includes('Alpha Papers'));
      const libraryOptions = [...document.querySelectorAll('#lens-library-select option')].map(option => option.textContent);
      outcomes.modalHydratesLocalStatsDocsAndLibraries = initialRendered
        && libraryOptions.includes('Alpha Papers')
        && document.querySelector('.kb-doc-delete')?.getAttribute('aria-label') === 'Delete alpha "quote".md'
        && !document.querySelector('#kb-modal [onclick], #kb-modal [onchange], #kb-modal [oninput]')
        && document.querySelector('.kb-doc-delete')?.dataset.lensSource === 'alpha "quote".md';

      const drop = document.getElementById('lens-local-drop');
      const picker = document.getElementById('lens-local-filepick');
      let pickerClicked = false;
      picker.click = () => { pickerClicked = true; };
      drop.click();
      drop.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      drop.dispatchEvent(new Event('dragenter', { bubbles: true, cancelable: true }));
      drop.dispatchEvent(new Event('dragleave', { bubbles: true, cancelable: true }));
      const dropEvent = new Event('drop', { bubbles: true, cancelable: true });
      Object.defineProperty(dropEvent, 'dataTransfer', {
        value: { files: [new File(['Berberine and glucose notes.'], 'berberine.md', { type: 'text/markdown' })] },
      });
      drop.dispatchEvent(dropEvent);
      const ingestFinished = await waitFor(() => document.getElementById('lens-local-doc-list')?.textContent.includes('berberine.md'));
      const progressHidden = await waitFor(() => document.getElementById('lens-local-progress-wrap')?.style.display === 'none');
      outcomes.dropKeyboardAndIngestProgressFlow = pickerClicked
        && ingestFinished
        && progressHidden
        && calls.some(call => call.type === 'ingest' && call.files?.[0]?.name === 'berberine.md');

      await lens.handleLocalLensDeleteDoc('');
      outcomes.emptySourceDeleteGuard = !document.getElementById('confirm-dialog-overlay')?.classList.contains('show')
        && !calls.some(call => call.type === 'delete' && call.source === '');

      document.querySelector('.kb-doc-delete')?.click();
      await waitFor(() => document.getElementById('confirm-dialog-overlay')?.classList.contains('show'));
      const deletePrompt = document.getElementById('confirm-dialog-overlay')?.textContent || '';
      document.getElementById('confirm-ok')?.click();
      const deletedRendered = await waitFor(() => !document.getElementById('lens-local-doc-list')?.textContent.includes('alpha "quote".md'));

      document.querySelector('[data-lens-action="clear-local"]')?.click();
      await waitFor(() => document.getElementById('confirm-dialog-overlay')?.classList.contains('show'));
      document.getElementById('confirm-cancel')?.click();
      await waitFor(() => !document.getElementById('confirm-dialog-overlay')?.classList.contains('show'));
      document.querySelector('[data-lens-action="clear-local"]')?.click();
      await waitFor(() => document.getElementById('confirm-dialog-overlay')?.classList.contains('show'));
      document.getElementById('confirm-ok')?.click();
      const clearedRendered = await waitFor(() => document.getElementById('lens-local-stats')?.textContent.includes('No documents indexed yet'));
      outcomes.deleteAndClearConfirmFlows = deletePrompt.includes('alpha "quote".md')
        && deletedRendered
        && clearedRendered
        && calls.some(call => call.type === 'delete' && call.source === 'alpha "quote".md')
        && calls.filter(call => call.type === 'clear').length === 1;

      document.querySelector('[data-lens-action="new-library"]')?.click();
      await waitFor(() => document.getElementById('lens-library-create-overlay')?.classList.contains('show'));
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      const createDismissedOnly = await waitFor(() => !document.getElementById('lens-library-create-overlay')?.classList.contains('show'))
        && document.getElementById('kb-modal-overlay')?.classList.contains('show');
      document.querySelector('[data-lens-action="new-library"]')?.click();
      await waitFor(() => document.getElementById('lens-library-create-overlay')?.classList.contains('show'));
      const recommended = document.querySelector('input[name="lens-create-model"]:checked')?.value;
      document.getElementById('lens-create-name').value = 'Protocols';
      document.getElementById('lens-create-ok')?.click();
      const createdRendered = await waitFor(() => document.getElementById('lens-library-select')?.textContent.includes('Protocols'));

      const librarySelect = document.getElementById('lens-library-select');
      librarySelect.value = 'lib-beta';
      librarySelect.dispatchEvent(new Event('change', { bubbles: true }));
      await waitFor(() => calls.some(call => call.type === 'activate_library' && call.libraryId === 'lib-beta'));
      document.querySelector('[data-lens-action="rename-library"]')?.click();
      await waitFor(() => document.getElementById('prompt-dialog-overlay')?.classList.contains('show'));
      document.getElementById('prompt-dialog-input').value = 'Renamed Beta';
      document.getElementById('prompt-ok')?.click();
      const renamedRendered = await waitFor(() => document.getElementById('lens-library-select')?.textContent.includes('Renamed Beta'));

      document.querySelector('[data-lens-action="delete-library"]')?.click();
      await waitFor(() => document.getElementById('confirm-dialog-overlay')?.classList.contains('show'));
      document.getElementById('confirm-ok')?.click();
      const deletedLibraryRendered = await waitFor(() => !document.getElementById('lens-library-select')?.textContent.includes('Renamed Beta'));
      outcomes.libraryCreateEscapeDismissesOnlyChild = createDismissedOnly;
      outcomes.libraryCreateRecommendsBalancedModel = recommended === 'bge-en';
      outcomes.libraryCreateRendersAndReachesWorker = createdRendered
        && calls.some(call => call.type === 'create_library' && call.name === 'Protocols' && call.model === 'bge-en');
      outcomes.libraryActivateReachesWorker = calls.some(call => call.type === 'activate_library' && call.libraryId === 'lib-beta');
      outcomes.libraryRenameRendersAndReachesWorker = renamedRendered
        && calls.some(call => call.type === 'rename_library' && call.name === 'Renamed Beta');
      outcomes.libraryDeleteRendersAndReachesWorker = deletedLibraryRendered
        && calls.some(call => call.type === 'delete_library' && call.libraryId === 'lib-beta');
    } finally {
      lens?.closeKnowledgeBaseModal?.();
      document.getElementById('kb-modal-overlay')?.remove();
      document.getElementById('lens-library-create-overlay')?.remove();
      document.getElementById('confirm-dialog-overlay')?.remove();
      document.getElementById('prompt-dialog-overlay')?.remove();
      window.Worker = originalWorker;
      window.setTimeout = originalSetTimeout;
      if (originalStorage) {
        try { Object.defineProperty(navigatorProto, 'storage', originalStorage); } catch {}
      } else {
        try { delete navigatorProto.storage; } catch {}
      }
      if (saved.config === null) localStorage.removeItem('labcharts-lens-config');
      else localStorage.setItem('labcharts-lens-config', saved.config);
      if (saved.count === null) localStorage.removeItem('labcharts-lens-local-count');
      else localStorage.setItem('labcharts-lens-local-count', saved.count);
    }

    return outcomes;
  }, { lensUrl: moduleUrl('/js/lens.js') });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});
