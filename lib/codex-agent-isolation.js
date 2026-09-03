// @ts-check
// Builds the fail-closed Codex process configuration used by Agent Host.

export const DISABLED_CODEX_FEATURES = Object.freeze([
  'apps',
  'browser_use',
  'browser_use_external',
  'browser_use_full_cdp_access',
  'code_mode',
  'computer_use',
  'external_agent_memory_import',
  'goals',
  'hooks',
  'image_generation',
  'in_app_browser',
  'in_app_chat',
  'in_app_local_automation',
  'memories',
  'multi_agent',
  'multi_agent_v2',
  'plugin_sharing',
  'plugins',
  'shell_tool',
  'skill_search',
  'workspace_dependencies',
]);

const SAFE_ENVIRONMENT_KEYS = Object.freeze([
  'PATH', 'HOME', 'CODEX_HOME', 'XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'XDG_CACHE_HOME',
  'TMPDIR', 'LANG', 'LC_ALL', 'USER', 'LOGNAME', 'SHELL',
  'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY',
  'SSL_CERT_FILE', 'SSL_CERT_DIR', 'NODE_EXTRA_CA_CERTS',
]);

export function buildIsolatedCodexArgs() {
  const args = ['app-server'];
  for (const feature of DISABLED_CODEX_FEATURES) args.push('--disable', feature);
  return args;
}

/** @param {NodeJS.ProcessEnv} [source] @param {string} [codexHome] */
export function buildIsolatedCodexEnvironment(source = process.env, codexHome = '') {
  /** @type {NodeJS.ProcessEnv} */
  const result = {};
  for (const key of SAFE_ENVIRONMENT_KEYS) {
    if (typeof source[key] === 'string') result[key] = source[key];
  }
  if (codexHome) result.CODEX_HOME = codexHome;
  return result;
}

