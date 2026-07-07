// @ts-check
// Shared OPFS and library-registry helpers for the browser-side Lens worker.

export const OPFS_SUBDIR = 'lens-local';
export const FILE_MANIFEST = 'manifest.json';
export const FILE_VECTORS = 'vectors.bin';
export const FILE_CHUNKS = 'chunks.json';
export const FILE_LIBRARIES = '_libraries.json';
export const FILE_LIBRARIES_BACKUP = '_libraries.backup.json';
export const DEFAULT_LIBRARY_NAME = 'My Library';

export function normaliseLibraryRegistry(registry) {
  if (!registry || !Array.isArray(registry.libraries)) return null;

  const seen = new Set();
  const libraries = [];
  for (const raw of registry.libraries) {
    const lib = normaliseLibraryRecord(raw);
    if (!lib || seen.has(lib.id)) continue;
    seen.add(lib.id);
    libraries.push(lib);
  }
  if (libraries.length === 0) return null;

  let activeId = typeof registry.activeId === 'string' ? registry.activeId : '';
  if (!libraries.some((lib) => lib.id === activeId)) activeId = libraries[0].id;
  const revisionNumber = Number(registry.revision);
  const updatedAtNumber = Number(registry.updatedAt);
  return {
    activeId,
    libraries,
    revision: Number.isFinite(revisionNumber) && revisionNumber > 0 ? revisionNumber : 0,
    updatedAt: Number.isFinite(updatedAtNumber) && updatedAtNumber > 0 ? updatedAtNumber : 0,
  };
}

export function sameLibraryRegistry(a, b) {
  if (!a || !b) return false;
  return a.revision === b.revision
    && a.activeId === b.activeId
    && JSON.stringify(a.libraries) === JSON.stringify(b.libraries);
}

export function normaliseLibraryRecord(raw, fallbackId = '') {
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

export function isSafeLibraryId(id) {
  return /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(String(id || ''));
}

export function fallbackLibraryName(id) {
  if (id === 'default') return DEFAULT_LIBRARY_NAME;
  const label = String(id || '')
    .replace(/^lib[-_]?/, '')
    .replace(/[-_]+/g, ' ')
    .trim();
  return label || 'Recovered library';
}

export function modelKeyFromManifest(manifest, models) {
  if (!manifest || typeof manifest !== 'object') return '';
  for (const [key, spec] of Object.entries(models || {})) {
    if (manifest.modelId === spec.id && Number(manifest.dim) === spec.dim) return key;
  }
  return '';
}

/// Read a text file from a specific directory handle. Thin wrapper over
/// readBinaryFrom that UTF-8-decodes. Used for manifest.json + chunks.json
/// + _libraries.json.
export async function readOpfsFileFrom(dir, name) {
  const bytes = await readBinaryFrom(dir, name);
  return new TextDecoder().decode(new Uint8Array(bytes));
}

/// Read an entire file as an ArrayBuffer. The sync-access handle returns a
/// view backed by a scratch Uint8Array; we copy into a fresh buffer so the
/// caller can safely use .buffer without worrying about byteOffset on a
/// subarray view.
export async function readBinaryFrom(dir, name) {
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

/// Write bytes atomically to a specific directory: truncate + write +
/// flush + close. flush() is what guarantees the data actually hit disk
/// before we return; without it the browser may coalesce writes and lose
/// data on reload if the tab closes between write and coalesce.
export async function writeBinaryTo(dir, name, bytes) {
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
