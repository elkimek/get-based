import { beforeEach, describe, expect, it, vi } from 'vitest';

let enrichCalls = 0;
let resolveEnrich;
let saveCalls = 0;
let renderCalls = 0;
let notificationCalls = [];
let draftBuildCalls = 0;
let draftBuildShouldThrow = false;

vi.mock('../js/lab-standards/nclp-cache.js', () => ({
  createPersistentNclpCache: () => ({ get: () => null, set: () => null }),
  enrichMarkersWithNclpCandidates: vi.fn((markers) => {
    enrichCalls += 1;
    return new Promise((resolve) => {
      resolveEnrich = () => resolve(markers.map(marker => ({
        ...marker,
        nclpStatus: 'reviewed_exact',
        nclpCandidates: [{ code: 'X', name: marker.displayName || marker.markerKey }],
      })));
    });
  }),
}));

vi.mock('../js/lab-order-intent.js', () => ({
  buildLabOrderDraftFromMarkers: vi.fn((markers) => {
    draftBuildCalls += 1;
    if (draftBuildShouldThrow) throw new Error('coverage exploded');
    return {
      id: 'draft-from-plan',
      provider: 'provider_selection',
      status: 'provider_selection',
      requestedMarkers: markers,
      providerOptions: [{ providerId: 'cz.labshop', name: 'Labshop' }],
      providerComparisons: [],
    };
  }),
  selectProviderForDraft: vi.fn(),
}));

vi.mock('../js/chat-history.js', () => ({
  saveChatHistory: vi.fn(async () => { saveCalls += 1; }),
}));

vi.mock('../js/chat-render.js', () => ({
  renderChatMessages: vi.fn(() => { renderCalls += 1; }),
}));

vi.mock('../js/utils.js', () => ({
  showNotification: vi.fn((message, type) => { notificationCalls.push({ message, type }); }),
}));

const { state } = await import('../js/state.js');
const { compareLabsFromPlan } = await import('../js/lab-order-actions.js');

describe('lab order actions', () => {
  beforeEach(() => {
    enrichCalls = 0;
    resolveEnrich = null;
    saveCalls = 0;
    renderCalls = 0;
    notificationCalls = [];
    draftBuildCalls = 0;
    draftBuildShouldThrow = false;
    state.chatHistory = [{
      role: 'assistant',
      content: 'Review first, then compare labs.',
      labPlanDraft: {
        id: 'plan-rapid-click',
        title: 'Focused lab plan',
        status: 'draft',
        markers: [{ markerKey: 'vitamins.folate', displayName: 'Folate' }],
      },
    }];
  });

  it('single-flights rapid repeated lab comparison clicks into one draft and one notification', async () => {
    const first = compareLabsFromPlan(0);
    const second = compareLabsFromPlan(0);
    const third = compareLabsFromPlan(0);

    expect(enrichCalls).toBe(1);
    expect(state.chatHistory[0].labPlanDraft.status).toBe('mapping_nclp');
    expect(state.chatHistory[0].labPlanDraft.statusMessage).toBe('Checking available lab tests…');
    expect(state.chatHistory[0].labOrderDraft).toBeUndefined();

    resolveEnrich();
    await Promise.all([first, second, third]);

    expect(draftBuildCalls).toBe(1);
    expect(saveCalls).toBe(1);
    expect(notificationCalls).toEqual([{ message: 'Lab coverage compared', type: 'success' }]);
    expect(state.chatHistory[0].labPlanDraft.status).toBe('compared');
    expect(state.chatHistory[0].labPlanDraft.statusMessage).toBeUndefined();
    expect(state.chatHistory[0].labOrderDraft).toMatchObject({
      id: 'draft-from-plan',
      provider: 'provider_selection',
      status: 'provider_selection',
    });
    expect(renderCalls).toBeGreaterThanOrEqual(2);
  });

  it('resets the lab plan card if comparison draft building throws', async () => {
    draftBuildShouldThrow = true;
    const run = compareLabsFromPlan(0);

    expect(state.chatHistory[0].labPlanDraft.status).toBe('mapping_nclp');
    resolveEnrich();
    await run;

    expect(draftBuildCalls).toBe(1);
    expect(state.chatHistory[0].labPlanDraft.status).toBe('suggested');
    expect(state.chatHistory[0].labPlanDraft.statusMessage).toBeUndefined();
    expect(state.chatHistory[0].labOrderDraft).toBeUndefined();
    expect(notificationCalls).toEqual([{ message: 'Lab comparison failed: coverage exploded', type: 'error' }]);
    expect(renderCalls).toBeGreaterThanOrEqual(2);
  });
});
