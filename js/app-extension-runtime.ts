// Neutral boundary for a single trusted build-time extension.

export type ExtensionContext = Record<string, unknown>;
type MaybePromise<T> = T | Promise<T>;
type ContextHook<T> = (context: ExtensionContext) => T;
type Notification = ContextHook<unknown>;
type Authorization = ContextHook<MaybePromise<boolean>>;

export interface ExtensionModelPolicy extends ExtensionContext {
  enforced?: unknown;
  allowlist?: string[];
  zdrOnly?: unknown;
  allowWebSearch?: unknown;
}
export interface ExtensionBalanceView extends ExtensionContext {
  onPrimary?: () => unknown;
}
export interface ExtensionActionSurface {
  renderSlot?: (slot: string, context: ExtensionContext) => string;
  handleAction?: Authorization;
}
export interface AppExtensionSettings extends ExtensionActionSurface {
  getPolicy?: ContextHook<ExtensionContext | null | undefined>;
  onOpen?: Notification;
  onTabChange?: Notification;
  onClose?: Notification;
}
export interface AppExtensionAI {
  isProviderActive?: (provider: string) => boolean;
  isCredentialOwned?: (provider: string) => boolean;
  shouldHideUsage?: (provider: string) => boolean;
  getModelPolicy?: ContextHook<ExtensionModelPolicy | null | undefined>;
  refresh?: (context?: ExtensionContext) => unknown;
  authorizeRequest?: Authorization;
  requestProcessingApproval?: Authorization;
  isProviderCallOwned?: ContextHook<boolean>;
  callProvider?: ContextHook<unknown>;
  getRequestOptions?: ContextHook<ExtensionContext | null | undefined>;
  mapProviderError?: ContextHook<Error | string | null | undefined>;
  onCredentialChanged?: Notification;
  hasModelSurface?: (provider: string) => boolean;
  onModelsLoaded?: Notification;
  getInsufficientBalanceView?: ContextHook<ExtensionBalanceView | null | undefined>;
}
export interface AppExtensionVoice {
  isRequestOwned?: ContextHook<boolean>;
  authorizeRequest?: Authorization;
  getPlaybackPolicy?: ContextHook<ExtensionContext | null | undefined>;
}
export interface ExtensionConflictResolution {
  preferRemoteKeys?: string[];
  keepLocalKeys?: string[];
}
export interface AppExtensionSync {
  storageKeys?: string[] | (() => string[]);
  storagePrefixes?: string[] | (() => string[]);
  encryptedStorageKeys?: string[] | (() => string[]);
  encryptedStoragePrefixes?: string[] | (() => string[]);
  resolveConflicts?: (context: { settings: ExtensionContext }) => ExtensionConflictResolution;
  onApplied?: (context: { settings: ExtensionContext; changedKeys: string[] }) => unknown;
}
export type AppExtensionProviderCall =
  | { handled: false; result: undefined }
  | { handled: true; result: unknown };

export interface AppExtension {
  id: string;
  isAvailable?: () => boolean;
  settings?: AppExtensionSettings;
  ai?: AppExtensionAI;
  voice?: AppExtensionVoice;
  sync?: AppExtensionSync;
  onboarding?: ExtensionActionSurface;
  onStartup?: (context?: ExtensionContext) => unknown;
}

const CORE_EXTENSION: Readonly<AppExtension> = Object.freeze({ id: 'core', isAvailable: () => false });

let configuredExtension: Readonly<AppExtension> = CORE_EXTENSION;

/** Configure one trusted edition adapter; null restores public-core behavior. */
export function configureAppExtension(extension: AppExtension | null | undefined) {
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

function renderExtensionSlot(surface: 'settings' | 'onboarding', slot: string, context: ExtensionContext) {
  const render = activeExtension()?.[surface]?.renderSlot;
  if (typeof render !== 'function') return '';
  try {
    return String(render(slot, context) || '');
  } catch (error) {
    console.warn(`[extension] ${surface} slot ${slot} failed`, error);
    return '';
  }
}

function handleExtensionAction(handle: Authorization | undefined, context: ExtensionContext) {
  if (typeof handle !== 'function') return false;
  const result = handle(context);
  return result instanceof Promise
    ? result.then(value => value === true)
    : result === true;
}

/** Synchronous hook throws still propagate; only rejected results are reported. */
function notifyExtension<T>(callback: ((context: T) => unknown) | undefined, context: T, onError: (error: unknown) => void) {
  if (typeof callback !== 'function') return;
  Promise.resolve(callback(context)).catch(onError);
}

function cleanSyncKeys(keys: unknown): string[] {
  return Array.isArray(keys)
    ? [...new Set(keys.map(key => String(key || '').trim()).filter(Boolean))]
    : [];
}

export function renderAppExtensionSettingsSlot(slot: string, context: ExtensionContext = {}) {
  return renderExtensionSlot('settings', slot, context);
}

export function getAppExtensionSettingsPolicy(context: ExtensionContext = {}) {
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

export function handleAppExtensionSettingsAction(context: ExtensionContext) {
  const handle = activeExtension()?.settings?.handleAction;
  return handleExtensionAction(handle, context);
}

export function notifyAppExtensionSettings(hook: 'onOpen' | 'onTabChange' | 'onClose', context: ExtensionContext = {}) {
  const callback = activeExtension()?.settings?.[hook];
  notifyExtension(callback, context, error => console.warn(`[extension] settings ${hook} failed`, error));
}

export function renderAppExtensionOnboardingSlot(slot: string, context: ExtensionContext = {}) {
  return renderExtensionSlot('onboarding', slot, context);
}

export function handleAppExtensionOnboardingAction(context: ExtensionContext) {
  const handle = activeExtension()?.onboarding?.handleAction;
  return handleExtensionAction(handle, context);
}

export function isAppExtensionAIProviderActive(provider: string) {
  return activeExtension()?.ai?.isProviderActive?.(provider) === true;
}

export function isAppExtensionAICredentialOwned(provider: string) {
  return activeExtension()?.ai?.isCredentialOwned?.(provider) === true;
}

/** Missing approval hooks and ownership changes fail closed for edition-owned credentials. */
export async function requestAppExtensionAIProcessingApproval(context: ExtensionContext & { provider: string }) {
  const extension = activeExtension();
  const ai = extension?.ai;
  if (ai?.isCredentialOwned?.(context.provider) !== true
      || typeof ai.requestProcessingApproval !== 'function') return false;
  const approved = await ai.requestProcessingApproval(context);
  return approved === true && activeExtension() === extension
    && ai.isCredentialOwned?.(context.provider) === true;
}

export function shouldHideAppExtensionAIUsage(provider: string) {
  return activeExtension()?.ai?.shouldHideUsage?.(provider) === true;
}

export function getAppExtensionAIModelPolicy(context: ExtensionContext) {
  const policy = activeExtension()?.ai?.getModelPolicy?.(context);
  return policy && typeof policy === 'object' ? policy : null;
}

export async function refreshAppExtensionAI(context: ExtensionContext = {}) {
  const refresh = activeExtension()?.ai?.refresh;
  return typeof refresh === 'function' ? refresh(context) : null;
}

export async function authorizeAppExtensionAIRequest(context: ExtensionContext) {
  const extension = activeExtension();
  if (!extension) return true;
  const authorize = extension.ai?.authorizeRequest;
  if (typeof authorize !== 'function') return false;
  return await authorize(context) === true;
}

/** The handled envelope distinguishes an absent hook from a valid undefined result. */
export async function callAppExtensionAIProvider(context: ExtensionContext): Promise<AppExtensionProviderCall> {
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

export function getAppExtensionAIRequestOptions(context: ExtensionContext) {
  const options = activeExtension()?.ai?.getRequestOptions?.(context);
  return options && typeof options === 'object' ? options : {};
}

export function mapAppExtensionAIProviderError(context: ExtensionContext) {
  return activeExtension()?.ai?.mapProviderError?.(context) || null;
}

export async function notifyAppExtensionAICredentialChanged(context: ExtensionContext) {
  const notify = activeExtension()?.ai?.onCredentialChanged;
  if (typeof notify === 'function') await notify(context);
}

export function hasAppExtensionAIModelSurface(provider: string) {
  return activeExtension()?.ai?.hasModelSurface?.(provider) === true;
}

export function notifyAppExtensionAIModelsLoaded(context: ExtensionContext) {
  const notify = activeExtension()?.ai?.onModelsLoaded;
  notifyExtension(notify, context, error => console.warn('[extension] model update failed', error));
}

export function getAppExtensionAIInsufficientBalanceView(context: ExtensionContext) {
  const view = activeExtension()?.ai?.getInsufficientBalanceView?.(context);
  return view && typeof view === 'object' ? view : null;
}

export async function authorizeAppExtensionVoiceRequest(context: ExtensionContext) {
  const extension = activeExtension();
  if (!extension) return true;
  if (extension.voice?.isRequestOwned?.(context) !== true) return true;
  const authorize = extension.voice?.authorizeRequest;
  if (typeof authorize !== 'function') return false;
  return await authorize(context) === true;
}

export function getAppExtensionVoicePlaybackPolicy(context: ExtensionContext) {
  const policy = activeExtension()?.voice?.getPlaybackPolicy?.(context);
  return policy && typeof policy === 'object' ? policy : {};
}

function extensionSyncValues(field: 'storageKeys' | 'storagePrefixes' | 'encryptedStorageKeys' | 'encryptedStoragePrefixes') {
  const value = activeExtension()?.sync?.[field];
  const values = typeof value === 'function' ? value() : value;
  return cleanSyncKeys(values);
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

export function isAppExtensionSyncEncryptedStorageKey(key: string) {
  return getAppExtensionSyncEncryptedStorageKeys().includes(key)
    || getAppExtensionSyncEncryptedStoragePrefixes().some(prefix => key.startsWith(prefix));
}

export function getAppExtensionSyncConflictResolution(settings: ExtensionContext) {
  const resolve = activeExtension()?.sync?.resolveConflicts;
  if (typeof resolve !== 'function') return { preferRemoteKeys: [], keepLocalKeys: [] };
  try {
    const resolution = resolve({ settings });
    return {
      preferRemoteKeys: cleanSyncKeys(resolution?.preferRemoteKeys),
      keepLocalKeys: cleanSyncKeys(resolution?.keepLocalKeys),
    };
  } catch (error) {
    console.warn('[extension] sync conflict policy failed', error);
    return { preferRemoteKeys: [], keepLocalKeys: [] };
  }
}

export function notifyAppExtensionSyncSettingsApplied(context: { settings: ExtensionContext; changedKeys: string[] }) {
  const notify = activeExtension()?.sync?.onApplied;
  notifyExtension(notify, context, error => console.warn('[extension] synced settings refresh failed', error));
}

export function runAppExtensionStartup(context: ExtensionContext = {}) {
  const startup = activeExtension()?.onStartup;
  notifyExtension(startup, context, error => console.warn('[extension] startup failed', error));
}
