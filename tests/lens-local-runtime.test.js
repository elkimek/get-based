import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const realWorker = globalThis.Worker;

function makeWorkerHarness(options = {}) {
  const state = {
    activeId: options.activeId || 'active-library',
    activeName: 'Active Library',
    documents: [{ source: 'notes.md', chunks: 2 }],
    libraries: [
      { id: 'default', name: 'Default Library', model: 'all-minilm' },
      { id: 'active-library', name: 'Active Library', model: 'bge-small-en' },
    ],
    total: 2,
  };
  const workers = [];

  class StubWorker {
    constructor(url, init) {
      this.url = String(url);
      this.init = init;
      this.messages = [];
      this.listeners = { message: new Set(), error: new Set() };
      this.terminated = false;
      this.pendingIngest = null;
      workers.push(this);
    }

    addEventListener(type, fn) {
      this.listeners[type]?.add(fn);
    }

    removeEventListener(type, fn) {
      this.listeners[type]?.delete(fn);
    }

    postMessage(msg) {
      this.messages.push(msg);
      if (options.throwOnMessageType === msg.type) throw new Error(`${msg.type} postMessage blocked`);
      queueMicrotask(() => this.respond(msg));
    }

    terminate() {
      this.terminated = true;
    }

    emitMessage(data) {
      for (const fn of this.listeners.message) fn({ data });
    }

    emitError(message) {
      for (const fn of this.listeners.error) fn({ message });
    }

    readyPayload(extra = {}) {
      return {
        type: 'ready',
        numChunks: state.total,
        numDocs: state.documents.length,
        libraries: state.libraries,
        activeId: state.activeId,
        activeName: state.activeName,
        activeModel: 'bge-small-en',
        embedder: { backend: 'wasm', msPerEmbed: 12 },
        models: { 'all-minilm': { dim: 384 } },
        ...extra,
      };
    }

    respond(msg) {
      if (options.errorMessageType === msg.type) {
        this.emitMessage({ type: 'error', message: `${msg.type} failed` });
        return;
      }
      if (options.errorEventType === msg.type) {
        this.emitError(`${msg.type} worker error`);
        return;
      }

      switch (msg.type) {
        case 'init':
          this.emitMessage(this.readyPayload());
          return;
        case 'ingest':
          this.emitMessage({ type: 'progress', stage: 'embed', index: 1, total: msg.files.length, source: msg.files[0]?.name });
          this.pendingIngest = msg;
          this.emitMessage({ type: 'progress', stage: 'saving', total: msg.files.length + 1 });
          return;
        case 'commit_ingest': {
          const ingest = this.pendingIngest;
          if (!ingest) return;
          this.pendingIngest = null;
          state.total += ingest.files.length + 1;
          state.documents = ingest.files.map(file => ({ source: file.name, chunks: 1 }));
          this.emitMessage({
            type: 'ingest_done',
            stats: { files_seen: ingest.files.length, chunks_indexed: ingest.files.length + 1 },
          });
          return;
        }
        case 'query':
          this.emitMessage({
            type: 'query_result',
            chunks: [
              { text: `${msg.text} strong`, source: 'notes.md', score: 0.92 },
              { text: 'medium match', source: 'notes.md', score: 0.42 },
              { text: 'weak match', source: 'old.md', score: 0.12 },
            ].slice(0, msg.topK),
          });
          return;
        case 'stats':
          this.emitMessage({
            type: 'stats_result',
            total_chunks: state.total,
            documents: state.documents,
            dim: 384,
            model: 'Xenova/bge-small-en-v1.5',
          });
          return;
        case 'delete':
          state.total = Math.max(0, state.total - 2);
          state.documents = state.documents.filter(doc => doc.source !== msg.source);
          this.emitMessage({ type: 'delete_done', deleted_chunks: 2 });
          return;
        case 'clear':
          state.total = 0;
          state.documents = [];
          this.emitMessage({ type: 'clear_done' });
          return;
        case 'list_libraries':
          this.emitMessage({ type: 'libraries_list', libraries: state.libraries, activeId: state.activeId });
          return;
        case 'activate_library':
          state.activeId = msg.libraryId;
          state.activeName = state.libraries.find(library => library.id === msg.libraryId)?.name || 'Activated';
          state.total = 4;
          state.documents = [{ source: 'activated.md', chunks: 4 }];
          this.emitMessage(this.readyPayload());
          return;
        case 'create_library': {
          const id = `library-${state.libraries.length + 1}`;
          const library = { id, name: msg.name, model: msg.model || 'all-minilm' };
          state.libraries.push(library);
          this.emitMessage({ type: 'library_created', id, name: library.name, model: library.model, libraries: state.libraries });
          return;
        }
        case 'rename_library': {
          const library = state.libraries.find(item => item.id === msg.libraryId);
          if (library) library.name = msg.name;
          this.emitMessage({ type: 'library_renamed', id: msg.libraryId, name: msg.name, libraries: state.libraries });
          return;
        }
        case 'delete_library':
          state.libraries = state.libraries.filter(library => library.id !== msg.libraryId);
          state.activeId = 'default';
          state.total = 3;
          state.documents = [{ source: 'default.md', chunks: 3 }];
          this.emitMessage({
            type: 'library_deleted',
            libraries: state.libraries,
            activeId: state.activeId,
            numChunks: state.total,
            numDocs: state.documents.length,
          });
          return;
        case 'abort':
          return;
        default:
          this.emitMessage({ type: 'error', message: `Unknown message type: ${msg.type}` });
      }
    }
  }

  return { Worker: StubWorker, state, workers };
}

async function loadLensLocal(options) {
  vi.resetModules();
  const harness = makeWorkerHarness(options);
  globalThis.Worker = harness.Worker;
  return { harness, mod: await import('../js/lens-local.js') };
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  if (realWorker) globalThis.Worker = realWorker;
  else delete globalThis.Worker;
  vi.restoreAllMocks();
});

describe('lens-local main-thread runtime behavior', () => {
  it('reads the cached corpus size defensively', async () => {
    const { mod } = await loadLensLocal();

    expect(mod.peekLocalCorpusSize()).toBe(0);
    localStorage.setItem('labcharts-lens-local-count', '12');
    expect(mod.peekLocalCorpusSize()).toBe(12);
    localStorage.setItem('labcharts-lens-local-count', 'not-a-number');
    expect(mod.peekLocalCorpusSize()).toBe(0);

    vi.spyOn(localStorage, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(mod.peekLocalCorpusSize()).toBe(0);
  });

  it('initializes the worker once and wraps corpus operations', async () => {
    const { harness, mod } = await loadLensLocal();
    const noisyProgress = vi.fn(() => { throw new Error('subscriber failed'); });
    const progress = vi.fn();
    const unsubscribeNoisy = mod.subscribeProgress(noisyProgress);
    const unsubscribeProgress = mod.subscribeProgress(progress);

    const lens = await mod.openLocalLens();
    const lensAgain = await mod.openLocalLens();

    expect(lensAgain).toBe(lens);
    expect(harness.workers).toHaveLength(1);
    expect(harness.workers[0].url).toContain('lens-local-worker.js');
    expect(harness.workers[0].init).toEqual({ type: 'module' });
    expect(localStorage.getItem('labcharts-lens-local-count')).toBe('2');
    expect(lens).toMatchObject({
      numChunks: 2,
      numDocs: 1,
      activeId: 'active-library',
      activeName: 'Active Library',
      activeModel: 'bge-small-en',
      embedder: { backend: 'wasm', msPerEmbed: 12 },
      models: { 'all-minilm': { dim: 384 } },
    });

    await expect(lens.ingest([{ name: 'one.md', text: 'one' }, { name: 'two.md', text: 'two' }]))
      .resolves.toEqual({ files_seen: 2, chunks_indexed: 3 });
    expect(noisyProgress).toHaveBeenCalledWith(expect.objectContaining({ type: 'progress', source: 'one.md' }));
    expect(progress).toHaveBeenCalledWith(expect.objectContaining({ type: 'progress', source: 'one.md' }));
    expect(progress).toHaveBeenCalledWith(expect.objectContaining({ type: 'progress', stage: 'saving' }));
    expect(harness.workers[0].messages).toContainEqual({ type: 'commit_ingest' });
    expect(localStorage.getItem('labcharts-lens-local-count')).toBe('5');

    unsubscribeNoisy();
    unsubscribeProgress();
    progress.mockClear();
    await lens.ingest([{ name: 'three.md', text: 'three' }]);
    expect(progress).not.toHaveBeenCalled();

    await expect(lens.query('vitamin d', 2)).resolves.toEqual([
      { text: 'vitamin d strong', source: 'notes.md', score: 0.92 },
      { text: 'medium match', source: 'notes.md', score: 0.42 },
    ]);
    await expect(lens.getStats()).resolves.toMatchObject({
      total_chunks: 7,
      documents: [{ source: 'three.md', chunks: 1 }],
      dim: 384,
      model: 'Xenova/bge-small-en-v1.5',
      backend: 'wasm',
    });

    await expect(lens.deleteDocument('three.md')).resolves.toBe(2);
    expect(localStorage.getItem('labcharts-lens-local-count')).toBe('5');
    await expect(lens.clear()).resolves.toBeUndefined();
    expect(localStorage.getItem('labcharts-lens-local-count')).toBe('0');

    lens.abort();
    expect(harness.workers[0].messages.at(-1)).toEqual({ type: 'abort' });
  });

  it('wraps library management messages and count refreshes', async () => {
    const { mod } = await loadLensLocal();
    const lens = await mod.openLocalLens();

    await expect(lens.listLibraries()).resolves.toMatchObject({
      activeId: 'active-library',
      libraries: expect.arrayContaining([expect.objectContaining({ id: 'active-library' })]),
    });

    await expect(lens.activateLibrary('default')).resolves.toMatchObject({
      activeId: 'default',
      activeName: 'Default Library',
      numChunks: 4,
      numDocs: 1,
    });
    expect(localStorage.getItem('labcharts-lens-local-count')).toBe('4');

    await expect(lens.createLibrary('Research', 'bge-base-en')).resolves.toMatchObject({
      id: 'library-3',
      name: 'Research',
      model: 'bge-base-en',
      libraries: expect.arrayContaining([expect.objectContaining({ id: 'library-3' })]),
    });
    await expect(lens.renameLibrary('library-3', 'Clinical Research')).resolves.toMatchObject({
      id: 'library-3',
      name: 'Clinical Research',
      libraries: expect.arrayContaining([expect.objectContaining({ name: 'Clinical Research' })]),
    });
    await expect(lens.deleteLibrary('library-3')).resolves.toMatchObject({
      activeId: 'default',
      numChunks: 3,
      numDocs: 1,
      libraries: expect.not.arrayContaining([expect.objectContaining({ id: 'library-3' })]),
    });
    expect(localStorage.getItem('labcharts-lens-local-count')).toBe('3');
  });

  it('filters local lens query results and labels them with the active library', async () => {
    const { harness, mod } = await loadLensLocal();

    await expect(mod.queryLensLocal('   ')).resolves.toBeNull();
    expect(harness.workers).toHaveLength(0);

    await expect(mod.queryLensLocal(' vitamin d ', { topK: 3, floor: 0.4 })).resolves.toEqual({
      chunks: [
        { text: 'vitamin d strong', source: 'notes.md', score: 0.92 },
        { text: 'medium match', source: 'notes.md', score: 0.42 },
      ],
      sourceName: 'Active Library',
    });
    await expect(mod.queryLensLocal(' vitamin d ', { topK: 3, floor: 1.0 })).resolves.toEqual({
      chunks: [],
      sourceName: 'Active Library',
    });
    expect(harness.workers[0].messages).toEqual(expect.arrayContaining([
      { type: 'query', text: 'vitamin d', topK: 3 },
      { type: 'list_libraries' },
    ]));
  });

  it('falls back to a generic source label when the active library is missing', async () => {
    const { mod } = await loadLensLocal({ activeId: 'missing-library' });

    await expect(mod.queryLensLocal('light')).resolves.toEqual({
      chunks: [
        { text: 'light strong', source: 'notes.md', score: 0.92 },
        { text: 'medium match', source: 'notes.md', score: 0.42 },
      ],
      sourceName: 'On this device',
    });
  });

  it('keeps working when localStorage count writes fail', async () => {
    const { mod } = await loadLensLocal();
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('quota exceeded'); });

    await expect(mod.openLocalLens()).resolves.toMatchObject({ numChunks: 2 });
  });

  it('rejects queued requests when the worker sends an error message', async () => {
    const { harness, mod } = await loadLensLocal({ errorMessageType: 'init' });

    await expect(mod.openLocalLens()).rejects.toThrow('init failed');
    await expect(mod.openLocalLens()).rejects.toThrow('init failed');
    expect(harness.workers).toHaveLength(1);
    expect(harness.workers[0].messages).toEqual([{ type: 'init' }]);
  });

  it('rejects queued requests when the worker itself errors', async () => {
    const { mod } = await loadLensLocal({ errorEventType: 'init' });

    await expect(mod.openLocalLens()).rejects.toThrow('init worker error');
  });

  it('swallows abort postMessage failures', async () => {
    const { mod } = await loadLensLocal({ throwOnMessageType: 'abort' });
    const lens = await mod.openLocalLens();

    expect(() => lens.abort()).not.toThrow();
  });
});
