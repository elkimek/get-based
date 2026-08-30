// @ts-check
// Experimental Evolu 8 compatibility adapter.
//
// Evolu 8 intentionally cannot open Evolu 7's local SQLite format and its
// released web API does not yet implement deleteDatabase/resetAppOwner. A
// durable browser vault avoids opening the v7 worker after the first identity
// handoff; destructive identity changes load v7 lazily to preserve rollback.

import { setSyncAppOwnerError } from './sync-runtime.js';
import { createEvolu8IdentityVault } from './sync-evolu8-identity-vault.js';
import { showNotification } from './utils.js';

export const EVOLU8_CLIENT_QUERY_PARAM = 'evolu-client';
export const EVOLU8_GENERATION_KEY = 'labcharts-sync-evolu8-generation';
const EVOLU_BUNDLE_URL = new URL('../vendor/evolu/evolu-bundle.js', import.meta.url).href;
// Candidate assets are intentionally fetched on first explicit opt-in instead
// of adding another 2.5 MB to every user's PWA app-shell download.
const EVOLU8_VENDOR_DIRECTORY = '../vendor/evolu8/';
const EVOLU8_BUNDLE_URL = new URL(`${EVOLU8_VENDOR_DIRECTORY}evolu-bundle.js`, import.meta.url).href;

/** @param {Location | { href?: string, search?: string } | null | undefined} [locationLike] */
export function isEvolu8CandidateRequested(locationLike = globalThis.location) {
  try {
    const search = typeof locationLike?.search === 'string'
      ? locationLike.search
      : new URL(String(locationLike?.href || ''), 'https://getbased.invalid/').search;
    return new URLSearchParams(search).get(EVOLU8_CLIENT_QUERY_PARAM) === 'v8';
  } catch {
    return false;
  }
}

/** @param {Storage | { getItem?: Function } | null | undefined} storage */
export function readEvolu8Generation(storage = globalThis.localStorage) {
  try {
    const parsed = Number.parseInt(String(storage?.getItem?.(EVOLU8_GENERATION_KEY) || ''), 10);
    return Number.isSafeInteger(parsed) && parsed >= 1 ? parsed : 1;
  } catch {
    return 1;
  }
}

/** @param {string} directoryName */
function isEvolu8DatabaseDirectory(directoryName) {
  // Current Evolu derives a tenant suffix from the owner ID. Accept the
  // unsuffixed appName as well so cleanup remains correct if the web driver
  // uses the configured name directly (or an earlier candidate already did).
  return /^\.getbased8g[1-9]\d*(?:-[A-Za-z0-9_-]+)?$/.test(directoryName);
}

/**
 * Reclaim candidate databases from superseded generations without depending
 * on Evolu 8's currently-unimplemented public deleteDatabase method.
 *
 * Evolu's web driver stores an encrypted database for instance `name` in the
 * OPFS directory `.${name}` and holds `evolu-leaderlock-${name}` for as long
 * as its worker has the database open. Taking that same lock with
 * `ifAvailable` makes deletion safe across tabs and crashed/lingering workers:
 * active databases are skipped and retried on a later startup.
 *
 * @param {{
 *   activeDatabaseName: string,
 *   storageManager?: { getDirectory?: Function } | null,
 *   lockManager?: { request?: Function } | null,
 * }} options
 */
export async function cleanupSupersededEvolu8Databases({
  activeDatabaseName,
  storageManager = globalThis.navigator?.storage,
  lockManager = globalThis.navigator?.locks,
}) {
  const activeDirectoryName = `.${String(activeDatabaseName || '')}`;
  if (!isEvolu8DatabaseDirectory(activeDirectoryName)
      || typeof storageManager?.getDirectory !== 'function'
      || typeof lockManager?.request !== 'function') {
    return { deleted: [], skipped: [] };
  }

  const root = await storageManager.getDirectory();
  if (!root || typeof root.entries !== 'function' || typeof root.removeEntry !== 'function') {
    return { deleted: [], skipped: [] };
  }

  const deleted = [];
  const skipped = [];
  for await (const [directoryName, handle] of root.entries()) {
    if (handle?.kind !== 'directory'
        || directoryName === activeDirectoryName
        || !isEvolu8DatabaseDirectory(directoryName)) continue;

    const databaseName = directoryName.slice(1);
    let didDelete = false;
    try {
      didDelete = await lockManager.request(
        `evolu-leaderlock-${databaseName}`,
        { ifAvailable: true, mode: 'exclusive' },
        async lock => {
          if (!lock) return false;
          await root.removeEntry(directoryName, { recursive: true });
          return true;
        },
      );
    } catch (error) {
      console.warn('[sync] Could not reclaim superseded Evolu 8 database:', error);
    }
    (didDelete ? deleted : skipped).push(databaseName);
  }

  return { deleted, skipped };
}

/**
 * Load the stable v7 client by default and the compatibility bridge only after
 * an explicit query opt-in. Keeping this loader lazy avoids adding candidate
 * code to the production startup bundle.
 * @param {{
 *   createSyncSchema: (types: any) => any,
 *   relay: string,
 *   reloadUrl: string,
 *   enableLogging: boolean,
 * }} options
 */
export async function createSyncEvoluClient({
  createSyncSchema,
  relay,
  reloadUrl,
  enableLogging,
}) {
  const identityVault = createEvolu8IdentityVault();
  if (isEvolu8CandidateRequested()) {
    const evolu = await createEvolu8SyncClient({
      relay,
      reloadUrl,
      enableLogging,
      createSyncSchema,
      identityVault,
    });
    console.warn('[sync] Running opt-in Evolu 8 compatibility candidate');
    return evolu;
  }
  const legacyEvolu = await createLegacyEvoluClient({
    createSyncSchema,
    reloadUrl,
    enableLogging,
    transports: [{ type: 'WebSocket', url: relay }],
  });
  return guardLegacyIdentityChanges(legacyEvolu, identityVault);
}

/**
 * @param {{
 *   createSyncSchema: (types: any) => any,
 *   reloadUrl: string,
 *   enableLogging: boolean,
 *   transports: Array<any>,
 * }} options
 */
async function createLegacyEvoluClient({
  createSyncSchema,
  reloadUrl,
  enableLogging,
  transports,
}) {
  const legacy = await import(EVOLU_BUNDLE_URL);
  const schema = createSyncSchema({
    id: legacy.id,
    nullOr: legacy.nullOr,
    NonEmptyString: legacy.NonEmptyString,
  });
  return legacy.createEvolu(legacy.evoluWebDeps)(schema, {
    name: legacy.SimpleName.orThrow('getbased4'),
    reloadUrl,
    enableLogging,
    transports,
  });
}

/**
 * Invalidate the v8 identity commit before v7 changes its owner. Run the IDB
 * deletion alongside the v7 mutation; token removal itself is synchronous.
 * @param {any} legacyEvolu
 * @param {{ invalidate: () => Promise<void> | void }} identityVault
 */
export function guardLegacyIdentityChanges(legacyEvolu, identityVault) {
  const restoreAppOwner = (...args) => {
    const invalidation = identityVault.invalidate();
    return Promise.all([
      Promise.resolve(invalidation),
      Promise.resolve(legacyEvolu.restoreAppOwner(...args)),
    ]).then(([, result]) => result);
  };
  const resetAppOwner = (...args) => {
    const invalidation = identityVault.invalidate();
    return Promise.all([
      Promise.resolve(invalidation),
      Promise.resolve(legacyEvolu.resetAppOwner(...args)),
    ]).then(([, result]) => result);
  };
  return new Proxy(legacyEvolu, {
    get(target, property, receiver) {
      if (property === 'restoreAppOwner') return restoreAppOwner;
      if (property === 'resetAppOwner') return resetAppOwner;
      return Reflect.get(target, property, receiver);
    },
  });
}

/**
 * Keep all candidate-only initialization out of the default startup bundle.
 * @param {{
 *   relay: string,
 *   reloadUrl: string,
 *   enableLogging: boolean,
 *   createSyncSchema: (types: any) => any,
 *   identityVault?: { invalidate: () => Promise<void> | void, read: () => Promise<any>, write: (identity: any) => Promise<void> },
 * }} options
 */
export async function createEvolu8SyncClient({
  relay,
  reloadUrl,
  enableLogging,
  createSyncSchema,
  identityVault = createEvolu8IdentityVault(),
}) {
  const modern = await import(EVOLU8_BUNDLE_URL);
  const modernSchema = createSyncSchema({
    id: modern.id,
    nullOr: modern.nullOr,
    // v8 removed the old NonEmptyString convenience type. The base String
    // type preserves the v7 wire schema without rejecting legacy values.
    NonEmptyString: modern.EvoluString,
  });
  let initialIdentity = await identityVault.read();
  if (initialIdentity) {
    try {
      const owner = createModernOwner(modern, initialIdentity.mnemonic);
      if (owner.id !== initialIdentity.ownerId) throw new Error('owner mismatch');
    } catch {
      await identityVault.invalidate();
      initialIdentity = null;
    }
  }
  let legacyEvoluPromise = null;
  const getLegacyEvolu = () => {
    legacyEvoluPromise ??= createLegacyEvoluClient({
      createSyncSchema,
      reloadUrl,
      enableLogging,
      transports: [],
    });
    return legacyEvoluPromise;
  };
  return createEvolu8Candidate({
    getLegacyEvolu,
    initialIdentity,
    identityVault,
    modern,
    schema: modernSchema,
    relay,
    onSharedWorkerUnsupported: () => {
      setSyncAppOwnerError('Evolu 8 requires this app to stay open in only one tab in this browser');
    },
  });
}

/** @param {Storage | { getItem?: Function, setItem?: Function } | null | undefined} storage */
function advanceEvolu8Generation(storage) {
  const current = readEvolu8Generation(storage);
  const next = current >= Number.MAX_SAFE_INTEGER ? 1 : current + 1;
  const serializedNext = String(next);
  try {
    if (typeof storage?.setItem !== 'function' || typeof storage?.getItem !== 'function') {
      throw new Error('browser storage is unavailable');
    }
    storage.setItem(EVOLU8_GENERATION_KEY, serializedNext);
    if (storage.getItem(EVOLU8_GENERATION_KEY) !== serializedNext) {
      throw new Error('browser storage did not retain the new generation');
    }
  } catch (error) {
    throw new Error('Evolu 8 could not safely persist a new database generation', { cause: error });
  }
  return next;
}

/** @param {any} modern @param {string} mnemonic */
function createModernOwner(modern, mnemonic) {
  const validatedMnemonic = modern.Mnemonic.orThrow(mnemonic);
  return modern.createAppOwner(modern.mnemonicToOwnerSecret(validatedMnemonic));
}

/** @param {any} resource */
async function disposeResource(resource) {
  if (!resource) return;
  const SymbolWithDispose = /** @type {any} */ (Symbol);
  const asyncDispose = SymbolWithDispose.asyncDispose;
  const dispose = SymbolWithDispose.dispose;
  if (asyncDispose && typeof resource[asyncDispose] === 'function') {
    await resource[asyncDispose]();
  } else if (dispose && typeof resource[dispose] === 'function') {
    resource[dispose]();
  }
}

/**
 * @param {{
 *   legacyEvolu?: any,
 *   getLegacyEvolu?: () => Promise<any>,
 *   initialIdentity?: { ownerId: string, mnemonic: string } | null,
 *   identityVault?: { invalidate: () => Promise<void> | void, write: (identity: any) => Promise<void> },
 *   modern: any,
 *   schema: any,
 *   relay: string,
 *   storage?: Storage | { getItem?: Function, setItem?: Function },
 *   onSharedWorkerUnsupported?: () => void,
 * }} options
 */
export async function createEvolu8Candidate({
  legacyEvolu,
  getLegacyEvolu,
  initialIdentity = null,
  identityVault = {
    invalidate: () => Promise.resolve(),
    write: async () => {},
  },
  modern,
  schema,
  relay,
  storage = globalThis.localStorage,
  onSharedWorkerUnsupported,
}) {
  modern.installPolyfills?.();
  const asyncDisposeSymbol = /** @type {any} */ (Symbol).asyncDispose;
  let resolvedLegacyEvolu = legacyEvolu || null;
  const resolveLegacyEvolu = async () => {
    resolvedLegacyEvolu ??= await getLegacyEvolu?.();
    if (!resolvedLegacyEvolu?.appOwner) throw new Error('Evolu 7 identity bridge is unavailable');
    return resolvedLegacyEvolu;
  };

  if (!initialIdentity) {
    const legacy = await resolveLegacyEvolu();
    let ownerTimeoutId;
    const ownerTimeout = new Promise((_, reject) => {
      ownerTimeoutId = setTimeout(() => reject(new Error('Evolu 7 identity bridge timed out')), 30_000);
    });
    let legacyOwner;
    try {
      legacyOwner = await Promise.race([legacy.appOwner, ownerTimeout]);
    } finally {
      clearTimeout(ownerTimeoutId);
    }
    if (!legacyOwner?.mnemonic) throw new Error('Evolu 7 identity has no recovery mnemonic');
    const modernOwner = createModernOwner(modern, legacyOwner.mnemonic);
    if (legacyOwner.id && modernOwner.id !== legacyOwner.id) {
      throw new Error('Evolu 8 derived a different owner ID from the Evolu 7 mnemonic');
    }
    initialIdentity = { ownerId: modernOwner.id, mnemonic: legacyOwner.mnemonic };
    try {
      await identityVault.invalidate();
      await identityVault.write(initialIdentity);
    } catch (error) {
      console.warn('[sync] Evolu 8 identity handoff could not be persisted:', error);
    }
  }

  const initialGeneration = readEvolu8Generation(storage);
  let current = null;
  let disposed = false;
  let preparedGeneration = null;
  const querySubscriptions = new Set();
  const errorSubscriptions = new Set();

  const prepareHistoryReset = () => {
    if (preparedGeneration !== null) return preparedGeneration;
    preparedGeneration = advanceEvolu8Generation(storage);
    return preparedGeneration;
  };

  const prepareHistoryResetForDisable = () => {
    try {
      prepareHistoryReset();
      return true;
    } catch {
      showNotification('Free browser storage before disabling Sync, then try again.', 'error');
      return false;
    }
  };

  const consumeHistoryResetGeneration = () => {
    const nextGeneration = preparedGeneration ?? advanceEvolu8Generation(storage);
    preparedGeneration = null;
    return nextGeneration;
  };

  const startRuntime = async (identity, nextGeneration) => {
    const appOwner = createModernOwner(modern, identity.mnemonic);
    if (appOwner.id !== identity.ownerId) throw new Error('Evolu 8 identity vault owner mismatch');
    const deps = modern.createEvoluDeps({ onSharedWorkerUnsupported });
    const run = modern.createRun(deps);
    try {
      const evolu = await run.ok(modern.createEvolu(schema, {
        appName: modern.AppName.orThrow(`getbased8g${nextGeneration}`),
        appOwner,
        transports: [{ type: 'WebSocket', url: relay }],
      }));
      return { evolu, deps, run };
    } catch (error) {
      await disposeResource(run).catch(() => {});
      await disposeResource(deps).catch(() => {});
      throw error;
    }
  };

  const unbindSubscriptions = () => {
    for (const subscription of [...querySubscriptions, ...errorSubscriptions]) {
      try { subscription.unsubscribe?.(); } catch {}
      subscription.unsubscribe = null;
    }
  };

  const bindSubscriptions = async () => {
    if (!current) return;
    await Promise.all([...querySubscriptions].map(subscription =>
      current.evolu.loadQuery(subscription.query).catch(() => [])));
    for (const subscription of querySubscriptions) {
      subscription.unsubscribe = current.evolu.subscribeQuery(subscription.query)(subscription.listener);
    }
    for (const subscription of errorSubscriptions) {
      const notify = () => subscription.listener(current.deps.evoluError.get());
      subscription.unsubscribe = current.deps.evoluError.subscribe(notify);
    }
  };

  const replaceRuntime = async (identity, nextGeneration) => {
    const previous = current;
    unbindSubscriptions();
    current = null;
    if (previous) {
      await disposeResource(previous.evolu).catch(() => {});
      await disposeResource(previous.run).catch(() => {});
      await disposeResource(previous.deps).catch(() => {});
    }
    current = await startRuntime(identity, nextGeneration);
    await bindSubscriptions();
    // Cleanup is best-effort and never delays owner/query readiness. A stale
    // database that is still open in another tab is protected by Evolu's lock
    // and will be retried on a later startup.
    void cleanupSupersededEvolu8Databases({
      activeDatabaseName: current.evolu.name,
    }).then(({ deleted }) => {
      if (deleted.length > 0) {
        console.info(`[sync] Reclaimed ${deleted.length} superseded Evolu 8 database(s)`);
      }
    }).catch(error => {
      console.warn('[sync] Evolu 8 database cleanup failed:', error);
    });
  };

  await replaceRuntime(initialIdentity, initialGeneration);
  const createQuery = modern.createQueryBuilder(schema);

  const facade = {
    __evoluClientVersion: 8,
    // Relay compaction and disable call this before their irreversible step.
    // restore/reset then consume the reservation without another storage write.
    prepareHistoryReset,
    prepareHistoryResetForDisable,
    get name() { return current?.evolu?.name; },
    get appOwner() { return Promise.resolve(current?.evolu?.appOwner); },
    createQuery,
    insert: (...args) => current.evolu.insert(...args),
    update: (...args) => current.evolu.update(...args),
    upsert: (...args) => current.evolu.upsert(...args),
    loadQuery: (...args) => current.evolu.loadQuery(...args),
    loadQueries: (...args) => current.evolu.loadQueries(...args),
    getQueryRows: (...args) => current.evolu.getQueryRows(...args),
    exportDatabase: (...args) => current.evolu.exportDatabase(...args),
    subscribeQuery: query => listener => {
      const subscription = { query, listener, unsubscribe: current.evolu.subscribeQuery(query)(listener) };
      querySubscriptions.add(subscription);
      return () => {
        if (!querySubscriptions.delete(subscription)) return;
        try { subscription.unsubscribe?.(); } catch {}
        subscription.unsubscribe = null;
      };
    },
    subscribeError: listener => {
      const notify = () => listener(current.deps.evoluError.get());
      const subscription = { listener, unsubscribe: current.deps.evoluError.subscribe(notify) };
      errorSubscriptions.add(subscription);
      return () => {
        if (!errorSubscriptions.delete(subscription)) return;
        try { subscription.unsubscribe?.(); } catch {}
        subscription.unsubscribe = null;
      };
    },
    restoreAppOwner: async (mnemonic, _options = {}) => {
      const validatedMnemonic = modern.Mnemonic.orThrow(mnemonic);
      const appOwner = createModernOwner(modern, validatedMnemonic);
      const nextIdentity = { ownerId: appOwner.id, mnemonic: validatedMnemonic };
      const nextGeneration = consumeHistoryResetGeneration();
      // Keep the v7 rollback identity aligned, but load its worker only for an
      // actual identity change. Token invalidation happens synchronously.
      const invalidation = identityVault.invalidate();
      const legacy = await resolveLegacyEvolu();
      await Promise.all([
        Promise.resolve(invalidation),
        legacy.restoreAppOwner(validatedMnemonic, { reload: false }),
      ]);
      try {
        await identityVault.write(nextIdentity);
      } catch (error) {
        console.warn('[sync] Evolu 8 restored identity could not be persisted:', error);
      }
      await replaceRuntime(nextIdentity, nextGeneration);
    },
    resetAppOwner: async (_options = {}) => {
      consumeHistoryResetGeneration();
      const invalidation = identityVault.invalidate();
      const legacy = await resolveLegacyEvolu();
      await Promise.all([
        Promise.resolve(invalidation),
        legacy.resetAppOwner({ reload: false }),
      ]);
      unbindSubscriptions();
      const previous = current;
      current = null;
      if (previous) {
        await disposeResource(previous.evolu).catch(() => {});
        await disposeResource(previous.run).catch(() => {});
        await disposeResource(previous.deps).catch(() => {});
      }
    },
    [asyncDisposeSymbol]: async () => {
      if (disposed) return;
      disposed = true;
      unbindSubscriptions();
      const previous = current;
      current = null;
      if (previous) {
        await disposeResource(previous.evolu).catch(() => {});
        await disposeResource(previous.run).catch(() => {});
        await disposeResource(previous.deps).catch(() => {});
      }
    },
  };

  return facade;
}
