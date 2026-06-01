#!/usr/bin/env node
// Settings delegated-action source guards.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'js/settings.js'), 'utf8');

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

function matchBlock(label, pattern) {
  const m = src.match(pattern);
  assert(`${label} block found`, !!m);
  return m ? m[0] : '';
}

console.log('=== Settings Delegated Actions ===');

const displayBlock = matchBlock('Display tab', /<!-- Display Tab -->[\s\S]*?<!-- AI Tab -->/);
const tweaksBlock = matchBlock('Tweaks panel', /export function openTweaksPanel\(\) \{[\s\S]*?\n}\n\napplyAccentOverride/);
const renderThemeButtonBlock = matchBlock('renderThemeButton', /function renderThemeButton[\s\S]*?\n}\n\nfunction getAccentOverride/);

const inlineHandlerRe = /\bon(?:click|change|input|submit|keydown|keyup)=/;

assert('Display tab has no inline event attributes',
  displayBlock && !inlineHandlerRe.test(displayBlock));
assert('Tweaks panel has no inline event attributes',
  tweaksBlock && !inlineHandlerRe.test(tweaksBlock));
assert('Theme button renderer has no inline event attributes',
  renderThemeButtonBlock && !inlineHandlerRe.test(renderThemeButtonBlock));

assert('Settings modal installs delegated click listener',
  /modal\.addEventListener\('click', handleSettingsClick\)/.test(src));
assert('Settings modal installs delegated change listener',
  /modal\.addEventListener\('change', handleSettingsChange\)/.test(src));
assert('Tweaks panel installs delegated click listener',
  /overlay\.addEventListener\('click', handleTweaksClick\)/.test(src));
assert('Tweaks panel installs delegated change listener',
  /overlay\.addEventListener\('change', handleTweaksChange\)/.test(src));

[
  'switch-unit',
  'toggle-alt-units',
  'switch-range',
  'set-time-format',
  'open-tweaks',
  'set-product-recs',
  'set-debug-mode',
  'start-guided-tour',
  'open-changelog',
].forEach(action => {
  assert(`Display action ${action} is rendered`, src.includes(`data-settings-action="${action}"`));
});

[
  'select-theme',
  'select-accent',
  'toggle-sunset',
  'toggle-crt',
  'reset-dashboard',
  'clear-dashboard',
  'organize-dashboard',
  'send-feedback',
].forEach(action => {
  assert(`Tweaks action ${action} is rendered`, src.includes(`data-tweaks-action="${action}"`));
});

assert('Settings tabs use data-settings-tab',
  /class="settings-tab-btn[\s\S]*data-settings-tab="display"/.test(src)
    && /class="settings-tab-btn[\s\S]*data-settings-tab="agent"/.test(src));
assert('Delegated settings handler switches tabs',
  /closestWithin\(event, '\[data-settings-tab\]', modal\)[\s\S]*switchSettingsTab/.test(src));
assert('Delegated tweaks handler closes on backdrop click',
  /event\.target === overlay[\s\S]*closeTweaksPanel\(\)/.test(src));

console.log(`\nResults: ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) process.exit(1);
