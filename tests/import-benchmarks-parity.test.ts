import { expect, it } from 'vitest';
import { benchmarkResultPatch } from '../js/import-benchmarks.js';

it('captures numeric intrinsics before reading a diagnostic getter', () => {
  const originalMax = Math.max;
  let patch: ReturnType<typeof benchmarkResultPatch>;
  try {
    patch = benchmarkResultPatch({
      provider: 'openrouter',
      costInfo: { modelId: 'fixture-model' },
      timings: {
        get pdfExtractionMs() {
          Math.max = () => 321;
          return -5;
        },
        piiMs: 4,
      },
    }, 0);
  } finally {
    Math.max = originalMax;
  }
  // The current calculation uses its captured Math.max; later fields observe
  // the getter's mutation, exactly as the original inline expressions did.
  expect(patch.timings.pdfExtractionMs).toBe(0);
  expect(patch.timings.piiMs).toBe(321);
});
