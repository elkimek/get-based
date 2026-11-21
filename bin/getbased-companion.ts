#!/usr/bin/env node

import type { CompanionServiceCommand } from '../lib/companion-install-support.js';

import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import {
  companionPlatformName, installCompanion, runCompanionServiceCommand, uninstallCompanion,
} from '../lib/companion-install.js';
import { runAgentMCPBridge } from '../lib/agent-mcp-bridge.js';
import { findExistingCompanion } from '../lib/companion-existing.js';
import { companionChatPairingCode, companionManagementCode } from '../lib/agent-host-boundary.js';
import { prepareAgentHostStorage } from '../lib/agent-host-storage.js';

const HELP = `getbased Companion

Usage:
  getbased-companion install [--dry-run]  Install and start at login
  getbased-companion run                  Run the companion in this terminal
  getbased-companion pair                 Show the private browser chat pairing code
  getbased-companion pair --manage        Show a short-lived local management code
  getbased-companion start                Start an installed companion
  getbased-companion stop                 Stop an installed companion
  getbased-companion restart              Restart the installed user service
  getbased-companion status               Show the installed user service status
  getbased-companion uninstall            Remove the service and runtime
`;

export async function main(args: string[], options: { bundlePath?: string } = {}) {
  const command = args[0] || 'help';
  if (command === 'mcp-bridge') {
    await runAgentMCPBridge();
    return;
  }
  if (command === 'help' || command === '--help' || command === '-h') {
    process.stdout.write(HELP);
    return;
  }
  if (command === 'pair') {
    const {token} = prepareAgentHostStorage({requireCodexAuth: false});
    const existing = await findExistingCompanion({installationToken: token});
    if (!existing) throw new Error('Start this user’s current Companion before pairing.');
    const management = args.includes('--manage');
    const code = management ? companionManagementCode(token, existing.endpoint) : companionChatPairingCode(token, existing.endpoint);
    process.stdout.write(management ? `Enter this code at ${existing.endpoint}/manage within five minutes:\n` : 'Enter this private code in Settings → AI → CLI agents:\n');
    process.stdout.write(code + '\n');
    return;
  }
  if (command === 'run') {
    if (process.env.GETBASED_COMPANION_SERVICE !== '1') {
      const existing = await findExistingCompanion({installationToken: prepareAgentHostStorage({requireCodexAuth:false}).token});
      if (existing) {
        process.stdout.write(`getbased Companion is already running at ${existing.endpoint}. No second process was started.\nRun the Companion pair command in a second terminal, then enter the code in getbased.\nLocal management (current Companion versions): ${existing.endpoint}/manage\nStopping this command does not stop the existing Companion.\n`);
        return;
      }
    }
    await import('../server/agent-host-server.js');
    return;
  }
  if (command === 'install') {
    const result = installCompanion({
      bundlePath: options.bundlePath || fileURLToPath(import.meta.url),
      dryRun: args.includes('--dry-run'),
    });
    if (result.installed) {
      process.stdout.write(`getbased Companion is installed and running on ${companionPlatformName()}. Run the Companion pair command in a second terminal, then enter the code in getbased.\n`);
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
    runCompanionServiceCommand(command as CompanionServiceCommand);
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
