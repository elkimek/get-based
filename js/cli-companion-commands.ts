export type CompanionPlatform = 'linux' | 'macos' | 'windows';
export interface CompanionLocation { origin?: string; hostname?: string }
export interface CompanionNavigator { userAgentData?: { platform?: string }; platform?: string; userAgent?: string }
export function detectCompanionPlatform(navigatorLike: CompanionNavigator = globalThis.navigator || {}) {
  const value = String(navigatorLike.userAgentData?.platform || navigatorLike.platform || navigatorLike.userAgent || '').toLowerCase();
  if (value.includes('win')) return ('windows' as const);
  if (value.includes('mac')) return ('macos' as const);
  return ('linux' as const);
}

function getCompanionDownloadOrigin(location: CompanionLocation = {}) {
  return String(location.origin ?? globalThis.location?.origin ?? 'https://app.getbased.health').replace(/\/$/, '');
}

export function getCompanionCommand(platform: CompanionPlatform, action: 'run' | 'install' | 'start', location: CompanionLocation = {}) {
  const url = `${getCompanionDownloadOrigin(location)}/getbased-companion.mjs`;
  if (platform === 'windows') {
    return `$ErrorActionPreference='Stop'; $p=Join-Path $env:TEMP 'getbased-companion.mjs'; Invoke-WebRequest '${url}' -OutFile $p; node $p ${action}`;
  }
  return `curl -fsSL '${url}' -o "\${TMPDIR:-/tmp}/getbased-companion.mjs" && node "\${TMPDIR:-/tmp}/getbased-companion.mjs" ${action}`;
}

export function getLinuxCompanionInstallCommand(location: CompanionLocation = {}) {
  return getCompanionCommand('linux', 'install', location);
}

export function getLinuxCompanionRunCommand(location: CompanionLocation = {}) {
  return getCompanionCommand('linux', 'run', location);
}
