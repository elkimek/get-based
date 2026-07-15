#!/usr/bin/env node
// test-light-devices-runtime.js — Light-device browser runtime adapter behavior.

import './_node-shim.js';
import { state } from '../js/state.js';
import {
  configureLightDevicesRuntimeDeps,
  getLightDeviceChannelDisplay,
  getLightDeviceChannelHelpers,
  loadLightDevicesCatalog,
  navigateLightDevicesRoute,
  openLightDeviceChannel,
  promptLightDeviceSessionDuration,
  refreshLightDevicesView,
  renderLightDeviceAffiliateRowRuntime,
} from '../js/light-devices-runtime.js';

const originalLightDevicesRuntimeDeps = configureLightDevicesRuntimeDeps();

let pass = 0, fail = 0;
function assert(name, condition, detail) {
  if (condition) { pass++; console.log(`  PASS: ${name}`); }
  else { fail++; console.log(`  FAIL: ${name}${detail ? ' — ' + detail : ''}`); }
}

console.log('=== Light Devices Runtime Tests ===\n');

const runtimeKeys = [
  'navigate',
  'showPromptDialog',
  'channelTier',
  'tierLabel',
  'formatChannelUnit',
  'CHANNEL_DISPLAY',
  'loadCatalog',
  'renderLightDeviceAffiliateRow',
  '_openChannelOnLightPage',
];
const saved = Object.fromEntries(runtimeKeys.map(key => [key, globalThis[key]]));
const savedView = state.currentView;

function restoreRuntime() {
  for (const key of runtimeKeys) {
    if (typeof saved[key] === 'undefined') delete globalThis[key];
    else globalThis[key] = saved[key];
  }
  state.currentView = savedView;
}

try {
  const calls = [];
  globalThis.navigate = route => calls.push(['navigate', route]);
  navigateLightDevicesRoute('light');
  assert('navigateLightDevicesRoute delegates to runtime navigate',
    calls.some(call => call[0] === 'navigate' && call[1] === 'light'));

  state.currentView = 'dashboard';
  refreshLightDevicesView();
  assert('refreshLightDevicesView skips non-light view',
    calls.filter(call => call[0] === 'navigate').length === 1);
  state.currentView = 'light';
  refreshLightDevicesView();
  assert('refreshLightDevicesView refreshes current light view',
    calls.filter(call => call[0] === 'navigate' && call[1] === 'light').length === 2);

  let promptArgs = null;
  configureLightDevicesRuntimeDeps({ showPromptDialog: async (...args) => {
    promptArgs = args;
    return '17';
  } });
  const raw = await promptLightDeviceSessionDuration(12);
  assert('promptLightDeviceSessionDuration delegates with duration defaults',
    raw === '17' &&
    promptArgs?.[0] === 'New duration (in minutes)' &&
    promptArgs?.[1]?.defaultValue === '12' &&
    promptArgs?.[1]?.okLabel === 'Save');
  configureLightDevicesRuntimeDeps({ showPromptDialog: null });
  assert('promptLightDeviceSessionDuration returns undefined when prompt hook is missing',
    await promptLightDeviceSessionDuration(3) === undefined);

  globalThis.channelTier = (value, key) => key === 'pbm_red' && value > 0 ? 3 : 0;
  globalThis.tierLabel = tier => tier === 3 ? 'high' : 'none';
  globalThis.formatChannelUnit = (key, value) => `${Math.round(value)} ${key}`;
  const helpers = getLightDeviceChannelHelpers();
  assert('getLightDeviceChannelHelpers reads runtime channel helpers',
    helpers.channelTier(1, 'pbm_red') === 3 &&
    helpers.tierLabel(3) === 'high' &&
    helpers.formatChannelUnit('pbm_red', 4.4) === '4 pbm_red');
  delete globalThis.channelTier;
  delete globalThis.tierLabel;
  delete globalThis.formatChannelUnit;
  const fallbackHelpers = getLightDeviceChannelHelpers();
  assert('getLightDeviceChannelHelpers provides safe fallbacks',
    fallbackHelpers.channelTier(99, 'pbm_red') === 0 &&
    fallbackHelpers.tierLabel(4) === 'none' &&
    fallbackHelpers.formatChannelUnit('pbm_red', 5) === '');

  delete globalThis.CHANNEL_DISPLAY;
  const fallbackDisplay = { pbm_red: { label: 'Fallback Red' } };
  assert('getLightDeviceChannelDisplay falls back to imported display',
    getLightDeviceChannelDisplay(fallbackDisplay).pbm_red.label === 'Fallback Red');
  globalThis.CHANNEL_DISPLAY = { circadian: { label: 'Runtime Clock' } };
  assert('getLightDeviceChannelDisplay prefers runtime display',
    getLightDeviceChannelDisplay(fallbackDisplay).circadian.label === 'Runtime Clock');

  globalThis.loadCatalog = async () => ({ slots: { light: true } });
  assert('loadLightDevicesCatalog delegates to runtime loadCatalog',
    (await loadLightDevicesCatalog()).slots.light === true);
  delete globalThis.loadCatalog;
  assert('loadLightDevicesCatalog returns undefined when hook is missing',
    await loadLightDevicesCatalog() === undefined);

  globalThis.renderLightDeviceAffiliateRow = (_catalog, slug) => `<a>${slug}</a>`;
  assert('renderLightDeviceAffiliateRowRuntime delegates affiliate row rendering',
    renderLightDeviceAffiliateRowRuntime({}, 'panel-x') === '<a>panel-x</a>');
  delete globalThis.renderLightDeviceAffiliateRow;
  assert('renderLightDeviceAffiliateRowRuntime returns empty string when hook is missing',
    renderLightDeviceAffiliateRowRuntime({}, 'panel-x') === '');

  globalThis._openChannelOnLightPage = channel => calls.push(['open-channel', channel]);
  openLightDeviceChannel('vitamin_d');
  assert('openLightDeviceChannel delegates to the current view binding',
    calls.some(call => call[0] === 'open-channel' && call[1] === 'vitamin_d'));
} finally {
  configureLightDevicesRuntimeDeps(originalLightDevicesRuntimeDeps);
  restoreRuntime();
}

console.log(`\nResults: ${pass} passed, ${fail} failed, ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
