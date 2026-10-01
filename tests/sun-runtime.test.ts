import { expect, it } from 'vitest';
import { setRuntimeValue, captureRuntimeGlobals } from './helpers/runtime-globals.js';
import { createLegacyAssertions } from './helpers/legacy-assertions.js';
import { readFileSync } from 'node:fs';
import { state } from '../js/state.js';
import {
  addSunProfileSwitchListener,
  configureSunRuntimeDeps,
  getSunDeviceSessionsRuntime,
  hasSunBrowserRuntime,
  hasSunGeolocationRuntime,
  isSunDebugRuntime,
  navigateSunRuntime,
  openSunChannelOnLightPageRuntime,
  rebuildSunSidebarRuntime,
  renderLightChannelsLiveRuntime,
  renderLightTodayStripRuntime,
  requestSunGeolocationPositionRuntime,
} from '../js/sun-runtime.js';

it('retains Sun callbacks, stored sessions and geolocation behavior', async () => {
  const originalSunRuntimeDeps = configureSunRuntimeDeps();

  const { assert, results: legacyAssertions } = createLegacyAssertions(" - ");

  console.log('=== Sun Runtime Tests ===\n');

  const runtimeKeys = [
    'window',
    'navigator',
    'addEventListener',
  ];

  const restoreRuntime = captureRuntimeGlobals(runtimeKeys);

  const savedImportedData = state.importedData;

  try {
    const calls: unknown[][] = [];
    const deviceSessions = [{ id: 'device-1', doses: { vitamin_d: 12 } }];
    state.importedData = { deviceSessions } as unknown as NonNullable<typeof state.importedData>;
    configureSunRuntimeDeps({
      buildSidebar: () => calls.push(['sidebar']),
      isDebugMode: () => true,
      navigate: (view, options) => calls.push(['navigate', view, options?.scrollAnchor]),
      openChannelOnLightPage: channel => calls.push(['channel', channel]),
      renderLightChannelsLive: () => calls.push(['channels-live']),
      renderLightTodayStrip: () => '<section>today</section>',
    });
    const profileListener = () => calls.push(['profile-switch']);
    setRuntimeValue('addEventListener', (type: string, listener: unknown) => calls.push(['listener', type, listener]));

    assert('hasSunBrowserRuntime detects browser runtime',
      hasSunBrowserRuntime() === true);
    assert('isSunDebugRuntime delegates debug mode safely',
      isSunDebugRuntime() === true);
    assert('getSunDeviceSessionsRuntime reads the device session store',
      getSunDeviceSessionsRuntime() === deviceSessions);
    rebuildSunSidebarRuntime();
    navigateSunRuntime('light', { scrollAnchor: 'light-session-log' });
    renderLightChannelsLiveRuntime();
    assert('renderLightTodayStripRuntime delegates and returns markup',
      renderLightTodayStripRuntime() === '<section>today</section>');
    openSunChannelOnLightPageRuntime('vitamin_d');
    addSunProfileSwitchListener(profileListener);
    assert('sun runtime UI hooks delegate to injected callbacks',
      calls.some(call => call[0] === 'sidebar') &&
      calls.some(call => call[0] === 'navigate' && call[1] === 'light' && call[2] === 'light-session-log') &&
      calls.some(call => call[0] === 'channels-live') &&
      calls.some(call => call[0] === 'channel' && call[1] === 'vitamin_d') &&
      calls.some(call => call[0] === 'listener' && call[1] === 'labcharts-profile-switched' && call[2] === profileListener));

    let capturedOptions: PositionOptions | null = null;
    const position = { coords: { latitude: 50.08, longitude: 14.42, altitude: null } };
    setRuntimeValue('navigator', {
      geolocation: {
        getCurrentPosition: (resolve: (value: typeof position) => void, _reject: unknown, options: PositionOptions) => {
          capturedOptions = options;
          resolve(position);
        },
      },
    });
    assert('hasSunGeolocationRuntime detects geolocation provider',
      hasSunGeolocationRuntime() === true);
    const resolvedPosition = await requestSunGeolocationPositionRuntime({ timeout: 8000, maximumAge: 60000, enableHighAccuracy: true });
    assert('requestSunGeolocationPositionRuntime delegates with options',
      resolvedPosition === position && (capturedOptions as PositionOptions | null)?.timeout === 8000 && (capturedOptions as PositionOptions | null)?.enableHighAccuracy === true);

    const runtimeSource = readFileSync(new URL('../js/sun-runtime.js', import.meta.url), 'utf8');
    assert('sun runtime does not publish module APIs on the browser global',
      !runtimeSource.includes('exposeSunRuntimeBindings') && !runtimeSource.includes('Object.assign(runtime'));

    state.importedData = { deviceSessions: [] } as unknown as NonNullable<typeof state.importedData>;
    configureSunRuntimeDeps({
      buildSidebar: () => { throw new Error('boom'); },
      isDebugMode: () => { throw new Error('boom'); },
      navigate: () => { throw new Error('boom'); },
      openChannelOnLightPage: () => { throw new Error('boom'); },
      renderLightChannelsLive: () => { throw new Error('boom'); },
      renderLightTodayStrip: () => { throw new Error('boom'); },
    });
    rebuildSunSidebarRuntime();
    navigateSunRuntime('dashboard');
    renderLightChannelsLiveRuntime();
    openSunChannelOnLightPageRuntime('circadian');
    assert('runtime hook failures use safe fallbacks',
      getSunDeviceSessionsRuntime().length === 0 &&
      renderLightTodayStripRuntime() === '' &&
      isSunDebugRuntime() === false);

    setRuntimeValue('navigator', {});
    assert('missing geolocation reports unavailable',
      hasSunGeolocationRuntime() === false);
    let rejected = false;
    try {
      await requestSunGeolocationPositionRuntime({ timeout: 1 });
    } catch {
      rejected = true;
    }
    assert('missing geolocation request rejects cleanly',
      rejected === true);

    delete (globalThis as { window?: unknown }).window;
    configureSunRuntimeDeps({
      buildSidebar: null,
      isDebugMode: null,
      navigate: null,
      openChannelOnLightPage: null,
      renderLightChannelsLive: null,
      renderLightTodayStrip: null,
    });
    const beforeNoWindowCalls = calls.length;
    rebuildSunSidebarRuntime();
    navigateSunRuntime('light');
    renderLightChannelsLiveRuntime();
    openSunChannelOnLightPageRuntime('no_cv');
    assert('runtime adapter no-ops safely when window is missing',
      hasSunBrowserRuntime() === false &&
      getSunDeviceSessionsRuntime().length === 0 &&
      renderLightTodayStripRuntime() === '' &&
      calls.length === beforeNoWindowCalls);
  } finally {
    state.importedData = savedImportedData;
    configureSunRuntimeDeps(originalSunRuntimeDeps);
    restoreRuntime();
  }

  const savedWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');

  try {
    delete (globalThis as { window?: unknown }).window;
    const probeUrl = '../js/sun-runtime.js?no-window-probe';
    await import(probeUrl);
    assert('sun runtime imports without a browser window', true);
  } catch (error) {
    assert('sun runtime imports without a browser window', false, (error as Error | null | undefined)?.message || String(error));
  } finally {
    if (savedWindow) Object.defineProperty(globalThis, 'window', savedWindow);
    else delete (globalThis as { window?: unknown }).window;
  }

  console.log(`\nResults: ${legacyAssertions.pass} passed, ${legacyAssertions.fail} failed, ${legacyAssertions.pass + legacyAssertions.fail} total`);

  expect(legacyAssertions.fail).toBe(0);
});
