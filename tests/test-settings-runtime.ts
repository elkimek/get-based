#!/usr/bin/env node
import { createLegacyAssertions } from './helpers/legacy-assertions.js';
// test-settings-runtime.js — Settings runtime adapter behavior.

import {
  configureSettingsRuntimeDeps,
  getSettingsMeteoConfig,
  saveSettingsMeteoConfig,
} from '../js/settings-runtime.js';
import {
  configureSettingsModuleBridge,
  getSettingsModuleFunction,
} from '../js/settings-runtime-bridge.js';




const { assert, results: legacyAssertions } = createLegacyAssertions(" -- ");

console.log('=== Settings Runtime Adapters ===');

const originalSettingsRuntimeDeps = configureSettingsRuntimeDeps({
  getMeteoConfig: null,
  saveMeteoConfig: null,
});

try {
  const previousSettingsBridge = configureSettingsModuleBridge({ settingsProbe: () => 'ok' });
  assert('settings module bridge registers callbacks without browser globals',
    getSettingsModuleFunction('settingsProbe')?.() === 'ok'
      && !('settingsProbe' in globalThis));
  configureSettingsModuleBridge(previousSettingsBridge);
  assert('settings module bridge snapshots remove newly added callbacks on restore',
    getSettingsModuleFunction('settingsProbe') === null);

  assert('missing getMeteoConfig returns defaults',
    (getSettingsMeteoConfig() as {mode?: unknown; privacyRounding?: unknown}).mode === 'auto');
  assert('missing saveMeteoConfig reports unavailable',
    await saveSettingsMeteoConfig({ mode: 'open-meteo' }) === false);

  configureSettingsRuntimeDeps({
    getMeteoConfig: () => ({ mode: 'open-meteo', privacyRounding: 0 }),
  });
  assert('runtime getMeteoConfig is delegated',
    (getSettingsMeteoConfig() as {mode?: unknown; privacyRounding?: unknown}).mode === 'open-meteo' &&
      (getSettingsMeteoConfig() as {mode?: unknown; privacyRounding?: unknown}).privacyRounding === 0);

  configureSettingsRuntimeDeps({
    getMeteoConfig: () => {
      throw new Error('read failed');
    },
  });
  assert('thrown getMeteoConfig returns defaults',
    (getSettingsMeteoConfig() as {mode?: unknown; privacyRounding?: unknown}).mode === 'auto');

  let savedConfig: unknown = null;
  configureSettingsRuntimeDeps({
    saveMeteoConfig: (config: unknown) => {
      savedConfig = config;
    },
  });
  assert('runtime saveMeteoConfig reports success',
    await saveSettingsMeteoConfig({ mode: 'selfhost' }) === true &&
      (savedConfig as {mode?: unknown} | null | undefined)?.mode === 'selfhost');

  configureSettingsRuntimeDeps({
    saveMeteoConfig: async () => false,
  });
  assert('async saveMeteoConfig failures report unavailable',
    await saveSettingsMeteoConfig({ mode: 'selfhost' }) === false);

  configureSettingsRuntimeDeps({
    saveMeteoConfig: () => {
      throw new Error('write failed');
    },
  });
  assert('thrown saveMeteoConfig reports unavailable',
    await saveSettingsMeteoConfig({ mode: 'open-meteo' }) === false);
} finally {
  configureSettingsRuntimeDeps(originalSettingsRuntimeDeps);
}

console.log(`\nResults: ${legacyAssertions.pass} passed, ${legacyAssertions.fail} failed, ${legacyAssertions.pass + legacyAssertions.fail} total`);
if (legacyAssertions.fail > 0) process.exit(1);
