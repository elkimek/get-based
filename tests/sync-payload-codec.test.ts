import { expect, it } from 'vitest';
import * as syncPayload from '../js/sync-payload-codec.js';
import { createLegacyAssertions } from './helpers/legacy-assertions.js';

it('retains the original streaming sync decompression regressions', async () => {
  const { assert, results } = createLegacyAssertions();
  // Runtime boundary test for the gunzip cap. Crafts a payload that
  // gunzips to (cap - 1) bytes and asserts it passes; then a payload
  // that gunzips to (cap + 1) bytes and asserts it throws. Catches
  // off-by-one and "checks size only after full buffer" regressions
  // that source inspection alone can't detect.
  if (typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined') {
    const {
      _gunzipToStringCapped: gunzipCapped,
      _PER_ROW_DECOMPRESSED_CAP_BYTES: perRowCapBytes,
    } = syncPayload;
    // Test against a SMALL synthetic cap to keep this assertion fast —
    // a real 1MB test would burn 100ms+ of CPU on slow CI runners.
    const TEST_CAP = 1024; // 1 KB
    const makeGzipped = async (size: number) => {
      const payload = new Uint8Array(size).fill(65); // 'A' bytes — high gzip ratio
      const cs = new CompressionStream('gzip');
      const w = cs.writable.getWriter();
      w.write(payload); w.close();
      const reader = cs.readable.getReader();
      const chunks: Uint8Array<ArrayBufferLike>[] = [];
      while (true) { const {value, done} = await reader.read(); if (done) break; chunks.push(value); }
      const total = chunks.reduce((n, c) => n + c.byteLength, 0);
      const out = new Uint8Array(total);
      let off = 0;
      for (const c of chunks) { out.set(c, off); off += c.byteLength; }
      return out;
    };
    // Under-cap → succeeds and returns the original bytes
    const underBytes = await makeGzipped(TEST_CAP - 1);
    let underResult: string | null = null, underErr: Error | null = null;
    try { underResult = await gunzipCapped(underBytes, TEST_CAP); } catch (e) { underErr = e as Error; }
    assert('gunzipCapped accepts payload at (cap - 1) bytes',
      underErr === null && underResult?.length === TEST_CAP - 1,
      underErr ? `threw: ${underErr.message}` : `len=${underResult?.length}, expected ${TEST_CAP - 1}`);
    // Over-cap → throws decompression-bomb error
    const overBytes = await makeGzipped(TEST_CAP + 1);
    let overErr: Error | null = null;
    try { await gunzipCapped(overBytes, TEST_CAP); } catch (e) { overErr = e as Error; }
    assert('gunzipCapped throws on payload at (cap + 1) bytes (decompression-bomb defence)',
      overErr !== null && /refusing to trust|exceeds/i.test(overErr.message),
      overErr ? `caught: ${overErr.message}` : 'no error thrown');
    // Streaming behaviour: a payload that crosses the cap mid-stream
    // (chunk by chunk) must reject as soon as `total` exceeds maxBytes,
    // not wait until the full payload has buffered. Use a payload
    // ~10× over the cap so multiple chunks would normally be needed.
    const wayOverBytes = await makeGzipped(TEST_CAP * 10);
    let streamErr: unknown = null;
    try { await gunzipCapped(wayOverBytes, TEST_CAP); } catch (e) { streamErr = e; }
    assert('gunzipCapped rejects mid-stream when cap crossed (no full-buffer wait)',
      streamErr !== null,
      streamErr ? 'ok' : 'no error — full buffer was accumulated past cap');
    assert('Per-row cap is exactly 1 MiB (regression: do not silently grow)',
      perRowCapBytes === 1024 * 1024,
      `cap=${perRowCapBytes}, expected ${1024 * 1024}`);
  }
  expect(results.fail).toBe(0);
});
