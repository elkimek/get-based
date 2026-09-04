// @vitest-environment node

import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  detectCompanionPlatform, getCLIAgentModelProvider, getCompanionCommand, getLinuxCompanionInstallCommand, getLinuxCompanionRunCommand,
} from '../js/settings-cli-agent-panel.js';
import { getCLIAgentBrandAsset, renderCLIAgentBrandIcon } from '../js/cli-agent-brand-assets.js';

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
    expect(source).not.toContain('settings-beta-badge">Experimental');
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

  it('maps every supported CLI to a local vendor mark', () => {
    const serviceWorker = read('service-worker.js');
    for (const agent of ['codex', 'claude', 'opencode', 'hermes', 'grok', 'openclaw']) {
      expect(getCLIAgentBrandAsset(agent)).toBe(`/brands/cli-agent-${agent}.svg`);
      expect(renderCLIAgentBrandIcon(agent)).toContain(`src="/brands/cli-agent-${agent}.svg"`);
      expect(read(`brands/cli-agent-${agent}.svg`)).toContain('<svg');
      if (agent !== 'grok') expect(serviceWorker).toContain(`/brands/cli-agent-${agent}.svg`);
    }
    expect(serviceWorker).toContain('/js/cli-agent-brand-assets.js');
    expect(renderCLIAgentBrandIcon('unknown')).toContain('local-agent-icon-fallback');
    expect(read('brands/cli-agent-grok.svg')).not.toContain('data:image');
    expect(read('brands/cli-agent-claude.svg')).not.toContain('data:image');
    expect(read('brands/CLI_AGENTS.md')).toContain('do not represent a partnership, sponsorship, or');
  });

  it('uses current provider identification assets and publishes their provenance', () => {
    const settings = read('js/settings.js');
    const serviceWorker = read('service-worker.js');
    const expectedHashes = {
      openrouter: '5b49593d44e6aa41011be377e182cd89e57473f1948e0dfb128f99a92adfc68d',
      routstr: '56fb66f3083ac0de62d933121df1506708292739465e3119421400284f544f4f',
      venice: '0218ef39e62887d49ae81dab563cec35ef61f3a1a0342d526fa8ff5ae5003eef',
    };
    for (const [provider, expectedHash] of Object.entries(expectedHashes)) {
      const path = `brands/ai-provider-${provider}.svg`;
      expect(settings).toContain(`src="/${path}"`);
      expect(createHash('sha256').update(read(path)).digest('hex')).toBe(expectedHash);
    }
    const ppqSvg = read('brands/ai-provider-ppq.svg');
    const ppqBytes = Buffer.from(ppqSvg.match(/base64,([^\"]+)/)?.[1] || '', 'base64');
    expect(createHash('sha256').update(ppqBytes).digest('hex'))
      .toBe('d1c6cab3f71ed07d4ebf086efbaa2e517dadfd5009a564b15780c4be5cda9de5');
    expect(settings).toContain('src="/brands/ai-provider-ppq.svg"');
    expect(serviceWorker).not.toContain('/brands/ai-provider-ppq.svg');
    expect(read('brands/AI_PROVIDERS.md')).toContain('do not imply');
  });

  it('offers existing AI accounts in chat onboarding', () => {
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
    expect(source).toContain("action: 'set-cli-agent-target'");
    expect(source).toContain('Personal gateway uses that profile');
    expect(source).toContain('data-cli-agent-model-search');
    expect(source).toContain('choices apply only to getbased sessions');
    expect(source).toContain('model: selectedModel || undefined');
    expect(getCLIAgentModelProvider('opencode', { id: 'openrouter/openai/gpt-5.6-sol' })).toBe('openrouter');
    expect(getCLIAgentModelProvider('hermes', { id: 'openai-codex:gpt-5.6-sol' })).toBe('openai-codex');
    expect(getCLIAgentModelProvider('openclaw', { id: 'openai/gpt-5.6-sol' })).toBe('openai');
  });

  it('returns chat to direct inference when an API or local-model provider is chosen', () => {
    const source = read('js/settings-provider-bridge.js');
    expect(source).toContain("if (changed) setChatBackend('direct')");
  });
});
