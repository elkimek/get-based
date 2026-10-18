#!/usr/bin/env node
import { readRepositorySource } from './helpers/repository-source.js';
import { readServiceWorkerSource } from '../scripts/service-worker-source.js';
import { createLegacyAssertions } from './helpers/legacy-assertions.js';
// Light page view delegated-action source guards.

const src = readRepositorySource('js/light-page-view.js', 'utf8');
const pillsSrc = readRepositorySource('js/components/LightDashboardPills.svelte', 'utf8');
const presentationSrc = readRepositorySource('js/components/LightWidgetPrompt.svelte', 'utf8');
const hooksSrc = readRepositorySource('js/light-page-view-hooks.js', 'utf8');
const todayAiSrc = readRepositorySource('js/light-today-ai.js', 'utf8');
const dashboardRenderersSrc = readRepositorySource('js/dashboard-widget-renderers.js', 'utf8');
const dashboardCompositionSrc = readRepositorySource('js/dashboard-view-composition.js', 'utf8');
const globalsSrc = readRepositorySource('types/globals.d.ts', 'utf8');
const uiHooksSrc = readRepositorySource('js/light-page-view-ui-hooks.js', 'utf8');
const lightSunModulesSrc = readRepositorySource('js/app-light-sun-modules.js', 'utf8');
const uiShellModulesSrc = readRepositorySource('js/app-ui-shell-modules.js', 'utf8');
const swSrc = readServiceWorkerSource(relative => readRepositorySource(relative, 'utf8'));

const { assert, results: legacyAssertions } = createLegacyAssertions(" -- ");

console.log('=== Light Page View Delegated Actions ===');

const inlineHandlerRe = /\bon(?:click|change|input|submit|keydown|keyup)=/;
const directAssignmentRe = /\.(?:onclick|onchange|oninput)\s*=/;

assert('light-page-view.js has no inline event attributes',
  !inlineHandlerRe.test(src));
assert('light-page-view.js avoids direct event property assignment',
  !directAssignmentRe.test(src));
assert('Light page view installs one click delegate per root',
  /const lightPageActionDelegateRoots = new WeakSet\(\);/.test(src)
    && /lightPageActionDelegateRoots\.has\(root\)/.test(src)
    && /lightPageActionDelegateRoots\.add\(root\)/.test(src)
    && /root\.addEventListener\('click', handleLightPageActionClick\)/.test(src)
    && /installLightPageActionDelegates\(\)/.test(src));
assert('Light page actions are scoped through closest data action lookup',
  /target\.closest\('\[data-light-page-action\]'\)/.test(src)
    && /event\.currentTarget\?\.contains\(actionEl\)/.test(src));
assert('Light page view exposes dependency configurator',
  /export function configureLightPageView\(deps = \{\}\)/.test(src)
    && /Object\.assign\(lightPageDeps, deps\)/.test(src));
assert('Light page view avoids direct window globals',
  !/window\./.test(src));
assert('Light page feature hook wires exposure dependencies without product recommendation coupling',
  /configureLightPageView\(\{/.test(hooksSrc)
    && /getLightTodayHeroView/.test(hooksSrc)
    && /renderDevicesSection/.test(hooksSrc)
    && /renderLightTools/.test(hooksSrc)
    && /getChannelMixVerdictView/.test(hooksSrc)
    && !/renderChannelDeficitDeviceRecs/.test(hooksSrc)
    && !/loadCatalog/.test(hooksSrc)
    && !/loadLightDevicePresets/.test(hooksSrc)
    && !/from '\.\/recommendations\.js'/.test(hooksSrc));
assert('Light Today AI renderers are wired without a window facade',
  todayAiSrc.includes('registerAIActionHandler')
    && !todayAiSrc.includes('Object.assign(globalThis')
    && !todayAiSrc.includes('window.renderLightTodayHero')
    && !todayAiSrc.includes('window.renderLightTodayDashboardChip')
    && !globalsSrc.includes('renderLightTodayHero')
    && !globalsSrc.includes('renderLightTodayDashboardChip')
    && dashboardRenderersSrc.includes('renderLightTodayHero = () =>')
    && dashboardRenderersSrc.includes('const hero = renderLightTodayHero();')
    && dashboardCompositionSrc.includes('renderLoadedLightTodayHero,')
    && dashboardCompositionSrc.includes('renderLightTodayHero: renderLoadedLightTodayHero,')
    && !dashboardCompositionSrc.includes("from './light-today-ai.js'"));
assert('Light page UI hook wires router and Sun settings leaf dependencies',
  /import \{ navigate \} from '\.\/views-runtime\.js';/.test(uiHooksSrc)
    && !/from '\.\/settings-privacy\.js'/.test(uiHooksSrc)
    && /import \{ installSunDataSourceDelegates, getSunDataSourceSettingsView \} from '\.\/settings-privacy\.js';/.test(hooksSrc)
    && (hooksSrc.match(/^installSunDataSourceDelegates\(\);$/gm) || []).length === 1
    && hooksSrc.indexOf('installSunDataSourceDelegates();') < hooksSrc.indexOf('configureLightPageView({')
    && !/from '\.\/settings\.js'/.test(uiHooksSrc)
    && /configureLightPageView\(\{[\s\S]*getSunDataSourceSettingsView[\s\S]*\}\);/.test(hooksSrc));
assert('Light page hooks and router wiring load behind the feature boundary',
  lightSunModulesSrc.includes("import './light-page-view-hooks.js';")
    && lightSunModulesSrc.includes('configureLightPageView({ navigate });')
    && !uiShellModulesSrc.includes("import './light-page-view-ui-hooks.js';"));
assert('Service worker caches Light page hooks',
  swSrc.includes("'/js/light-page-view-hooks.js'")
    && swSrc.includes("'/js/light-page-view-ui-hooks.js'"));

[
  'open-channel',
  'quick-log-device',
  'open-add-device',
  'quick-log-sun',
  'open-detailed-session',
  'navigate-light',
  'request-precise-location',
  'open-light-environment',
  'expand-light-tools',
].forEach(action => {
  assert(`Light page action ${action} is rendered or handled`,
    src.includes(`data-light-page-action="${action}"`) || src.includes(`action === '${action}'`));
});

assert('Light widget prompt receives action ids instead of JavaScript snippets',
  /function renderLightWidgetPrompt\(status, ctaLabel, ctaAction/.test(src)
    && presentationSrc.includes('data-light-page-action={view.action}') && src.includes("kind: 'prompt'")
    && !/function renderLightWidgetPrompt\(status, ctaLabel, ctaJs/.test(src));
assert('Dashboard channel pill action passes channel through data attribute',
  pillsSrc.includes('data-light-page-action="open-channel" data-channel={pill.key}')
    && /lightPageDeps\.openChannelOnLightPage\(actionEl\.dataset\.channel \|\| ''\)/.test(src));

console.log(`\nResults: ${legacyAssertions.pass} passed, ${legacyAssertions.fail} failed, ${legacyAssertions.pass + legacyAssertions.fail} total`);
if (legacyAssertions.fail > 0) process.exit(1);
