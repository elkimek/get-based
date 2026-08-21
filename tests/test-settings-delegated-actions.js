#!/usr/bin/env node
// Settings delegated-action source guards.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const appShellHooksSrc = fs.readFileSync(path.join(root, 'js/app-shell-hooks.js'), 'utf8');
const appAIInteractionSrc = fs.readFileSync(path.join(root, 'js/app-ai-interaction-modules.js'), 'utf8');
const chatOnboardingHostSrc = fs.readFileSync(path.join(root, 'js/chat-onboarding-host-bindings.js'), 'utf8');
const lightPageUIHooksSrc = fs.readFileSync(path.join(root, 'js/light-page-view-ui-hooks.js'), 'utf8');
const loaderSrc = fs.readFileSync(path.join(root, 'js/settings-loader.js'), 'utf8');
const src = fs.readFileSync(path.join(root, 'js/settings.js'), 'utf8');
const displaySrc = fs.readFileSync(path.join(root, 'js/settings-display-panel.js'), 'utf8');
const eventTargetSrc = fs.readFileSync(path.join(root, 'js/settings-event-target.js'), 'utf8');
const privacySrc = fs.readFileSync(path.join(root, 'js/settings-privacy.js'), 'utf8');
const settingsDataSrc = fs.readFileSync(path.join(root, 'js/settings-data.js'), 'utf8');
const voiceSrc = fs.readFileSync(path.join(root, 'js/settings-voice-panel.js'), 'utf8');
const voiceViewSrc = fs.readFileSync(path.join(root, 'js/settings-voice-view.js'), 'utf8');
const tweaksSrc = fs.readFileSync(path.join(root, 'js/settings-tweaks.js'), 'utf8');
const appShellCss = fs.readFileSync(path.join(root, 'css/app-shell.css'), 'utf8');
const settingsCss = fs.readFileSync(path.join(root, 'css/settings.css'), 'utf8');
const settingsSurfaceSrc = `${src}\n${displaySrc}\n${eventTargetSrc}\n${privacySrc}\n${settingsDataSrc}\n${voiceSrc}\n${tweaksSrc}`;

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

function matchBlock(label, pattern, source = src) {
  const m = source.match(pattern);
  assert(`${label} block found`, !!m);
  return m ? m[0] : '';
}

console.log('=== Settings Delegated Actions ===');

assert('Settings is absent from the static startup graph',
  !appAIInteractionSrc.includes("import './settings.js'")
    && !appShellHooksSrc.includes("from './settings.js'")
    && !chatOnboardingHostSrc.includes("from './settings.js'")
    && !lightPageUIHooksSrc.includes("from './settings.js'"));
assert('Settings entry points use the cached lazy loader',
  appShellHooksSrc.includes("from './settings-loader.js'")
    && appShellHooksSrc.includes('configureChatLoader({')
    && appShellHooksSrc.includes('openSettingsModal,')
    && !chatOnboardingHostSrc.includes("from './settings-loader.js'")
    && loaderSrc.includes("import('./settings.js')")
    && loaderSrc.includes("import('./settings.js?lazy-retry=1')"));
assert('Settings loader owns the deferred stylesheet boundary',
  loaderSrc.includes("new URL('../css/settings.css', import.meta.url)")
    && loaderSrc.includes('data-settings-stylesheet-anchor')
    && loaderSrc.includes('lazy-retry'));
assert('Settings shell control styling remains in the eager shell bundle',
  appShellCss.includes('.settings-btn:hover')
    && !settingsCss.includes('.settings-btn:hover'));
assert('Light page owns only the Sun data-source Settings leaf',
  !lightPageUIHooksSrc.includes("from './settings-privacy.js'")
    && fs.readFileSync(path.join(root, 'js/light-page-view-hooks.js'), 'utf8')
      .includes("from './settings-privacy.js'"));

const displayBlock = matchBlock(
  'Display tab',
  /export function renderDisplaySettingsPanel[\s\S]*?\n}\n\nexport function updateDisplaySettingsPanel/,
  displaySrc,
);
const tweaksBlock = matchBlock(
  'Tweaks panel',
  /export function openTweaksPanel\(\) \{[\s\S]*?\n\}/,
  tweaksSrc,
);
const renderThemeButtonBlock = matchBlock(
  'renderThemeButton',
  /function renderThemeButton[\s\S]*?\n}\n\nfunction refreshVisualSurfaces/,
  tweaksSrc,
);

const inlineHandlerRe = /\bon(?:click|change|input|submit|keydown|keyup)=/;
const tweaksLifecycleOpenRe = /openModalOverlay\s*\(\s*overlay\s*,\s*\{[\s\S]*initialFocus:\s*['"]#tweaks-panel button['"][\s\S]*focusDelay:\s*0[\s\S]*scrollLock:\s*settingsMediaMatches\(['"]\(max-width: 768px\)['"]\)[\s\S]*\}\s*\)/;

assert('settings.js has no inline event attributes',
  !inlineHandlerRe.test(settingsSurfaceSrc));
assert('Voice settings use delegated actions with linked and advanced providers',
  src.includes('data-settings-tab="voice"')
    && voiceViewSrc.includes('data-voice-shared-provider')
    && voiceViewSrc.includes('data-voice-setting="inputProvider"')
    && voiceViewSrc.includes('data-voice-setting="outputProvider"')
    && voiceSrc.includes("panel.addEventListener('click'"));
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
  /overlay\.addEventListener\('click', handleTweaksClick\)/.test(tweaksSrc));
assert('Tweaks panel installs delegated change listener',
  /overlay\.addEventListener\('change', handleTweaksChange\)/.test(tweaksSrc));
assert('Tweaks panel uses shared overlay lifecycle helpers',
  tweaksSrc.includes("from './modal-lifecycle.js'") &&
    tweaksSrc.includes("from './settings-runtime.js'") &&
    tweaksBlock &&
    tweaksLifecycleOpenRe.test(tweaksBlock) &&
    /removeModalOverlay\(overlay\)/.test(tweaksSrc) &&
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
  assert(`Display action ${action} is rendered`, displaySrc.includes(`data-settings-action="${action}"`));
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
  assert(`Tweaks action ${action} is rendered`, tweaksSrc.includes(`data-tweaks-action="${action}"`));
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
  /closestSettingsTarget\(event, '\[data-settings-tab\]', modal\)[\s\S]*switchSettingsTab/.test(src));
assert('Delegated tweaks handler closes on backdrop click',
  /event\.target === overlay[\s\S]*closeTweaksPanel\(\)/.test(tweaksSrc));
assert('Tweaks feedback action uses configured module runtime',
  tweaksSrc.includes('settingsTweaksRuntime.openFeedbackModal()')
    && !tweaksSrc.includes('settingsWindow.openFeedbackModal'));
assert('Product recommendations toggle uses configured navigation',
  src.includes("settingsRuntime.navigate('dashboard')")
    && !src.includes("from './views-runtime-bridge.js'")
    && /navigate,\s*openFeedbackModal,/.test(appShellHooksSrc));
assert('Settings version label uses the shared runtime adapter',
  displaySrc.includes("import { getAppVersionRuntime } from './utils-runtime.js';")
    && displaySrc.includes('escapeHTML(getAppVersionRuntime())')
    && !displaySrc.includes('settingsWindow.APP_VERSION'));
assert('Delegated settings handler switches AI providers',
  /action === 'switch-ai-provider'[\s\S]*switchAIProviderBridge\(actionEl\.dataset\.provider/.test(src));
assert('Delegated settings handler updates PII model selection',
  /action === 'set-pii-model'[\s\S]*isPIIEligibleModel\(model\)[\s\S]*setOllamaPIIModel\(model\)/.test(src));
assert('Sun data-source delegate is installed on document change',
  /document\.addEventListener\('change', handleSunDataSourceChange\)/.test(privacySrc));
assert('Sun data-source delegate is scoped to its section',
  /function closestSunDataSourceControl[\s\S]*closest\('#sun-data-source-section'\)/.test(privacySrc));
assert('Sun data-source save handlers surface unavailable runtime saves',
  /function notifyMeteoSaveUnavailable\(\)[\s\S]*could not be saved securely/.test(privacySrc) &&
    /async function setMeteoMode\(mode\)[\s\S]*if \(!await saveSettingsMeteoConfig\(cfg\)\) \{[\s\S]*notifyMeteoSaveUnavailable\(\);[\s\S]*return;[\s\S]*\}/.test(privacySrc) &&
    /async function saveMeteoSelfhost\(\)[\s\S]*if \(!await saveSettingsMeteoConfig\(cfg\)\) \{[\s\S]*notifyMeteoSaveUnavailable\(\);[\s\S]*\}/.test(privacySrc) &&
    /async function toggleMeteoRounding\(enabled\)[\s\S]*if \(!await saveSettingsMeteoConfig\(cfg\)\) \{[\s\S]*notifyMeteoSaveUnavailable\(\);[\s\S]*\}/.test(privacySrc));
assert('Legacy Sun data-source window handlers are removed',
  !src.includes('window._setMeteoMode')
    && !src.includes('window._saveMeteoSelfhost')
    && !src.includes('window._toggleMeteoRounding')
    && !privacySrc.includes('window._setMeteoMode')
    && !privacySrc.includes('window._saveMeteoSelfhost')
    && !privacySrc.includes('window._toggleMeteoRounding'));

console.log(`\nResults: ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) process.exit(1);
