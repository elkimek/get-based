import type { CompanionInstallOptions, CompanionServiceOptions, CompanionServiceCommand } from './companion-install-support.js';
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

export function companionPlatformName(platform: NodeJS.Platform = process.platform) {
  if (platform === 'darwin') return 'macOS';
  if (platform === 'win32') return 'Windows';
  if (platform === 'linux') return 'Linux';
  return platform;
}

export function installCompanion(options: CompanionInstallOptions) {
  const platform = options.platform || process.platform;
  if (platform === 'linux') return installLinuxCompanion({ ...options, platform });
  if (platform === 'darwin') return installMacOSCompanion({ ...options, platform });
  if (platform === 'win32') return installWindowsCompanion({ ...options, platform });
  throw new Error(`Automatic companion installation is not available on ${companionPlatformName(platform)}.`);
}

export function uninstallCompanion(options: CompanionServiceOptions = {}) {
  const platform = options.platform || process.platform;
  if (platform === 'linux') return uninstallLinuxCompanion((options));
  if (platform === 'darwin') return uninstallMacOSCompanion((options));
  if (platform === 'win32') return uninstallWindowsCompanion((options));
  throw new Error(`Automatic companion removal is not available on ${companionPlatformName(platform)}.`);
}

export function runCompanionServiceCommand(command: CompanionServiceCommand, options: CompanionServiceOptions = {}) {
  const platform = options.platform || process.platform;
  if (platform === 'linux') return runLinuxCompanionServiceCommand(command, (options));
  if (platform === 'darwin') return runMacOSCompanionServiceCommand(command, (options));
  if (platform === 'win32') return runWindowsCompanionServiceCommand(command, (options));
  throw new Error(`Companion service controls are not available on ${companionPlatformName(platform)}.`);
}
