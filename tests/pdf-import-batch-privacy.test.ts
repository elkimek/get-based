// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Drive the real handleBatchPDFs privacy branch and assert the per-file
// outcome the auto-import source records: 'failed' is offered again on a later
// check, 'skipped' is marked handled for good.
const pii = vi.hoisted(() => ({
  available: false,
  localModelConfigured: false,
  review: vi.fn<(...args: unknown[]) => Promise<string>>(),
}));

vi.mock('../js/pii.js', () => ({
  PII_REVIEW_UNAVAILABLE: '\u0000pii-review-unavailable',
  checkOllamaPII: vi.fn(async () => ({ available: pii.available, models: [] })),
  isOllamaPIIEnabled: () => pii.localModelConfigured,
  obfuscatePDFText: (text: string) => ({ original: text, obfuscated: text, replacements: 0 }),
  sanitizeWithOllama: vi.fn(async (text: string) => text),
  sanitizeWithOllamaStreaming: vi.fn(),
  reviewPIIBeforeSend: (...args: unknown[]) => pii.review(...args),
}));
vi.mock('../js/utils.js', async importOriginal => ({
  ...(await importOriginal<typeof import('../js/utils.js')>()),
  showNotification: vi.fn(),
  isPIIReviewEnabled: () => true,
  isDebugMode: () => false,
}));
vi.mock('../js/ai-feature-routing.js', async importOriginal => ({
  ...(await importOriginal<typeof import('../js/ai-feature-routing.js')>()),
  hasAssistantFeatureProvider: () => true,
}));
vi.mock('../js/pdf-import-file-utils.js', async importOriginal => ({
  ...(await importOriginal<typeof import('../js/pdf-import-file-utils.js')>()),
  extractPDFTextFacade: vi.fn(async () => '=== Page 1 ===\nGlucose 90 mg/dL'),
}));
vi.mock('../js/pdf-import-preflight.js', () => ({ runPreflightChecks: vi.fn(async () => true) }));
vi.mock('../js/pdf-import-progress.js', async importOriginal => ({
  ...(await importOriginal<typeof import('../js/pdf-import-progress.js')>()),
  showBatchImportProgress: vi.fn(async () => {}),
  hideImportProgress: vi.fn(),
  updateImportProgressPct: vi.fn(),
}));
vi.mock('../js/pdf-import-persistence.js', async importOriginal => ({
  ...(await importOriginal<typeof import('../js/pdf-import-persistence.js')>()),
  refreshImportedDataViews: vi.fn(),
}));

import { state } from '../js/state.js';
import { handleBatchPDFs, type BatchPDFOutcome } from '../js/pdf-import.js';

let previousProfile: string;
beforeEach(() => {
  previousProfile = state.currentProfile;
  state.currentProfile = 'alpha';
  pii.available = false;
  pii.localModelConfigured = false;
  pii.review.mockReset();
});
afterEach(() => {
  state.currentProfile = previousProfile;
  vi.useRealTimers();
});

async function outcomeOf(): Promise<BatchPDFOutcome[]> {
  const outcomes: BatchPDFOutcome[] = [];
  const file = new File([new Uint8Array([37, 80, 68, 70])], 'report.pdf', { type: 'application/pdf' });
  vi.useFakeTimers();
  const run = handleBatchPDFs([file], { profileId: 'alpha', onFileResult: (_file, outcome) => outcomes.push(outcome) });
  await vi.runAllTimersAsync();
  await run;
  return outcomes;
}

describe('batch privacy review outcomes', () => {
  it('reports an unavailable streaming review as failed so it is retried', async () => {
    pii.available = true;
    pii.review.mockResolvedValue('\u0000pii-review-unavailable');
    expect(await outcomeOf()).toEqual(['failed']);
    expect(pii.review).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ reportUnavailable: true }));
  });

  it('reports an unavailable regex review as failed', async () => {
    pii.review.mockResolvedValue('\u0000pii-review-unavailable');
    expect(await outcomeOf()).toEqual(['failed']);
  });

  it('reports a cancel while the configured local model is unreachable as failed', async () => {
    pii.localModelConfigured = true;
    pii.review.mockResolvedValue('cancel');
    expect(await outcomeOf()).toEqual(['failed']);
  });

  it('keeps an ordinary cancel as an explicit skip', async () => {
    pii.available = true;
    pii.review.mockResolvedValue('cancel');
    expect(await outcomeOf()).toEqual(['skipped']);
  });

  it('keeps a cancel with no local model configured as an explicit skip', async () => {
    pii.review.mockResolvedValue('cancel');
    expect(await outcomeOf()).toEqual(['skipped']);
  });
});
