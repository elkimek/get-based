import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  configureSyncLifecycleDeps,
  disableSync,
  enableSync,
  pauseSync,
} from '../js/sync.js';

let previousLifecycleDeps: ReturnType<typeof configureSyncLifecycleDeps> | undefined;

afterEach(() => {
  if (previousLifecycleDeps) configureSyncLifecycleDeps(previousLifecycleDeps);
  previousLifecycleDeps = undefined;
});

describe('sync public facade lifecycle composition', () => {
  it('delegates lifecycle calls and returns the previous configuration', async () => {
    const enableLifecycle = vi.fn(async (options: unknown) => ({ enabled: options }));
    const pauseLifecycle = vi.fn(async () => ({ paused: true }));
    const disableLifecycle = vi.fn(async (reason: unknown) => ({ disabled: reason }));

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

// Facades and direct consumers must share one configuration function/provider state.
it('retains the original configuration APIs as identical producer exports', async () => {
  const [planners, plannerContext, observability, observabilityContext, diagnostics, diagnosticsContext] = await Promise.all([
    import('../js/sync-delta-planners.js'), import('../js/sync-delta-planner-context.js'),
    import('../js/sync-delta-observability.js'), import('../js/sync-delta-observability-context.js'),
    import('../js/sync-diagnostics.js'), import('../js/sync-diagnostics-context.js'),
  ]);
  for (const [facade, producer, name] of [
    [planners.configureSyncDeltaPlanners, plannerContext.configureSyncDeltaPlanners, 'configureSyncDeltaPlanners'],
    [observability.configureSyncDeltaObservability, observabilityContext.configureSyncDeltaObservability, 'configureSyncDeltaObservability'],
    [diagnostics.configureSyncDiagnostics, diagnosticsContext.configureSyncDiagnostics, 'configureSyncDiagnostics'],
  ] as const) {
    expect(facade).toBe(producer);
    expect(facade.name).toBe(name);
    expect(facade.length).toBe(0);
    expect(facade()).toBeUndefined();
  }
});
