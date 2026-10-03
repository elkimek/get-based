// profile-share-loader.js — lazy initialization and safe Profile Sharing entry points

import { showNotification } from './utils.js';
import { addUtilsRuntimeListener } from './utils-runtime.js';

type ProfileShareModule = typeof import('./profile-share.js');
type ShareRouteReader = {hash?:unknown;href?:unknown};


const SHARE_ID_RE = /^[A-Za-z0-9_-]{20,80}$/;

let _profileShareModuleLoad: Promise<ProfileShareModule> | null = null;
let _profileShareModuleLoaded = false;
let _useProfileShareRetryUrl = false;
let _profileShareLinksInitialized = false;

export function isProfileShareModuleLoaded() {
  return _profileShareModuleLoaded;
}

function loadProfileShareRetryModule() {
  return import('./profile-share.js?lazy-retry=1' as './profile-share.js');
}

function completeProfileShareModuleLoad(module: ProfileShareModule) {
  _profileShareModuleLoaded = true;
  return module;
}

function resetProfileShareModuleLoad(err: unknown): never {
  _profileShareModuleLoad = null;
  _profileShareModuleLoaded = false;
  _useProfileShareRetryUrl = true;
  throw err;
}

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

async function runProfileShareAction(name: keyof ProfileShareModule, args: unknown[]) {
  try {
    const module = await loadProfileShareModule();
    const action = module[name];
    if (typeof action !== 'function') {
      throw new Error(`Profile Sharing action ${String(name)} is unavailable`);
    }
    return Reflect.apply(action, module, args) as unknown;
  } catch (err) {
    console.error(`Failed to run Profile Sharing action ${String(name)}`, err);
    showNotification('Profile Sharing could not be loaded. Try again.', 'error');
    return false;
  }
}

export function openProfileShareModal(...args: unknown[]) {
  return runProfileShareAction('openProfileShareModal', args);
}

export function hasProfileShareDeepLink(loc: unknown = globalThis.location) {
  if (!loc) return false;
  const hash = String((loc as ShareRouteReader).hash || '').replace(/^#\/?/, '');
  let match = /^share\/([A-Za-z0-9_-]{20,80})$/.exec(hash);
  if (!match) match = /^share=([A-Za-z0-9_-]{20,80})$/.exec(hash);
  if (match) return SHARE_ID_RE.test(match[1]!);
  try {
    const url = new URL(((loc as ShareRouteReader).href || String(loc)) as string);
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
