// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { refreshDetectedAgentList } from '../js/settings-cli-agent-panel.js';

describe('CLI companion setup UI', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="local-agent-list"></div>';
    localStorage.clear();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('uses one bootstrap command before offering in-app installation', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"error":"not_found"}', {
      status: 404, headers: { 'Content-Type': 'application/json' },
    })));

    await refreshDetectedAgentList();

    const list = document.getElementById('local-agent-list');
    expect(list.textContent).toContain('Connect your installed CLI agents');
    expect(list.textContent).toContain("curl -fsSL 'http://localhost:3000/getbased-companion.mjs'");
    expect(list.textContent).toContain('getbased-companion.mjs" run');
    expect(list.querySelector('[data-settings-action="copy-cli-companion-start"]')?.getAttribute('data-command'))
      .toContain('getbased-companion.mjs" start');
    expect(list.querySelectorAll('[data-settings-action="set-cli-companion-platform"]')).toHaveLength(3);
    expect(list.querySelector('[data-settings-action="copy-cli-companion-run"]')).not.toBeNull();
    expect(list.querySelector('[data-settings-action="copy-cli-companion-install"]')).toBeNull();
    expect(list.querySelector('[data-settings-action="copy-cli-companion-start"]')).not.toBeNull();
    expect(list.textContent).toContain('No port or pairing token is needed');
    expect(list.querySelector('input')).toBeNull();
    expect(list.querySelector('a[href*="github.com/elkimek/get-based"]')).not.toBeNull();
  });

  it('renders direct management controls for a running temporary companion', async () => {
    vi.stubGlobal('fetch', vi.fn(async input => {
      if (String(input).startsWith('/api/local-agents')) return new Response('{"agents":[]}', { status: 200 });
      return new Response(JSON.stringify({
        service: 'getbased-agent-host', endpoint: 'http://127.0.0.1:8324', token: '1234567890123456',
        protocolVersion: 3, capabilities: ['companion-control'], runtimeMode: 'temporary',
        companionVersion: '1.0.0', agents: [{ id: 'codex', name: 'Codex CLI', status: 'available', compatible: true }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }));

    await refreshDetectedAgentList();

    const list = document.getElementById('local-agent-list');
    expect(list.textContent).toContain('Connected for this terminal session · v1.0.0');
    expect(list.querySelector('[data-value="pause"]')).not.toBeNull();
    expect(list.querySelector('[data-value="restart"]')).not.toBeNull();
    expect(list.querySelector('[data-value="install"]')).not.toBeNull();
    expect(list.querySelector('[data-value="uninstall"]')).toBeNull();
  });

  it('shows a stopped companion state without attempting to load models', async () => {
    localStorage.setItem('labcharts-chat-backend', 'codex');
    vi.stubGlobal('fetch', vi.fn(async input => {
      if (String(input).startsWith('/api/local-agents')) {
        return new Response(JSON.stringify({ agents: [{
          id: 'codex', name: 'Codex CLI', description: 'OpenAI official CLI',
          version: 'codex-cli 0.150.1', status: 'unavailable', compatible: true,
        }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response('{"error":"not_found"}', { status: 404 });
    }));

    await refreshDetectedAgentList({ refresh: true });

    const list = document.getElementById('local-agent-list');
    expect(list.textContent).toContain('Installed · companion not running');
    expect(list.textContent).not.toContain('Loading Codex models');
    expect(list.textContent).not.toContain('Could not load the Codex model catalog');
    expect(list.querySelector('[data-settings-action="toggle-cli-codex"]')?.disabled).toBe(true);
    expect(list.querySelector('[data-settings-action="test-cli-codex"]')?.disabled).toBe(true);
  });
});
