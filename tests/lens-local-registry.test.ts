import { expect, it, vi } from 'vitest';
import { LensLocalLibraryRegistry } from '../js/lens-local-library-registry.js';
import { FILE_LIBRARIES, FILE_LIBRARIES_BACKUP, readBinaryFrom, writeBinaryTo } from '../js/lens-local-store.js';
import type { OpfsSyncHandle } from '../js/lens-local-store.js';
class Directory {
  files = new Map<string, Uint8Array<ArrayBuffer>>();
  directories = new Map<string, Directory>();
  fault: ((name: string, stage: string) => void) | null = null;
  maximumTransfer = Infinity;
  closedHandles = 0;
  async getFileHandle(name: string, options?: { create?: boolean }) {
    if (!this.files.has(name)) { if (!options?.create) throw new DOMException('Missing file', 'NotFoundError'); this.files.set(name, new Uint8Array()); }
    return { createSyncAccessHandle: async (): Promise<OpfsSyncHandle> => ({
      getSize: () => this.files.get(name)!.length,
      read: (target, { at }) => { this.fault?.(name, 'read'); const source = this.files.get(name)!.subarray(at, at + Math.min(target.length, this.maximumTransfer)); target.set(source); return source.length; },
      truncate: size => { this.fault?.(name, 'truncate'); const bytes = new Uint8Array(size); bytes.set(this.files.get(name)!.subarray(0, size)); this.files.set(name, bytes); },
      write: (source, { at }) => { this.fault?.(name, 'write'); const count = Math.min(source.byteLength, this.maximumTransfer), bytes = new Uint8Array(Math.max(this.files.get(name)!.length, at + count)); bytes.set(this.files.get(name)!); bytes.set(source.subarray(0, count), at); this.files.set(name, bytes); return count; },
      flush: () => { this.fault?.(name, 'flush'); }, close: () => { this.closedHandles++; },
    }) };
  }
  async getDirectoryHandle(name: string, options?: { create?: boolean }) {
    if (!this.directories.has(name)) { if (!options?.create) throw new DOMException('Missing directory', 'NotFoundError'); this.directories.set(name, new Directory()); }
    return this.directories.get(name)!;
  }
  async *entries() { for (const [name, directory] of this.directories) yield [name, Object.assign(directory, { kind: 'directory' as const })] as [string, Directory & { kind: 'directory' }]; }
  async removeEntry(name: string) { this.fault?.(name, 'remove'); this.files.delete(name); this.directories.delete(name); }
}
const models = { mini: { id: 'synthetic-model', dim: 2 } };
const raw = { revision: 4, updatedAt: 1, activeId: 'default', extension: { source: 'private-extension-sentinel', keep: [1, 2] }, libraries: [{ id: 'default', name: 'Notes', createdAt: 1, model: 'mini', origin: { keep: 'private-origin-sentinel' } }, { id: 'research', name: 'Research', createdAt: 2, model: 'mini' }] };
async function fixture() {
  const dir = new Directory(), encoded = new TextEncoder().encode(JSON.stringify(raw)); dir.files.set(FILE_LIBRARIES, encoded.slice()); dir.files.set(FILE_LIBRARIES_BACKUP, encoded.slice());
  const registry = new LensLocalLibraryRegistry(dir, models, 'mini'); await registry.loadOrMigrate(); return { dir, registry };
}
const json = (dir: Directory, name: string) => JSON.parse(new TextDecoder().decode(dir.files.get(name)!));
it('explicit native initialization still migrates missing and obsolete model fields while preserving private metadata', async () => {
  const { dir } = await fixture(); const legacy = { ...raw, libraries: [{ ...raw.libraries[0], model: undefined }, { ...raw.libraries[1], model: 'retired-synthetic-model' }] };
  for (const name of [FILE_LIBRARIES, FILE_LIBRARIES_BACKUP]) dir.files.set(name, new TextEncoder().encode(JSON.stringify(legacy)));
  const registry = new LensLocalLibraryRegistry(dir, models, 'mini'); await registry.loadOrMigrate();
  expect(registry.libraries.map(row => row.model)).toEqual(['mini', 'mini']); expect(registry.revision).toBe(5); expect(json(dir, FILE_LIBRARIES).extension).toEqual(raw.extension); expect(json(dir, FILE_LIBRARIES).libraries[0].origin).toEqual(raw.libraries[0]!.origin); expect(json(dir, FILE_LIBRARIES_BACKUP)).toEqual(json(dir, FILE_LIBRARIES));
});
it('retains a fresh replacement identity when final-library cleanup fails and the registry is reopened', async () => {
  const { dir, registry } = await fixture(); await registry.delete('research');
  const old = await dir.getDirectoryHandle('default', { create: true }); old.files.set('private-source', new TextEncoder().encode('private-corpus-sentinel'));
  dir.fault = (name, stage) => { if (name === 'default' && stage === 'remove') throw new Error('Synthetic cleanup failure'); };
  await expect(registry.delete('default')).resolves.toEqual({ wasActive: true, cleanupPending: true });
  const replacement = registry.activeId!; expect(replacement).not.toBe('default'); expect(registry.libraries).toHaveLength(1); expect(registry.libraries[0]!.id).toBe(replacement);
  const reopened = new LensLocalLibraryRegistry(dir, models, 'mini'); await reopened.loadOrMigrate(); expect(reopened.activeId).toBe(replacement); expect(reopened.libraries).toEqual(registry.libraries); expect(dir.directories.get('default')!.files.get('private-source')).toEqual(new TextEncoder().encode('private-corpus-sentinel'));
  const fresh = await dir.getDirectoryHandle(replacement, { create: true }); expect(fresh.files.size).toBe(0);
  dir.fault = null; await expect(reopened.delete(replacement)).resolves.toEqual({ wasActive: true, cleanupPending: false }); expect(reopened.activeId).not.toBe(replacement); expect(reopened.activeId).not.toBe('default');
});
it('fresh native reads use a newer recovery copy without repairing storage or recovering removed directories', async () => {
  const { dir, registry } = await fixture(); const newer = { ...raw, revision: 5, libraries: [raw.libraries[1]], activeId: 'research' };
  dir.files.set(FILE_LIBRARIES_BACKUP, new TextEncoder().encode(JSON.stringify(newer))); await dir.getDirectoryHandle('default', { create: true });
  const files = new Map([...dir.files].map(([name, bytes]) => [name, bytes.slice()])); await registry.loadOrMigrate({ repair: false });
  expect(registry.libraries).toEqual(newer.libraries); expect(registry.activeId).toBe('research'); expect(registry.revision).toBe(5); expect(dir.files).toEqual(files);
});
it('retains opaque registry and library metadata through native rename and activation', async () => {
  const { dir, registry } = await fixture(); await registry.rename('default', 'Updated notes'); await registry.activate('research');
  expect(json(dir, FILE_LIBRARIES)).toEqual({ ...raw, libraries: [{ ...raw.libraries[0], name: 'Updated notes' }, raw.libraries[1]], activeId: 'research', revision: 6, updatedAt: expect.any(Number) });
  expect(json(dir, FILE_LIBRARIES_BACKUP)).toEqual(json(dir, FILE_LIBRARIES));
});
it.each(['create', 'rename', 'activate', 'delete'] as const)('reports %s accepted when the acknowledged backup committed before primary failure', async operation => {
  const { dir, registry } = await fixture(); const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
  dir.fault = (name, stage) => { if (name === FILE_LIBRARIES && stage === 'truncate') throw new Error('Synthetic primary unavailable'); };
  try {
    const result = operation === 'create' ? registry.create('New', 'mini') : operation === 'rename' ? registry.rename('default', 'Updated') : operation === 'activate' ? registry.activate('research') : registry.delete('research');
    await expect(result).resolves.toBeDefined(); expect(registry.revision).toBe(5); const accepted = json(dir, FILE_LIBRARIES_BACKUP); expect(accepted.extension).toEqual(raw.extension);
    dir.fault = null; const reopened = new LensLocalLibraryRegistry(dir, models, 'mini'); await reopened.loadOrMigrate(); expect(reopened.libraries).toEqual(registry.libraries); expect(reopened.activeId).toBe(registry.activeId); expect(json(dir, FILE_LIBRARIES).libraries).toEqual(accepted.libraries);
  } finally { warning.mockRestore(); }
});
it('keeps failed precommit writes retryable without changing the live or saved registry', async () => {
  const { dir, registry } = await fixture(); dir.fault = (name, stage) => { if (name === FILE_LIBRARIES_BACKUP && stage === 'truncate') throw new Error('Synthetic backup unavailable'); };
  await expect(registry.rename('default', 'Updated')).rejects.toMatchObject({ requiresReload: true, cause: new Error('Synthetic backup unavailable') }); expect(registry.libraries[0]!.name).toBe('Notes'); expect(registry.revision).toBe(4); expect(json(dir, FILE_LIBRARIES_BACKUP)).toEqual(raw); expect(json(dir, FILE_LIBRARIES)).toEqual(raw);
  dir.fault = null; await registry.loadOrMigrate(); await registry.rename('default', 'Updated'); expect(registry.revision).toBe(5); expect(json(dir, FILE_LIBRARIES).libraries[0].name).toBe('Updated');
});
it('never accepts a different persisted backup as the requested registry change', async () => {
  const { dir, registry } = await fixture(); dir.fault = (name, stage) => { if (name === FILE_LIBRARIES && stage === 'truncate') { dir.files.set(FILE_LIBRARIES_BACKUP, new TextEncoder().encode(JSON.stringify({ ...raw, revision: 9, activeId: 'research' }))); throw new Error('Synthetic source replacement'); } };
  await expect(registry.rename('default', 'Updated')).rejects.toMatchObject({ requiresReload: true, cause: new Error('Synthetic source replacement') }); expect(registry.revision).toBe(4); expect(registry.libraries[0]!.name).toBe('Notes'); expect(json(dir, FILE_LIBRARIES_BACKUP).revision).toBe(9);
});
it.each(['create', 'rename', 'activate', 'delete'] as const)('blocks %s after an unconfirmed backup flush until authoritative reload', async operation => {
  const { dir, registry } = await fixture(); dir.fault = (name, stage) => { if (name === FILE_LIBRARIES_BACKUP && stage === 'flush') throw new Error('Synthetic flush unconfirmed'); };
  await expect(registry.rename('default', 'Unconfirmed update')).rejects.toMatchObject({ requiresReload: true, cause: new Error('Synthetic flush unconfirmed') }); expect(json(dir, FILE_LIBRARIES_BACKUP).libraries[0].name).toBe('Unconfirmed update'); expect(registry.libraries[0]!.name).toBe('Notes');
  const bytes = [...dir.files].map(([name, bytes]) => [name, [...bytes]]); dir.fault = null;
  await expect(operation === 'create' ? registry.create('Next') : operation === 'rename' ? registry.rename('default', 'Next') : operation === 'activate' ? registry.activate('research') : registry.delete('research')).rejects.toMatchObject({ requiresReload: true }); expect([...dir.files].map(([name, bytes]) => [name, [...bytes]])).toEqual(bytes);
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => {}); try { await registry.loadOrMigrate(); expect(registry.libraries[0]!.name).toBe('Unconfirmed update'); await registry.rename('default', 'Confirmed after reload'); expect(json(dir, FILE_LIBRARIES).libraries[0].name).toBe('Confirmed after reload'); } finally { warning.mockRestore(); }
});
it('completes short OPFS reads and writes rather than silently accepting partial bytes', async () => {
  const dir = new Directory(); dir.maximumTransfer = 3; const bytes = new TextEncoder().encode('Synthetic complete payload'); await writeBinaryTo(dir, 'record', bytes); expect(dir.files.get('record')).toEqual(bytes); expect(new Uint8Array(await readBinaryFrom(dir, 'record'))).toEqual(bytes);
});
it('does not treat inaccessible saved registries as a missing store or replace their data', async () => {
  const { dir, registry } = await fixture(), before = [...dir.files].map(([name, bytes]) => [name, [...bytes]]);
  dir.fault = (_name, stage) => { if (stage === 'read') throw new DOMException('Synthetic store is locked', 'NoModificationAllowedError'); };
  await expect(registry.loadOrMigrate()).rejects.toMatchObject({ name: 'NoModificationAllowedError' }); await expect(registry.create('Must not overwrite')).rejects.toMatchObject({ requiresReload: true }); expect([...dir.files].map(([name, bytes]) => [name, [...bytes]])).toEqual(before);
  dir.fault = null; await registry.loadOrMigrate(); expect(registry.libraries).toEqual(raw.libraries); expect(registry.extensions).toEqual({ extension: raw.extension });
});
it('reports an unconfirmed outcome if a primary failure cannot be verified through storage', async () => {
  const { dir, registry } = await fixture(); let verifying = false;
  dir.fault = (name, stage) => { if (name === FILE_LIBRARIES && stage === 'truncate') { verifying = true; throw new Error('Synthetic primary failed'); } if (verifying && stage === 'read') throw new DOMException('Synthetic verification blocked', 'NoModificationAllowedError'); };
  await expect(registry.rename('default', 'Visible recovery candidate')).rejects.toMatchObject({ requiresReload: true, cause: expect.objectContaining({ name: 'NoModificationAllowedError' }) }); await expect(registry.create('Must not overwrite')).rejects.toMatchObject({ requiresReload: true }); expect(json(dir, FILE_LIBRARIES_BACKUP).libraries[0].name).toBe('Visible recovery candidate');
});
it('rejects zero-progress I/O and closes its handle without looping', async () => {
  const dir = new Directory(); dir.maximumTransfer = 0; await expect(writeBinaryTo(dir, 'record', new Uint8Array([1]))).rejects.toThrow(/write/i); expect(dir.closedHandles).toBe(1); dir.files.set('record', new Uint8Array([1])); await expect(readBinaryFrom(dir, 'record')).rejects.toThrow(/read/i); expect(dir.closedHandles).toBe(2);
});
