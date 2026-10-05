#!/usr/bin/env node
import { createLegacyAssertions } from './helpers/legacy-assertions.js';
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
import { configureRecommendationModuleBridge } from '../js/recommendations-runtime.js';

const originalLightDevicesRuntimeDeps = configureLightDevicesRuntimeDeps();


const { assert, results: legacyAssertions } = createLegacyAssertions();

console.log('=== Light Devices Runtime Tests ===\n');

const savedView = state.currentView;

function restoreRuntime() {
  state.currentView = savedView;
}

try {
  const calls: unknown[][] = [];
  configureLightDevicesRuntimeDeps({ navigate: (route: unknown) => calls.push(['navigate', route]) });
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

  let promptArgs: unknown[] | null = null;
  configureLightDevicesRuntimeDeps({ showPromptDialog: async (...args: unknown[]) => {
    promptArgs = args;
    return '17';
  } });
  const raw = await promptLightDeviceSessionDuration(12);
  assert('promptLightDeviceSessionDuration delegates with duration defaults',
    raw === '17' &&
    promptArgs?.[0] === 'New duration (in minutes)' &&
    (promptArgs?.[1] as {defaultValue?: unknown; okLabel?: unknown} | null | undefined)?.defaultValue === '12' &&
    (promptArgs?.[1] as {okLabel?: unknown} | null | undefined)?.okLabel === 'Save');
  configureLightDevicesRuntimeDeps({ showPromptDialog: null });
  assert('promptLightDeviceSessionDuration returns undefined when prompt hook is missing',
    await promptLightDeviceSessionDuration(3) === undefined);

  configureLightDevicesRuntimeDeps({
    channelTier: (value: number, key: unknown) => key === 'pbm_red' && value > 0 ? 3 : 0,
    tierLabel: (tier: unknown) => tier === 3 ? 'high' : 'none',
    formatChannelUnit: (key: unknown, value: number) => `${Math.round(value)} ${key}`,
  });
  const helpers = getLightDeviceChannelHelpers();
  assert('getLightDeviceChannelHelpers reads configured module helpers',
    (helpers.channelTier as (value: unknown, key: unknown) => unknown)(1, 'pbm_red') === 3 &&
    (helpers.tierLabel as (tier: unknown) => unknown)(3) === 'high' &&
    (helpers.formatChannelUnit as (key: unknown, value: unknown) => unknown)('pbm_red', 4.4) === '4 pbm_red');
  configureLightDevicesRuntimeDeps({ channelTier: null, tierLabel: null, formatChannelUnit: null });
  const fallbackHelpers = getLightDeviceChannelHelpers();
  assert('getLightDeviceChannelHelpers provides safe fallbacks',
    (fallbackHelpers.channelTier as (value: unknown, key: unknown) => unknown)(99, 'pbm_red') === 0 &&
    (fallbackHelpers.tierLabel as (tier: unknown) => unknown)(4) === 'none' &&
    (fallbackHelpers.formatChannelUnit as (key: unknown, value: unknown) => unknown)('pbm_red', 5) === '');

  const fallbackDisplay = { pbm_red: { label: 'Fallback Red' } };
  configureLightDevicesRuntimeDeps({ channelDisplay: null });
  assert('getLightDeviceChannelDisplay falls back to imported display',
    (getLightDeviceChannelDisplay(fallbackDisplay) as {pbm_red: {label?: unknown}}).pbm_red.label === 'Fallback Red');
  configureLightDevicesRuntimeDeps({ channelDisplay: { circadian: { label: 'Module Clock' } } });
  assert('getLightDeviceChannelDisplay prefers configured module display',
    (getLightDeviceChannelDisplay(fallbackDisplay) as {circadian: {label?: unknown}}).circadian.label === 'Module Clock');

  const previousRecommendationBridge = configureRecommendationModuleBridge({
    loadCatalog: async () => ({ slots: { light: true } }),
    renderLightDeviceAffiliateRow: (_catalog: unknown, slug: unknown) => `<a>${slug}</a>`,
  });
  assert('loadLightDevicesCatalog delegates to module loadCatalog',
    (await loadLightDevicesCatalog() as {slots: {light?: unknown}}).slots.light === true);
  configureRecommendationModuleBridge({ loadCatalog: null });
  assert('loadLightDevicesCatalog returns undefined when hook is missing',
    await loadLightDevicesCatalog() === undefined);

  assert('renderLightDeviceAffiliateRowRuntime delegates affiliate row rendering',
    renderLightDeviceAffiliateRowRuntime({}, 'panel-x') === '<a>panel-x</a>');
  configureRecommendationModuleBridge({ renderLightDeviceAffiliateRow: null });
  assert('renderLightDeviceAffiliateRowRuntime returns empty string when hook is missing',
    renderLightDeviceAffiliateRowRuntime({}, 'panel-x') === '');
  configureRecommendationModuleBridge(previousRecommendationBridge);

  configureLightDevicesRuntimeDeps({
    openChannelOnLightPage: (channel: unknown) => calls.push(['open-channel', channel]),
  });
  openLightDeviceChannel('vitamin_d');
  assert('openLightDeviceChannel delegates to the current view binding',
    calls.some(call => call[0] === 'open-channel' && call[1] === 'vitamin_d'));

  configureLightDevicesRuntimeDeps({ navigate: null, openChannelOnLightPage: null });
  const callCountBeforeMissingCallbacks = calls.length;
  navigateLightDevicesRoute('dashboard');
  openLightDeviceChannel('circadian');
  assert('Light Devices view callbacks no-op safely before shell wiring',
    calls.length === callCountBeforeMissingCallbacks);
} finally {
  configureRecommendationModuleBridge({
    loadCatalog: null,
    renderLightDeviceAffiliateRow: null,
  });
  configureLightDevicesRuntimeDeps(originalLightDevicesRuntimeDeps);
  restoreRuntime();
}

console.log(`\nResults: ${legacyAssertions.pass} passed, ${legacyAssertions.fail} failed, ${legacyAssertions.pass + legacyAssertions.fail} total`);
process.exit(legacyAssertions.fail > 0 ? 1 : 0);
