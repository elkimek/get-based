import { describe, expect, it, vi } from 'vitest';

import { buildLocalIngestTransaction } from '../js/lens-local-ingest.js';

const DIM = 3;
const emptyState = () => ({
  vectors: new Float32Array(0),
  chunks: [],
  manifest: { numChunks: 0, dim: DIM, modelId: 'test', indexedAt: null, docs: [] },
});

function makeEmbedder() {
  return vi.fn(async (input) => {
    const texts = Array.isArray(input) ? input : [input];
    const data = new Float32Array(texts.length * DIM);
    texts.forEach((text, row) => {
      const seed = String(text).length;
      for (let col = 0; col < DIM; col++) data[row * DIM + col] = seed + col;
    });
    return { data };
  });
}

async function build(files, current = emptyState(), overrides = {}) {
  const progress = [];
  const result = await buildLocalIngestTransaction({
    files,
    embedder: overrides.embedder || makeEmbedder(),
    backend: overrides.backend || 'wasm',
    dim: DIM,
    current,
    postProgress: event => progress.push(event),
    yieldTask: overrides.yieldTask || (async () => {}),
    isAbortRequested: overrides.isAbortRequested || (() => false),
  });
  return { ...result, progress };
}

describe('local Knowledge Base ingest transactions', () => {
  it('skips an unchanged re-import without embedding or changing state', async () => {
    const file = { name: 'notes.md', text: 'Vitamin D and circadian notes. '.repeat(12) };
    const first = await build([file]);
    expect(first.nextState).not.toBeNull();

    const embedder = makeEmbedder();
    const repeat = await build([file], first.nextState, { embedder });
    expect(repeat.nextState).toBeNull();
    expect(repeat.stats).toMatchObject({ chunks_indexed: 0, cancelled: false, skipped: ['notes.md'] });
    expect(embedder).not.toHaveBeenCalled();
  });

  it('replaces changed content with the same source while preserving other documents', async () => {
    const initial = await build([
      { name: 'notes.md', text: 'Original vitamin D notes. '.repeat(14) },
      { name: 'sleep.md', text: 'Melatonin and blue light notes. '.repeat(14) },
    ]);
    const oldSleep = initial.nextState.chunks.filter(chunk => chunk.source === 'sleep.md');
    const replacement = await build([
      { name: 'notes.md', text: 'Updated vitamin D, UVB, magnesium, and circadian evidence. '.repeat(24) },
    ], initial.nextState);

    expect(replacement.stats.replaced_documents).toBe(1);
    expect(replacement.nextState.manifest.docs.map(doc => doc.source).sort()).toEqual(['notes.md', 'sleep.md']);
    expect(replacement.nextState.chunks.filter(chunk => chunk.source === 'sleep.md')).toEqual(oldSleep);
    expect(replacement.nextState.chunks.filter(chunk => chunk.source === 'notes.md')).toHaveLength(replacement.stats.chunks_indexed);
    expect(replacement.nextState.vectors).toHaveLength(replacement.nextState.chunks.length * DIM);
  });

  it('returns no next state when Stop indexing arrives during the final batch', async () => {
    let yields = 0;
    const current = (await build([
      { name: 'existing.md', text: 'Existing committed library document. '.repeat(12) },
    ])).nextState;
    const cancelled = await build([
      { name: 'pending.md', text: 'A pending document that should never be committed. '.repeat(30) },
    ], current, {
      yieldTask: async () => { yields += 1; },
      isAbortRequested: () => yields >= 2,
    });

    expect(cancelled.nextState).toBeNull();
    expect(cancelled.stats).toMatchObject({ cancelled: true, chunks_indexed: 0 });
    expect(cancelled.stats.chunks_processed).toBeGreaterThan(0);
    expect(current.manifest.docs.map(doc => doc.source)).toEqual(['existing.md']);
  });
});
