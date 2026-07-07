#!/usr/bin/env node
// Settings delegated-action source guards.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'js/settings.js'), 'utf8');
const privacySrc = fs.readFileSync(path.join(root, 'js/settings-privacy.js'), 'utf8');
const settingsDataSrc = fs.readFileSync(path.join(root, 'js/settings-data.js'), 'utf8');
const settingsSurfaceSrc = `${src}\n${privacySrc}\n${settingsDataSrc}`;

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
const tweaksLifecycleOpenRe = /openModalOverlay\s*\(\s*overlay\s*,\s*\{[\s\S]*initialFocus:\s*['"]#tweaks-panel button['"][\s\S]*focusDelay:\s*0[\s\S]*scrollLock:\s*settingsMediaMatches\(['"]\(max-width: 768px\)['"]\)[\s\S]*\}\s*\)/;

assert('settings.js has no inline event attributes',
  !inlineHandlerRe.test(src));
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
assert('Tweaks panel uses shared overlay lifecycle helpers',
  src.includes("from './modal-lifecycle.js'") &&
    src.includes("from './settings-runtime.js'") &&
    tweaksBlock &&
    tweaksLifecycleOpenRe.test(tweaksBlock) &&
    /removeModalOverlay\(overlay\)/.test(src) &&
    !tweaksBlock.includes('document.body.style.overflow'));

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
  'toggle-ai-pause',
  'switch-ai-provider',
  'toggle-privacy-configure',
  'test-pii-ollama',
  'set-pii-model',
  'toggle-pii-local',
  'toggle-pii-review',
  'set-analytics',
  'rename-imported-entry',
  'remove-imported-entry',
  'share-profile',
  'export-client',
  'export-all-clients',
  'clear-all-data',
  'reset-profile-usage',
].forEach(action => {
  assert(`Settings action ${action} is rendered`, settingsSurfaceSrc.includes(`data-settings-action="${action}"`));
});

assert('Settings AI no longer owns context source toggles',
  !settingsSurfaceSrc.includes('id="ai-context-section"') &&
    !settingsSurfaceSrc.includes('data-settings-action="set-wearable-context"') &&
    !settingsSurfaceSrc.includes('data-settings-action="set-body-regions-context"'));

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

[
  'set-meteo-mode',
  'save-meteo-selfhost',
  'toggle-meteo-rounding',
].forEach(action => {
  assert(`Sun data-source action ${action} is rendered`, privacySrc.includes(`data-sun-source-action="${action}"`));
});

assert('Settings tabs use data-settings-tab',
  /class="settings-tab-btn[\s\S]*data-settings-tab="display"/.test(src)
    && /class="settings-tab-btn[\s\S]*data-settings-tab="agent"/.test(src));
assert('Delegated settings handler switches tabs',
  /closestWithin\(event, '\[data-settings-tab\]', modal\)[\s\S]*switchSettingsTab/.test(src));
assert('Delegated tweaks handler closes on backdrop click',
  /event\.target === overlay[\s\S]*closeTweaksPanel\(\)/.test(src));
assert('Delegated settings handler switches AI providers',
  /action === 'switch-ai-provider'[\s\S]*switchAIProviderBridge\(actionEl\.dataset\.provider/.test(src));
assert('Delegated settings handler updates PII model selection',
  /action === 'set-pii-model'[\s\S]*setOllamaPIIModel\(actionEl instanceof HTMLSelectElement \? actionEl\.value : ''\)/.test(src));
assert('Sun data-source delegate is installed on document change',
  /document\.addEventListener\('change', handleSunDataSourceChange\)/.test(privacySrc));
assert('Sun data-source delegate is scoped to its section',
  /function closestSunDataSourceControl[\s\S]*closest\('#sun-data-source-section'\)/.test(privacySrc));
assert('Sun data-source save handlers surface unavailable runtime saves',
  /function notifyMeteoSaveUnavailable\(\)[\s\S]*Sun data-source settings are still loading/.test(privacySrc) &&
    /function setMeteoMode\(mode\)[\s\S]*if \(!saveSettingsMeteoConfig\(cfg\)\) \{[\s\S]*notifyMeteoSaveUnavailable\(\);[\s\S]*return;[\s\S]*\}/.test(privacySrc) &&
    /function saveMeteoSelfhost\(\)[\s\S]*if \(!saveSettingsMeteoConfig\(cfg\)\) \{[\s\S]*notifyMeteoSaveUnavailable\(\);[\s\S]*\}/.test(privacySrc) &&
    /function toggleMeteoRounding\(enabled\)[\s\S]*if \(!saveSettingsMeteoConfig\(cfg\)\) \{[\s\S]*notifyMeteoSaveUnavailable\(\);[\s\S]*\}/.test(privacySrc));
assert('Legacy Sun data-source window handlers are removed',
  !src.includes('window._setMeteoMode')
    && !src.includes('window._saveMeteoSelfhost')
    && !src.includes('window._toggleMeteoRounding')
    && !privacySrc.includes('window._setMeteoMode')
    && !privacySrc.includes('window._saveMeteoSelfhost')
    && !privacySrc.includes('window._toggleMeteoRounding'));

console.log(`\nResults: ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) process.exit(1);
