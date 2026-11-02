import type { Page } from '@playwright/test';
/** Fixture writes use the actual native worker and OPFS, with its mock embedder. */
export async function seedLocalKnowledgeCorpus(page: Page, { configure = true } = {}) {
  return page.evaluate(async configure => {
    const worker = new Worker('/js/lens-local-worker.js?mock=1', { type: 'module' });
    const send = (message: Record<string, unknown>, expected: string) => new Promise<Record<string, unknown>>((resolve, reject) => {
      const timer = setTimeout(() => { worker.terminate(); reject(new Error('Native corpus fixture timed out')); }, 15000);
      worker.onerror = () => { clearTimeout(timer); reject(new Error('Native corpus fixture worker failed')); };
      worker.onmessage = event => {
        const data = event.data as Record<string, unknown>;
        if (data.type === 'progress' && data.stage === 'saving') worker.postMessage({ type: 'commit_ingest' });
        else if (data.type === 'error') { clearTimeout(timer); reject(new Error(String(data.message))); }
        else if (data.type === expected) { clearTimeout(timer); resolve(data); }
      };
      worker.postMessage(message);
    });
    try {
      const ready = await send({ type: 'init' }, 'ready');
      await send({ type: 'ingest', files: [{ name: 'synthetic-notes.md', text: 'Synthetic source about sleep and everyday habits. Private fixture text never belongs in an inventory. '.repeat(12) }, { name: 'synthetic-report.txt', text: 'Synthetic research report for a Knowledge Base metadata test. private-corpus-text-sentinel '.repeat(12) }] }, 'ingest_done');
      if (configure) (await import('/js/lens.js')).saveLensConfig({ backend: 'in-browser', enabled: true });
      return String(ready.activeId);
    } finally { worker.terminate(); }
  }, configure);
}
export async function knowledgeCorpusReceipt(page: Page, libraryId: string) {
  return page.evaluate(async libraryId => {
    const root = await navigator.storage.getDirectory(), saved = await root.getDirectoryHandle('lens-local'), library = await saved.getDirectoryHandle(libraryId);
    const read = async (dir: FileSystemDirectoryHandle, name: string) => {
      try { return [...new Uint8Array(await (await (await dir.getFileHandle(name)).getFile()).arrayBuffer())]; }
      catch (error) { if (error instanceof DOMException && error.name === 'NotFoundError') return null; throw error; }
    };
    const registry = await Promise.all(['_libraries.json', '_libraries.backup.json'].map(name => read(saved, name)));
    const corpus = await Promise.all(['manifest.a.json', 'manifest.b.json', 'vectors.a.bin', 'vectors.b.bin', 'chunks.a.json', 'chunks.b.json', 'manifest.json', 'vectors.bin', 'chunks.json'].map(name => read(library, name)));
    return { registry, corpus, config: localStorage.getItem('labcharts-lens-config') };
  }, libraryId);
}
/** Read actual validated native generations in the main thread, without a model. */
export async function knowledgeNativeCorpusState(page: Page, libraryId: string) {
  return page.evaluate(async libraryId => {
    const source = await import('/js/knowledge-library-source.js'), io = await source.openKnowledgeLibraryIO();
    const registry = await source.readKnowledgeLibraryRegistry(io), library = registry?.libraries.find(row => row.id === libraryId);
    if (!library) throw new Error('Synthetic library is missing'); const corpus = await source.readKnowledgeLibraryCorpus(io, library);
    if (!corpus) throw new Error('Synthetic corpus generation is missing');
    return { slot: corpus.slot, revision: corpus.revision, manifest: corpus.state.manifest, chunks: corpus.state.chunks,
      vectorBytes: [...new Uint8Array(corpus.state.vectors.buffer, corpus.state.vectors.byteOffset, corpus.state.vectors.byteLength)] };
  }, libraryId);
}
