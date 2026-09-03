// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { refreshDetectedAgentList } from '../js/settings-cli-agent-panel.js';

describe('CLI companion setup UI', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="local-agent-list"></div>';
    localStorage.clear();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('replaces an empty scan with one Linux install action instead of connection settings', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"error":"not_found"}', {
      status: 404, headers: { 'Content-Type': 'application/json' },
    })));

    await refreshDetectedAgentList();

    const list = document.getElementById('local-agent-list');
    expect(list.textContent).toContain('Linux companion isn’t running');
    expect(list.textContent).toContain('npm run companion:install');
    expect(list.querySelector('[data-settings-action="copy-cli-companion-install"]')).not.toBeNull();
    expect(list.textContent).toContain('No port or pairing token is needed');
    expect(list.querySelector('input')).toBeNull();
  });
});
