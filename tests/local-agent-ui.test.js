// @vitest-environment node

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  detectCompanionPlatform, getCLIAgentModelProvider, getCompanionCommand, getLinuxCompanionInstallCommand, getLinuxCompanionRunCommand,
} from '../js/settings-cli-agent-panel.js';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

describe('local agent selection UI', () => {
  it('places CLI inference in AI providers and keeps connection internals hidden', () => {
    const source = read('js/settings-cli-agent-panel.js');
    const settings = read('js/settings.js');
    const agentAccess = read('js/settings-agent-access-panel.js');
    expect(source).toContain('Installed CLIs');
    expect(source).toContain('data-settings-action="rescan-cli-agents"');
    expect(source).toContain('data-settings-action="toggle-cli-codex"');
    expect(settings).toContain('data-settings-action="show-cli-agent-provider"');
    expect(settings).toContain('CLI agents');
    expect(agentAccess).not.toContain('Installed CLIs');
    expect(source).not.toContain('id="agent-chat-endpoint"');
    expect(source).not.toContain('id="agent-chat-token"');
    expect(source).not.toContain('Paste the Agent Host pairing token');
    expect(source).toContain('hosted research capabilities');
    expect(source).toContain('control-cli-companion');
    expect(source).toContain('copy-cli-companion-run');
    expect(source).toContain('copy-cli-companion-start');
    expect(source).toContain('Connect your installed CLI agents');
    expect(source).toContain('getbased-companion.mjs');
    expect(source).toContain('Review the source on GitHub');
    expect(settings).toContain('controlCLICompanion');
    expect(settings).toContain('copyCLICompanionRunCommand');
  });

  it('keeps provider selection out of the chat header', () => {
    const source = read('index.html');
    expect(source).not.toContain('id="chat-backend-select"');
    expect(source).not.toContain('id="chat-agent-status-dot"');
  });

  it('offers existing subscriptions in chat onboarding', () => {
    const source = read('js/chat-onboarding.js');
    expect(source).toContain('Use an AI subscription I already have');
    expect(source).toContain("branch === 'cli'");
    expect(source).toContain("provider === 'cli'");
  });

  it('offers self-contained download commands for Linux, macOS, and Windows', () => {
    expect(getLinuxCompanionRunCommand({ hostname: 'localhost', origin: 'http://localhost:8000' }))
      .toContain("curl -fsSL 'http://localhost:8000/getbased-companion.mjs'");
    expect(getLinuxCompanionInstallCommand({ hostname: 'localhost', origin: 'http://localhost:8000' }))
      .toContain('getbased-companion.mjs" install');
    expect(getLinuxCompanionRunCommand({
      hostname: 'app.getbased.health', origin: 'https://app.getbased.health',
    })).toContain("curl -fsSL 'https://app.getbased.health/getbased-companion.mjs'");
    expect(getLinuxCompanionInstallCommand({
      hostname: 'app.getbased.health', origin: 'https://app.getbased.health',
    })).toContain('getbased-companion.mjs" install');
    expect(getCompanionCommand('macos', 'run', { origin: 'https://app.getbased.health' }))
      .toContain('${TMPDIR:-/tmp}/getbased-companion.mjs" run');
    expect(getCompanionCommand('windows', 'install', { origin: 'https://app.getbased.health' }))
      .toContain("Invoke-WebRequest 'https://app.getbased.health/getbased-companion.mjs' -OutFile $p; node $p install");
    expect(detectCompanionPlatform({ platform: 'Win32' })).toBe('windows');
    expect(detectCompanionPlatform({ platform: 'MacIntel' })).toBe('macos');
    expect(detectCompanionPlatform({ platform: 'Linux x86_64' })).toBe('linux');
  });

  it('renders Codex model and reasoning controls from the CLI catalog', () => {
    const source = read('js/settings-cli-agent-panel.js');
    expect(source).toContain("action: 'set-cli-agent-model'");
    expect(source).toContain("action: 'set-cli-agent-effort'");
    expect(source).toContain('listAgentModels');
    expect(source).toContain('class="cli-agent-picker"');
    expect(source).not.toContain('<select id="cli-agent-model"');
    expect(source).not.toContain('<select id="cli-agent-effort"');
    expect(source).toContain("action: 'set-cli-agent-provider-filter'");
    expect(source).toContain('data-cli-agent-model-search');
    expect(source).toContain('choices apply only to GetBased sessions');
    expect(source).toContain('model: selectedModel || undefined');
    expect(getCLIAgentModelProvider('opencode', { id: 'openrouter/openai/gpt-5.6-sol' })).toBe('openrouter');
    expect(getCLIAgentModelProvider('hermes', { id: 'openai-codex:gpt-5.6-sol' })).toBe('openai-codex');
  });

  it('returns chat to direct inference when an API or local-model provider is chosen', () => {
    const source = read('js/settings-provider-bridge.js');
    expect(source).toContain("if (changed) setChatBackend('direct')");
  });
});
