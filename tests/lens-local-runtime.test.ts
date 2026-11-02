import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const realWorker = globalThis.Worker;

type HarnessOptions = {activeId?: string; throwOnMessageType?: string; errorMessageType?: string; errorEventType?: string; requiresReload?: boolean; deferMessageType?: string};
type WorkerRequestFixture = {type: string; files?: {name: string; text: string}[]; text?: string; topK?: number; source?: string; libraryId?: string; name?: string; model?: string};
type WorkerEventFixture = {data?: unknown; message?: string};

function makeWorkerHarness(options: HarnessOptions = {}) {
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
  const workers: StubWorker[] = [];

  interface StubWorker {url: string; init: WorkerOptions | undefined; messages: WorkerRequestFixture[]; listeners: Record<'message' | 'error', Set<(event: WorkerEventFixture) => void>>; terminated: boolean; pendingIngest: WorkerRequestFixture | null}
  class StubWorker {
    constructor(url: string | URL, init?: WorkerOptions) {
      this.url = String(url);
      this.init = init;
      this.messages = [];
      this.listeners = { message: new Set(), error: new Set() };
      this.terminated = false;
      this.pendingIngest = null;
      workers.push(this);
    }

    addEventListener(type: 'message' | 'error', fn: (event: WorkerEventFixture) => void) {
      this.listeners[type]?.add(fn);
    }

    removeEventListener(type: 'message' | 'error', fn: (event: WorkerEventFixture) => void) {
      this.listeners[type]?.delete(fn);
    }

    postMessage(msg: WorkerRequestFixture) {
      this.messages.push(msg);
      if (options.throwOnMessageType === msg.type) throw new Error(`${msg.type} postMessage blocked`);
      if (options.deferMessageType !== msg.type) queueMicrotask(() => this.respond(msg));
    }

    terminate() {
      this.terminated = true;
    }

    emitMessage(data: unknown) {
      for (const fn of this.listeners.message) fn({ data });
    }

    emitError(message: string) {
      for (const fn of this.listeners.error) fn({ message });
    }

    readyPayload(extra: Record<string, unknown> = {}) {
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

    respond(msg: WorkerRequestFixture) {
      if (options.errorMessageType === msg.type) {
        this.emitMessage({ type: 'error', message: `${msg.type} failed`, ...(options.requiresReload ? { requiresReload: true } : {}) });
        return;
      }
      if (options.errorEventType === msg.type) {
        this.emitError(`${msg.type} worker error`);
        return;
      }

      switch (msg.type) {
        case 'init':
        case 'init_metadata':
          this.emitMessage(this.readyPayload());
          return;
        case 'ingest':
          this.emitMessage({ type: 'progress', stage: 'embed', index: 1, total: msg.files!.length, source: msg.files![0]?.name });
          this.pendingIngest = msg;
          this.emitMessage({ type: 'progress', stage: 'saving', total: msg.files!.length + 1 });
          return;
        case 'commit_ingest': {
          const ingest = this.pendingIngest;
          if (!ingest) return;
          this.pendingIngest = null;
          state.total += ingest.files!.length + 1;
          state.documents = ingest.files!.map(file => ({ source: file.name, chunks: 1 }));
          this.emitMessage({
            type: 'ingest_done',
            stats: { files_seen: ingest.files!.length, chunks_indexed: ingest.files!.length + 1 },
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
          state.activeId = msg.libraryId!;
          state.activeName = state.libraries.find(library => library.id === msg.libraryId)?.name || 'Activated';
          state.total = 4;
          state.documents = [{ source: 'activated.md', chunks: 4 }];
          this.emitMessage(this.readyPayload());
          return;
        case 'create_library': {
          const id = `library-${state.libraries.length + 1}`;
          const library = { id, name: msg.name!, model: msg.model || 'all-minilm' };
          state.libraries.push(library);
          this.emitMessage({ type: 'library_created', id, name: library.name, model: library.model, libraries: state.libraries });
          return;
        }
        case 'rename_library': {
          const library = state.libraries.find(item => item.id === msg.libraryId);
          if (library) library.name = msg.name!;
          this.emitMessage({ type: 'library_renamed', id: msg.libraryId, name: msg.name!, libraries: state.libraries });
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

async function loadLensLocal(options?: HarnessOptions) {
  vi.resetModules();
  const harness = makeWorkerHarness(options);
  (globalThis as unknown as {Worker: unknown}).Worker = harness.Worker;
  return { harness, mod: await import('../js/lens-local.js') };
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  if (realWorker) globalThis.Worker = realWorker;
  else delete (globalThis as {Worker?: unknown}).Worker;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
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
    expect(harness.workers[0]!.url).toContain('lens-local-worker.js');
    expect(harness.workers[0]!.init).toEqual({ type: 'module' });
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
    expect(harness.workers[0]!.messages).toContainEqual({ type: 'commit_ingest' });
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
    expect(harness.workers[0]!.messages.at(-1)).toEqual({ type: 'abort' });
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
    expect(harness.workers[0]!.messages).toEqual(expect.arrayContaining([
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
    expect(harness.workers[0]!.messages).toEqual([{ type: 'init' }, { type: 'init' }]);
  });

  it.each(['errorMessageType', 'throwOnMessageType'] as const)('recovers later requests after %s failure without poisoning the native queue', async field => {
    const options: HarnessOptions = { [field]: 'create_library' }, { mod } = await loadLensLocal(options), lens = await mod.openLocalLens();
    await expect(lens.createLibrary('Failed library')).rejects.toThrow(); delete options[field];
    await expect(lens.listLibraries()).resolves.toMatchObject({ activeId: 'active-library' }); await expect(lens.createLibrary('Retried library')).resolves.toMatchObject({ name: 'Retried library' });
  });

  it('retries initialization after the failed dependency becomes available', async () => {
    const options: HarnessOptions = { errorMessageType: 'init' }, { mod, harness } = await loadLensLocal(options); await expect(mod.openLocalLens()).rejects.toThrow('init failed'); delete options.errorMessageType;
    await expect(mod.openLocalLens()).resolves.toMatchObject({ activeId: 'active-library' }); expect(harness.workers[0]!.messages).toEqual([{ type: 'init' }, { type: 'init' }]);
  });

  it('lets an already queued read proceed after a mutation rejects', async () => {
    const { mod } = await loadLensLocal({ errorMessageType: 'create_library' }), lens = await mod.openLocalLens();
    const failed = lens.createLibrary('Failed'), queued = lens.listLibraries(); await expect(failed).rejects.toThrow('create_library failed'); await expect(queued).resolves.toMatchObject({ activeId: 'active-library' });
  });

  it('restarts a crashed worker for existing handles and ignores its late replies', async () => {
    const options: HarnessOptions = { errorEventType: 'stats' }, { mod, harness } = await loadLensLocal(options), lens = await mod.openLocalLens();
    const retired = harness.workers[0]!; await expect(lens.getStats()).rejects.toThrow('stats worker error'); expect(retired.terminated).toBe(true); delete options.errorEventType;
    await expect(lens.getStats()).resolves.toMatchObject({ total_chunks: 2 }); expect(harness.workers).toHaveLength(2); const replacement = harness.workers[1]!;
    retired.emitMessage(retired.readyPayload({ numChunks: 999, activeId: 'retired-library' })); await expect(mod.openLocalLens()).resolves.toMatchObject({ activeId: 'active-library', numChunks: 2 });
    expect(replacement.messages.map(message => message.type)).toEqual(['init', 'stats']); expect(localStorage.getItem('labcharts-lens-local-count')).toBe('2');
  });
  it('retires an unconfirmed-write worker and reloads storage before an existing handle proceeds', async () => {
    const options: HarnessOptions = { errorMessageType: 'create_library', requiresReload: true }, { mod, harness } = await loadLensLocal(options), lens = await mod.openLocalLens();
    await expect(lens.createLibrary('Unconfirmed')).rejects.toMatchObject({ requiresReload: true }); expect(harness.workers[0]!.terminated).toBe(true); delete options.errorMessageType;
    await expect(lens.listLibraries()).resolves.toMatchObject({ activeId: 'active-library' }); expect(harness.workers[1]!.messages.map(message => message.type)).toEqual(['init', 'list_libraries']);
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


describe('metadata-only library sessions', () => {
  it('initializes only metadata and recovers after an ordinary rejected request', async () => {
    vi.stubGlobal('navigator', { locks: { request: () => {} } });
    const options: HarnessOptions = { errorMessageType: 'create_library' }, { harness } = await loadLensLocal(options);
    const { openLocalLibrarySession } = await import('../js/lens-local-library-session.js'), session = await openLocalLibrarySession();
    await expect(session.createLibrary('Synthetic')).rejects.toThrow('create_library failed'); delete options.errorMessageType;
    await expect(session.listLibraries()).resolves.toMatchObject({ activeId: 'active-library' });
    expect(harness.workers[0]!.messages.map(message => message.type)).toEqual(['init_metadata', 'create_library', 'list_libraries']); session.close(); expect(harness.workers[0]!.terminated).toBe(true);
  });
  it.each(['errorMessageType', 'errorEventType'] as const)('closes an unconfirmed session after %s without replay and requires an explicit new session', async fault => {
    vi.stubGlobal('navigator', { locks: { request: () => {} } });
    const options: HarnessOptions = { [fault]: 'create_library', requiresReload: true }, { harness } = await loadLensLocal(options);
    const { openLocalLibrarySession } = await import('../js/lens-local-library-session.js'), session = await openLocalLibrarySession();
    await expect(session.createLibrary('Unconfirmed')).rejects.toMatchObject({ requiresReload: true });
    await expect(session.listLibraries()).rejects.toThrow('closed'); expect(harness.workers).toHaveLength(1); expect(harness.workers[0]!.terminated).toBe(true); expect(harness.workers[0]!.messages.filter(message => message.type === 'create_library')).toHaveLength(1);
    delete options[fault]; const reopened = await openLocalLibrarySession(); await expect(reopened.listLibraries()).resolves.toMatchObject({ activeId: 'active-library' }); expect(harness.workers[1]!.messages[0]!.type).toBe('init_metadata'); reopened.close();
  });
  it('fails before creating a worker when browser-wide locking is unavailable', async () => {
    vi.stubGlobal('navigator', {}); const { harness } = await loadLensLocal(); const { openLocalLibrarySession } = await import('../js/lens-local-library-session.js');
    await expect(openLocalLibrarySession()).rejects.toThrow('browser-wide storage locking'); expect(harness.workers).toHaveLength(0);
  });
});

it('closing a pending metadata mutation rejects it as unconfirmed and rejects queued reads without sending them', async () => {
  vi.stubGlobal('navigator', { locks: { request: () => {} } });
  const { harness } = await loadLensLocal({ deferMessageType: 'create_library' }); const { openLocalLibrarySession } = await import('../js/lens-local-library-session.js'); const session = await openLocalLibrarySession();
  const mutation = session.createLibrary('Pending synthetic collection'), read = session.listLibraries();
  const outcome = expect(mutation).rejects.toMatchObject({ requiresReload: true }), queued = expect(read).rejects.toThrow('closed');
  await vi.waitFor(() => expect(harness.workers[0]!.messages.map(message => message.type)).toContain('create_library')); session.close(); await outcome; await queued;
  expect(harness.workers[0]!.messages.map(message => message.type)).toEqual(['init_metadata', 'create_library']); expect(harness.workers[0]!.terminated).toBe(true);
});
it('a metadata initialization message failure retires the worker and leaves an explicit new-session retry available', async () => {
  vi.stubGlobal('navigator', { locks: { request: () => {} } }); const options: HarnessOptions = { throwOnMessageType: 'init_metadata' }, { harness } = await loadLensLocal(options);
  const { openLocalLibrarySession } = await import('../js/lens-local-library-session.js'); await expect(openLocalLibrarySession()).rejects.toThrow('init_metadata postMessage blocked'); expect(harness.workers[0]!.terminated).toBe(true);
  delete options.throwOnMessageType; const session = await openLocalLibrarySession(); await expect(session.listLibraries()).resolves.toMatchObject({ activeId: 'active-library' }); session.close();
});
