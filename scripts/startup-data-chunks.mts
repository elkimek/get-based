import path from 'node:path';

// Already-eager, dependency-closed data contracts and helpers. Keep query-module
// identities, feature modules, framework code and native workers independent.
export const STARTUP_DATA_MODULES = [
  'js/base64.js', 'js/caught-error.js', 'js/native-command-locks.js', 'js/profile-storage-key.js',
  'js/passphrase-classes.js', 'js/passphrase-presentation.js', 'js/settings-protection-classes.js',
  'js/url-safety.js', 'js/agent-access-legacy-source.js', 'js/health-goals-utils.js', 'js/lab-date-range.js',
  'js/chat-thread-navigation-classes.js', 'js/body-measurement-model.js',
  'js/nutrition-photo-provenance.js', 'js/nutrition-sync-sanitize.js',
  'js/sun-body-regions.js', 'js/sun-defaults-model.js', 'js/light-device-fields.js',
  'js/cli-agent-brand-assets.js', 'js/readonly-history-surfaces.js', 'js/food-contaminants.js',
  'js/supplement-quality.js', 'js/genetics-import-events.js', 'js/recommendation-preferences.js',
  'shared/lab-ordering-control-contract.js', 'shared/chat-control-policy.js', 'shared/history-view-contract.js',
  'shared/lab-overlay-contract.js', 'shared/context-preference-contract.js',
  'shared/agent-data-contract.js', 'shared/agent-host-protocol.js',
] as const;
const modules = new Set<string>(STARTUP_DATA_MODULES);
export function startupDataChunk(root: string) {
  // Rolldown requires recursive capture with strict entry signatures. Source
  // closure and exact emitted-owner tests forbid adding any other dependency.
  return {name: 'startup-data-contracts', priority: 100, includeDependenciesRecursively: true,
    test: (id: string) => modules.has(path.relative(root, id).split(path.sep).join('/'))};
}
