// @ts-check
// Platform dispatcher for getbased Companion installation and lifecycle.

import {
  installLinuxCompanion, runLinuxCompanionServiceCommand, uninstallLinuxCompanion,
} from './linux-companion-install.js';
import {
  installMacOSCompanion, runMacOSCompanionServiceCommand, uninstallMacOSCompanion,
} from './macos-companion-install.js';
import {
  installWindowsCompanion, runWindowsCompanionServiceCommand, uninstallWindowsCompanion,
} from './windows-companion-install.js';

/** @param {NodeJS.Platform} [platform] */
export function companionPlatformName(platform = process.platform) {
  if (platform === 'darwin') return 'macOS';
  if (platform === 'win32') return 'Windows';
  if (platform === 'linux') return 'Linux';
  return platform;
}

/** @param {{bundlePath: string, dryRun?: boolean, platform?: NodeJS.Platform} & Record<string, any>} options */
export function installCompanion(options) {
  const platform = options.platform || process.platform;
  if (platform === 'linux') return installLinuxCompanion({ ...options, platform });
  if (platform === 'darwin') return installMacOSCompanion({ ...options, platform });
  if (platform === 'win32') return installWindowsCompanion({ ...options, platform });
  throw new Error(`Automatic companion installation is not available on ${companionPlatformName(platform)}.`);
}

/** @param {({platform?: NodeJS.Platform} & Record<string, any>)} [options] */
export function uninstallCompanion(options = {}) {
  const platform = options.platform || process.platform;
  if (platform === 'linux') return uninstallLinuxCompanion(/** @type {any} */ (options));
  if (platform === 'darwin') return uninstallMacOSCompanion(/** @type {any} */ (options));
  if (platform === 'win32') return uninstallWindowsCompanion(/** @type {any} */ (options));
  throw new Error(`Automatic companion removal is not available on ${companionPlatformName(platform)}.`);
}

/** @param {'start'|'stop'|'restart'|'status'} command @param {({platform?: NodeJS.Platform} & Record<string, any>)} [options] */
export function runCompanionServiceCommand(command, options = {}) {
  const platform = options.platform || process.platform;
  if (platform === 'linux') return runLinuxCompanionServiceCommand(command, /** @type {any} */ (options));
  if (platform === 'darwin') return runMacOSCompanionServiceCommand(command, /** @type {any} */ (options));
  if (platform === 'win32') return runWindowsCompanionServiceCommand(command, /** @type {any} */ (options));
  throw new Error(`Companion service controls are not available on ${companionPlatformName(platform)}.`);
}
