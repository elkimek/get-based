// @ts-check
// changelog.js — cold-safe What's New version gate and lazy modal facade

import { closeModalOverlay } from './modal-lifecycle.js';
import { showNotification } from './utils.js';
import { getAppVersionRuntime } from './utils-runtime.js';

/** @typedef {typeof import('./changelog-impl.js')} ChangelogModule */
/** @type {Promise<ChangelogModule> | null} */
let changelogModulePromise = null;
/** @type {ChangelogModule | null} */
let changelogModule = null;
let useChangelogRetryUrl = false;

// Keep this compact gate metadata aligned with forceShow entries in the lazy
// archive. Source tests enforce exact coverage in both directions.
const FORCE_SHOW_VERSIONS = [
  '1.20.2',
  '1.13.1',
  '1.11.1',
  '1.10.177',
  '1.10.169',
  '1.10.157',
  '1.10.62',
  '1.10.49',
  '1.10.48',
  '1.10.29',
  '1.10.28',
  '1.10.24',
  '1.10.15',
  '1.10.9',
  '1.10.8',
  '1.10.6',
  '1.7.1',
];

export function isChangelogModuleLoaded() {
  return changelogModule !== null;
}

/** @returns {Promise<ChangelogModule>} */
function loadChangelogRetryModule() {
  // @ts-expect-error TypeScript resolves only the query-free source path.
  return import('./changelog-impl.js?lazy-retry=1');
}

/** @returns {Promise<ChangelogModule>} */
export function loadChangelogModule() {
  if (!changelogModulePromise) {
    const load = useChangelogRetryUrl
      ? loadChangelogRetryModule()
      : import('./changelog-impl.js');
    changelogModulePromise = load
      .then(module => {
        changelogModule = module;
        return module;
      })
      .catch(err => {
        changelogModulePromise = null;
        changelogModule = null;
        useChangelogRetryUrl = true;
        throw err;
      });
  }
  return changelogModulePromise;
}

export function openChangelog(showAll) {
  const open = (/** @type {ChangelogModule} */ module) => module.openChangelog(showAll);
  try {
    if (changelogModule) return open(changelogModule);
    return loadChangelogModule()
      .then(open)
      .catch(err => {
        console.error('[changelog] Could not open release notes:', err);
        showNotification('Release notes could not be loaded. Try again.', 'error');
        return false;
      });
  } catch (err) {
    console.error('[changelog] Could not open release notes:', err);
    showNotification('Release notes could not be loaded. Try again.', 'error');
    return false;
  }
}

/** Extract major.minor from a semver string (e.g. '1.0.1' → '1.0') */
function getMajorMinor(ver) {
  const parts = String(ver).split('.');
  return parts.slice(0, 2).join('.');
}

function getSeenVersion() {
  return localStorage.getItem('labcharts-changelog-seen') || '';
}

function markChangelogSeen() {
  localStorage.setItem('labcharts-changelog-seen', getAppVersionRuntime());
}

export function closeChangelog() {
  closeModalOverlay('changelog-modal-overlay');
  markChangelogSeen();
}

// Compare two semver strings — returns true when `a` is strictly newer
// than `b`. Tolerant of missing parts (treats "1.7" as "1.7.0").
function _semverGt(a, b) {
  const pa = String(a || '').split('.').map(n => parseInt(n, 10) || 0);
  const pb = String(b || '').split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const ai = pa[i] || 0, bi = pb[i] || 0;
    if (ai > bi) return true;
    if (ai < bi) return false;
  }
  return false;
}

export function maybeShowChangelog() {
  if (document.getElementById('legal-consent-overlay')) return;
  const seen = getSeenVersion();
  const appVersion = getAppVersionRuntime();
  // First visit — no changelog, just mark as seen.
  if (!seen) { markChangelogSeen(); return; }
  // Only show What's New on minor/major bumps, not ordinary patches.
  if (appVersion && getMajorMinor(seen) !== getMajorMinor(appVersion)) {
    return openChangelog(false);
  }
  // Critical patch notices stay eager as compact version metadata while their
  // full release-note content remains deferred.
  if (FORCE_SHOW_VERSIONS.some(version => (
    _semverGt(version, seen) && !_semverGt(version, appVersion)
  ))) {
    return openChangelog(false);
  }
}
