import type { OpfsSyncHandle } from '../../js/lens-local-store.js';
export class KnowledgeMemoryFile {
  bytes: Uint8Array<ArrayBuffer> = new Uint8Array();
  reportedSize?: number;
  opens = 0;
  flushed: Uint8Array[] = [];
  onOpen?: (count: number) => void | Promise<void>;
  fault?: (stage: string) => void;
  async getFile() { const bytes = this.bytes.slice(); return { size: this.reportedSize ?? bytes.length, text: async () => new TextDecoder().decode(bytes), arrayBuffer: async () => bytes.buffer } as File; }
  async createSyncAccessHandle(): Promise<OpfsSyncHandle> {
    this.opens++; await this.onOpen?.(this.opens);
    return {
      getSize: () => this.reportedSize ?? this.bytes.length,
      read: (target, { at }) => { this.fault?.('read'); const part = this.bytes.subarray(at, at + target.length); target.set(part); return part.length; },
      truncate: size => { this.fault?.('truncate'); const next = new Uint8Array(size); next.set(this.bytes.subarray(0, size)); this.bytes = next; },
      write: (source, { at }) => { this.fault?.('write'); const next = new Uint8Array(Math.max(this.bytes.length, at + source.length)); next.set(this.bytes); next.set(source, at); this.bytes = next; return source.length; },
      flush: () => { this.fault?.('flush'); this.flushed.push(this.bytes.slice()); }, close() {},
    };
  }
}
export class KnowledgeMemoryDirectory {
  files = new Map<string, KnowledgeMemoryFile>(); dirs = new Map<string, KnowledgeMemoryDirectory>(); accesses: string[] = [];
  readonly = false; failRemoval = false;
  async getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<KnowledgeMemoryDirectory> {
    this.accesses.push(`dir:${name}:${!!options?.create}`); if (options?.create && this.readonly) throw new Error('Unexpected directory creation');
    if (!this.dirs.has(name)) { if (!options?.create) throw new DOMException('Missing', 'NotFoundError'); this.dirs.set(name, new KnowledgeMemoryDirectory()); } return this.dirs.get(name)!;
  }
  async getFileHandle(name: string, options?: { create?: boolean }) {
    this.accesses.push(`file:${name}:${!!options?.create}`); if (options?.create && this.readonly) throw new Error('Unexpected file creation');
    if (!this.files.has(name)) { if (!options?.create) throw new DOMException('Missing', 'NotFoundError'); this.files.set(name, new KnowledgeMemoryFile()); } return this.files.get(name)!;
  }
  async removeEntry(name: string) { if (this.failRemoval) throw new Error('Synthetic cleanup failure'); this.files.delete(name); this.dirs.delete(name); }
  async *entries() { for (const [id, directory] of this.dirs) yield [id, Object.assign(directory, { kind: 'directory' as const })] as [string, KnowledgeMemoryDirectory & { kind: 'directory' }]; }
  json(name: string, value: unknown) { const file = new KnowledgeMemoryFile(); file.bytes = new TextEncoder().encode(JSON.stringify(value)); this.files.set(name, file); }
  snapshot(): unknown { return { files: Object.fromEntries([...this.files].map(([name, file]) => [name, [...file.bytes]])), directories: Object.fromEntries([...this.dirs].map(([name, directory]) => [name, directory.snapshot()])) }; }
}
export function knowledgeTestLocks() {
  const tails = new Map<string, Promise<unknown>>();
  return { request<T>(name: string, callback: () => T | Promise<T>) { const result = (tails.get(name) ?? Promise.resolve()).then(callback, callback); tails.set(name, result.then(() => undefined, () => undefined)); return result; } };
}
