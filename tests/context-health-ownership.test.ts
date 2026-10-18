import { contextStatusFixture, contextStatusElement } from './helpers/context-card-status-fixture.js';
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
const ai = vi.hoisted(() => ({
  provider: 'ollama', modelId: 'first-model', subscription: false, enabled: true, paused: false, demo: false,
  context: '[section:diet]reported diet[/section:diet]',
  pending: [] as { resolve(value: unknown): void; reject(error: Error): void }[],
  usage: vi.fn(),
}));
vi.mock('../js/api.js', () => ({ isAIPaused: () => ai.paused }));
vi.mock('../js/ai-feature-routing.js', () => ({
  getAssistantFeatureIdentity: () => ({ provider: ai.provider, modelId: ai.modelId, subscription: ai.subscription }),
  hasAssistantFeatureProvider: () => ai.enabled && !ai.paused,
  callAssistantFeatureAI: () => new Promise((resolve, reject) => ai.pending.push({ resolve, reject })),
}));
vi.mock('../js/context-card-summaries.js', () => ({ CONTEXT_CARD_KEYS: ['diet', 'exercise'] }));
vi.mock('../js/local-ai-provider-shared.js', () => ({ isCloudModel: () => false }));
vi.mock('../js/profile.js', () => ({ getProfiles: () => ai.demo ? [{ id: 'origin', tags: ['demo'] }] : [], profileStorageKey: (id: string, key: string) => `${id}:${key}` }));
vi.mock('../js/schema.js', () => ({ trackUsage: ai.usage }));
import { state } from '../js/state.js';
import { getCardFingerprint, loadContextHealthDots, refreshAllHealthDots, enableDemoContextLiveAI, disableDemoContextLiveAI, configureContextCardHealthDots } from '../js/context-card-health-dots.js';
const response = (summary: string) => ({ text: JSON.stringify({ diet: { dot: 'green', tip: 'Fresh tip', summary }, exercise: { dot: 'yellow', tip: '', summary: '' } }), usage: { inputTokens: 7, outputTokens: 3 } });
function data(breakfast = 'eggs'): typeof state.importedData { return { ...state.importedData, entries: [], diet: { breakfast } }; }
function markup() {
  contextStatusFixture(document.body, ['diet', 'exercise']);
}
beforeEach(() => {
  globalThis.dispatchEvent(new Event('labcharts-profile-switched'));
  localStorage.clear(); ai.pending.length = 0; ai.usage.mockClear();
  ai.provider = 'ollama'; ai.modelId = 'first-model'; ai.subscription = false; ai.enabled = true; ai.paused = false; ai.demo = false;
  ai.context = '[section:diet]reported diet[/section:diet]';
  configureContextCardHealthDots({ buildLabContext: () => ai.context });
  state.currentProfile = 'origin'; state.importedData = data(); state.profileSex = 'female'; state.profileDob = '1990-01-01'; markup();
});
describe('context insight request ownership', () => {
  it('coalesces the same input and persists the exact assessed fingerprints', async () => {
    const fingerprint = getCardFingerprint('diet');
    const first = loadContextHealthDots(), duplicate = loadContextHealthDots();
    expect(duplicate).toBe(first); expect(ai.pending).toHaveLength(1);
    ai.pending[0]!.resolve(response('Reported eggs')); await first;
    expect(JSON.parse(localStorage.getItem('origin:contextHealth')!)).toMatchObject({ cardSummaries: { diet: 'Reported eggs' }, fingerprints: { diet: fingerprint } });
    expect(contextStatusElement('summary', 'diet')?.textContent).toBe('Reported eggs');
    expect(ai.usage).toHaveBeenCalledWith('ollama', 'first-model', 7, 3, 'origin');
  });
  it.each(['profile', 'data', 'in-place-edit', 'sex', 'dob', 'model', 'provider', 'paused', 'unavailable', 'context', 'consent-cycle'])('rejects a late response after %s changes', async change => {
    const pending = loadContextHealthDots();
    if (change === 'profile') state.currentProfile = 'replacement';
    if (change === 'data') state.importedData = data('oats');
    if (change === 'in-place-edit') state.importedData.diet!.breakfast = 'oats';
    if (change === 'unavailable') ai.enabled = false;
    if (change === 'sex') state.profileSex = 'male';
    if (change === 'dob') state.profileDob = '1980-01-01';
    if (change === 'model') ai.modelId = 'replacement-model';
    if (change === 'provider') ai.provider = 'openrouter';
    if (change === 'paused') ai.paused = true;
    if (change === 'context') ai.context = 'Changed nutrition source';
    if (change === 'consent-cycle') globalThis.dispatchEvent(new Event('labcharts-ai-settings-local-changed'));
    markup(); ai.pending[0]!.resolve(response('Obsolete assessment')); await pending;
    expect(localStorage.getItem('origin:contextHealth')).toBeNull();
    expect(localStorage.getItem('replacement:contextHealth')).toBeNull();
    expect(contextStatusElement('summary', 'diet')?.textContent).toBe('Local summary');
    expect(contextStatusElement('ai', 'diet')?.textContent).toBe('');
    // Provider usage belongs to the dispatched request even if its presentation expired.
    expect(ai.usage).toHaveBeenCalledWith('ollama', 'first-model', 7, 3, 'origin');
  });
  it('starts a replacement for edits in the same data object and ignores an older response', async () => {
    const first = loadContextHealthDots();
    state.importedData.diet!.breakfast = 'oats'; ai.context = 'Edited diet';
    const second = loadContextHealthDots(); expect(second).not.toBe(first); expect(ai.pending).toHaveLength(2);
    const fingerprint = getCardFingerprint('diet');
    ai.pending[1]!.resolve(response('Reported oats')); await second;
    ai.pending[0]!.resolve(response('Reported eggs')); await first;
    expect(JSON.parse(localStorage.getItem('origin:contextHealth')!)).toMatchObject({ cardSummaries: { diet: 'Reported oats' }, fingerprints: { diet: fingerprint } });
    expect(contextStatusElement('summary', 'diet')?.textContent).toBe('Reported oats');
  });
  it.each(['failure', 'invalid-json'])('does not gray a newer assessment when an old request returns %s', async kind => {
    const first = loadContextHealthDots(); state.importedData.diet!.breakfast = 'oats';
    const second = loadContextHealthDots();
    expect(ai.pending).toHaveLength(2);
    ai.pending[1]!.resolve(response('New assessment')); await second;
    if (kind === 'failure') ai.pending[0]!.reject(new Error('Old request failed'));
    else ai.pending[0]!.resolve({ text: 'invalid' });
    await first;
    expect(contextStatusElement('dot', 'diet')?.classList.contains('ctx-health-dot-green')).toBe(true);
    expect(contextStatusElement('dot', 'diet')?.classList.contains('ctx-health-dot-shimmer')).toBe(false);
    expect(contextStatusElement('summary', 'diet')?.textContent).toBe('New assessment');
  });
  it('manual refresh supersedes an active request even with unchanged inputs', async () => {
    const first = loadContextHealthDots(); refreshAllHealthDots();
    const replacement = loadContextHealthDots(); expect(replacement).not.toBe(first); expect(ai.pending).toHaveLength(2);
    ai.pending[1]!.resolve(response('Refreshed assessment')); await replacement;
    ai.pending[0]!.resolve(response('Old assessment')); await first;
    expect(JSON.parse(localStorage.getItem('origin:contextHealth')!).cardSummaries.diet).toBe('Refreshed assessment');
  });
  it('retiring an older completion does not remove its still-pending replacement', async () => {
    const first = loadContextHealthDots(); state.importedData.diet!.breakfast = 'oats';
    const second = loadContextHealthDots(); expect(ai.pending).toHaveLength(2);
    ai.pending[0]!.resolve(response('Obsolete eggs')); await first;
    expect(loadContextHealthDots()).toBe(second); expect(ai.pending).toHaveLength(2);
    ai.pending[1]!.resolve(response('Reported oats')); await second;
    expect(contextStatusElement('summary', 'diet')?.textContent).toBe('Reported oats');
  });
  it('revoking then restoring paid demo consent still retires the original request', async () => {
    ai.demo = true; ai.provider = 'openrouter'; enableDemoContextLiveAI();
    const first = loadContextHealthDots(); expect(ai.pending).toHaveLength(1);
    disableDemoContextLiveAI(); enableDemoContextLiveAI();
    ai.pending[0]!.resolve(response('Obsolete consent')); await first;
    expect(localStorage.getItem('origin:contextHealth')).toBeNull();
  });
  it('keeps subscription usage out of the direct-provider ledger after a route change', async () => {
    ai.subscription = true;
    const first = loadContextHealthDots(); ai.subscription = false;
    ai.pending[0]!.resolve(response('Obsolete subscription')); await first;
    expect(ai.usage).not.toHaveBeenCalled(); expect(localStorage.getItem('origin:contextHealth')).toBeNull();
  });
  it.each(['labcharts-profile-switched', 'labcharts-ai-settings-synced', 'getbased:chat-backend-changed', 'getbased:agent-host-settings-changed', 'getbased:chat-model-selection-changed'])('retires the original request after %s even when its identity later matches again', async event => {
    const first = loadContextHealthDots();
    globalThis.dispatchEvent(new Event(event));
    ai.pending[0]!.resolve(response('Old profile session')); await first;
    expect(localStorage.getItem('origin:contextHealth')).toBeNull();
  });
});
