import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoredProfileRecord } from '../js/profile-list-store.js';
import type { LabContextBuilder } from '../js/lab-context-loader.js';
const ports = vi.hoisted(() => ({
  productionLoad: vi.fn<() => Promise<LabContextBuilder>>()
}));
vi.mock('../js/lab-context-loader.js', () => ({
  loadLabContextBuilder: ports.productionLoad
}));
let messenger: typeof import('../js/sync-messenger.js');
let state: typeof import('../js/state.js')['state'];
let owner: {
  id: string;
  writeKey: Uint8Array
} | null;
let relay: string;
let profiles: StoredProfileRecord[];
const fetchSpy = vi.fn<typeof fetch>();
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return {
    promise,
    resolve,
    reject
  };
}
const contextKey = 'gbctx_v1_' + 'B'.repeat(43);
beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  localStorage.clear();
  ({
    state
  } = await import('../js/state.js'));
  messenger = await import('../js/sync-messenger.js');
  vi.useFakeTimers();
  vi.stubGlobal('crypto', webcrypto);
  vi.stubGlobal('fetch', fetchSpy);
  fetchSpy.mockResolvedValue(new Response(null, {
    status: 204
  }));
  state.currentProfile = 'prepared-origin';
  localStorage.setItem('labcharts-active-profile', state.currentProfile);
  state.importedData = {
    ...state.importedData,
    entries: [],
    agentAccess: {
      version: 1,
      enabled: true,
      token: 'a'.repeat(64),
      contextKey
    }
  };
  owner = {
    id: 'prepared-owner',
    writeKey: new Uint8Array(32).fill(7)
  };
  relay = 'wss://origin.example.test';
  profiles = [];
  messenger.configureSyncMessenger({
    getAppOwner: () => owner,
    getSyncRelay: () => relay,
    getProfiles: () => profiles,
    getAgentWearableSeriesDays: () => 0,
    buildWearableSeriesSection: async () => '',
    debug: () => {}
  });
});
afterEach(() => {
  messenger.configureSyncMessengerContextPreparation(null);
  messenger._resetAgentAccessMigrationStateForTesting();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function tick() {
  await Promise.resolve();
  await Promise.resolve();
}
function changeOwner(change: string) {
  if (change === 'profile') state.currentProfile = 'replacement';
  if (change === 'data') state.importedData = {
    ...state.importedData
  };
  if (change === 'owner') owner = {
    ...owner!,
    id: 'replacement-owner'
  };
  if (change === 'write-key') owner!.writeKey[0] = 9;
  if (change === 'relay') relay = 'wss://replacement.example.test';
  if (change === 'token') state.importedData.agentAccess!.token = 'c'.repeat(64);
  if (change === 'context-key') state.importedData.agentAccess!.contextKey = 'gbctx_v1_' + 'C'.repeat(43);
  if (change === 'disabled') messenger.disableMessengerTokenLocal();
  if (change === 'demo') profiles.push({
    id: state.currentProfile,
    tags: ['demo']
  });
  if (change === 'builder') messenger.configureSyncMessenger({
    buildLabContext: () => 'Replacement builder'
  });
  if (change === 'wearables') messenger.configureSyncMessenger({
    buildWearableSeriesSection: async () => 'Replacement series'
  });
  if (change === 'days') messenger.configureSyncMessenger({
    getAgentWearableSeriesDays: () => 30
  });
  if (change === 'preparation') messenger.configureSyncMessengerContextPreparation(async () => () => 'Replacement preparation');
}
describe('default Agent Access context preparation', () => {
  it.each(['disabled', 'demo', 'missing-owner', 'stale-debounce'] as const)('never loads default context for %s', async gate => {
    const prepare = vi.fn(async () => () => 'Private context');
    messenger.configureSyncMessengerContextPreparation(prepare);
    if (gate === 'disabled') messenger.disableMessengerTokenLocal();
    if (gate === 'demo') profiles.push({
      id: state.currentProfile,
      tags: ['demo']
    });
    if (gate === 'missing-owner') owner = null;
    messenger.pushContextToGateway();
    if (gate === 'stale-debounce') state.currentProfile = 'replacement';
    await vi.advanceTimersByTimeAsync(5000);
    expect(prepare).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it('starts only inside the existing debounce and encrypts the exact prepared context with real AES-GCM', async () => {
    const held = deferred<LabContextBuilder>();
    const build = vi.fn(() => 'Prepared private context');
    const prepare = vi.fn(() => held.promise);
    const sent = deferred<void>();
    fetchSpy.mockImplementation(async () => {
      sent.resolve();
      return new Response(null, {
        status: 204
      });
    });
    messenger.configureSyncMessengerContextPreparation(prepare);
    messenger.pushContextToGateway();
    expect(prepare).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(4999);
    expect(prepare).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(prepare).toHaveBeenCalledOnce();
    expect(build).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    held.resolve(build);
    await sent.promise;
    const [, options] = fetchSpy.mock.calls[0]!;
    const envelope = JSON.parse(String(options!.body));
    const encrypted = JSON.parse(envelope.context).encryptedContext;
    const key = await webcrypto.subtle.importKey('raw', Buffer.from('B'.repeat(43), 'base64url'), {
      name: 'AES-GCM'
    }, false, ['decrypt']);
    const plaintext = await webcrypto.subtle.decrypt({
      name: 'AES-GCM',
      iv: Buffer.from(encrypted.iv, 'base64'),
      additionalData: new TextEncoder().encode('getbased-agent-context-v2:prepared-origin')
    }, key, Buffer.from(encrypted.ciphertext, 'base64'));
    expect(new TextDecoder().decode(plaintext)).toBe('Prepared private context');
    expect(envelope.ownerId).toBe('prepared-owner');
    expect(envelope.profileId).toBe('prepared-origin');
    expect(envelope.signature).toMatch(/^[a-f0-9]{64}$/);
    expect(String(options!.body)).not.toContain('Prepared private context');
  });
  it.each([
    'profile',
    'data',
    'owner',
    'write-key',
    'relay',
    'token',
    'context-key',
    'disabled',
    'demo',
    'builder',
    'wearables',
    'days',
    'preparation'
  ] as const)('does no build, encryption or send after %s changes during import', async change => {
    const held = deferred<LabContextBuilder>();
    const build = vi.fn(() => 'Must not be assembled');
    const encrypt = vi.spyOn(webcrypto.subtle, 'encrypt');
    messenger.configureSyncMessengerContextPreparation(() => held.promise);
    messenger.pushContextToGateway();
    await vi.advanceTimersByTimeAsync(5000);
    changeOwner(change);
    held.resolve(build);
    await tick();
    expect(build).not.toHaveBeenCalled();
    expect(encrypt).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it.each([
    'profile',
    'owner',
    'write-key',
    'relay',
    'token',
    'context-key',
    'disabled',
    'demo',
    'builder',
    'wearables',
    'days',
    'preparation'
  ] as const)('rejects %s changes during wearable preparation before encryption', async change => {
    const held = deferred<string>();
    const encrypt = vi.spyOn(webcrypto.subtle, 'encrypt');
    messenger.configureSyncMessenger({
      buildLabContext: () => 'Initial private context',
      getAgentWearableSeriesDays: () => 7,
      buildWearableSeriesSection: () => held.promise
    });
    messenger.pushContextToGateway();
    await vi.advanceTimersByTimeAsync(5000);
    changeOwner(change);
    held.resolve('Initial wearable context');
    await tick();
    expect(encrypt).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it('checks ownership again when a resumed profile callback replaces the owner while returning non-demo', async () => {
    const held = deferred<LabContextBuilder>();
    const build = vi.fn(() => 'Must never be assembled');
    const encrypt = vi.spyOn(webcrypto.subtle, 'encrypt');
    let resumed = false;
    messenger.configureSyncMessenger({
      getProfiles: () => {
        if (resumed) owner = {
          ...owner!,
          id: 'replacement-owner'
        };
        return [];
      }
    });
    messenger.configureSyncMessengerContextPreparation(() => held.promise);
    messenger.pushContextToGateway();
    await vi.advanceTimersByTimeAsync(5000);
    resumed = true;
    held.resolve(build);
    await tick();
    expect(build).not.toHaveBeenCalled();
    expect(encrypt).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it('releases in-flight preparation after failure and allows a new attempt', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const prepare = vi.fn<() => Promise<LabContextBuilder>>().mockRejectedValueOnce(new Error('Synthetic import failure')).mockResolvedValue(() => 'Retried private context');
    const sent = deferred<void>();
    fetchSpy.mockImplementation(async () => {
      sent.resolve();
      return new Response(null, {
        status: 204
      });
    });
    messenger.configureSyncMessengerContextPreparation(prepare);
    messenger.pushContextToGateway();
    await vi.advanceTimersByTimeAsync(5000);
    expect(warn).toHaveBeenCalledWith('[sync] Context push failed:', expect.objectContaining({
      message: 'Synthetic import failure'
    }));
    messenger.pushContextToGateway();
    await vi.advanceTimersByTimeAsync(5000);
    await sent.promise;
    expect(prepare).toHaveBeenCalledTimes(2);
    expect(fetchSpy).toHaveBeenCalledOnce();
  });
  it('keeps injected build, days and wearable invocation synchronous without calling preparation', async () => {
    const trace: string[] = [];
    const held = deferred<string>();
    const prepare = vi.fn(async () => () => 'Unused default context');
    const sent = deferred<void>();
    fetchSpy.mockImplementation(async () => {
      sent.resolve();
      return new Response(null, {
        status: 204
      });
    });
    messenger.configureSyncMessengerContextPreparation(prepare);
    messenger.configureSyncMessenger({
      buildLabContext: () => {
        trace.push('build');
        return 'Injected context';
      },
      getAgentWearableSeriesDays: () => {
        trace.push('days');
        return 7;
      },
      buildWearableSeriesSection: () => {
        trace.push('wearables');
        return held.promise;
      }
    });
    messenger.pushContextToGateway();
    await vi.advanceTimersByTimeAsync(5000);
    expect(trace).toEqual(['build', 'days', 'wearables']);
    expect(prepare).not.toHaveBeenCalled();
    held.resolve('Injected series');
    await sent.promise;
  });
  it('preserves seven inherited getter reads and makes no partial configuration update when destructuring throws', () => {
    const fields = [
      'getSyncRelay',
      'getAppOwner',
      'debug',
      'buildLabContext',
      'buildWearableSeriesSection',
      'getAgentWearableSeriesDays',
      'getProfiles'
    ];
    const trace: string[] = [];
    const inherited = Object.create(null);
    for (const field of fields) Object.defineProperty(inherited, field, {
      get() {
        trace.push(field);
        return undefined;
      }
    });
    expect(messenger.configureSyncMessenger(Object.create(inherited))).toBeUndefined();
    expect(trace).toEqual(fields);
    const failure = new Error('Synthetic configuration getter failure');
    expect(() => messenger.configureSyncMessenger({
      getAppOwner: () => null,
      get debug(): (...args: unknown[]) => void {
        throw failure;
      }
    })).toThrow(failure);
    expect(messenger.hasMessengerSyncIdentity()).toBe(true);
  });
  it('first-party reconfiguration replaces a prior injected builder with its stable cold default', async () => {
    const custom = vi.fn(() => 'Obsolete injected context');
    messenger.configureSyncMessenger({
      buildLabContext: custom
    });
    const {
      configureSyncModules
    } = await import('../js/sync-configure.js');
    const runtime = await import('../js/sync-runtime.js');
    configureSyncModules();
    runtime.setSyncAppOwner(owner);
    localStorage.setItem('labcharts-sync-relay', relay);
    const held = deferred<LabContextBuilder>();
    ports.productionLoad.mockReturnValue(held.promise);
    messenger.pushContextToGateway();
    await vi.advanceTimersByTimeAsync(5000);
    expect(custom).not.toHaveBeenCalled();
    expect(ports.productionLoad).toHaveBeenCalledOnce();
    messenger.disableMessengerTokenLocal();
    held.resolve(() => 'Retired preparation');
    await tick();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
