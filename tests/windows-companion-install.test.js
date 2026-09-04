// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import {
  renderWindowsCompanionLauncher, renderWindowsCompanionRunner, resolveWindowsCompanionPaths,
  runWindowsCompanionServiceCommand, WINDOWS_COMPANION_TASK,
} from '../lib/windows-companion-install.js';

describe('Windows companion installer', () => {
  it('uses user-owned LocalAppData paths and a hidden WScript runner', () => {
    const paths = resolveWindowsCompanionPaths({
      homeDirectory: 'C:\\Users\\Alex',
      env: { LOCALAPPDATA: 'C:\\Users\\Alex\\AppData\\Local' },
    });
    expect(paths.installedBundle).toBe('C:\\Users\\Alex\\AppData\\Local\\getbased\\companion\\getbased-companion.mjs');
    expect(paths.serviceFile).toBe(WINDOWS_COMPANION_TASK);
    const runner = renderWindowsCompanionRunner({
      nodePath: 'C:\\Node\\node.exe', bundlePath: paths.installedBundle,
      codexCommand: 'C:\\Users\\Alex\\bin\\codex.exe', sourceCodexHome: 'C:\\Users\\Alex\\.codex',
      agentCommands: {
        GETBASED_CODEX_COMMAND: 'C:\\Users\\Alex\\bin\\codex.exe',
        GETBASED_ENABLE_CLAUDE_AGENT: 'api-console',
      },
    });
    expect(runner).toContain('WScript.Shell');
    expect(runner).toContain(', 0, True');
    expect(runner).toContain('GETBASED_CODEX_COMMAND');
    expect(runner).toContain('GETBASED_SOURCE_CODEX_HOME');
    expect(runner).toContain('GETBASED_COMPANION_SERVICE');
    expect(runner).toContain('GETBASED_ENABLE_CLAUDE_AGENT');
    expect(runner).toContain('api-console');
    expect(renderWindowsCompanionLauncher({ nodePath: 'C:\\Node\\node.exe', bundlePath: paths.installedBundle }))
      .toContain('%*');
  });

  it('maps lifecycle commands to the current-user scheduled task', () => {
    const schtasks = vi.fn();
    runWindowsCompanionServiceCommand('start', { execFileSyncImpl: schtasks });
    runWindowsCompanionServiceCommand('stop', { execFileSyncImpl: schtasks });
    runWindowsCompanionServiceCommand('status', { execFileSyncImpl: schtasks });
    expect(schtasks.mock.calls.map(call => call[1][0])).toEqual(['/Run', '/End', '/Query']);
    expect(schtasks.mock.calls.every(call => call[1].includes(WINDOWS_COMPANION_TASK))).toBe(true);
  });
});
