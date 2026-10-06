import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { state } from '../js/state.js';
import { configureSyncMessenger, _resetAgentAccessMigrationStateForTesting, pushContextToGateway } from '../js/sync-messenger.js';
const original = state.importedData; const originalProfile = state.currentProfile;
let ownerId = 'origin-owner'; const ownerKey = new Uint8Array(32).fill(7);
const fetchSpy = vi.fn<typeof fetch>(async () => new Response(null, { status: 204 }));
beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks(); vi.stubGlobal('fetch', fetchSpy);
  _resetAgentAccessMigrationStateForTesting(); ownerId = 'origin-owner';
  state.currentProfile = 'origin-profile';
  state.importedData = { ...original, entries: [], agentAccess: { version: 1, enabled: true, token: 'a'.repeat(64), contextKey: 'gbctx_v1_' + 'B'.repeat(43) } };
  configureSyncMessenger({ getSyncRelay: () => 'wss://origin.example.test', getAppOwner: () => ({ id: ownerId, writeKey: ownerKey }), getProfiles: () => [], buildLabContext: () => 'Synthetic context', getAgentWearableSeriesDays: () => 7 });
});
afterEach(() => {
  vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals();
  _resetAgentAccessMigrationStateForTesting(); state.importedData = original; state.currentProfile = originalProfile;
  configureSyncMessenger({ getAppOwner: () => null, getSyncRelay: () => 'wss://sync.getbased.health', getAgentWearableSeriesDays: () => 0, buildWearableSeriesSection: async () => '', debug: () => {} });
});

describe('Agent Access context preparation ownership', () => {
  it.each(['profile', 'owner', 'credential'] as const)('does not send prepared context after its %s changes during an await', async change => {
    let finishSeries!: (value: string) => void;
    let skipped!: () => void;
    const stopped = new Promise<void>(resolve => { skipped = resolve; });
    const series = vi.fn(() => new Promise<string>(resolve => { finishSeries = resolve; }));
    configureSyncMessenger({ buildWearableSeriesSection: series, debug: message => { if (String(message).startsWith('Skipped stale Agent Access context after preparation')) skipped(); } });
    pushContextToGateway(); await vi.advanceTimersByTimeAsync(5000);
    expect(series).toHaveBeenCalledOnce();
    if (change === 'profile') { state.currentProfile = 'other-profile'; state.importedData = { ...original, entries: [], agentAccess: null }; }
    else if (change === 'owner') ownerId = 'new-owner';
    else (state.importedData.agentAccess as Record<string, unknown>).token = 'c'.repeat(64);
    finishSeries('Synthetic wearable series'); await stopped;
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('checks the owner before preparing context when identity changes during the debounce', async () => {
    const build = vi.fn(() => 'Synthetic context'); configureSyncMessenger({ buildLabContext: build });
    pushContextToGateway(); ownerId = 'new-owner'; await vi.advanceTimersByTimeAsync(5000);
    expect(build).not.toHaveBeenCalled(); expect(fetchSpy).not.toHaveBeenCalled();
  });
});
