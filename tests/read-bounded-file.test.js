import { expect, it, vi } from 'vitest';
import { readBoundedFile } from '../lib/read-bounded-file.js';

function descriptor(text, { step = 3, reportedSize = Buffer.byteLength(text), isFile = true } = {}) {
  const bytes = Buffer.from(text);
  return {
    stat: vi.fn(async () => ({ isFile: () => isFile, size: reportedSize })),
    read: vi.fn(async (buffer, offset, length, position) => {
      const size = Math.min(step, length, bytes.length - position);
      bytes.copy(buffer, offset, position, position + size);
      return { bytesRead: size };
    }),
  };
}

it('preserves short reads, including split UTF-8 characters, until EOF', async () => {
  const text = JSON.stringify({ name: 'Žofka 🩺', value: 'long enough to require multiple reads' });
  const handle = descriptor(text, { step: 1 });
  expect(await readBoundedFile(handle, 1000, 'oversized')).toBe(text);
  expect(handle.read.mock.calls.length).toBe(Buffer.byteLength(text) + 1);
});
it('accepts the exact cap and an empty file', async () => {
  expect(await readBoundedFile(descriptor('12345'), 5, 'oversized')).toBe('12345');
  expect(await readBoundedFile(descriptor(''), 5, 'oversized')).toBe('');
});
it('rejects growth past the cap even when stat reported a small size', async () => {
  const handle = descriptor('1234567890', { reportedSize: 1 });
  await expect(readBoundedFile(handle, 5, 'oversized')).rejects.toThrow('oversized');
  expect(handle.read.mock.calls.at(-1)[2]).toBe(3);
});
it('rejects oversized files and non-files without reading', async () => {
  for (const handle of [descriptor('123456'), descriptor('', { isFile: false })]) {
    await expect(readBoundedFile(handle, 5, 'oversized')).rejects.toThrow('oversized');
    expect(handle.read).not.toHaveBeenCalled();
  }
});
