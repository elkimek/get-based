// Synthetic browser-origin storage for failure and recovery tests.
export function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {get length() {return values.size;}, clear: () => values.clear(),
    getItem: key => values.get(key) ?? null, setItem: (key, value) => {values.set(key, String(value));},
    removeItem: key => {values.delete(key);}, key: index => [...values.keys()][index] ?? null};
}
export class MigrationMemoryDirectory {
  kind = 'directory' as const;
  files = new Map<string, MigrationMemoryFile | MigrationMemoryDirectory>();
  async *entries() { yield* this.files.entries(); }
  async getDirectoryHandle(name: string, {create = false} = {}) {
    let entry = this.files.get(name);
    if (!entry && create) {entry = new MigrationMemoryDirectory(); this.files.set(name, entry);}
    if (!(entry instanceof MigrationMemoryDirectory)) throw new DOMException('Missing directory', 'NotFoundError');
    return entry;
  }
  async getFileHandle(name: string, {create = false} = {}) {
    let entry = this.files.get(name);
    if (!entry && create) {entry = new MigrationMemoryFile(); this.files.set(name, entry);}
    if (!(entry instanceof MigrationMemoryFile)) throw new DOMException('Missing file', 'NotFoundError');
    return entry;
  }
}
export class MigrationMemoryFile {
  kind = 'file' as const;
  bytes = new Uint8Array(0);
  async getFile() { return new File([this.bytes], 'synthetic'); }
  async createWritable() {
    return {write: async (bytes: Uint8Array) => {this.bytes = new Uint8Array(bytes);}, close: async () => {}, abort: async () => {}};
  }
}
