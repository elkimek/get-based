// @vitest-environment jsdom
// Actual public UI, text parser and serialized local API; synthetic Worker replies,
// timers and Node FileList-like container. This does not prove real browser FileList.
import { File as NodeFile } from 'node:buffer';
import { afterEach, expect, it, vi } from 'vitest';
import type { WorkerRequest, WorkerReply, StatsReply, IngestStats } from '../js/lens-local-protocol.js';
import type { LensUiConfig } from '../js/lens-knowledge-base-ui.js';
import type { LibraryRecord } from '../js/lens-local-store.js';

const realTimeout = globalThis.setTimeout;
const text = 'Synthetic markdown with enough text to exercise actual file.text extraction.';
const library: LibraryRecord = {
  id: 'research', name: 'Research Papers', createdAt: 1_700_000_000_000, model: 'all-minilm',
};

type IngestWindow = Window & {
  _lensIngestRunning?: boolean;
  _lensIngestStopRequested?: boolean;
  _lensIngestJobToken?: symbol;
};
const appWindow = window as IngestWindow;
const requests: WorkerRequest[] = [];
let worker: WorkerBoundary | undefined;
let closeUi: (() => void) | undefined;
const corpus: StatsReply = {
  type: 'stats_result', total_chunks: 0, documents: [], dim: 384,
  model: 'minilm', backend: 'wasm', ms_per_embed: 100,
};

async function waitFor(predicate: () => boolean) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (predicate()) return;
    await new Promise<void>(resolve => realTimeout(resolve, 2));
  }
  expect(predicate(), JSON.stringify({ message: 'Expected original public operation to settle', stats: document.getElementById('lens-local-stats')?.textContent, requests, workerCreated: !!worker })).toBe(true);
}

class WorkerBoundary {
  listeners = new Set<(event: { data: WorkerReply }) => void>();
  pending: WorkerRequest | null = null;

  constructor(url: string | URL, options?: WorkerOptions) {
    // Vitest's Worker transform appends a harness query to the unchanged runtime URL.
    const workerUrl = new URL(String(url));
    expect(workerUrl.pathname).toBe('/js/lens-local-worker.js');
    expect(workerUrl.search).toBe('?worker_file&type=module');
    expect(options?.type).toBe('module');
    worker = this;
  }

  addEventListener(type: string, fn: (event: { data: WorkerReply }) => void) {
    if (type === 'message') this.listeners.add(fn);
  }

  removeEventListener(type: string, fn: (event: { data: WorkerReply }) => void) {
    if (type === 'message') this.listeners.delete(fn);
  }

  terminate() {}

  emit(data: WorkerReply) {
    for (const listener of this.listeners) listener({ data });
  }

  finish(cancelled: boolean) {
    const pending = this.pending;
    expect(pending).not.toBeNull();
    this.pending = null;
    if (!cancelled) {
      corpus.total_chunks = 2;
      corpus.documents = [{ source: String(pending?.files?.[0]?.name), chunks: 2 }];
    }
    const stats: IngestStats = {
      files_seen: 1, chunks_planned: 2, documents_indexed: cancelled ? 0 : 1,
      chunks_indexed: cancelled ? 0 : 2, replaced_documents: 0, skipped: [], cancelled,
    };
    this.emit({ type: 'ingest_done', stats });
  }

  postMessage(message: WorkerRequest) {
    requests.push(structuredClone(message));
    switch (message.type) {
      case 'init':
        queueMicrotask(() => this.emit({
          type: 'ready', numChunks: corpus.total_chunks, numDocs: corpus.documents.length,
          libraries: [library], activeId: library.id, activeName: library.name,
          activeModel: library.model!, embedder: null, models: {},
        }));
        return;
      case 'list_libraries':
        queueMicrotask(() => this.emit({ type: 'libraries_list', libraries: [library], activeId: library.id }));
        return;
      case 'stats':
        queueMicrotask(() => this.emit(structuredClone(corpus)));
        return;
      case 'ingest':
        expect(this.pending).toBeNull();
        this.pending = message;
        return;
      case 'commit_ingest':
        expect(this.pending).not.toBeNull();
        queueMicrotask(() => this.finish(false));
        return;
      case 'abort':
        expect(this.pending).not.toBeNull();
        queueMicrotask(() => this.finish(true));
        return;
      default:
        throw new Error(`Unexpected fixture request ${message.type}`);
    }
  }
}

afterEach(async () => {
  // Settle a pending synthetic transaction before restoring global fixture ports.
  if (worker?.pending) {
    worker.emit({ type: 'progress', stage: 'saving', total: 2 });
    await waitFor(() => !appWindow._lensIngestRunning);
  }
  closeUi?.();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete appWindow._lensIngestRunning;
  delete appWindow._lensIngestStopRequested;
  delete appWindow._lensIngestJobToken;
  document.body.replaceChildren();
});

it('keeps a new job stoppable and visible across a previous factory job cleanup boundary', async () => {
  requests.length = 0;
  worker = undefined;
  corpus.total_chunks = 0;
  corpus.documents = [];
  delete appWindow._lensIngestRunning;
  delete appWindow._lensIngestStopRequested;
  delete appWindow._lensIngestJobToken;
  vi.resetModules();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date', 'performance'] });
  vi.setSystemTime(new Date('2026-10-10T00:00:00Z'));
  vi.stubGlobal('Worker', WorkerBoundary);
  const frames: FrameRequestCallback[] = [];
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.push(callback);
    return frames.length;
  });
  const { createLensKnowledgeBaseUi } = await import('../js/lens-knowledge-base-ui.js');
  const cfg: LensUiConfig = {
    backend: 'in-browser', name: library.name, url: '', enabled: true,
    topK: 5, testProbe: 'Synthetic probe', multiQuery: true,
  };
  const cacheWrites: unknown[][] = [];

  function createUi() {
    return createLensKnowledgeBaseUi({
      defaultTestProbe: 'Synthetic probe', getLensConfig: () => cfg,
      saveLensConfig: partial => Object.assign(cfg, partial), getLensKey: () => '',
      saveLensKey: async () => {}, removeLens: async () => {},
      clearLensCache: () => cacheWrites.push(['clear']),
      getLensStatus: () => ({ state: 'idle', lastChunkCount: 0, lastError: null, sourceName: '' }),
      updateLensStatus: () => {}, hasLens: () => false, isValidLensUrl: () => true,
      testLensConnection: async () => ({ ok: true, chunkCount: 0 }), recordLocalLensStats: () => {},
    });
  }

  async function hydratePanel(ui: ReturnType<typeof createUi>) {
    document.getElementById('custom-lens-section')!.innerHTML = ui.renderCustomLensSection();
    expect(frames).toHaveLength(1);
    frames.shift()!(performance.now());
    await waitFor(() => document.getElementById('lens-local-drop')?.dataset.wired === '1');
  }

  async function select(name: string) {
    const picker = document.getElementById('lens-local-filepick') as HTMLInputElement;
    const live: File[] = [new NodeFile([text], name, { type: 'text/markdown' }) as unknown as File];
    const native = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!;
    Object.defineProperty(picker, 'files', { configurable: true, get: () => live });
    Object.defineProperty(picker, 'value', {
      configurable: true,
      get() { return native.get!.call(this); },
      set(value: string) {
        native.set!.call(this, value);
        if (value === '') live.length = 0;
      },
    });
    picker.dispatchEvent(new Event('change', { bubbles: true }));
    expect(live).toHaveLength(0);
    await waitFor(() => !!worker?.pending);
    expect(worker!.pending!.files).toEqual([{ name, text }]);
  }

  document.body.innerHTML = '<div id="custom-lens-section" class="settings-section"></div>';
  const uiA = createUi();
  closeUi = () => uiA.closeKnowledgeBaseModal();
  await hydratePanel(uiA);
  await select('first.md');
  worker!.emit({ type: 'progress', stage: 'start', total: 2 });
  worker!.emit({ type: 'progress', stage: 'saving', total: 2 });
  await waitFor(() => !appWindow._lensIngestRunning &&
    document.getElementById('lens-ingest-pill-cancel')?.textContent === 'Done');
  expect(requests.filter(message => message.type === 'commit_ingest')).toHaveLength(1);
  expect(corpus.documents).toEqual([{ source: 'first.md', chunks: 2 }]);
  expect(cacheWrites).toHaveLength(1);
  await vi.advanceTimersByTimeAsync(1000);

  // A new factory replaces only the panel, retaining the existing body-owned pill.
  const pill = document.getElementById('lens-ingest-pill')!;
  const uiB = createUi();
  closeUi = () => { uiA.closeKnowledgeBaseModal(); uiB.closeKnowledgeBaseModal(); };
  await hydratePanel(uiB);
  await select('second.md');
  expect.soft(document.getElementById('lens-ingest-pill')).toBe(pill);
  const stop = document.getElementById('lens-ingest-pill-cancel') as HTMLButtonElement;
  expect.soft(stop.disabled, 'A completed job must not disable Stop for the accepted next job').toBe(false);
  expect.soft(stop.textContent).toBe('Stop indexing');
  expect(appWindow._lensIngestRunning).toBe(true);

  // A cleanup is due at A completion +3000; B starts at +1000.
  await vi.advanceTimersByTimeAsync(1999);
  expect.soft(document.getElementById('lens-ingest-pill')).toBe(pill);
  expect.soft((document.getElementById('lens-local-progress-wrap') as HTMLElement).hidden).toBe(false);
  await vi.advanceTimersByTimeAsync(1);
  expect.soft(document.getElementById('lens-ingest-pill'), 'Old cleanup cannot remove a new running job').toBe(pill);
  const progress = document.getElementById('lens-local-progress-wrap') as HTMLElement;
  expect.soft(progress.hidden).toBe(false);
  expect.soft(progress.style.display).toBe('');
  expect(appWindow._lensIngestRunning).toBe(true);
  expect(requests.filter(message => message.type === 'ingest')).toHaveLength(2);

  // The real original Stop listener must reach the actual local API abort side channel.
  stop.click();
  await waitFor(() => requests.some(message => message.type === 'abort') && !appWindow._lensIngestRunning);
  expect(stop.disabled).toBe(true);
  expect(stop.textContent).toBe('Stopped');
  expect(requests.filter(message => message.type === 'commit_ingest')).toHaveLength(1);
  expect(corpus.documents).toEqual([{ source: 'first.md', chunks: 2 }]);
  expect(cacheWrites).toHaveLength(1);
  expect(appWindow._lensIngestStopRequested).toBe(false);

  // The current job retains its ordinary completion lifetime exactly.
  await vi.advanceTimersByTimeAsync(2999);
  expect(document.getElementById('lens-ingest-pill')).toBe(pill);
  await vi.advanceTimersByTimeAsync(1);
  expect(document.getElementById('lens-ingest-pill')).toBeNull();
  expect(progress.hidden).toBe(true);
  expect(progress.style.display).toBe('none');
});
