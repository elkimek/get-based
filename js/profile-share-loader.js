// @ts-check
// profile-share-loader.js — lazy initialization and safe Profile Sharing entry points

import { showNotification } from './utils.js';
import { addUtilsRuntimeListener } from './utils-runtime.js';

/** @typedef {typeof import('./profile-share.js')} ProfileShareModule */

const SHARE_ID_RE = /^[A-Za-z0-9_-]{20,80}$/;

/** @type {Promise<ProfileShareModule> | null} */
let _profileShareModuleLoad = null;
let _profileShareModuleLoaded = false;
let _useProfileShareRetryUrl = false;
let _profileShareLinksInitialized = false;

export function isProfileShareModuleLoaded() {
  return _profileShareModuleLoaded;
}

/** @returns {Promise<ProfileShareModule>} */
function loadProfileShareRetryModule() {
  // @ts-expect-error The browser accepts a fixed query-string module URL;
  // TypeScript resolves declarations only for the query-free source path.
  return import('./profile-share.js?lazy-retry=1');
}

/**
 * @param {ProfileShareModule} module
 * @returns {ProfileShareModule}
 */
function completeProfileShareModuleLoad(module) {
  _profileShareModuleLoaded = true;
  return module;
}

/**
 * @param {unknown} err
 * @returns {never}
 */
function resetProfileShareModuleLoad(err) {
  _profileShareModuleLoad = null;
  _profileShareModuleLoaded = false;
  _useProfileShareRetryUrl = true;
  throw err;
}

/** @returns {Promise<ProfileShareModule>} */
export function loadProfileShareModule() {
  if (!_profileShareModuleLoad) {
    // Browsers cache failed module-map fetches by URL. A fixed second literal
    // gives the user one genuine retry without introducing a computed import.
    const moduleLoad = _useProfileShareRetryUrl
      ? loadProfileShareRetryModule()
      : import('./profile-share.js');
    _profileShareModuleLoad = moduleLoad
      .then(completeProfileShareModuleLoad)
      .catch(resetProfileShareModuleLoad);
  }
  return _profileShareModuleLoad;
}

/**
 * @param {keyof ProfileShareModule} name
 * @param {any[]} args
 */
async function runProfileShareAction(name, args) {
  try {
    const module = await loadProfileShareModule();
    const action = module[name];
    if (typeof action !== 'function') {
      throw new Error(`Profile Sharing action ${String(name)} is unavailable`);
    }
    return Reflect.apply(action, module, args);
  } catch (err) {
    console.error(`Failed to run Profile Sharing action ${String(name)}`, err);
    showNotification('Profile Sharing could not be loaded. Try again.', 'error');
    return false;
  }
}

export function openProfileShareModal(...args) {
  return runProfileShareAction('openProfileShareModal', args);
}

/**
 * Detect only the small route shape needed to decide whether the full Profile
 * Sharing module should load. The feature module owns parsing and validation.
 *
 * @param {Location | { hash?: string, href?: string } | undefined} [loc]
 */
export function hasProfileShareDeepLink(loc = globalThis.location) {
  if (!loc) return false;
  const hash = String(loc.hash || '').replace(/^#\/?/, '');
  let match = /^share\/([A-Za-z0-9_-]{20,80})$/.exec(hash);
  if (!match) match = /^share=([A-Za-z0-9_-]{20,80})$/.exec(hash);
  if (match) return SHARE_ID_RE.test(match[1]);
  try {
    const url = new URL(loc.href || String(loc));
    return SHARE_ID_RE.test(url.searchParams.get('share') || '');
  } catch {
    return false;
  }
}

export async function handleProfileShareLoaderDeepLink() {
  if (!hasProfileShareDeepLink()) return false;
  return runProfileShareAction('handleProfileShareDeepLink', []);
}

function queueProfileShareLoaderDeepLink() {
  void handleProfileShareLoaderDeepLink();
}

export function initProfileShareLoaderLinks() {
  if (
    _profileShareLinksInitialized
    || typeof window === 'undefined'
    || typeof document === 'undefined'
  ) return false;
  _profileShareLinksInitialized = true;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', queueProfileShareLoaderDeepLink, { once: true });
  } else {
    setTimeout(queueProfileShareLoaderDeepLink, 0);
  }
  addUtilsRuntimeListener('hashchange', queueProfileShareLoaderDeepLink);
  return true;
}

initProfileShareLoaderLinks();
