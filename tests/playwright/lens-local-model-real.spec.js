import { expect, test } from '@playwright/test';

// Opt-in: downloads the real MiniLM weights. Keep traces off for model runs.
test('real MiniLM indexes, searches and reloads without downloading weights again', async ({ page, context }) => {
  test.skip(process.env.GETBASED_LENS_REAL_MODELS !== '1', 'Set GETBASED_LENS_REAL_MODELS=1 to run real model inference.');
  test.setTimeout(180_000);
  const issues = [];
  page.on('pageerror', error => issues.push(error.message));
  await page.goto('/app', { waitUntil: 'load' });
  const inspect = ingest => page.evaluate(async ingest => {
    const worker = new Worker('/js/lens-local-worker.js', { type: 'module' });
    const request = (message, expected) => new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`Worker timed out: ${expected}`)), 120_000);
      const receive = event => {
        const result = event.data;
        if (result.type === 'progress') {
          if (result.stage === 'saving') worker.postMessage({ type: 'commit_ingest' });
          return;
        }
        if (result.type !== expected && result.type !== 'error') return;
        clearTimeout(timeout);
        worker.removeEventListener('message', receive);
        if (result.type === 'error') reject(new Error(result.message)); else resolve(result);
      };
      worker.addEventListener('message', receive);
      worker.onerror = event => reject(new Error(event.message));
      worker.postMessage(message);
    });
    try {
      const ready = await request({ type: 'init' }, 'ready');
      if (ingest) await request({ type: 'ingest', files: [
        { name: 'gardening.md', text: 'Tomatoes need sunlight and regular watering. Garden soil should drain well. Compost helps vegetables grow.' },
        { name: 'astronomy.md', text: 'Jupiter is the largest planet in the solar system. Its moons include Europa and Ganymede. Astronomers observe planets through telescopes.' },
      ] }, 'ingest_done');
      const result = await request({ type: 'query', text: 'How do I grow vegetables in my garden?', topK: 2 }, 'query_result');
      const stats = await request({ type: 'stats' }, 'stats_result');
      return { backend: ready.embedder.backend, dim: stats.dim, documents: stats.documents.length, chunks: result.chunks };
    } finally { worker.terminate(); }
  }, ingest);
  const first = await inspect(true);
  expect(first.dim).toBe(384);
  expect(first.backend).toMatch(/^(wasm|webgpu)$/);
  expect(first.documents).toBe(2);
  expect(first.chunks[0].source).toBe('gardening.md');
  expect(first.chunks.every(chunk => Number.isFinite(chunk.score))).toBe(true);
  const repeatedDownloads = [];
  await context.route(/\.onnx(?:[?]|$)/, route => {
    repeatedDownloads.push(route.request().url());
    return route.abort();
  });
  await page.reload({ waitUntil: 'load' });
  const restored = await inspect(false);
  expect(restored).toEqual(first);
  expect(repeatedDownloads).toEqual([]);
  expect(issues).toEqual([]);
  console.log(`Real MiniLM search and cached reload passed on ${first.backend}.`);
});
