#!/usr/bin/env node
import { readRepositorySource, readAuthoredRepositorySource } from './helpers/repository-source.js';
import { createLegacyAssertions } from './helpers/legacy-assertions.js';
// Settings delegated-action source guards.

const appShellHooksSrc = readRepositorySource('js/app-shell-hooks.js', 'utf8');
const appAIInteractionSrc = readRepositorySource('js/app-ai-interaction-modules.js', 'utf8');
const chatOnboardingHostSrc = readRepositorySource('js/chat-onboarding-host-bindings.js', 'utf8');
const lightPageUIHooksSrc = readRepositorySource('js/light-page-view-ui-hooks.js', 'utf8');
const loaderSrc = readRepositorySource('js/settings-loader.js', 'utf8');
const settingsStylesSrc = readRepositorySource('js/settings-styles.js', 'utf8');
const src = readRepositorySource('js/settings.js', 'utf8');
const aiComponentSrc = readRepositorySource('js/components/AiSettings.svelte', 'utf8');
const providerBridgeSrc = readAuthoredRepositorySource('js/settings-provider-bridge.js', 'utf8');
const displayAdapterSrc = readAuthoredRepositorySource('js/settings-display-panel.js', 'utf8');
const shellSrc = readRepositorySource('js/components/SettingsShell.svelte', 'utf8');
const shellContractSrc = readAuthoredRepositorySource('js/settings-shell-contract.js', 'utf8');
const displaySrc = readRepositorySource('js/components/DisplaySettings.svelte', 'utf8');
const eventTargetSrc = readRepositorySource('js/settings-event-target.js', 'utf8');
const privacyComponentSrc = readRepositorySource('js/components/PrivacySettings.svelte', 'utf8');
const toggleComponentSrc = readRepositorySource('js/components/SettingsToggle.svelte', 'utf8');
const privacySrc = readRepositorySource('js/settings-privacy.js', 'utf8');
const sunComponentSrc = readRepositorySource('js/components/SunDataSourcePresentation.svelte', 'utf8');
const sunOptionSrc = readRepositorySource('js/components/SunModeOption.svelte', 'utf8');
const sunRendererSrc = readAuthoredRepositorySource('js/sun-data-source-rendering.js', 'utf8');
const settingsDataSrc = [readRepositorySource('js/settings-data.js', 'utf8'), readRepositorySource('js/components/DataEntriesSettings.svelte', 'utf8'), readRepositorySource('js/components/AIUsageSettings.svelte', 'utf8')].join('\n');
const voiceSrc = readRepositorySource('js/settings-voice-panel.js', 'utf8');
const voiceComponentSrc = readRepositorySource('js/components/VoiceSettings.svelte', 'utf8');
const voiceViewSrc = readRepositorySource('js/settings-voice-view.js', 'utf8');
const tweaksSrc = readAuthoredRepositorySource('js/settings-tweaks.js', 'utf8');
const tweaksComponentSrc = readRepositorySource('js/components/TweaksPresentation.svelte', 'utf8');
const tweaksRendererSrc = readAuthoredRepositorySource('js/tweaks-rendering.js', 'utf8');
const appShellCss = readRepositorySource('css/app-shell.css', 'utf8');
const settingsCss = readRepositorySource('css/settings.css', 'utf8');
const settingsSurfaceSrc = `${src}\n${displaySrc}\n${eventTargetSrc}\n${privacySrc}\n${privacyComponentSrc}\n${toggleComponentSrc}\n${settingsDataSrc}\n${voiceSrc}\n${voiceComponentSrc}\n${tweaksSrc}\n${tweaksComponentSrc}`;

const { assert, results: legacyAssertions } = createLegacyAssertions(" -- ");

function matchBlock(label: string, pattern: RegExp, source = src) {
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
  loaderSrc.includes("from './settings-styles.js'")
    && loaderSrc.includes('loadSettingsStylesheet()')
    && settingsStylesSrc.includes("new URL('../css/settings.css', import.meta.url)")
    && settingsStylesSrc.includes('data-settings-stylesheet-anchor')
    && settingsStylesSrc.includes('lazy-retry'));
assert('Settings shell control styling remains in the eager shell bundle',
  appShellCss.includes('.settings-btn:hover')
    && !settingsCss.includes('.settings-btn:hover'));
assert('Light page owns only the Sun data-source Settings leaf',
  !lightPageUIHooksSrc.includes("from './settings-privacy.js'")
    && readRepositorySource('js/light-page-view-hooks.js', 'utf8')
      .includes("from './settings-privacy.js'"));

const displayBlock = displaySrc;
assert('Svelte Display ownership brackets Settings shell replacement',
  src.indexOf('disposeDisplaySettingsPanel();') < src.indexOf('mountSettingsShell(modal,')
    && src.indexOf('mountSettingsShell(modal,') < src.indexOf('mountDisplaySettingsPanel();')
    && displayAdapterSrc.includes('DisplaySettings.svelte.native.js'));

const tweaksBlock = matchBlock(
  'Tweaks panel',
  /export function openTweaksPanel\(\) \{[\s\S]*?\n\}/,
  tweaksSrc,
);
const renderThemeButtonBlock = matchBlock(
  'Authored Tweaks theme button',
  /<button type="button"[^>]*data-tweaks-action="select-theme">[\s\S]*?<\/button>/,
  tweaksComponentSrc,
);

// Keep every native inline-handler form forbidden; Svelte expressions compile to listeners.
const inlineHandlerRe = /\bon(?:click|change|input|submit|keydown|keyup)\s*=/;
const quotedSvelteHandlerRe = /\bon(?:click|change|input|submit|keydown|keyup)\s*=\s*["']/;
const nativeSettingsSurfaceSrc = [src, eventTargetSrc, privacySrc, voiceSrc, tweaksSrc].join('\n');
const tweaksLifecycleOpenRe = /openModalOverlay\s*\(\s*overlay\s*,\s*\{[\s\S]*initialFocus:\s*['"]#tweaks-panel button['"][\s\S]*focusDelay:\s*0[\s\S]*scrollLock:\s*settingsMediaMatches\(['"]\(max-width: 768px\)['"]\)[\s\S]*\}\s*\)/;

assert('settings.js has no inline event attributes',
  !inlineHandlerRe.test(nativeSettingsSurfaceSrc)
    && !quotedSvelteHandlerRe.test(settingsSurfaceSrc));
assert('Voice settings use delegated actions with linked and advanced providers',
  shellContractSrc.includes("id: 'voice'") && shellSrc.includes('data-settings-tab={tab.id}')
    && voiceComponentSrc.includes('data-voice-shared-provider')
    && voiceViewSrc.includes("setting: 'inputProvider'") && voiceComponentSrc.includes('data-voice-setting={field.setting}')
    && voiceViewSrc.includes("setting: 'outputProvider'")
    && voiceSrc.includes("panel.addEventListener('click'"));
assert('Display tab has no inline event attributes',
  displayBlock && !inlineHandlerRe.test(displayBlock));
assert('Tweaks panel has no inline event attributes',
  tweaksBlock && !inlineHandlerRe.test(tweaksBlock));
assert('Theme button renderer has no inline event attributes',
  renderThemeButtonBlock && !inlineHandlerRe.test(renderThemeButtonBlock));
assert('Tweaks authored presentation keeps the synchronous public renderer boundary',
  tweaksSrc.includes("from './tweaks-rendering.js'")
    && tweaksSrc.includes('renderTweaksPanel({')
    && tweaksRendererSrc.includes("from './components/TweaksPresentation.svelte.html.js'")
    && !tweaksSrc.includes('function renderThemeButton')
    && !inlineHandlerRe.test(tweaksComponentSrc)
    && !tweaksComponentSrc.includes('{@html'));

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
  assert(`Display action ${action} is rendered`,
    action === 'set-product-recs' || action === 'set-debug-mode'
      ? displaySrc.includes(`action="${action}"`) && toggleComponentSrc.includes('data-settings-action={action}')
      : displaySrc.includes(`data-settings-action="${action}"`));
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
  assert(`Settings action ${action} is rendered`, (settingsSurfaceSrc.includes(`data-settings-action="${action}"`) || (action === 'switch-ai-provider' && aiComponentSrc.includes("data-settings-action={choice.id === 'cli' ? 'show-cli-agent-provider' : 'switch-ai-provider'}")) || ((privacyComponentSrc.includes(`action="${action}"`) || aiComponentSrc.includes(`action="${action}"`)) && toggleComponentSrc.includes('data-settings-action={action}'))));
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
  assert(`Tweaks action ${action} is rendered`, tweaksComponentSrc.includes(`data-tweaks-action="${action}"`));
});

[
  'set-meteo-mode',
  'save-meteo-selfhost',
  'toggle-meteo-rounding',
].forEach(action => {
  assert(`Sun data-source action ${action} is rendered`,
    (action === 'set-meteo-mode' ? sunOptionSrc : sunComponentSrc).includes(`data-sun-source-action="${action}"`));
});

assert('Sun public controller renders the authored component through its synchronous facade',
  privacySrc.includes("from './sun-data-source-rendering.js'")
    && privacySrc.includes('return renderSunDataSource(getSunDataSourceSettingsView());') && privacySrc.includes('export function getSunDataSourceSettingsView')
    && sunRendererSrc.includes("from './components/SunDataSourcePresentation.svelte.html.js'"));
assert('Sun mode controls belong to the authored internal option child',
  sunComponentSrc.includes("import SunModeOption from './SunModeOption.svelte'")
    && [0, 1, 2].every(index => sunComponentSrc.includes(`<SunModeOption view={view.options[${index}]} />`)));

assert('Settings tabs use data-settings-tab',
  shellSrc.includes('data-settings-tab={tab.id}') && shellSrc.includes('{#each SETTINGS_TABS as tab')
    && shellContractSrc.includes("id: 'display'") && shellContractSrc.includes("id: 'agent'"));
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
  displayAdapterSrc.includes("import { getAppVersionRuntime } from './utils-runtime.js';")
    && displayAdapterSrc.includes('version: getAppVersionRuntime()')
    && displaySrc.includes('{preferences.version}')
    && !displayAdapterSrc.includes('settingsWindow.APP_VERSION'));
assert('Owned AI settings switch providers through the guarded bridge',
  aiComponentSrc.includes('actions.select(choice.id,event.currentTarget)')
    && /if \(provider === 'cli'\)\s*showCLIAgentProviderBridge\(\);\s*else\s*switchAIProviderBridge\(provider\);/.test(src)
    && providerBridgeSrc.includes('panels.switchAIProvider(provider, { previousProvider, isCurrent: owner.isCurrent })'));
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

console.log(`\nResults: ${legacyAssertions.pass} passed, ${legacyAssertions.fail} failed, ${legacyAssertions.pass + legacyAssertions.fail} total`);
if (legacyAssertions.fail > 0) process.exit(1);
