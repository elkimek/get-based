#!/usr/bin/env node
// test-sun-runtime.js - Sun session browser adapter behavior.

import './_node-shim.js';
import { state } from '../js/state.js';
import {
  addSunProfileSwitchListener,
  configureSunRuntimeDeps,
  exposeSunRuntimeBindings,
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

const originalSunRuntimeDeps = configureSunRuntimeDeps();

let pass = 0, fail = 0;
function assert(name, condition, detail) {
  if (condition) { pass++; console.log(`  PASS: ${name}`); }
  else { fail++; console.log(`  FAIL: ${name}${detail ? ' - ' + detail : ''}`); }
}

console.log('=== Sun Runtime Tests ===\n');

const runtimeKeys = [
  'window',
  'navigator',
  'buildSidebar',
  'navigate',
  'renderLightChannelsLive',
  'renderLightTodayStrip',
  '_openChannelOnLightPage',
  'addEventListener',
  'isDebugMode',
  'sunRuntimeProbe',
];
const savedDescriptors = new Map(runtimeKeys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
const savedImportedData = state.importedData;

function setRuntimeValue(key, value) {
  Object.defineProperty(globalThis, key, {
    configurable: true,
    writable: true,
    enumerable: true,
    value,
  });
}

function restoreRuntime() {
  for (const key of runtimeKeys) {
    const descriptor = savedDescriptors.get(key);
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  }
}

try {
  const calls = [];
  const deviceSessions = [{ id: 'device-1', doses: { vitamin_d: 12 } }];
  state.importedData = { deviceSessions };
  setRuntimeValue('buildSidebar', () => calls.push(['sidebar']));
  setRuntimeValue('navigate', (view, options) => calls.push(['navigate', view, options?.scrollAnchor]));
  setRuntimeValue('renderLightChannelsLive', () => calls.push(['channels-live']));
  setRuntimeValue('renderLightTodayStrip', () => '<section>today</section>');
  setRuntimeValue('_openChannelOnLightPage', channel => calls.push(['channel', channel]));
  const profileListener = () => calls.push(['profile-switch']);
  setRuntimeValue('addEventListener', (type, listener) => calls.push(['listener', type, listener]));
  configureSunRuntimeDeps({ isDebugMode: () => true });

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
  assert('sun runtime UI hooks delegate to browser globals',
    calls.some(call => call[0] === 'sidebar') &&
    calls.some(call => call[0] === 'navigate' && call[1] === 'light' && call[2] === 'light-session-log') &&
    calls.some(call => call[0] === 'channels-live') &&
    calls.some(call => call[0] === 'channel' && call[1] === 'vitamin_d') &&
    calls.some(call => call[0] === 'listener' && call[1] === 'labcharts-profile-switched' && call[2] === profileListener));

  let capturedOptions = null;
  const position = { coords: { latitude: 50.08, longitude: 14.42, altitude: null } };
  setRuntimeValue('navigator', {
    geolocation: {
      getCurrentPosition: (resolve, reject, options) => {
        capturedOptions = options;
        resolve(position);
      },
    },
  });
  assert('hasSunGeolocationRuntime detects geolocation provider',
    hasSunGeolocationRuntime() === true);
  const resolvedPosition = await requestSunGeolocationPositionRuntime({ timeout: 8000, maximumAge: 60000, enableHighAccuracy: true });
  assert('requestSunGeolocationPositionRuntime delegates with options',
    resolvedPosition === position && capturedOptions?.timeout === 8000 && capturedOptions?.enableHighAccuracy === true);

  const probe = () => 'ok';
  exposeSunRuntimeBindings({ sunRuntimeProbe: probe });
  assert('exposeSunRuntimeBindings publishes runtime bindings',
    globalThis.sunRuntimeProbe === probe);

  state.importedData = { deviceSessions: [] };
  setRuntimeValue('renderLightTodayStrip', () => { throw new Error('boom'); });
  setRuntimeValue('buildSidebar', () => { throw new Error('boom'); });
  setRuntimeValue('navigate', () => { throw new Error('boom'); });
  setRuntimeValue('renderLightChannelsLive', () => { throw new Error('boom'); });
  setRuntimeValue('_openChannelOnLightPage', () => { throw new Error('boom'); });
  configureSunRuntimeDeps({ isDebugMode: () => { throw new Error('boom'); } });
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

  delete globalThis.window;
  const beforeNoWindowCalls = calls.length;
  rebuildSunSidebarRuntime();
  navigateSunRuntime('light');
  renderLightChannelsLiveRuntime();
  openSunChannelOnLightPageRuntime('no_cv');
  exposeSunRuntimeBindings({ sunRuntimeProbe: null });
  assert('runtime adapter no-ops safely when window is missing',
    hasSunBrowserRuntime() === false &&
    getSunDeviceSessionsRuntime().length === 0 &&
    renderLightTodayStripRuntime() === '' &&
    calls.length === beforeNoWindowCalls &&
    globalThis.sunRuntimeProbe === probe);
} finally {
  state.importedData = savedImportedData;
  configureSunRuntimeDeps(originalSunRuntimeDeps);
  restoreRuntime();
}

const savedWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
try {
  delete globalThis.window;
  await import('../js/sun-runtime.js?no-window-probe');
  assert('sun runtime imports without a browser window', true);
} catch (error) {
  assert('sun runtime imports without a browser window', false, error?.message || String(error));
} finally {
  if (savedWindow) Object.defineProperty(globalThis, 'window', savedWindow);
  else delete globalThis.window;
}

console.log(`\nResults: ${pass} passed, ${fail} failed, ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
