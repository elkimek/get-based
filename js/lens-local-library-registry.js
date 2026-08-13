// @ts-check
// Lens Local library-registry lifecycle and OPFS recovery.

import { getErrorMessage } from './caught-error.js';
import { createUniqueId } from './unique-id.js';
import {
  DEFAULT_LIBRARY_NAME,
  FILE_CHUNKS,
  FILE_LIBRARIES,
  FILE_LIBRARIES_BACKUP,
  FILE_MANIFEST,
  FILE_VECTORS,
  fallbackLibraryName,
  isSafeLibraryId,
  modelKeyFromManifest,
  normaliseLibraryRegistry,
  readBinaryFrom,
  readLatestCorpusManifest,
  readOpfsFileFrom,
  sameLibraryRegistry,
  writeBinaryTo,
} from './lens-local-store.js';

export class LensLocalLibraryRegistry {
  constructor(rootDir, models, defaultModelKey) {
    this.rootDir = rootDir;
    this.models = models;
    this.defaultModelKey = defaultModelKey;
    this.libraries = [];
    this.activeId = null;
    this.revision = 0;
    this.failNextPersistForTest = false;
  }

  failNextPersist() {
    this.failNextPersistForTest = true;
  }

  modelKey(libOrId) {
    const lib = typeof libOrId === 'string'
      ? this.libraries.find((item) => item.id === libOrId)
      : libOrId;
    const key = lib?.model;
    return (key && this.models[key]) ? key : this.defaultModelKey;
  }

  async loadOrMigrate() {
    const registry = await this.readRegistry();

    if (registry?.payload) {
      this.revision = registry.payload.revision || 0;
      this.libraries = registry.payload.libraries;
      this.activeId = registry.payload.activeId;

      let migrated = false;
      for (const lib of this.libraries) {
        if (!lib.model || !this.models[lib.model]) {
          lib.model = this.defaultModelKey;
          migrated = true;
        }
      }

      // A valid registry is authoritative. A newer backup may intentionally
      // omit a library deleted just before the worker stopped, so disk-only
      // directories are recovered only when both registry files are absent.
      const recovered = await this.reconcileWithDisk({ recoverOrphans: false });
      if (registry.source !== 'primary' || registry.needsPersist || migrated || recovered.changed) {
        if (registry.source !== 'primary') {
          console.warn(`[lens-local] Restored library registry from ${registry.source}.`);
        }
        await this.persist();
      }
      return;
    }

    let hasLegacy = false;
    try {
      await this.rootDir.getFileHandle(FILE_MANIFEST);
      hasLegacy = true;
    } catch {}

    if (hasLegacy) {
      console.log('[lens-local] Migrating legacy single-library store to /default/');
      const defaultDir = await this.rootDir.getDirectoryHandle('default', { create: true });
      for (const filename of [FILE_MANIFEST, FILE_VECTORS, FILE_CHUNKS]) {
        try {
          const sourceBytes = await readBinaryFrom(this.rootDir, filename);
          await writeBinaryTo(defaultDir, filename, new Uint8Array(sourceBytes));
          await this.rootDir.removeEntry(filename);
        } catch (error) {
          console.warn(`[lens-local] Migration: ${filename} skip — ${getErrorMessage(error)}`);
        }
      }
      this.libraries = [this.defaultLibrary()];
      this.activeId = 'default';
      await this.persist();
      return;
    }

    const recoveredLibraries = await this.discoverDirectories();
    if (recoveredLibraries.length > 0) {
      this.libraries = recoveredLibraries.map((lib) => ({
        id: lib.id,
        name: lib.name,
        createdAt: lib.createdAt,
        model: lib.model,
      }));
      this.activeId = this.libraries.find((lib) => lib.id === 'default')?.id || this.libraries[0].id;
      console.warn(`[lens-local] Recovered ${this.libraries.length} library registry entries from OPFS directories.`);
      await this.persist();
      return;
    }

    this.libraries = [this.defaultLibrary()];
    this.activeId = 'default';
    await this.rootDir.getDirectoryHandle('default', { create: true });
    await this.persist();
  }

  async activate(libraryId) {
    if (!this.libraries.some((lib) => lib.id === libraryId)) {
      throw new Error(`No library with id "${libraryId}"`);
    }
    if (libraryId === this.activeId) return false;
    await this.persistState(this.libraries, libraryId);
    this.activeId = libraryId;
    return true;
  }

  async create(name, modelKey) {
    const label = String(name || '').trim() || 'Untitled library';
    const id = createUniqueId('lib-');
    const model = (modelKey && this.models[modelKey]) ? modelKey : this.defaultModelKey;
    const library = { id, name: label, createdAt: Date.now(), model };
    const nextLibraries = this.libraries.concat(library);
    await this.persistState(nextLibraries, this.activeId);
    this.libraries = nextLibraries;
    return library;
  }

  async rename(libraryId, name) {
    const library = this.libraries.find((lib) => lib.id === libraryId);
    if (!library) throw new Error(`No library with id "${libraryId}"`);
    const nextName = String(name || '').trim() || library.name;
    const nextLibraries = this.libraries.map((lib) =>
      lib.id === libraryId ? { ...lib, name: nextName } : lib);
    await this.persistState(nextLibraries, this.activeId);
    this.libraries = nextLibraries;
    return nextName;
  }

  async delete(libraryId) {
    const index = this.libraries.findIndex((lib) => lib.id === libraryId);
    if (index === -1) throw new Error(`No library with id "${libraryId}"`);
    const wasActive = libraryId === this.activeId;

    let nextLibraries = this.libraries.filter((lib) => lib.id !== libraryId);
    let nextActiveId = this.activeId;
    if (nextLibraries.length === 0) {
      nextLibraries = [this.defaultLibrary()];
      nextActiveId = 'default';
    } else if (wasActive) {
      nextActiveId = nextLibraries[0].id;
    }

    await this.persistState(nextLibraries, nextActiveId);
    this.libraries = nextLibraries;
    this.activeId = nextActiveId;

    try { await this.rootDir.removeEntry(libraryId, { recursive: true }); } catch {}
    if (this.libraries.length === 1 && this.activeId === 'default') {
      await this.rootDir.getDirectoryHandle('default', { create: true });
    }
    return { wasActive };
  }

  async persist() {
    return this.persistState(this.libraries, this.activeId);
  }

  async persistState(libraries, activeId) {
    if (this.failNextPersistForTest) {
      this.failNextPersistForTest = false;
      throw new Error('Test registry persist failure');
    }
    const nextRevision = this.revision + 1;
    const payload = { activeId, libraries, revision: nextRevision, updatedAt: Date.now() };
    const bytes = new TextEncoder().encode(JSON.stringify(payload));
    // Write backup first. If the worker dies before the primary write,
    // startup chooses the newer revision and repairs the stale copy.
    await writeBinaryTo(this.rootDir, FILE_LIBRARIES_BACKUP, bytes);
    await writeBinaryTo(this.rootDir, FILE_LIBRARIES, bytes);
    this.revision = nextRevision;
  }

  defaultLibrary() {
    return {
      id: 'default',
      name: DEFAULT_LIBRARY_NAME,
      createdAt: Date.now(),
      model: this.defaultModelKey,
    };
  }

  async readRegistry() {
    const primary = await this.readRegistryFile(FILE_LIBRARIES);
    const backup = await this.readRegistryFile(FILE_LIBRARIES_BACKUP);
    if (primary && backup) {
      if (backup.revision > primary.revision) {
        return { source: 'backup', payload: backup, needsPersist: true };
      }
      return {
        source: 'primary',
        payload: primary,
        needsPersist: !sameLibraryRegistry(primary, backup),
      };
    }
    if (primary) return { source: 'primary', payload: primary, needsPersist: true };
    if (backup) return { source: 'backup', payload: backup, needsPersist: true };
    return null;
  }

  async readRegistryFile(name) {
    try {
      const text = await readOpfsFileFrom(this.rootDir, name);
      return normaliseLibraryRegistry(JSON.parse(text));
    } catch {
      return null;
    }
  }

  async discoverDirectories() {
    if (!this.rootDir || typeof this.rootDir.entries !== 'function') return [];

    const libraries = [];
    for await (const [id, handle] of this.rootDir.entries()) {
      if (handle?.kind !== 'directory' || !isSafeLibraryId(id)) continue;

      let manifest = null;
      try {
        manifest = await readLatestCorpusManifest(handle);
      } catch {}

      const model = modelKeyFromManifest(manifest, this.models) || this.defaultModelKey;
      const indexedAt = Number(manifest?.indexedAt);
      libraries.push({
        id,
        name: fallbackLibraryName(id),
        createdAt: Number.isFinite(indexedAt) && indexedAt > 0 ? indexedAt : Date.now(),
        model,
        manifest,
      });
    }

    libraries.sort((a, b) => {
      if (a.id === 'default') return -1;
      if (b.id === 'default') return 1;
      return a.createdAt - b.createdAt || a.id.localeCompare(b.id);
    });
    return libraries;
  }

  async reconcileWithDisk({ recoverOrphans = false } = {}) {
    const discovered = await this.discoverDirectories();
    if (discovered.length === 0) return { changed: false };

    const byId = new Map(discovered.map((lib) => [lib.id, lib]));
    const next = [];
    let changed = false;

    for (const lib of this.libraries) {
      const disk = byId.get(lib.id);
      if (!disk) {
        next.push(lib);
        continue;
      }
      byId.delete(lib.id);

      const diskModel = modelKeyFromManifest(disk.manifest, this.models);
      if ((!lib.model || !this.models[lib.model]) && diskModel) {
        lib.model = diskModel;
        changed = true;
      }
      next.push(lib);
    }

    if (recoverOrphans) {
      for (const disk of byId.values()) {
        next.push({
          id: disk.id,
          name: disk.name,
          createdAt: disk.createdAt,
          model: disk.model,
        });
        changed = true;
      }
    }

    if (next.length > 0) {
      this.libraries = next;
      if (!this.libraries.some((lib) => lib.id === this.activeId)) {
        this.activeId = this.libraries[0].id;
        changed = true;
      }
    }
    return { changed };
  }
}
