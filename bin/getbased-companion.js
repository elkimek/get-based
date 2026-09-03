#!/usr/bin/env node
// @ts-check

import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import {
  companionPlatformName, installCompanion, runCompanionServiceCommand, uninstallCompanion,
} from '../lib/companion-install.js';

const HELP = `getbased Companion

Usage:
  getbased-companion install [--dry-run]  Install and start at login
  getbased-companion run                  Run the companion in this terminal
  getbased-companion start                Start an installed companion
  getbased-companion stop                 Stop an installed companion
  getbased-companion restart              Restart the installed user service
  getbased-companion status               Show the installed user service status
  getbased-companion uninstall            Remove the service and runtime
`;

/** @param {string[]} args @param {{bundlePath?: string}} [options] */
export async function main(args, options = {}) {
  const command = args[0] || 'help';
  if (command === 'help' || command === '--help' || command === '-h') {
    process.stdout.write(HELP);
    return;
  }
  if (command === 'run') {
    await import('../server/agent-host-server.js');
    return;
  }
  if (command === 'install') {
    const result = installCompanion({
      bundlePath: options.bundlePath || fileURLToPath(import.meta.url),
      dryRun: args.includes('--dry-run'),
    });
    if (result.installed) {
      process.stdout.write(`getbased Companion is installed and running on ${companionPlatformName()}. Return to getbased and select Check connection.\n`);
      process.stdout.write(`Service: ${result.serviceFile}\n`);
    } else {
      process.stdout.write(`Dry run successful. Service would be installed at ${result.serviceFile}\n`);
    }
    return;
  }
  if (command === 'uninstall') {
    uninstallCompanion();
    process.stdout.write('getbased Companion was removed. Private pairing state was kept for a future reinstall.\n');
    return;
  }
  if (['start', 'stop', 'restart', 'status'].includes(command)) {
    runCompanionServiceCommand(/** @type {'start'|'stop'|'restart'|'status'} */ (command));
    return;
  }
  throw new Error(`Unknown command: ${command}\n\n${HELP}`);
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (invokedPath === import.meta.url) {
  main(process.argv.slice(2)).catch(error => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
