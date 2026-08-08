import fs from 'node:fs';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  configureExportImportRuntimeDeps,
  refreshImportRuntimeShell,
} from '../js/export-runtime.js';

let previousDeps;

beforeEach(() => {
  previousDeps = configureExportImportRuntimeDeps({
    buildSidebar: null,
    ensureActiveThread: null,
    loadChatThreads: null,
    navigate: null,
    refreshChatPersonalities: null,
    renderProfileButton: null,
    renderThreadList: null,
    updateHeaderDates: null,
  });
});

afterEach(() => {
  configureExportImportRuntimeDeps(previousDeps);
});

describe('export import runtime dependencies', () => {
  it('refreshes the shell through explicitly configured callbacks', async () => {
    const deps = {
      buildSidebar: vi.fn(),
      ensureActiveThread: vi.fn(),
      loadChatThreads: vi.fn(() => true),
      navigate: vi.fn(),
      refreshChatPersonalities: vi.fn(async () => true),
      renderProfileButton: vi.fn(),
      renderThreadList: vi.fn(),
      updateHeaderDates: vi.fn(),
    };
    configureExportImportRuntimeDeps(deps);

    await refreshImportRuntimeShell({ chat: true, profileButton: true, route: 'labs' });

    expect(deps.loadChatThreads).toHaveBeenCalledOnce();
    expect(deps.refreshChatPersonalities).toHaveBeenCalledOnce();
    expect(deps.ensureActiveThread).toHaveBeenCalledOnce();
    expect(deps.renderThreadList).toHaveBeenCalledOnce();
    expect(deps.buildSidebar).toHaveBeenCalledOnce();
    expect(deps.updateHeaderDates).toHaveBeenCalledOnce();
    expect(deps.renderProfileButton).toHaveBeenCalledOnce();
    expect(deps.navigate).toHaveBeenCalledWith('labs');
  });

  it('keeps shell modules behind the app composition seam', () => {
    const runtimeSource = fs.readFileSync(new URL('../js/export-runtime.js', import.meta.url), 'utf8');
    const shellSource = fs.readFileSync(new URL('../js/app-shell-hooks.js', import.meta.url), 'utf8');

    expect(runtimeSource).not.toMatch(/import\(['"]\.\/(?:chat-threads|data|nav|views)\.js['"]\)/);
    expect(shellSource).toContain("import { configureExportImportRuntimeDeps } from './export-runtime.js';");
    expect(shellSource).toContain('configureExportImportRuntimeDeps({');
  });
});
