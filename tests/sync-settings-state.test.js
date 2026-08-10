import { beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(async () => {
  localStorage.clear();
  await vi.resetModules();
});

describe('sync configured / paused state', () => {
  it('pauses and resumes without removing the configured identity flag', async () => {
    const state = await import('../js/sync-settings-state.js');

    expect(state.setSyncEnabled(true)).toBe(true);
    expect(state.setSyncPaused(true)).toBe(true);
    expect(state.isSyncConfigured()).toBe(true);
    expect(state.isSyncPaused()).toBe(true);
    expect(state.isSyncEnabled()).toBe(false);
    expect(localStorage.getItem(state.SYNC_STORAGE_KEY)).toBe('true');
    expect(localStorage.getItem(state.SYNC_PAUSED_STORAGE_KEY)).toBe('true');

    expect(state.setSyncPaused(false)).toBe(false);
    expect(state.isSyncEnabled()).toBe(true);
    expect(localStorage.getItem(state.SYNC_PAUSED_STORAGE_KEY)).toBeNull();
  });

  it('disconnect clears both configured and paused state', async () => {
    const state = await import('../js/sync-settings-state.js');
    state.setSyncEnabled(true);
    state.setSyncPaused(true);

    expect(state.setSyncEnabled(false)).toBe(false);
    expect(state.isSyncConfigured()).toBe(false);
    expect(state.isSyncPaused()).toBe(false);
    expect(localStorage.getItem(state.SYNC_STORAGE_KEY)).toBe('false');
    expect(localStorage.getItem(state.SYNC_PAUSED_STORAGE_KEY)).toBeNull();
  });
});
