// Shared OPFS and library-registry helpers for the browser-side Lens worker.

// Structural OPFS capabilities used here, including the worker-only sync handle.
export interface OpfsSyncHandle {
  getSize(): number; read(bytes: Uint8Array<ArrayBuffer>, options: { at: number }): number;
  truncate(size: number): void; write(bytes: Uint8Array<ArrayBufferLike>, options: { at: number }): number;
  flush(): void; close(): void;
}
export interface OpfsDirectory {
  getFileHandle(name: string, options?: { create?: boolean }): Promise<{ createSyncAccessHandle(): Promise<OpfsSyncHandle> }>;
}
export interface LibraryRecord { id: string; name: string; createdAt: number; model: string | undefined }
interface LibraryRecordView { id?: unknown; name?: unknown; createdAt?: unknown; model?: unknown }
interface RegistryView { libraries?: unknown; activeId?: unknown; revision?: unknown; updatedAt?: unknown }
export interface LibraryRegistry { activeId: string; libraries: LibraryRecord[]; revision: number; updatedAt: number }
export interface CorpusDocument { source: string; chunks: number; hash?: string; [key: string]: unknown }
export interface CorpusChunk { source: string; text: string; [key: string]: unknown }
export interface CorpusManifest extends Record<string, unknown> {
  dim: number; numChunks: number; modelId?: unknown; indexedAt?: unknown; docs: CorpusDocument[];
  storage?: { schemaVersion: number; revision: number; vectorsChecksum: string; chunksChecksum: string };
}
export interface CorpusState { manifest: CorpusManifest; vectors: Float32Array; chunks: CorpusChunk[] }
export type CorpusSlot = 'a' | 'b';
type CorpusSnapshot = { slot: CorpusSlot | null; revision: number; state: CorpusState; legacy: boolean };

export const OPFS_SUBDIR = 'lens-local';
export const FILE_MANIFEST = 'manifest.json';
export const FILE_VECTORS = 'vectors.bin';
export const FILE_CHUNKS = 'chunks.json';
export const FILE_LIBRARIES = '_libraries.json';
export const FILE_LIBRARIES_BACKUP = '_libraries.backup.json';
export const DEFAULT_LIBRARY_NAME = 'My Library';
const CORPUS_SNAPSHOT_SCHEMA = 1;

const CORPUS_SLOT_FILES = {
  a: { manifest: 'manifest.a.json', vectors: 'vectors.a.bin', chunks: 'chunks.a.json' },
  b: { manifest: 'manifest.b.json', vectors: 'vectors.b.bin', chunks: 'chunks.b.json' },
};

export function normaliseLibraryRegistry(registry: RegistryView | null | undefined): LibraryRegistry | null {
  if (!registry || !Array.isArray(registry.libraries)) return null;

  const seen = new Set();
  const libraries: LibraryRecord[] = [];
  for (const raw of registry.libraries as Array<LibraryRecordView | null | undefined>) {
    const lib = normaliseLibraryRecord(raw);
    if (!lib || seen.has(lib.id)) continue;
    seen.add(lib.id);
    libraries.push(lib);
  }
  if (libraries.length === 0) return null;

  let activeId = typeof registry.activeId === 'string' ? registry.activeId : '';
  if (!libraries.some((lib) => lib.id === activeId)) activeId = libraries[0]!.id;
  const revisionNumber = Number(registry.revision);
  const updatedAtNumber = Number(registry.updatedAt);
  return {
    activeId,
    libraries,
    revision: Number.isFinite(revisionNumber) && revisionNumber > 0 ? revisionNumber : 0,
    updatedAt: Number.isFinite(updatedAtNumber) && updatedAtNumber > 0 ? updatedAtNumber : 0,
  };
}

export function sameLibraryRegistry(a: LibraryRegistry | null | undefined, b: LibraryRegistry | null | undefined) {
  if (!a || !b) return false;
  return a.revision === b.revision
    && a.activeId === b.activeId
    && JSON.stringify(a.libraries) === JSON.stringify(b.libraries);
}

export function normaliseLibraryRecord(raw: LibraryRecordView | null | undefined, fallbackId = '') {
  const id = String(raw?.id || fallbackId || '').trim();
  if (!isSafeLibraryId(id)) return null;
  const name = String(raw?.name || '').trim() || fallbackLibraryName(id);
  const createdAtNumber = Number(raw?.createdAt);
  const createdAt = Number.isFinite(createdAtNumber) && createdAtNumber > 0
    ? createdAtNumber
    : Date.now();
  const model = typeof raw?.model === 'string' ? raw.model : undefined;
  return { id, name, createdAt, model };
}

export function isSafeLibraryId(id: unknown) {
  return /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(String(id || ''));
}

export function fallbackLibraryName(id: unknown) {
  if (id === 'default') return DEFAULT_LIBRARY_NAME;
  const label = String(id || '')
    .replace(/^lib[-_]?/, '')
    .replace(/[-_]+/g, ' ')
    .trim();
  return label || 'Recovered library';
}

export function modelKeyFromManifest(manifest: CorpusManifest | null | undefined, models: Record<string, { id: string; dim: number }> | null | undefined) {
  if (!manifest || typeof manifest !== 'object') return '';
  for (const [key, spec] of Object.entries(models || {})) {
    if (manifest.modelId === spec.id && Number(manifest.dim) === spec.dim) return key;
  }
  return '';
}

/// Read a text file from a specific directory handle. Thin wrapper over
/// readBinaryFrom that UTF-8-decodes. Used for manifest.json + chunks.json
/// + _libraries.json.
export async function readOpfsFileFrom(dir: OpfsDirectory, name: string) {
  const bytes = await readBinaryFrom(dir, name);
  return new TextDecoder().decode(new Uint8Array(bytes));
}

/// Read an entire file as an ArrayBuffer. The sync-access handle returns a
/// view backed by a scratch Uint8Array; we copy into a fresh buffer so the
/// caller can safely use .buffer without worrying about byteOffset on a
/// subarray view.
export async function readBinaryFrom(dir: OpfsDirectory, name: string) {
  const handle = await dir.getFileHandle(name);
  const sync = await handle.createSyncAccessHandle();
  try {
    const size = sync.getSize();
    const buf = new Uint8Array(size);
    sync.read(buf, { at: 0 });
    const copy = new Uint8Array(buf.byteLength);
    copy.set(buf);
    return copy.buffer;
  } finally {
    sync.close();
  }
}

/// Write and flush one file in a specific directory. This operation alone is
/// not a multi-file transaction; writeCorpusSnapshot provides that guarantee
/// by writing an inactive generation and committing its manifest last.
export async function writeBinaryTo(dir: OpfsDirectory, name: string, bytes: Uint8Array<ArrayBufferLike>) {
  const handle = await dir.getFileHandle(name, { create: true });
  const sync = await handle.createSyncAccessHandle();
  try {
    sync.truncate(0);
    sync.write(bytes, { at: 0 });
    sync.flush();
  } finally {
    sync.close();
  }
}

function checksumBytes(bytes: Uint8Array) {
  let fnv = 2166136261;
  let djb = 5381;
  for (let i = 0; i < bytes.length; i++) {
    fnv = Math.imul(fnv ^ bytes[i]!, 16777619);
    djb = Math.imul(djb, 33) ^ bytes[i]!;
  }
  return `${bytes.length}:${(fnv >>> 0).toString(36)}:${(djb >>> 0).toString(36)}`;
}

function corpusSlotFiles(slot: string) {
  return slot === 'b' ? CORPUS_SLOT_FILES.b : CORPUS_SLOT_FILES.a;
}

function isPresent<T>(value: T | null): value is T {
  return value !== null;
}

async function readCorpusSlotManifest(dir: OpfsDirectory, slot: CorpusSlot) {
  try {
    const files = corpusSlotFiles(slot);
    const manifest = JSON.parse(await readOpfsFileFrom(dir, files.manifest)) as CorpusManifest;
    const storage = manifest?.storage;
    if (storage?.schemaVersion !== CORPUS_SNAPSHOT_SCHEMA) return null;
    if (!Number.isInteger(storage.revision) || storage.revision <= 0) return null;
    if (typeof storage.vectorsChecksum !== 'string' || typeof storage.chunksChecksum !== 'string') return null;
    return { slot, files, manifest, revision: storage.revision };
  } catch {
    return null;
  }
}

function readCorpusSlots(dir: OpfsDirectory) {
  return Promise.all([readCorpusSlotManifest(dir, 'a'), readCorpusSlotManifest(dir, 'b')]);
}

/**
 * Return the newest parseable snapshot manifest, falling back to the legacy
 * single-manifest layout for registry recovery. Full checksum validation is
 * performed by readLatestCorpusSnapshot before a corpus is used.
 */
export async function readLatestCorpusManifest(dir: OpfsDirectory): Promise<CorpusManifest | null> {
  const candidates = (await readCorpusSlots(dir)).filter(isPresent).sort((a, b) => b.revision - a.revision);
  if (candidates[0]) return candidates[0].manifest;
  try { return JSON.parse(await readOpfsFileFrom(dir, FILE_MANIFEST)); }
  catch { return null; }
}

/**
 * Read the newest complete corpus generation. Each generation is written to
 * an inactive slot with vectors and chunks first and its checksummed manifest
 * last. A torn write therefore invalidates only the inactive slot; the prior
 * generation remains available.
 *
 */
export async function readLatestCorpusSnapshot(dir: OpfsDirectory, expected: { dim?: number; modelId?: string } = {}): Promise<CorpusSnapshot | null> {
  const manifests = (await readCorpusSlots(dir)).filter(isPresent).sort((a, b) => b.revision - a.revision);

  for (const candidate of manifests) {
    try {
      const { manifest, files, slot, revision } = candidate;
      if (expected.dim !== undefined && manifest.dim !== expected.dim) continue;
      if (expected.modelId !== undefined && manifest.modelId !== expected.modelId) continue;
      const vectorBuffer = await readBinaryFrom(dir, files.vectors);
      const chunkBuffer = await readBinaryFrom(dir, files.chunks);
      const vectorBytes = new Uint8Array(vectorBuffer);
      const chunkBytes = new Uint8Array(chunkBuffer);
      if (checksumBytes(vectorBytes) !== manifest.storage!.vectorsChecksum) continue;
      if (checksumBytes(chunkBytes) !== manifest.storage!.chunksChecksum) continue;
      if (vectorBytes.byteLength % Float32Array.BYTES_PER_ELEMENT !== 0) continue;
      const vectors = new Float32Array(vectorBuffer);
      const chunks = JSON.parse(new TextDecoder().decode(chunkBytes));
      if (!Array.isArray(chunks) || !Array.isArray(manifest.docs)) continue;
      if (chunks.length !== manifest.numChunks || vectors.length !== manifest.numChunks * manifest.dim) continue;
      return { slot, revision, state: { manifest, vectors, chunks }, legacy: false };
    } catch {
      // A partially written inactive slot is expected after interruption.
    }
  }

  try {
    const manifest = JSON.parse(await readOpfsFileFrom(dir, FILE_MANIFEST)) as CorpusManifest;
    if (expected.dim !== undefined && manifest.dim !== expected.dim) return null;
    if (expected.modelId !== undefined && manifest.modelId !== expected.modelId) return null;
    const vectorBuffer = await readBinaryFrom(dir, FILE_VECTORS);
    const chunks = JSON.parse(await readOpfsFileFrom(dir, FILE_CHUNKS));
    const vectors = new Float32Array(vectorBuffer);
    if (!Array.isArray(chunks) || !Array.isArray(manifest.docs)) return null;
    if (chunks.length !== manifest.numChunks || vectors.length !== manifest.numChunks * manifest.dim) return null;
    return { slot: null, revision: 0, state: { manifest, vectors, chunks }, legacy: true };
  } catch {
    return null;
  }
}

/**
 * Persist a complete corpus to the inactive generation slot. The returned
 * state becomes canonical only after the manifest commit record is flushed.
 *
 */
export async function writeCorpusSnapshot(dir: OpfsDirectory, state: CorpusState, options: { activeSlot?: string | null; revision?: number; writeBytes?: typeof writeBinaryTo } = {}) {
  const slot: CorpusSlot = options.activeSlot === 'a' ? 'b' : 'a';
  const files = corpusSlotFiles(slot);
  const revision = Math.max(0, Number(options.revision) || 0) + 1;
  const writeBytes = options.writeBytes || writeBinaryTo;
  const vectorBytes = new Uint8Array(state.vectors.buffer, state.vectors.byteOffset, state.vectors.byteLength);
  const chunkBytes = new TextEncoder().encode(JSON.stringify(state.chunks));
  const manifest = {
    ...state.manifest,
    storage: {
      schemaVersion: CORPUS_SNAPSHOT_SCHEMA,
      revision,
      vectorsChecksum: checksumBytes(vectorBytes),
      chunksChecksum: checksumBytes(chunkBytes),
    },
  };

  // Manifest-last is the commit boundary. If either data write or the final
  // manifest write is interrupted, startup rejects this slot and uses the
  // untouched previous generation.
  await writeBytes(dir, files.vectors, vectorBytes);
  await writeBytes(dir, files.chunks, chunkBytes);
  await writeBytes(dir, files.manifest, new TextEncoder().encode(JSON.stringify(manifest)));
  return { slot, revision, state: { ...state, manifest } };
}
