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
    expect(list.textContent).toContain('npm run companion');
    expect(list.textContent).toContain('npm run companion:install');
    expect(list.querySelector('[data-settings-action="copy-cli-companion-run"]')).not.toBeNull();
    expect(list.querySelector('[data-settings-action="copy-cli-companion-install"]')).not.toBeNull();
    expect(list.textContent).toContain('No port or pairing token is needed');
    expect(list.querySelector('input')).toBeNull();
    expect(list.querySelector('a[href*="github.com/elkimek/get-based"]')).not.toBeNull();
  });
});
