// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { refreshDetectedAgentList } from '../js/settings-cli-agent-panel.js';

describe('CLI companion setup UI', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="local-agent-list"></div>';
    localStorage.clear();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('replaces an empty scan with temporary and installed Linux companion actions', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"error":"not_found"}', {
      status: 404, headers: { 'Content-Type': 'application/json' },
    })));

    await refreshDetectedAgentList();

    const list = document.getElementById('local-agent-list');
    expect(list.textContent).toContain('Connect your installed CLI agents');
    expect(list.textContent).toContain("curl -fsSL 'http://localhost:3000/getbased-companion.mjs'");
    expect(list.textContent).toContain('getbased-companion.mjs" run');
    expect(list.textContent).toContain('getbased-companion.mjs" install');
    expect(list.querySelectorAll('[data-settings-action="set-cli-companion-platform"]')).toHaveLength(3);
    expect(list.querySelector('[data-settings-action="copy-cli-companion-run"]')).not.toBeNull();
    expect(list.querySelector('[data-settings-action="copy-cli-companion-install"]')).not.toBeNull();
    expect(list.textContent).toContain('No port or pairing token is needed');
    expect(list.querySelector('input')).toBeNull();
    expect(list.querySelector('a[href*="github.com/elkimek/get-based"]')).not.toBeNull();
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
