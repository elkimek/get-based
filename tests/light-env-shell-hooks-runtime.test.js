import { afterEach, describe, expect, it, vi } from 'vitest';

const MOCKED_MODULES = [
  '../js/app-event-listeners.js',
  '../js/light-env.js',
  '../js/light-sun-loader.js',
  '../js/light-tools.js',
  '../js/nav.js',
  '../js/views.js',
];

afterEach(() => {
  for (const modulePath of MOCKED_MODULES) vi.doUnmock(modulePath);
  vi.resetModules();
  vi.restoreAllMocks();
});

describe('Light environment shell hooks', () => {
  it('opens after lazy UI readiness and contains lazy-load failures', async () => {
    let appEventActions;
    let navActions;
    const closeLightEnvironmentAssessment = vi.fn();
    const configureLightEnv = vi.fn();
    const getMeasurementsForRoom = vi.fn();
    const navigate = vi.fn();
    const openLightEnvironmentAssessment = vi.fn();
    const loadError = new Error('Light UI unavailable');
    const loadLightSunUI = vi.fn()
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(loadError);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    vi.doMock('../js/app-event-listeners.js', () => ({
      configureAppEventListeners(actions) {
        appEventActions = actions;
      },
    }));
    vi.doMock('../js/light-env.js', () => ({
      closeLightEnvironmentAssessment,
      configureLightEnv,
      openLightEnvironmentAssessment,
    }));
    vi.doMock('../js/light-sun-loader.js', () => ({ loadLightSunUI }));
    vi.doMock('../js/light-tools.js', () => ({ getMeasurementsForRoom }));
    vi.doMock('../js/nav.js', () => ({
      configureNavActions(actions) {
        navActions = actions;
      },
    }));
    vi.doMock('../js/views.js', () => ({ navigate }));

    await import('../js/light-env-shell-hooks.js');

    expect(configureLightEnv).toHaveBeenCalledWith({ getMeasurementsForRoom, navigate });
    expect(appEventActions).toEqual({ closeLightEnvironmentAssessment });

    navActions.openLightEnvironmentAssessment();
    await vi.waitFor(() => {
      expect(openLightEnvironmentAssessment).toHaveBeenCalledOnce();
    });

    navActions.openLightEnvironmentAssessment();
    await vi.waitFor(() => {
      expect(consoleError).toHaveBeenCalledWith('Failed to load Light & Sun modules', loadError);
    });

    expect(loadLightSunUI).toHaveBeenCalledTimes(2);
  });
});
