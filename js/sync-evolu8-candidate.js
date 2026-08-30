// @ts-check
// Experimental Evolu 8 compatibility adapter.
//
// Evolu 8 intentionally cannot open Evolu 7's local SQLite format and its
// released web API does not yet implement deleteDatabase/resetAppOwner. Keep
// the v7 database as the identity vault, then give every destructive reset a
// fresh v8 database generation so pre-compaction history can never replay.

import { setSyncAppOwnerError } from './sync-runtime.js';

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
  const legacy = await import(EVOLU_BUNDLE_URL);
  const legacySchema = createSyncSchema({
    id: legacy.id,
    nullOr: legacy.nullOr,
    NonEmptyString: legacy.NonEmptyString,
  });
  if (isEvolu8CandidateRequested()) {
    const evolu = await createEvolu8SyncClient({
      legacy,
      legacySchema,
      relay,
      reloadUrl,
      enableLogging,
      createSyncSchema,
    });
    console.warn('[sync] Running opt-in Evolu 8 compatibility candidate');
    return evolu;
  }
  return legacy.createEvolu(legacy.evoluWebDeps)(legacySchema, {
    name: legacy.SimpleName.orThrow('getbased4'),
    reloadUrl,
    enableLogging,
    transports: [{ type: 'WebSocket', url: relay }],
  });
}

/**
 * Keep all candidate-only initialization out of the default startup bundle.
 * @param {{
 *   legacy: any,
 *   legacySchema: any,
 *   relay: string,
 *   reloadUrl: string,
 *   enableLogging: boolean,
 *   createSyncSchema: (types: any) => any,
 * }} options
 */
export async function createEvolu8SyncClient({
  legacy,
  legacySchema,
  relay,
  reloadUrl,
  enableLogging,
  createSyncSchema,
}) {
  const legacyEvolu = legacy.createEvolu(legacy.evoluWebDeps)(legacySchema, {
    name: legacy.SimpleName.orThrow('getbased4'),
    reloadUrl,
    enableLogging,
    transports: [],
  });
  const modern = await import(EVOLU8_BUNDLE_URL);
  const modernSchema = createSyncSchema({
    id: modern.id,
    nullOr: modern.nullOr,
    // v8 removed the old NonEmptyString convenience type. The base String
    // type preserves the v7 wire schema without rejecting legacy values.
    NonEmptyString: modern.EvoluString,
  });
  return createEvolu8Candidate({
    legacyEvolu,
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
 *   legacyEvolu: any,
 *   modern: any,
 *   schema: any,
 *   relay: string,
 *   storage?: Storage | { getItem?: Function, setItem?: Function },
 *   onSharedWorkerUnsupported?: () => void,
 * }} options
 */
export async function createEvolu8Candidate({
  legacyEvolu,
  modern,
  schema,
  relay,
  storage = globalThis.localStorage,
  onSharedWorkerUnsupported,
}) {
  if (!legacyEvolu?.appOwner) throw new Error('Evolu 7 identity bridge is unavailable');
  modern.installPolyfills?.();
  const asyncDisposeSymbol = /** @type {any} */ (Symbol).asyncDispose;
  let ownerTimeoutId;
  const ownerTimeout = new Promise((_, reject) => {
    ownerTimeoutId = setTimeout(() => reject(new Error('Evolu 7 identity bridge timed out')), 30_000);
  });
  let legacyOwner;
  try {
    legacyOwner = await Promise.race([legacyEvolu.appOwner, ownerTimeout]);
  } finally {
    clearTimeout(ownerTimeoutId);
  }
  if (!legacyOwner?.mnemonic) throw new Error('Evolu 7 identity has no recovery mnemonic');

  const initialGeneration = readEvolu8Generation(storage);
  let current = null;
  let disposed = false;
  const querySubscriptions = new Set();
  const errorSubscriptions = new Set();

  const startRuntime = async (mnemonic, nextGeneration) => {
    const appOwner = createModernOwner(modern, mnemonic);
    if (legacyOwner.id && appOwner.id !== legacyOwner.id && mnemonic === legacyOwner.mnemonic) {
      throw new Error('Evolu 8 derived a different owner ID from the Evolu 7 mnemonic');
    }
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

  const replaceRuntime = async (mnemonic, nextGeneration) => {
    const previous = current;
    unbindSubscriptions();
    current = null;
    if (previous) {
      await disposeResource(previous.evolu).catch(() => {});
      await disposeResource(previous.run).catch(() => {});
      await disposeResource(previous.deps).catch(() => {});
    }
    current = await startRuntime(mnemonic, nextGeneration);
    await bindSubscriptions();
  };

  await replaceRuntime(legacyOwner.mnemonic, initialGeneration);
  const createQuery = modern.createQueryBuilder(schema);

  const facade = {
    __evoluClientVersion: 8,
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
      const nextGeneration = advanceEvolu8Generation(storage);
      // v7 remains the durable identity vault during the compatibility phase.
      // Always suppress its internal reload; GetBased owns reload sequencing.
      await legacyEvolu.restoreAppOwner(validatedMnemonic, { reload: false });
      await replaceRuntime(validatedMnemonic, nextGeneration);
    },
    resetAppOwner: async (_options = {}) => {
      advanceEvolu8Generation(storage);
      await legacyEvolu.resetAppOwner({ reload: false });
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
