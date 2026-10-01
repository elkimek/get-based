type ChangelogModule = typeof import('./changelog-impl.js');
import { createRetryingModuleLoader } from './retrying-module-loader.js';
// changelog.js — cold-safe What's New version gate and lazy modal facade

import { closeModalOverlay } from './modal-lifecycle.js';
import { showNotification } from './utils.js';
import { getAppVersionRuntime } from './utils-runtime.js';
import { getMajorMinor, getSeenVersion, markChangelogSeen, _semverGt } from './changelog-state.js';

const changelogModuleLoader = createRetryingModuleLoader(
  retry => retry ? loadChangelogRetryModule() : import('./changelog-impl.js'),
);

// Keep this compact gate metadata aligned with forceShow entries in the lazy
// archive. Source tests enforce exact coverage in both directions.
const FORCE_SHOW_VERSIONS = [
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
  return changelogModuleLoader.module !== null;
}

function loadChangelogRetryModule() {
  return import('./changelog-impl.js?lazy-retry=1' as string) as Promise<ChangelogModule>;
}

export function loadChangelogModule() {
  return changelogModuleLoader.load();
}

export function openChangelog(showAll: unknown) {
  const open = (module: ChangelogModule) => module.openChangelog(showAll);
  try {
    if (changelogModuleLoader.module) return open(changelogModuleLoader.module);
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

export function closeChangelog() {
  closeModalOverlay('changelog-modal-overlay');
  markChangelogSeen();
}

// Compare two semver strings — returns true when `a` is strictly newer
// than `b`. Tolerant of missing parts (treats "1.7" as "1.7.0").

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
  if (FORCE_SHOW_VERSIONS.some(version => _semverGt(version, seen))) {
    return openChangelog(false);
  }
}
