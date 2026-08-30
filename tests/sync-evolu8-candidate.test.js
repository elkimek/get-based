import { describe, expect, it, vi } from 'vitest';

import {
  EVOLU8_GENERATION_KEY,
  cleanupSupersededEvolu8Databases,
  createEvolu8Candidate,
  guardLegacyIdentityChanges,
  isEvolu8CandidateRequested,
  readEvolu8Generation,
} from '../js/sync-evolu8-candidate.js';

function createOpfsRoot(entries) {
  const values = new Map(entries.map(([name, kind = 'directory']) => [name, { kind }]));
  return {
    entries: vi.fn(async function* () { yield* values.entries(); }),
    removeEntry: vi.fn(async name => { values.delete(name); }),
  };
}

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: vi.fn(key => values.get(key) ?? null),
    setItem: vi.fn((key, value) => values.set(key, value)),
  };
}

function createErrorStore() {
  const listeners = new Set();
  let value = null;
  return {
    get: vi.fn(() => value),
    set(next) {
      value = next;
      for (const listener of listeners) listener();
    },
    subscribe: vi.fn(listener => {
      listeners.add(listener);
      return vi.fn(() => listeners.delete(listener));
    }),
  };
}

function createHarness({ mnemonic = 'alpha words', ownerId = `owner:${mnemonic}` } = {}) {
  const actives = [];
  const depsList = [];
  const events = [];
  const runs = [];
  const legacyEvolu = {
    appOwner: Promise.resolve({ id: ownerId, mnemonic }),
    restoreAppOwner: vi.fn(async () => {}),
    resetAppOwner: vi.fn(async () => {}),
  };

  const modern = {
    Mnemonic: { orThrow: vi.fn(value => {
      if (!value || value === 'invalid') throw new Error('invalid mnemonic');
      return value;
    }) },
    AppName: { orThrow: vi.fn(value => value) },
    mnemonicToOwnerSecret: vi.fn(value => value),
    createAppOwner: vi.fn(value => ({ id: `owner:${value}`, mnemonic: value })),
    createQueryBuilder: vi.fn(() => vi.fn(() => 'query')),
    createEvoluDeps: vi.fn(() => {
      const deps = {
        evoluError: createErrorStore(),
        [Symbol.dispose]: vi.fn(),
      };
      depsList.push(deps);
      return deps;
    }),
    createRun: vi.fn(() => {
      const run = {
        ok: vi.fn(async task => task),
        [Symbol.asyncDispose]: vi.fn(async () => {}),
      };
      runs.push(run);
      return run;
    }),
    createEvolu: vi.fn((_schema, config) => {
      const activeNumber = actives.length + 1;
      events.push(`create:${activeNumber}`);
      const queryUnsubscribers = [];
      const active = {
        name: config.appName,
        appOwner: config.appOwner,
        insert: vi.fn(() => ({ id: 'inserted' })),
        update: vi.fn(() => ({ id: 'updated' })),
        upsert: vi.fn(() => ({ id: 'upserted' })),
        loadQuery: vi.fn(async () => []),
        loadQueries: vi.fn(() => []),
        getQueryRows: vi.fn(() => []),
        exportDatabase: vi.fn(async () => new Uint8Array()),
        subscribeQuery: vi.fn(() => () => {
          const unsubscribe = vi.fn();
          queryUnsubscribers.push(unsubscribe);
          return unsubscribe;
        }),
        [Symbol.asyncDispose]: vi.fn(async () => { events.push(`dispose:${activeNumber}`); }),
        config,
        queryUnsubscribers,
      };
      actives.push(active);
      return active;
    }),
  };

  return { actives, depsList, events, legacyEvolu, modern, runs };
}

describe('Evolu 8 compatibility candidate', () => {
  it('invalidates the v8 vault before legacy restore and reset mutations', async () => {
    const events = [];
    const legacy = {
      name: 'getbased4',
      restoreAppOwner: vi.fn(async () => { events.push('legacy:restore'); }),
      resetAppOwner: vi.fn(async () => { events.push('legacy:reset'); }),
    };
    const identityVault = {
      invalidate: vi.fn(() => { events.push('vault:invalidate'); return Promise.resolve(); }),
    };
    const guarded = guardLegacyIdentityChanges(legacy, identityVault);

    expect(guarded.name).toBe('getbased4');
    await guarded.restoreAppOwner('words', { reload: false });
    await guarded.resetAppOwner({ reload: false });

    expect(events).toEqual([
      'vault:invalidate', 'legacy:restore',
      'vault:invalidate', 'legacy:reset',
    ]);
  });

  it('boots from a durable v8 identity without opening the v7 bridge', async () => {
    const harness = createHarness();
    const getLegacyEvolu = vi.fn(async () => harness.legacyEvolu);
    const identityVault = {
      invalidate: vi.fn(async () => {}),
      write: vi.fn(async () => {}),
    };
    const evolu = await createEvolu8Candidate({
      getLegacyEvolu,
      initialIdentity: { ownerId: 'owner:alpha words', mnemonic: 'alpha words' },
      identityVault,
      modern: harness.modern,
      schema: { profileData: {} },
      relay: 'wss://relay.example',
      storage: createStorage(),
    });

    await expect(evolu.appOwner).resolves.toMatchObject({ id: 'owner:alpha words' });
    expect(getLegacyEvolu).not.toHaveBeenCalled();
    expect(identityVault.invalidate).not.toHaveBeenCalled();
    expect(identityVault.write).not.toHaveBeenCalled();
  });

  it('persists the first verified v7 identity handoff', async () => {
    const harness = createHarness();
    const identityVault = {
      invalidate: vi.fn(async () => {}),
      write: vi.fn(async () => {}),
    };
    await createEvolu8Candidate({
      legacyEvolu: harness.legacyEvolu,
      identityVault,
      modern: harness.modern,
      schema: { profileData: {} },
      relay: 'wss://relay.example',
      storage: createStorage(),
    });

    expect(identityVault.invalidate).toHaveBeenCalledOnce();
    expect(identityVault.write).toHaveBeenCalledWith({
      ownerId: 'owner:alpha words',
      mnemonic: 'alpha words',
    });
  });

  it('loads v7 lazily to align restore and reset identity changes', async () => {
    const harness = createHarness();
    const getLegacyEvolu = vi.fn(async () => harness.legacyEvolu);
    const identityVault = {
      invalidate: vi.fn(async () => {}),
      write: vi.fn(async () => {}),
    };
    const evolu = await createEvolu8Candidate({
      getLegacyEvolu,
      initialIdentity: { ownerId: 'owner:alpha words', mnemonic: 'alpha words' },
      identityVault,
      modern: harness.modern,
      schema: { profileData: {} },
      relay: 'wss://relay.example',
      storage: createStorage(),
    });

    await evolu.restoreAppOwner('beta words', { reload: false });
    await evolu.resetAppOwner({ reload: false });

    expect(getLegacyEvolu).toHaveBeenCalledOnce();
    expect(harness.legacyEvolu.restoreAppOwner)
      .toHaveBeenCalledWith('beta words', { reload: false });
    expect(harness.legacyEvolu.resetAppOwner).toHaveBeenCalledWith({ reload: false });
    expect(identityVault.invalidate).toHaveBeenCalledTimes(2);
    expect(identityVault.write).toHaveBeenCalledWith({
      ownerId: 'owner:beta words',
      mnemonic: 'beta words',
    });
  });

  it('reclaims only unlocked superseded v8 database generations', async () => {
    const active = 'getbased8g3-owner_current';
    const stale = 'getbased8g2';
    const staleWithOwnerSuffix = 'getbased8g2-owner_previous';
    const locked = 'getbased8g1';
    const root = createOpfsRoot([
      [`.${active}`],
      [`.${stale}`],
      [`.${staleWithOwnerSuffix}`],
      [`.${locked}`],
      ['.getbased8g-bad'],
      ['.getbased8g0'],
      ['.getbased4'],
      ['unrelated'],
      ['.getbased8g4-owner_file', 'file'],
    ]);
    const lockManager = {
      request: vi.fn(async (name, options, callback) => callback(
        name === `evolu-leaderlock-${locked}` ? null : { name, mode: options.mode },
      )),
    };

    const result = await cleanupSupersededEvolu8Databases({
      activeDatabaseName: active,
      storageManager: { getDirectory: vi.fn(async () => root) },
      lockManager,
    });

    expect(result).toEqual({ deleted: [stale, staleWithOwnerSuffix], skipped: [locked] });
    expect(root.removeEntry).toHaveBeenCalledTimes(2);
    expect(root.removeEntry).toHaveBeenCalledWith(`.${stale}`, { recursive: true });
    expect(root.removeEntry).toHaveBeenCalledWith(`.${staleWithOwnerSuffix}`, { recursive: true });
    expect(lockManager.request).toHaveBeenCalledTimes(3);
    for (const [, options] of lockManager.request.mock.calls) {
      expect(options).toEqual({ ifAvailable: true, mode: 'exclusive' });
    }
  });

  it('makes OPFS cleanup a no-op when the active name or browser APIs are unavailable', async () => {
    const root = createOpfsRoot([['.getbased8g1-owner']]);
    const lockManager = { request: vi.fn() };

    await expect(cleanupSupersededEvolu8Databases({
      activeDatabaseName: 'getbased4',
      storageManager: { getDirectory: vi.fn(async () => root) },
      lockManager,
    })).resolves.toEqual({ deleted: [], skipped: [] });
    await expect(cleanupSupersededEvolu8Databases({
      activeDatabaseName: 'getbased8g1-owner',
      storageManager: null,
      lockManager,
    })).resolves.toEqual({ deleted: [], skipped: [] });

    expect(root.entries).not.toHaveBeenCalled();
    expect(lockManager.request).not.toHaveBeenCalled();
  });

  it('requires an explicit v8 query opt-in', () => {
    expect(isEvolu8CandidateRequested({ search: '?evolu-client=v8' })).toBe(true);
    expect(isEvolu8CandidateRequested({ href: 'https://getbased.health/?evolu-client=v8' })).toBe(true);
    expect(isEvolu8CandidateRequested({ search: '?evolu-client=v7' })).toBe(false);
    expect(isEvolu8CandidateRequested({ search: '' })).toBe(false);
  });

  it('normalizes corrupt generation state without writing it', () => {
    expect(readEvolu8Generation(createStorage())).toBe(1);
    expect(readEvolu8Generation(createStorage({ [EVOLU8_GENERATION_KEY]: '-4' }))).toBe(1);
    expect(readEvolu8Generation(createStorage({ [EVOLU8_GENERATION_KEY]: '12' }))).toBe(12);
  });

  it('preserves the v7 owner and forwards the v7-shaped API to Evolu 8', async () => {
    const harness = createHarness();
    const storage = createStorage();
    const evolu = await createEvolu8Candidate({
      legacyEvolu: harness.legacyEvolu,
      modern: harness.modern,
      schema: { profileData: {} },
      relay: 'wss://relay.example',
      storage,
    });

    expect(evolu.__evoluClientVersion).toBe(8);
    await expect(evolu.appOwner).resolves.toMatchObject({ id: 'owner:alpha words', mnemonic: 'alpha words' });
    expect(harness.actives[0].config).toMatchObject({
      appName: 'getbased8g1',
      transports: [{ type: 'WebSocket', url: 'wss://relay.example' }],
    });
    expect(evolu.createQuery(() => {})).toBe('query');
    expect(evolu.insert('profileData', { profileId: 'p1' })).toEqual({ id: 'inserted' });
    expect(harness.actives[0].insert).toHaveBeenCalledWith('profileData', { profileId: 'p1' });
    expect(harness.legacyEvolu.restoreAppOwner).not.toHaveBeenCalled();
  });

  it('uses a fresh database generation on restore and rebinds subscriptions', async () => {
    const harness = createHarness();
    const storage = createStorage({ [EVOLU8_GENERATION_KEY]: '4' });
    const evolu = await createEvolu8Candidate({
      legacyEvolu: harness.legacyEvolu,
      modern: harness.modern,
      schema: { profileData: {} },
      relay: 'wss://relay.example',
      storage,
    });
    const queryListener = vi.fn();
    const errorListener = vi.fn();
    evolu.subscribeQuery('profiles')(queryListener);
    evolu.subscribeError(errorListener);

    expect(evolu.prepareHistoryReset()).toBe(5);
    expect(evolu.prepareHistoryReset()).toBe(5);
    await evolu.restoreAppOwner('beta words', { reload: false });

    expect(harness.legacyEvolu.restoreAppOwner).toHaveBeenCalledWith('beta words', { reload: false });
    expect(storage.setItem).toHaveBeenCalledOnce();
    expect(storage.setItem).toHaveBeenCalledWith(EVOLU8_GENERATION_KEY, '5');
    expect(harness.actives).toHaveLength(2);
    expect(harness.actives[1].config.appName).toBe('getbased8g5');
    expect(harness.actives[1].loadQuery).toHaveBeenCalledWith('profiles');
    expect(harness.actives[1].subscribeQuery).toHaveBeenCalledWith('profiles');
    expect(harness.depsList[1].evoluError.subscribe).toHaveBeenCalled();
    expect(harness.actives[0][Symbol.asyncDispose]).toHaveBeenCalledOnce();
    expect(harness.events).toEqual(['create:1', 'dispose:1', 'create:2']);
    expect(evolu.update('profileData', { id: 'row1' })).toEqual({ id: 'updated' });
    expect(harness.actives[1].update).toHaveBeenCalled();
    await expect(evolu.appOwner).resolves.toMatchObject({ id: 'owner:beta words' });
  });

  it('advances the generation before delegating a disconnect reset', async () => {
    const harness = createHarness();
    const storage = createStorage();
    const evolu = await createEvolu8Candidate({
      legacyEvolu: harness.legacyEvolu,
      modern: harness.modern,
      schema: { profileData: {} },
      relay: 'wss://relay.example',
      storage,
    });

    await evolu.resetAppOwner({ reload: false });

    expect(storage.setItem).toHaveBeenCalledWith(EVOLU8_GENERATION_KEY, '2');
    expect(harness.legacyEvolu.resetAppOwner).toHaveBeenCalledWith({ reload: false });
    expect(harness.actives[0][Symbol.asyncDispose]).toHaveBeenCalledOnce();
  });

  it('fails closed before restore or reset when a new generation cannot be persisted', async () => {
    for (const setItem of [
      vi.fn(() => { throw new Error('quota denied'); }),
      vi.fn(() => {}),
    ]) {
      const harness = createHarness();
      const storage = {
        getItem: vi.fn(() => null),
        setItem,
      };
      const evolu = await createEvolu8Candidate({
        legacyEvolu: harness.legacyEvolu,
        modern: harness.modern,
        schema: { profileData: {} },
        relay: 'wss://relay.example',
        storage,
      });

      expect(evolu.prepareHistoryResetForDisable()).toBe(false);
      expect(() => evolu.prepareHistoryReset()).toThrow('could not safely persist');
      await expect(evolu.restoreAppOwner('beta words', { reload: false }))
        .rejects.toThrow('could not safely persist');
      await expect(evolu.resetAppOwner({ reload: false }))
        .rejects.toThrow('could not safely persist');

      expect(harness.legacyEvolu.restoreAppOwner).not.toHaveBeenCalled();
      expect(harness.legacyEvolu.resetAppOwner).not.toHaveBeenCalled();
      expect(harness.actives).toHaveLength(1);
      expect(harness.actives[0][Symbol.asyncDispose]).not.toHaveBeenCalled();
      await expect(evolu.appOwner).resolves.toMatchObject({ id: 'owner:alpha words' });
    }
  });

  it('fails closed if the same mnemonic derives a different owner ID', async () => {
    const harness = createHarness({ ownerId: 'unexpected-owner' });
    await expect(createEvolu8Candidate({
      legacyEvolu: harness.legacyEvolu,
      modern: harness.modern,
      schema: { profileData: {} },
      relay: 'wss://relay.example',
      storage: createStorage(),
    })).rejects.toThrow('different owner ID');
    expect(harness.modern.createEvolu).not.toHaveBeenCalled();
  });
});
