import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createImportAIProgress, saveImportAIPerf } from '../js/pdf-import-ai-utils.js';

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('phase-aware import AI progress', () => {
  it('reports a reading phase until the first token, then a writing phase', () => {
    const calls = [];
    const progress = createImportAIProgress({
      perfKey: 'local:test-model',
      estimatedPromptTokens: 10000,
      onProgress: (pct, label) => calls.push([pct, label]),
    });
    progress.start();
    expect(calls.at(-1)).toEqual([15, 'Model is reading the report']);

    vi.advanceTimersByTime(30000);
    const [readingPct, readingLabel] = calls.at(-1);
    expect(readingLabel).toContain('reading');
    expect(readingPct).toBeGreaterThanOrEqual(15);
    expect(readingPct).toBeLessThanOrEqual(40);

    progress.onStream('x'.repeat(4000));
    const [writingPct, writingLabel] = calls.at(-1);
    expect(writingLabel).toBe('Model is writing the results');
    expect(writingPct).toBeGreaterThanOrEqual(40);
    expect(writingPct).toBeLessThanOrEqual(90);

    // Ticker no longer fires after streaming begins.
    const countAfterStream = calls.length;
    vi.advanceTimersByTime(5000);
    expect(calls.length).toBe(countAfterStream);

    // Progress is monotonic even if a smaller text length were reported.
    progress.onStream('x'.repeat(20000));
    const highPct = calls.at(-1)[0];
    progress.onStream('x'.repeat(100));
    expect(calls.at(-1)[0]).toBeGreaterThanOrEqual(highPct);
    progress.finish();
  });

  it('uses persisted per-model prefill speed for a time-tracking reading phase', () => {
    saveImportAIPerf('local:fast-model', {
      usage: { inputTokens: 10000 },
      diagnostics: { performance: { timeToFirstTokenMs: 10000, tokensPerSecond: 25 } },
    });
    const calls = [];
    const progress = createImportAIProgress({
      perfKey: 'local:fast-model',
      estimatedPromptTokens: 10000, // at 1000 tok/s prefill → ~10s ETA
      onProgress: (pct, label) => calls.push([pct, label]),
    });
    progress.start();
    vi.advanceTimersByTime(5000); // halfway through the ETA
    const [pct, label] = calls.at(-1);
    expect(pct).toBeGreaterThanOrEqual(26);
    expect(pct).toBeLessThanOrEqual(29);
    expect(label).toMatch(/reading the report — about \d+s left/);
    // At/after the ETA the reading phase parks at its ceiling.
    vi.advanceTimersByTime(6000);
    expect(calls.at(-1)[0]).toBe(40);
    progress.finish();
  });

  it('does nothing without an onProgress callback and caps stored perf entries', () => {
    const progress = createImportAIProgress({ perfKey: 'local:x', estimatedPromptTokens: 100 });
    expect(progress.onStream).toBeUndefined();
    progress.start();
    progress.finish();

    for (let i = 0; i < 15; i++) {
      saveImportAIPerf(`local:model-${i}`, {
        usage: { inputTokens: 1000 },
        diagnostics: { performance: { timeToFirstTokenMs: 2000, tokensPerSecond: 10 } },
      });
    }
    const stored = JSON.parse(localStorage.getItem('labcharts-import-ai-perf'));
    expect(Object.keys(stored).length).toBeLessThanOrEqual(12);
  });
});
