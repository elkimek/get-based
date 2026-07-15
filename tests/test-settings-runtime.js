#!/usr/bin/env node
// test-settings-runtime.js — Settings runtime adapter behavior.

import {
  configureSettingsRuntimeDeps,
  getSettingsMeteoConfig,
  saveSettingsMeteoConfig,
} from '../js/settings-runtime.js';

let passed = 0;
let failed = 0;

function assert(name, condition, detail = '') {
  if (condition) {
    passed++;
    console.log(`  PASS: ${name}`);
  } else {
    failed++;
    console.log(`  FAIL: ${name}${detail ? ` -- ${detail}` : ''}`);
  }
}

console.log('=== Settings Runtime Adapters ===');

const originalSettingsRuntimeDeps = configureSettingsRuntimeDeps({
  getMeteoConfig: null,
  saveMeteoConfig: null,
});

try {
  assert('missing getMeteoConfig returns defaults',
    getSettingsMeteoConfig().mode === 'auto');
  assert('missing saveMeteoConfig reports unavailable',
    saveSettingsMeteoConfig({ mode: 'manual' }) === false);

  configureSettingsRuntimeDeps({
    getMeteoConfig: () => ({ mode: 'manual', privacyRounding: 0 }),
  });
  assert('runtime getMeteoConfig is delegated',
    getSettingsMeteoConfig().mode === 'manual' &&
      getSettingsMeteoConfig().privacyRounding === 0);

  configureSettingsRuntimeDeps({
    getMeteoConfig: () => {
      throw new Error('read failed');
    },
  });
  assert('thrown getMeteoConfig returns defaults',
    getSettingsMeteoConfig().mode === 'auto');

  let savedConfig = null;
  configureSettingsRuntimeDeps({
    saveMeteoConfig: config => {
      savedConfig = config;
    },
  });
  assert('runtime saveMeteoConfig reports success',
    saveSettingsMeteoConfig({ mode: 'selfhost' }) === true &&
      savedConfig?.mode === 'selfhost');

  configureSettingsRuntimeDeps({
    saveMeteoConfig: () => {
      throw new Error('write failed');
    },
  });
  assert('thrown saveMeteoConfig reports unavailable',
    saveSettingsMeteoConfig({ mode: 'open-meteo' }) === false);
} finally {
  configureSettingsRuntimeDeps(originalSettingsRuntimeDeps);
}

console.log(`\nResults: ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) process.exit(1);
