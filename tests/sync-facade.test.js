import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  configureSyncLifecycleDeps,
  disableSync,
  enableSync,
  pauseSync,
} from '../js/sync.js';

let previousLifecycleDeps;

afterEach(() => {
  if (previousLifecycleDeps) configureSyncLifecycleDeps(previousLifecycleDeps);
  previousLifecycleDeps = undefined;
});

describe('sync public facade lifecycle composition', () => {
  it('delegates lifecycle calls and returns the previous configuration', async () => {
    const enableLifecycle = vi.fn(async options => ({ enabled: options }));
    const pauseLifecycle = vi.fn(async () => ({ paused: true }));
    const disableLifecycle = vi.fn(async reason => ({ disabled: reason }));

    previousLifecycleDeps = configureSyncLifecycleDeps({
      enableSync: enableLifecycle,
      pauseSync: pauseLifecycle,
      disableSync: disableLifecycle,
    });

    await expect(enableSync({ skipPush: true })).resolves.toEqual({ enabled: { skipPush: true } });
    await expect(pauseSync()).resolves.toEqual({ paused: true });
    await expect(disableSync('test-cleanup')).resolves.toEqual({ disabled: 'test-cleanup' });
    expect(enableLifecycle).toHaveBeenCalledWith({ skipPush: true });
    expect(pauseLifecycle).toHaveBeenCalledOnce();
    expect(disableLifecycle).toHaveBeenCalledWith('test-cleanup');
    expect(previousLifecycleDeps).toEqual({
      enableSync: expect.any(Function),
      pauseSync: expect.any(Function),
      disableSync: expect.any(Function),
    });
  });
});
