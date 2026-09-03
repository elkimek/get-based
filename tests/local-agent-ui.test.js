// @vitest-environment node

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getLinuxCompanionInstallCommand } from '../js/settings-cli-agent-panel.js';

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
    expect(source).toContain('hosted web research');
    expect(source).toContain('copy-cli-companion-install');
    expect(source).toContain('Linux companion isn&rsquo;t running');
    expect(source).toContain('getbased-companion.mjs');
    expect(settings).toContain('copyCLICompanionInstallCommand');
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

  it('offers a working local preview command and a hosted single-file installer command', () => {
    expect(getLinuxCompanionInstallCommand({ hostname: 'localhost', origin: 'http://localhost:8000' }))
      .toBe('npm run companion:install');
    expect(getLinuxCompanionInstallCommand({
      hostname: 'app.getbased.health', origin: 'https://app.getbased.health',
    })).toBe('curl -fsS https://app.getbased.health/getbased-companion.mjs -o getbased-companion.mjs && node getbased-companion.mjs install');
  });

  it('renders Codex model and reasoning controls from the CLI catalog', () => {
    const source = read('js/settings-cli-agent-panel.js');
    expect(source).toContain("action: 'set-cli-agent-model'");
    expect(source).toContain("action: 'set-cli-agent-effort'");
    expect(source).toContain('listAgentModels');
    expect(source).toContain('class="cli-agent-picker"');
    expect(source).not.toContain('<select id="cli-agent-model"');
    expect(source).not.toContain('<select id="cli-agent-effort"');
  });

  it('returns chat to direct inference when an API or local-model provider is chosen', () => {
    const source = read('js/settings-provider-bridge.js');
    expect(source).toContain("if (changed) setChatBackend('direct')");
  });
});
