// @ts-check
// app-extension-runtime.js — neutral build-time extension boundary.

/**
 * @typedef {{
 *   renderSlot?: (slot: string, context: Record<string, any>) => string,
 *   getPolicy?: (context: Record<string, any>) => Record<string, any> | null | undefined,
 *   handleAction?: (context: Record<string, any>) => boolean | Promise<boolean>,
 *   onOpen?: (context: Record<string, any>) => void | Promise<void>,
 *   onTabChange?: (context: Record<string, any>) => void | Promise<void>,
 *   onClose?: (context: Record<string, any>) => void | Promise<void>,
 * }} AppExtensionSettings
 *
 * @typedef {{
 *   isProviderActive?: (provider: string) => boolean,
 *   isCredentialOwned?: (provider: string) => boolean,
 *   shouldHideUsage?: (provider: string) => boolean,
 *   getModelPolicy?: (context: Record<string, any>) => Record<string, any> | null | undefined,
 *   refresh?: (context?: Record<string, any>) => any | Promise<any>,
 *   authorizeRequest?: (context: Record<string, any>) => boolean | Promise<boolean>,
 *   isProviderCallOwned?: (context: Record<string, any>) => boolean,
 *   callProvider?: (context: Record<string, any>) => any | Promise<any>,
 *   getRequestOptions?: (context: Record<string, any>) => Record<string, any> | null | undefined,
 *   mapProviderError?: (context: Record<string, any>) => Error | string | null | undefined,
 *   onCredentialChanged?: (context: Record<string, any>) => void | Promise<void>,
 *   hasModelSurface?: (provider: string) => boolean,
 *   onModelsLoaded?: (context: Record<string, any>) => void | Promise<void>,
 *   getInsufficientBalanceView?: (context: Record<string, any>) => Record<string, any> | null | undefined,
 * }} AppExtensionAI
 *
 * @typedef {{
 *   isRequestOwned?: (context: Record<string, any>) => boolean,
 *   authorizeRequest?: (context: Record<string, any>) => boolean | Promise<boolean>,
 *   getPlaybackPolicy?: (context: Record<string, any>) => Record<string, any> | null | undefined,
 * }} AppExtensionVoice
 *
 * @typedef {{
 *   storageKeys?: string[] | (() => string[]),
 *   storagePrefixes?: string[] | (() => string[]),
 *   encryptedStorageKeys?: string[] | (() => string[]),
 *   encryptedStoragePrefixes?: string[] | (() => string[]),
 *   resolveConflicts?: (context: { settings: Record<string, any> }) => { preferRemoteKeys?: string[], keepLocalKeys?: string[] },
 *   onApplied?: (context: { settings: Record<string, any>, changedKeys: string[] }) => void | Promise<void>,
 * }} AppExtensionSync
 *
 * @typedef {{
 *   renderSlot?: (slot: string, context: Record<string, any>) => string,
 *   handleAction?: (context: Record<string, any>) => boolean | Promise<boolean>,
 * }} AppExtensionOnboarding
 *
 * @typedef {{
 *   id: string,
 *   isAvailable?: () => boolean,
 *   settings?: AppExtensionSettings,
 *   ai?: AppExtensionAI,
 *   voice?: AppExtensionVoice,
 *   sync?: AppExtensionSync,
 *   onboarding?: AppExtensionOnboarding,
 *   onStartup?: (context?: Record<string, any>) => void | Promise<void>,
 * }} AppExtension
 */

/** @type {Readonly<AppExtension>} */
const CORE_EXTENSION = Object.freeze({ id: 'core', isAvailable: () => false });

/** @type {Readonly<AppExtension>} */
let configuredExtension = CORE_EXTENSION;

/**
 * Configure the single trusted extension bundled by an edition build.
 * Passing null restores the independently runnable public-core behavior.
 *
 * @param {AppExtension | null | undefined} extension
 * @returns {Readonly<AppExtension>}
 */
export function configureAppExtension(extension) {
  const previous = configuredExtension;
  if (extension == null) {
    configuredExtension = CORE_EXTENSION;
    return previous;
  }
  if (typeof extension !== 'object' || !/^[a-z0-9][a-z0-9._-]*$/i.test(String(extension.id || ''))) {
    throw new TypeError('App extension requires a stable id.');
  }
  configuredExtension = Object.freeze({ ...extension, id: String(extension.id) });
  return previous;
}

export function getAppExtension() {
  return configuredExtension;
}

export function isAppExtensionAvailable() {
  if (configuredExtension === CORE_EXTENSION) return false;
  try {
    return configuredExtension.isAvailable?.() !== false;
  } catch (error) {
    console.warn('[extension] availability check failed', error);
    return false;
  }
}

function activeExtension() {
  return isAppExtensionAvailable() ? configuredExtension : null;
}

/** @param {string} slot @param {Record<string, any>} [context] */
export function renderAppExtensionSettingsSlot(slot, context = {}) {
  const render = activeExtension()?.settings?.renderSlot;
  if (typeof render !== 'function') return '';
  try {
    return String(render(slot, context) || '');
  } catch (error) {
    console.warn(`[extension] settings slot ${slot} failed`, error);
    return '';
  }
}

/** @param {Record<string, any>} [context] */
export function getAppExtensionSettingsPolicy(context = {}) {
  const getPolicy = activeExtension()?.settings?.getPolicy;
  if (typeof getPolicy !== 'function') return {};
  try {
    const policy = getPolicy(context);
    return policy && typeof policy === 'object' ? policy : {};
  } catch (error) {
    console.warn('[extension] settings policy failed', error);
    return {};
  }
}

/** @param {Record<string, any>} context @returns {boolean | Promise<boolean>} */
export function handleAppExtensionSettingsAction(context) {
  const handle = activeExtension()?.settings?.handleAction;
  if (typeof handle !== 'function') return false;
  const result = handle(context);
  return result instanceof Promise
    ? result.then(value => value === true)
    : result === true;
}

/** @param {'onOpen' | 'onTabChange' | 'onClose'} hook @param {Record<string, any>} [context] */
export function notifyAppExtensionSettings(hook, context = {}) {
  const callback = activeExtension()?.settings?.[hook];
  if (typeof callback !== 'function') return;
  Promise.resolve(callback(context)).catch(error => console.warn(`[extension] settings ${hook} failed`, error));
}

/** @param {string} slot @param {Record<string, any>} [context] */
export function renderAppExtensionOnboardingSlot(slot, context = {}) {
  const render = activeExtension()?.onboarding?.renderSlot;
  if (typeof render !== 'function') return '';
  try {
    return String(render(slot, context) || '');
  } catch (error) {
    console.warn(`[extension] onboarding slot ${slot} failed`, error);
    return '';
  }
}

/** @param {Record<string, any>} context @returns {boolean | Promise<boolean>} */
export function handleAppExtensionOnboardingAction(context) {
  const handle = activeExtension()?.onboarding?.handleAction;
  if (typeof handle !== 'function') return false;
  const result = handle(context);
  return result instanceof Promise
    ? result.then(value => value === true)
    : result === true;
}

/** @param {string} provider */
export function isAppExtensionAIProviderActive(provider) {
  return activeExtension()?.ai?.isProviderActive?.(provider) === true;
}

/** @param {string} provider */
export function isAppExtensionAICredentialOwned(provider) {
  return activeExtension()?.ai?.isCredentialOwned?.(provider) === true;
}

/** @param {string} provider */
export function shouldHideAppExtensionAIUsage(provider) {
  return activeExtension()?.ai?.shouldHideUsage?.(provider) === true;
}

/** @param {Record<string, any>} context */
export function getAppExtensionAIModelPolicy(context) {
  const policy = activeExtension()?.ai?.getModelPolicy?.(context);
  return policy && typeof policy === 'object' ? policy : null;
}

/** @param {Record<string, any>} [context] */
export async function refreshAppExtensionAI(context = {}) {
  const refresh = activeExtension()?.ai?.refresh;
  return typeof refresh === 'function' ? refresh(context) : null;
}

/** @param {Record<string, any>} context */
export async function authorizeAppExtensionAIRequest(context) {
  const extension = activeExtension();
  if (!extension) return true;
  const authorize = extension.ai?.authorizeRequest;
  if (typeof authorize !== 'function') return false;
  return await authorize(context) === true;
}

/**
 * Let a trusted edition replace a built-in provider's transport while keeping
 * the public provider UI and request contract. The explicit handled envelope
 * distinguishes an absent hook from a valid undefined provider result.
 * @param {Record<string, any>} context
 */
export async function callAppExtensionAIProvider(context) {
  const ai = activeExtension()?.ai;
  const callProvider = ai?.callProvider;
  if (typeof callProvider !== 'function' || ai?.isProviderCallOwned?.(context) !== true) {
    return { handled: false, result: undefined };
  }
  if (typeof ai.authorizeRequest !== 'function' || await ai.authorizeRequest(context) !== true) {
    throw new Error('This hosted AI request is not authorized. No data was sent.');
  }
  return { handled: true, result: await callProvider(context) };
}

/** @param {Record<string, any>} context */
export function getAppExtensionAIRequestOptions(context) {
  const options = activeExtension()?.ai?.getRequestOptions?.(context);
  return options && typeof options === 'object' ? options : {};
}

/** @param {Record<string, any>} context */
export function mapAppExtensionAIProviderError(context) {
  return activeExtension()?.ai?.mapProviderError?.(context) || null;
}

/** @param {Record<string, any>} context */
export async function notifyAppExtensionAICredentialChanged(context) {
  const notify = activeExtension()?.ai?.onCredentialChanged;
  if (typeof notify === 'function') await notify(context);
}

/** @param {string} provider */
export function hasAppExtensionAIModelSurface(provider) {
  return activeExtension()?.ai?.hasModelSurface?.(provider) === true;
}

/** @param {Record<string, any>} context */
export function notifyAppExtensionAIModelsLoaded(context) {
  const notify = activeExtension()?.ai?.onModelsLoaded;
  if (typeof notify !== 'function') return;
  Promise.resolve(notify(context)).catch(error => console.warn('[extension] model update failed', error));
}

/** @param {Record<string, any>} context */
export function getAppExtensionAIInsufficientBalanceView(context) {
  const view = activeExtension()?.ai?.getInsufficientBalanceView?.(context);
  return view && typeof view === 'object' ? view : null;
}

/** @param {Record<string, any>} context */
export async function authorizeAppExtensionVoiceRequest(context) {
  const extension = activeExtension();
  if (!extension) return true;
  if (extension.voice?.isRequestOwned?.(context) !== true) return true;
  const authorize = extension.voice?.authorizeRequest;
  if (typeof authorize !== 'function') return false;
  return await authorize(context) === true;
}

/** @param {Record<string, any>} context */
export function getAppExtensionVoicePlaybackPolicy(context) {
  const policy = activeExtension()?.voice?.getPlaybackPolicy?.(context);
  return policy && typeof policy === 'object' ? policy : {};
}

/** @param {'storageKeys' | 'storagePrefixes' | 'encryptedStorageKeys' | 'encryptedStoragePrefixes'} field */
function extensionSyncValues(field) {
  const value = activeExtension()?.sync?.[field];
  const values = typeof value === 'function' ? value() : value;
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map(item => String(item || '').trim()).filter(Boolean))];
}

export function getAppExtensionSyncStorageKeys() {
  return extensionSyncValues('storageKeys');
}

export function getAppExtensionSyncStoragePrefixes() {
  return extensionSyncValues('storagePrefixes');
}

export function getAppExtensionSyncEncryptedStorageKeys() {
  return extensionSyncValues('encryptedStorageKeys');
}

export function getAppExtensionSyncEncryptedStoragePrefixes() {
  return extensionSyncValues('encryptedStoragePrefixes');
}

/** @param {string} key */
export function isAppExtensionSyncEncryptedStorageKey(key) {
  return getAppExtensionSyncEncryptedStorageKeys().includes(key)
    || getAppExtensionSyncEncryptedStoragePrefixes().some(prefix => key.startsWith(prefix));
}

/** @param {Record<string, any>} settings */
export function getAppExtensionSyncConflictResolution(settings) {
  const resolve = activeExtension()?.sync?.resolveConflicts;
  if (typeof resolve !== 'function') return { preferRemoteKeys: [], keepLocalKeys: [] };
  try {
    const resolution = resolve({ settings });
    const clean = (keys) => Array.isArray(keys)
      ? [...new Set(keys.map(key => String(key || '').trim()).filter(Boolean))]
      : [];
    return {
      preferRemoteKeys: clean(resolution?.preferRemoteKeys),
      keepLocalKeys: clean(resolution?.keepLocalKeys),
    };
  } catch (error) {
    console.warn('[extension] sync conflict policy failed', error);
    return { preferRemoteKeys: [], keepLocalKeys: [] };
  }
}

/** @param {{ settings: Record<string, any>, changedKeys: string[] }} context */
export function notifyAppExtensionSyncSettingsApplied(context) {
  const notify = activeExtension()?.sync?.onApplied;
  if (typeof notify !== 'function') return;
  Promise.resolve(notify(context)).catch(error => console.warn('[extension] synced settings refresh failed', error));
}

/** @param {Record<string, any>} [context] */
export function runAppExtensionStartup(context = {}) {
  const startup = activeExtension()?.onStartup;
  if (typeof startup !== 'function') return;
  Promise.resolve(startup(context)).catch(error => console.warn('[extension] startup failed', error));
}
