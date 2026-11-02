import { expect, test } from './coverage-fixture.js';
import { seedLocalKnowledgeCorpus, knowledgeCorpusReceipt } from '../helpers/knowledge-browser-fixture.js';
import type { openLocalLibrarySession } from '../../js/lens-local-library-session.js';
import type { openLocalLens } from '../../js/lens-local.js';
type TestWindow = Window & { librarySession: Awaited<ReturnType<typeof openLocalLibrarySession>>; fullLens: Awaited<ReturnType<typeof openLocalLens>> };

test('native and metadata-only library workers retain concurrent tab edits and refresh active corpus without model downloads', async ({ page, context }, info) => {
  const downloads: string[] = [], errors: string[] = [];
  context.on('request', request => { if (/huggingface|jsdelivr.*transformers|cdn-lfs|xethub|\.onnx(?:\?|$)/i.test(request.url())) downloads.push(request.url()); });
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    const Native = window.Worker;
    window.Worker = class extends Native { constructor(url: string | URL, options?: WorkerOptions) { const target = new URL(url, location.href); if (target.pathname.endsWith('/lens-local-worker.js')) target.searchParams.set('mock', '1'); super(target, options); } };
  });
  await page.goto('/app'); await page.locator('html[data-app-ready]').waitFor();
  const originalId = await seedLocalKnowledgeCorpus(page, { configure: false }), original = await knowledgeCorpusReceipt(page, originalId);
  const peer = await context.newPage(); peer.on('pageerror', error => errors.push(error.message)); await peer.goto('/app'); await peer.locator('html[data-app-ready]').waitFor();
  await page.evaluate(async () => { (window as unknown as TestWindow).fullLens = await (await import('/js/lens-local.js')).openLocalLens(); });
  await peer.evaluate(async () => { (window as unknown as TestWindow).librarySession = await (await import('/js/lens-local-library-session.js')).openLocalLibrarySession(); });
  const [native, metadata] = await Promise.all([
    page.evaluate(async () => (window as unknown as TestWindow).fullLens.createLibrary('Native concurrent collection')),
    peer.evaluate(async () => (window as unknown as TestWindow).librarySession.createLibrary('Metadata concurrent collection', 'bge-base-en')),
  ]);
  const listed = await page.evaluate(async () => (window as unknown as TestWindow).fullLens.listLibraries());
  expect(listed.libraries.map(row => row.id).sort()).toEqual([originalId, native.id, metadata.id].sort());
  await Promise.all([
    page.evaluate(async id => (window as unknown as TestWindow).fullLens.renameLibrary(id, 'Native renamed collection'), native.id),
    peer.evaluate(async id => (window as unknown as TestWindow).librarySession.renameLibrary(id, 'Metadata renamed collection'), metadata.id),
  ]);
  const activated = await peer.evaluate(async id => (window as unknown as TestWindow).librarySession.activateLibrary(id), metadata.id);
  expect(activated.activeId).toBe(metadata.id); expect(activated.activeModel).toBe('bge-base-en'); expect(activated.numChunks).toBe(0); expect(activated.embedder).toBeNull();
  expect((await page.evaluate(async () => (window as unknown as TestWindow).fullLens.getStats())).total_chunks).toBe(0);
  const renamed = await peer.evaluate(async () => (window as unknown as TestWindow).librarySession.listLibraries());
  expect(renamed.libraries.find(row => row.id === native.id)!.name).toBe('Native renamed collection'); expect(renamed.libraries.find(row => row.id === metadata.id)!.name).toBe('Metadata renamed collection');
  await peer.evaluate(async id => (window as unknown as TestWindow).librarySession.activateLibrary(id), originalId);
  const restored = await page.evaluate(async () => (window as unknown as TestWindow).fullLens.getStats()); expect(restored.total_chunks).toBeGreaterThan(0); expect(restored.documents).toHaveLength(2);
  const retry = await peer.evaluate(async () => { const session = (window as unknown as TestWindow).librarySession; let failure = ''; try { await session.deleteLibrary('missing-library'); } catch (error) { failure = String(error); } return { failure, listed: await session.listLibraries() }; });
  expect(retry.failure).toContain('No library with id'); expect(retry.listed.libraries).toHaveLength(3);
  expect((await knowledgeCorpusReceipt(page, originalId)).corpus).toEqual(original.corpus); expect(downloads).toEqual([]); expect(errors).toEqual([]);
  await peer.evaluate(() => (window as unknown as TestWindow).librarySession.close());
  await info.attach('library-concurrent-workers', { body: JSON.stringify({ originalId, native, metadata, listed, renamed, activated, restored, errors, downloads, boundary: 'Actual two-tab native client and production metadata-only Worker/OPFS/Web Locks. Native embedding fixture is mock only; metadata path uses no embedding implementation.' }), contentType: 'application/json' });
});

test('failed physical cleanup cannot revive the final library corpus after a metadata session is reopened', async ({ page, context }, info) => {
  const downloads: string[] = [];
  context.on('request', request => { if (/huggingface|jsdelivr.*transformers|cdn-lfs|xethub|\.onnx(?:\?|$)/i.test(request.url())) downloads.push(request.url()); });
  await page.goto('/app'); await page.locator('html[data-app-ready]').waitFor();
  const originalId = await seedLocalKnowledgeCorpus(page, { configure: false }), before = await knowledgeCorpusReceipt(page, originalId);
  const result = await page.evaluate(async originalId => {
    const Native = window.Worker, url = new URL('/js/lens-local-worker.js', location.href).href;
    const wrapper = URL.createObjectURL(new Blob([`const remove = FileSystemDirectoryHandle.prototype.removeEntry; FileSystemDirectoryHandle.prototype.removeEntry = function(name, options) { if (name === ${JSON.stringify(originalId)}) return Promise.reject(new DOMException('Synthetic cleanup failure', 'UnknownError')); return remove.call(this, name, options); }; await import(${JSON.stringify(url)}); self.postMessage({ fixtureReady: true });`], { type: 'text/javascript' }));
    window.Worker = class extends Native { constructor(target: string | URL, options?: WorkerOptions) {
      const wrapped = String(target).includes('lens-local-worker.js'); super(wrapped ? wrapper : target, options);
      if (!wrapped) return;
      const post = this.postMessage.bind(this), queued: unknown[] = []; let ready = false;
      this.postMessage = ((message: unknown) => { if (ready) post(message); else queued.push(message); }) as Worker['postMessage'];
      this.addEventListener('message', event => { if (event.data?.fixtureReady) { event.stopImmediatePropagation(); ready = true; for (const message of queued.splice(0)) post(message); } });
    } };
    try {
      const { openLocalLibrarySession } = await import('/js/lens-local-library-session.js');
      const first = await openLocalLibrarySession(); let removed;
      try { removed = await first.deleteLibrary(originalId); } finally { first.close(); }
      const reopened = await openLocalLibrarySession(); try { return { removed, reopened: await reopened.listLibraries() }; } finally { reopened.close(); }
    } finally { window.Worker = Native; URL.revokeObjectURL(wrapper); }
  }, originalId);
  expect(result.removed.cleanupPending).toBe(true); expect(result.removed.activeId).not.toBe(originalId); expect(result.removed.numChunks).toBe(0); expect(result.removed.numDocs).toBe(0); expect(result.reopened.libraries).toHaveLength(1); expect(result.reopened.activeId).toBe(result.removed.activeId);
  expect((await knowledgeCorpusReceipt(page, originalId)).corpus).toEqual(before.corpus);
  const fresh = await knowledgeCorpusReceipt(page, result.removed.activeId); expect(fresh.corpus.every(row => row === null)).toBe(true); expect(downloads).toEqual([]);
  await info.attach('last-library-cleanup', { body: JSON.stringify({ result, downloads, boundary: 'Actual production metadata Worker and OPFS with injected removal failure. Original synthetic bytes remain physically pending cleanup but cannot be addressed as the active replacement.' }), contentType: 'application/json' });
});
