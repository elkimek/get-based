// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cliSettingsFixture } from './helpers/cli-settings-fixture.js';
import { disposeCliAgentSettings } from '../js/cli-agent-settings-component.js';
import { refreshDetectedAgentList, renderCLIAgentProviderPanel, resizeCLICompanionPanel, toggleCLIAgentOptions } from '../js/settings-cli-agent-panel.js';

describe('CLI companion setup UI', () => {
  it('collapses agent settings without changing the selected provider or controls', () => {
    localStorage.setItem('labcharts-agent-host-agent', 'codex');
    cliSettingsFixture([{ id:'codex',name:'Codex',compatible:true,status:'available' }],'codex');
    document.getElementById('cli-agent-options')!.innerHTML = '<input value="medium">';
    const button = document.querySelector('[data-settings-action="toggle-cli-agent-options"]')!;
    const options = document.getElementById('cli-agent-options')!;
    const input = options.querySelector('input')!;
    toggleCLIAgentOptions();
    expect(options.hidden).toBe(true);
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(localStorage.getItem('labcharts-agent-host-agent')).toBe('codex');
    toggleCLIAgentOptions();
    expect(options.hidden).toBe(false);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(options.querySelector('input')).toBe(input);
    expect(input.value).toBe('medium');
  });
  beforeEach(() => {
    localStorage.clear(); cliSettingsFixture();
  });
  afterEach(() => { disposeCliAgentSettings(); document.body.replaceChildren(); vi.unstubAllGlobals(); });

  it('uses one bootstrap command before offering in-app installation', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"error":"not_found"}', {
      status: 404, headers: { 'Content-Type': 'application/json' },
    })));

    await refreshDetectedAgentList();

    const list = document.getElementById('local-agent-list')!;
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
    vi.stubGlobal('fetch', vi.fn(async (input: unknown) => {
      if (String(input).startsWith('/api/local-agents')) return new Response(JSON.stringify({ agents: [{
        id: 'codex', name: 'Codex CLI', status: 'available', compatible: true,
        endpoint: 'http://127.0.0.1:8324', token: 'installation-token', controlAuthorized: true,
      }] }), { status: 200 });
      return new Response(JSON.stringify({
        service: 'getbased-agent-host', endpoint: 'http://127.0.0.1:8324', token: '1234567890123456',
        protocolVersion: 3, capabilities: ['companion-control'], runtimeMode: 'temporary',
        companionVersion: '1.0.0', agents: [{ id: 'codex', name: 'Codex CLI', status: 'available', compatible: true }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }));

    await refreshDetectedAgentList();

    const companion = document.getElementById('local-agent-companion-section')!;
    expect(companion.textContent).toContain('Connected for this terminal session · v1.0.0');
    expect(companion.querySelector('[data-value="pause"]')).not.toBeNull();
    expect(companion.querySelector('[data-value="restart"]')).not.toBeNull();
    expect(companion.textContent).toContain('Reconnect CLIs');
    expect(companion.querySelector('[data-value="restart-companion"]')).toBeNull();
    expect(companion.querySelector('[data-value="install"]')).not.toBeNull();
    expect(companion.querySelector('[data-value="uninstall"]')).toBeNull();
  });

  it('checks an installed companion on first opening without a manual connection check', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: unknown) => {
      if (String(input).startsWith('/api/local-agents')) return new Response(JSON.stringify({ agents: [{
        id: 'codex', name: 'Codex CLI', status: 'available', compatible: true,
        endpoint: 'http://127.0.0.1:8324', token: 'installation-token', controlAuthorized: true,
      }] }), { status: 200 });
      return new Response(JSON.stringify({
        service: 'getbased-agent-host', endpoint: 'http://127.0.0.1:8324', token: '1234567890123456',
        protocolVersion: 5, capabilities: ['companion-control', 'companion-restart'], runtimeMode: 'installed',
        companionVersion: '1.2.0', agents: [{ id: 'codex', name: 'Codex CLI', status: 'available', compatible: true, version: String(input).includes('refresh=true') ? 'codex-cli 0.163.0' : 'codex-cli 0.156.1' }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }));

    document.body.innerHTML = renderCLIAgentProviderPanel();
    await Promise.resolve();
    expect(document.body.textContent).toContain('Scanning this computer');
    expect(document.querySelector('.local-agent-install-card')).toBeNull();
    await vi.waitFor(() => {
      expect(document.querySelector('[data-value="restart-companion"]')).not.toBeNull();
    });
    expect(fetch).toHaveBeenCalledWith('/api/local-agents?refresh=1', expect.any(Object));
    expect(document.body.textContent).toContain('codex-cli 0.163.0');
    expect(document.body.textContent).not.toContain('codex-cli 0.156.1');
    expect(document.querySelector('.local-agent-install-card')).toBeNull();

    const companion = document.getElementById('local-agent-companion-section')!;
    expect(companion.querySelector('[data-value="restart"]')?.textContent).toContain('Reconnect CLIs');
    expect(companion.querySelector('[data-value="restart-companion"]')?.textContent).toContain('Restart companion');
    expect(companion.querySelector('[data-value="update"]')?.textContent).toContain('Check for update');
  });

  it.each([['chat-stream'], ['chat-stream', 'companion-control']])('offers recovery when an installed companion lacks service restart (%j)', async (...capabilities) => {
    vi.stubGlobal('fetch', vi.fn(async (input: unknown) => {
      if (String(input).startsWith('/api/local-agents')) return new Response('{"agents":[]}', { status: 200 });
      return new Response(JSON.stringify({
        service: 'getbased-agent-host', endpoint: 'http://127.0.0.1:8324', token: '1234567890123456',
        protocolVersion: 2, capabilities, runtimeMode: 'installed',
        agents: [{ id: 'codex', name: 'Codex CLI', status: 'available', compatible: true }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }));

    await refreshDetectedAgentList();

    const companion = document.getElementById('local-agent-companion-section')!;
    expect(companion.textContent).toContain('Update required');
    expect(companion.textContent).toContain('Restarting the same file will not update it');
    expect(companion.querySelector('[data-settings-action="copy-cli-companion-update"]')).not.toBeNull();
    expect(companion.querySelector('[data-settings-action="control-cli-companion"]')).toBeNull();
  });

  it('shows chat-only lifecycle guidance for discovery, even if an old host advertises controls', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: unknown) => {
      if (String(input).startsWith('/api/local-agents')) return new Response('{"agents":[]}');
      return new Response(JSON.stringify({
        service: 'getbased-agent-host', endpoint: 'http://127.0.0.1:8324', token: '1234567890123456',
        capabilities: ['companion-control', 'companion-restart'], runtimeMode: 'installed',
        agents: [{ id: 'codex', status: 'available', compatible: true }],
      }));
    }));
    await refreshDetectedAgentList();
    const companion = document.getElementById('local-agent-companion-section')!;
    expect(companion.textContent).toContain('Connected for chat');
    expect(companion.querySelector('[data-settings-action="control-cli-companion"]')).toBeNull();
    expect(companion.querySelector('[data-settings-action="copy-cli-companion-update"]')).not.toBeNull();
  });

  it('links hosted discovery to management on the actual discovered port without sharing credentials', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: unknown) => {
      if (String(input).startsWith('/api/local-agents')) return new Response('{"agents":[]}');
      return Response.json({
        service: 'getbased-agent-host', endpoint: 'http://127.0.0.1:8325', token: '1234567890123456',
        capabilities: ['companion-control', 'companion-restart', 'companion-management'], runtimeMode: 'installed',
        agents: [{ id: 'codex', status: 'available', compatible: true }],
      });
    }));
    await refreshDetectedAgentList();
    const companion = document.getElementById('local-agent-companion-section')!;
    const link = companion.querySelector('a');
    expect(link?.href).toBe('http://127.0.0.1:8325/manage');
    expect(link?.rel).toContain('noopener');
    expect(companion.textContent).toContain('Starts automatically at login');
    expect(companion.innerHTML).not.toContain('1234567890123456');
    expect(companion.querySelector('[data-settings-action="control-cli-companion"]')).toBeNull();
  });

  it.each(['http://localhost:8000', 'http://iobqafpywmncin7m2wpvbemouvulaeb7jnvtvugxnru4gpneushb5jyd.onion', 'https://custom-chat.example'])('uses embedded controls or a local fallback on %s without sharing credentials', async origin => {
    vi.stubGlobal('location', { origin });
    vi.stubGlobal('fetch', vi.fn(async (input: unknown) => {
      if (String(input).startsWith('/api/local-agents')) return Response.json({ agents: [] });
      return Response.json({
        service: 'getbased-agent-host', endpoint: 'http://127.0.0.1:8325', token: '1234567890123456',
        capabilities: ['companion-control', 'companion-restart', 'companion-management', 'companion-management-embedded'], runtimeMode: 'installed',
        agents: [{ id: 'codex', status: 'available', compatible: true }],
      });
    }));
    await refreshDetectedAgentList();
    const companion = document.getElementById('local-agent-companion-section')!;
    const frame = companion.querySelector('iframe')!;
    if (origin === 'https://custom-chat.example') {
      expect(frame).toBeNull();
      expect(companion.querySelector('a')!.href).toBe('http://127.0.0.1:8325/manage');
      expect(companion.textContent).toContain('from this deployment');
      expect(companion.textContent).not.toContain('Update Companion once');
      return;
    }
    expect(frame.title).toBe('Companion controls');
    const url = new URL(frame.src);
    expect(url.origin + url.pathname).toBe('http://127.0.0.1:8325/manage/embed');
    expect(url.searchParams.get('parentOrigin')).toBe(location.origin);
    expect(frame.getAttribute('sandbox')).toBe('allow-scripts allow-same-origin');
    expect(companion.querySelector('a')).toBeNull();
    expect(companion.innerHTML).not.toContain('1234567890123456');
  });

  it('accepts bounded frame sizing only from its own local management panel', () => {
    vi.stubGlobal('location',{ origin:'http://localhost:8000' });
    cliSettingsFixture([{ id:'codex',compatible:true,status:'available',endpoint:'http://127.0.0.1:8325',capabilities:['companion-control','companion-restart','companion-management-embedded'] }]);
    const frame = document.querySelector('iframe')!;
    const event = { data: { type: 'getbased-companion-panel-size', height: 340 }, origin: 'http://127.0.0.1:8325', source: frame.contentWindow };
    const postMessage = vi.spyOn(frame.contentWindow!, 'postMessage');
    for (const origin of ['https://attacker.example', 'null', '', 'http://127.0.0.1:8324', 'http://127.0.0.1:8325.attacker.example']) {
      window.dispatchEvent(new MessageEvent('message', { ...event, origin }));
    }
    expect(postMessage).not.toHaveBeenCalled();
    resizeCLICompanionPanel({ ...event, origin: 'https://attacker.example' });
    resizeCLICompanionPanel({ ...event, source: window });
    expect(frame.style.height).toBe('');
    window.dispatchEvent(new MessageEvent('message', event));
    expect(frame.style.height).toBe('340px');
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'getbased-companion-panel-theme' }), event.origin);
    resizeCLICompanionPanel({ ...event, data: { ...event.data, height: 100000 } });
    expect(frame.style.height).toBe('800px');
    postMessage.mockClear();
    disposeCliAgentSettings();
    window.dispatchEvent(new MessageEvent('message', event));
    expect(postMessage).not.toHaveBeenCalled();
    postMessage.mockRestore();
  });

  it('shows a stopped companion state without attempting to load models', async () => {
    localStorage.setItem('labcharts-chat-backend', 'codex');
    vi.stubGlobal('fetch', vi.fn(async (input: unknown) => {
      if (String(input).startsWith('/api/local-agents')) {
        return new Response(JSON.stringify({ agents: [{
          id: 'codex', name: 'Codex CLI', description: 'OpenAI official CLI',
          version: 'codex-cli 0.150.1', status: 'unavailable', compatible: true,
        }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response('{"error":"not_found"}', { status: 404 });
    }));

    await refreshDetectedAgentList({ refresh: true });

    const list = document.getElementById('local-agent-list')!;
    expect(list.textContent).toContain('Installed · companion not running');
    expect(list.textContent).not.toContain('Loading Codex models');
    expect(list.textContent).not.toContain('Could not load the Codex model catalog');
    expect(list.querySelector<HTMLInputElement>('[data-settings-action="toggle-cli-codex"]')?.disabled).toBe(true);
    expect(list.querySelector<HTMLButtonElement>('[data-settings-action="test-cli-codex"]')?.disabled).toBe(true);
  });
});
