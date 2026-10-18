// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AssistantFeatureRequestOptions, getAssistantFeatureIdentity } from '../js/ai-feature-routing.js';
import { state } from '../js/state.js';
import { invalidateActiveDataCache } from '../js/data.js';

const mocks = vi.hoisted(() => ({
  infer: vi.fn<(options: AssistantFeatureRequestOptions) => Promise<{ text: string }>>(),
  identity: vi.fn<() => ReturnType<typeof getAssistantFeatureIdentity>>(),
  approve: vi.fn<() => Promise<void>>(),
}));

vi.mock('../js/ai-feature-routing.js', () => ({
  callAssistantFeatureAI: mocks.infer,
  getAssistantFeatureIdentity: mocks.identity,
  hasAssistantFeatureProvider: () => true,
}));
vi.mock('../js/cloud-ai-consent.js', async load => ({
  ...await load<Record<string, unknown>>(),
  requireAIProcessingApproval: mocks.approve,
}));

import { generateReportAISummary, REPORT_VENICE_GENERATION_TIMEOUT_MS } from '../js/export-report.js';

const options = {
  dateRange: 'all',
  sections: ['notes'],
  purpose: 'Review the synthetic recorded note.',
};
const overview = 'Record overview:\nA synthetic note was selected for this report.';

function selectProvider(provider: string, modelId: string) {
  mocks.identity.mockReturnValue({
    provider,
    modelId,
    modelDisplay: 'Synthetic report model',
    providerDisplay: provider,
    subscription: false,
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  sessionStorage.clear();
  state.currentProfile = 'synthetic-report-lifecycle';
  state.rangeMode = 'reference';
  state.importedData = {
    ...state.importedData,
    entries: [],
    notes: [{ id: 'synthetic-note', date: '2026-10-01', text: 'Synthetic report lifecycle note.' }],
    supplements: [],
    healthGoals: [],
    customMarkers: {},
  };
  invalidateActiveDataCache();
  mocks.infer.mockReset();
  mocks.identity.mockReset();
  mocks.approve.mockReset();
  mocks.approve.mockResolvedValue(undefined);
  mocks.infer.mockResolvedValue({ text: overview });
  selectProvider('venice', 'e2ee-glm-5-3-flash');
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('report AI request lifecycle', () => {
  it.each([
    ['venice', 'e2ee-glm-5-3-flash', false],
    ['venice', 'glm-5-3-flash', false],
    ['openrouter', 'synthetic-regular-model', true],
    ['custom', 'synthetic-custom-model', true],
  ] as const)('preserves the report response contract with %s / %s', async (provider, model, forceNonStream) => {
    selectProvider(provider, model);
    const result = await generateReportAISummary(options);
    expect(mocks.approve).toHaveBeenCalledOnce();
    expect(mocks.infer).toHaveBeenCalledOnce();
    const request = mocks.infer.mock.calls[0]![0];
    expect(request).toMatchObject({ forceNonStream, maxTokens: 900, consentKind: 'report' });
    expect(request.messages).toHaveLength(1);
    expect(request.messages[0]!.role).toBe('user');
    expect(request.messages[0]!.content).toContain('Synthetic report lifecycle note.');
    expect(request.messages[0]!.content).toContain(options.purpose);
    // Venice collects its encrypted stream internally; report consumers still get final text.
    expect(request.onStream).toBeUndefined();
    if (provider === 'venice') {
      expect(request.requestRetries).toBe(0);
      expect(request.requestTimeoutMs).toBe(REPORT_VENICE_GENERATION_TIMEOUT_MS);
      expect(request.signal).toBeDefined();
      expect(request.signal!.aborted).toBe(false);
    } else {
      expect(request.requestRetries).toBeUndefined();
      expect(request.requestTimeoutMs).toBeUndefined();
    }
    expect(result).toMatchObject({ text: overview, provider, modelId: model, model: 'Synthetic report model' });
  });

  it('bounds a never-settling Venice generation without issuing a second inference', async () => {
    mocks.infer.mockImplementation(() => new Promise(() => {}));
    const pending = generateReportAISummary(options);
    const rejection = expect(pending).rejects.toThrow(/timed out|timeout/i);
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.infer).toHaveBeenCalledOnce();
    const signal = mocks.infer.mock.calls[0]![0].signal!;
    await vi.advanceTimersByTimeAsync(REPORT_VENICE_GENERATION_TIMEOUT_MS - 1);
    expect(signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await rejection;
    expect(signal.aborted).toBe(true);
    expect(mocks.infer).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('starts the Venice generation deadline after approval has completed', async () => {
    let approve!: () => void;
    mocks.approve.mockImplementation(() => new Promise(resolve => { approve = resolve; }));
    const pending = generateReportAISummary(options);
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.approve).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(REPORT_VENICE_GENERATION_TIMEOUT_MS * 2);
    expect(mocks.infer).not.toHaveBeenCalled();
    approve();
    await expect(pending).resolves.toMatchObject({ text: overview });
    expect(mocks.infer.mock.calls[0]![0].signal!.aborted).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rejects an in-flight report on caller cancellation and ignores a late provider result', async () => {
    let finish!: (result: { text: string }) => void;
    mocks.infer.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const caller = new AbortController();
    const reason = new DOMException('Synthetic report closed.', 'AbortError');
    const pending = generateReportAISummary(options, { signal: caller.signal });
    const rejection = expect(pending).rejects.toBe(reason);
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.infer).toHaveBeenCalledOnce();
    const requestSignal = mocks.infer.mock.calls[0]![0].signal!;
    caller.abort(reason);
    await rejection;
    expect(requestSignal.aborted).toBe(true);
    finish({ text: 'Late overview that must not be accepted.' });
    await vi.advanceTimersByTimeAsync(REPORT_VENICE_GENERATION_TIMEOUT_MS * 2);
    await expect(pending).rejects.toBe(reason);
    expect(mocks.infer).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cleans up the deadline and caller listener after successful generation', async () => {
    const caller = new AbortController();
    const result = await generateReportAISummary(options, { signal: caller.signal });
    const requestSignal = mocks.infer.mock.calls[0]![0].signal!;
    expect(result).toMatchObject({ text: overview });
    expect(requestSignal.aborted).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(REPORT_VENICE_GENERATION_TIMEOUT_MS * 2);
    expect(requestSignal.aborted).toBe(false);
    caller.abort(new DOMException('Closed after completion.', 'AbortError'));
    expect(requestSignal.aborted).toBe(false);
    expect(mocks.infer).toHaveBeenCalledOnce();
  });

  it('does not start inference when the caller has already cancelled', async () => {
    const caller = new AbortController();
    caller.abort(new DOMException('Cancelled before generation.', 'AbortError'));
    await expect(generateReportAISummary(options, { signal: caller.signal })).resolves.toBeNull();
    expect(mocks.infer).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
