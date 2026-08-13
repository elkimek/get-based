import { describe, expect, it } from 'vitest';

import {
  readLatestCorpusSnapshot,
  writeBinaryTo,
  writeCorpusSnapshot,
} from '../js/lens-local-store.js';

class MemoryFile {
  constructor() {
    this.bytes = new Uint8Array(0);
  }

  async createSyncAccessHandle() {
    const file = this;
    return {
      getSize: () => file.bytes.byteLength,
      read(target, { at }) {
        target.set(file.bytes.subarray(at, at + target.byteLength));
        return Math.min(target.byteLength, Math.max(0, file.bytes.byteLength - at));
      },
      truncate(size) {
        const next = new Uint8Array(size);
        next.set(file.bytes.subarray(0, size));
        file.bytes = next;
      },
      write(source, { at }) {
        const bytes = new Uint8Array(source.buffer, source.byteOffset, source.byteLength);
        const next = new Uint8Array(Math.max(file.bytes.byteLength, at + bytes.byteLength));
        next.set(file.bytes);
        next.set(bytes, at);
        file.bytes = next;
        return bytes.byteLength;
      },
      flush() {},
      close() {},
    };
  }
}

class MemoryDirectory {
  constructor() {
    this.files = new Map();
  }

  async getFileHandle(name, options = {}) {
    if (!this.files.has(name)) {
      if (!options.create) throw new Error(`Missing file: ${name}`);
      this.files.set(name, new MemoryFile());
    }
    return this.files.get(name);
  }
}

function corpus(label, values) {
  return {
    manifest: {
      numChunks: values.length / 2,
      dim: 2,
      modelId: 'test-model',
      indexedAt: 1,
      docs: [{ source: `${label}.md`, chunks: values.length / 2 }],
    },
    vectors: new Float32Array(values),
    chunks: Array.from({ length: values.length / 2 }, (_, index) => ({
      source: `${label}.md`,
      text: `${label}-${index}`,
    })),
  };
}

describe('crash-safe local Knowledge Base storage', () => {
  it('keeps the previous generation readable until the manifest commit succeeds', async () => {
    const directory = new MemoryDirectory();
    const first = corpus('first', [1, 2, 3, 4]);
    const initial = await writeCorpusSnapshot(directory, first);

    expect(initial).toMatchObject({ slot: 'a', revision: 1 });
    await expect(readLatestCorpusSnapshot(directory)).resolves.toMatchObject({
      slot: 'a',
      revision: 1,
      state: { chunks: first.chunks },
    });

    let writes = 0;
    await expect(writeCorpusSnapshot(directory, corpus('second', [5, 6]), {
      activeSlot: initial.slot,
      revision: initial.revision,
      writeBytes: async (target, name, bytes) => {
        writes += 1;
        if (writes === 3) throw new Error('simulated manifest interruption');
        await writeBinaryTo(target, name, bytes);
      },
    })).rejects.toThrow('simulated manifest interruption');

    const afterInterruptedWrite = await readLatestCorpusSnapshot(directory);
    expect(afterInterruptedWrite).toMatchObject({
      slot: 'a',
      revision: 1,
      state: { chunks: first.chunks },
    });

    const second = corpus('second', [5, 6]);
    const committed = await writeCorpusSnapshot(directory, second, {
      activeSlot: initial.slot,
      revision: initial.revision,
    });
    expect(committed).toMatchObject({ slot: 'b', revision: 2 });
    await expect(readLatestCorpusSnapshot(directory)).resolves.toMatchObject({
      slot: 'b',
      revision: 2,
      state: { chunks: second.chunks },
    });

    await writeBinaryTo(directory, 'vectors.b.bin', new Uint8Array([0]));
    await expect(readLatestCorpusSnapshot(directory)).resolves.toMatchObject({
      slot: 'a',
      revision: 1,
      state: { chunks: first.chunks },
    });
  });
});
