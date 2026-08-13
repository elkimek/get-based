// @ts-check
// Pure transactional ingest planning for the browser Knowledge Base worker.

import { chunkText } from './lens-local-utils.js';

const CHUNK_SIZE = 800;
const CHUNK_OVERLAP = 50;
const CHUNK_MIN = 50;

/**
 * Build the next corpus without mutating the active worker state. The caller
 * owns the persistence boundary and commits `nextState` only after all model
 * calls succeed. Returning null leaves the existing library untouched.
 *
 * @param {{
 *   files: Array<{name?: string, text?: string}>,
 *   embedder: Function,
 *   backend: string,
 *   dim: number,
 *   current: {vectors: Float32Array, chunks: Array<{source:string,text:string}>, manifest: any},
 *   postProgress: (progress: any) => void,
 *   yieldTask: () => Promise<void>,
 *   isAbortRequested: () => boolean,
 * }} options
 */
export async function buildLocalIngestTransaction(options) {
  const { files, embedder, backend, dim, current, postProgress, yieldTask, isAbortRequested } = options;

  // A browser picker exposes names, not stable paths. Matching names are the
  // same logical document; duplicate names in one selection use the last file.
  const uniqueFiles = new Map();
  for (const file of files) {
    const name = String(file.name || 'Untitled document');
    const text = String(file.text || '');
    uniqueFiles.set(name, { name, text, hash: contentFingerprint(text) });
  }

  const skipped = [];
  const changedFiles = [];
  for (const file of uniqueFiles.values()) {
    const existing = current.manifest.docs.find((doc) => doc.source === file.name);
    if (existing?.hash && existing.hash === file.hash) skipped.push(file.name);
    else changedFiles.push(file);
  }

  const allChunks = [];
  const changedWithChunks = [];
  for (const file of changedFiles) {
    const pieces = chunkText(file.text, CHUNK_SIZE, CHUNK_OVERLAP, CHUNK_MIN);
    // Empty input should not accidentally erase an existing document.
    if (pieces.length === 0) {
      skipped.push(file.name);
      continue;
    }
    changedWithChunks.push(file);
    for (const text of pieces) allChunks.push({ source: file.name, text });
  }

  postProgress({ stage: 'start', total: allChunks.length });
  const baseStats = {
    files_seen: uniqueFiles.size,
    chunks_planned: allChunks.length,
    skipped,
  };
  if (allChunks.length === 0) {
    return {
      nextState: null,
      stats: {
        ...baseStats,
        documents_indexed: 0,
        chunks_indexed: 0,
        replaced_documents: 0,
        cancelled: false,
      },
    };
  }

  const batchSize = backend === 'webgpu' ? 8 : 4;
  const newVectors = new Float32Array(allChunks.length * dim);
  let indexed = 0;
  let cancelled = false;
  for (let start = 0; start < allChunks.length; start += batchSize) {
    await yieldTask();
    if (isAbortRequested()) { cancelled = true; break; }
    const end = Math.min(allChunks.length, start + batchSize);
    const texts = allChunks.slice(start, end).map((chunk) => chunk.text);
    newVectors.set(await embedTexts(embedder, texts, dim), start * dim);
    indexed = end;
    postProgress({
      stage: 'embed',
      index: indexed,
      total: allChunks.length,
      source: allChunks[end - 1].source,
    });
  }
  // Catch Stop indexing sent while the final model invocation was running.
  await yieldTask();
  if (isAbortRequested()) cancelled = true;
  if (cancelled) {
    return {
      nextState: null,
      stats: {
        ...baseStats,
        documents_indexed: 0,
        chunks_indexed: 0,
        chunks_processed: indexed,
        replaced_documents: 0,
        cancelled: true,
      },
    };
  }

  const replacedSources = new Set(changedWithChunks.map((file) => file.name));
  const replacedDocuments = current.manifest.docs.filter((doc) => replacedSources.has(doc.source)).length;
  let keptCount = 0;
  for (const chunk of current.chunks) if (!replacedSources.has(chunk.source)) keptCount += 1;

  const mergedVectors = new Float32Array((keptCount + allChunks.length) * dim);
  const mergedChunks = new Array(keptCount + allChunks.length);
  let writeIndex = 0;
  for (let i = 0; i < current.chunks.length; i++) {
    if (replacedSources.has(current.chunks[i].source)) continue;
    mergedVectors.set(current.vectors.subarray(i * dim, (i + 1) * dim), writeIndex * dim);
    mergedChunks[writeIndex] = current.chunks[i];
    writeIndex += 1;
  }
  mergedVectors.set(newVectors, writeIndex * dim);
  for (let i = 0; i < allChunks.length; i++) mergedChunks[writeIndex + i] = allChunks[i];

  const perDocument = new Map();
  for (const chunk of allChunks) perDocument.set(chunk.source, (perDocument.get(chunk.source) || 0) + 1);
  const nextManifest = {
    ...current.manifest,
    numChunks: mergedChunks.length,
    indexedAt: Date.now(),
    docs: current.manifest.docs.filter((doc) => !replacedSources.has(doc.source)),
  };
  for (const file of changedWithChunks) {
    nextManifest.docs.push({ source: file.name, chunks: perDocument.get(file.name) || 0, hash: file.hash });
  }

  return {
    nextState: { vectors: mergedVectors, chunks: mergedChunks, manifest: nextManifest },
    stats: {
      ...baseStats,
      documents_indexed: changedWithChunks.length,
      chunks_indexed: allChunks.length,
      replaced_documents: replacedDocuments,
      cancelled: false,
    },
  };
}

async function embedTexts(embedder, texts, dim) {
  const input = texts.length === 1 ? texts[0] : texts;
  const out = await embedder(input, { pooling: 'mean', normalize: true });
  if (out?.data?.length === texts.length * dim) return out.data;

  // Compatibility for older/custom wrappers that only accept one string.
  const vectors = new Float32Array(texts.length * dim);
  for (let i = 0; i < texts.length; i++) {
    const single = await embedder(texts[i], { pooling: 'mean', normalize: true });
    if (!single?.data || single.data.length !== dim) {
      throw new Error('Embedding model returned an unexpected vector shape');
    }
    vectors.set(single.data, i * dim);
  }
  return vectors;
}

function contentFingerprint(text) {
  let fnv = 2166136261;
  let djb = 5381;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    fnv = Math.imul(fnv ^ code, 16777619);
    djb = Math.imul(djb, 33) ^ code;
  }
  return `${text.length}:${(fnv >>> 0).toString(36)}:${(djb >>> 0).toString(36)}`;
}
