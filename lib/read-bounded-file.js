// @ts-check
// Read one already-open descriptor, preserving both size bounds and short reads.

/** @param {import('node:fs/promises').FileHandle} handle @param {number} limit @param {string} message */
export async function readBoundedFile(handle, limit, message) {
  const info = await handle.stat();
  if (!info.isFile() || info.size > limit) throw new Error(message);
  const chunks = [];
  const buffer = Buffer.alloc(Math.min(limit + 1, 65_536));
  let total = 0;
  while (true) {
    // Read one sentinel byte beyond the cap to detect growth after stat().
    const length = Math.min(buffer.length, limit + 1 - total);
    const { bytesRead } = await handle.read(buffer, 0, length, total);
    if (bytesRead === 0) break;
    total += bytesRead;
    if (total > limit) throw new Error(message);
    chunks.push(Buffer.from(buffer.subarray(0, bytesRead)));
  }
  return Buffer.concat(chunks, total).toString('utf8');
}
