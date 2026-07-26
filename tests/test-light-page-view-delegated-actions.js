#!/usr/bin/env node
// Light page view delegated-action source guards.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'js/light-page-view.js'), 'utf8');
const hooksSrc = fs.readFileSync(path.join(root, 'js/light-page-view-hooks.js'), 'utf8');
const todayAiSrc = fs.readFileSync(path.join(root, 'js/light-today-ai.js'), 'utf8');
const dashboardRenderersSrc = fs.readFileSync(path.join(root, 'js/dashboard-widget-renderers.js'), 'utf8');
const dashboardCompositionSrc = fs.readFileSync(path.join(root, 'js/dashboard-view-composition.js'), 'utf8');
const globalsSrc = fs.readFileSync(path.join(root, 'types/globals.d.ts'), 'utf8');
const uiHooksSrc = fs.readFileSync(path.join(root, 'js/light-page-view-ui-hooks.js'), 'utf8');
const lightSunModulesSrc = fs.readFileSync(path.join(root, 'js/app-light-sun-modules.js'), 'utf8');
const uiShellModulesSrc = fs.readFileSync(path.join(root, 'js/app-ui-shell-modules.js'), 'utf8');
const swSrc = fs.readFileSync(path.join(root, 'service-worker.js'), 'utf8');

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
    && /renderLightTodayHero/.test(hooksSrc)
    && /renderDevicesSection/.test(hooksSrc)
    && /renderLightTools/.test(hooksSrc)
    && /renderChannelMixVerdict/.test(hooksSrc)
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
  /import \{ navigate \} from '\.\/views\.js';/.test(uiHooksSrc)
    && !/from '\.\/settings-privacy\.js'/.test(uiHooksSrc)
    && /import \{ renderSunDataSourceSettings \} from '\.\/settings-privacy\.js';/.test(hooksSrc)
    && !/from '\.\/settings\.js'/.test(uiHooksSrc)
    && /configureLightPageView\(\{[\s\S]*renderSunDataSourceSettings[\s\S]*\}\);/.test(hooksSrc));
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
    && /data-light-page-action="\$\{escapeAttr\(ctaAction\)\}"/.test(src)
    && !/function renderLightWidgetPrompt\(status, ctaLabel, ctaJs/.test(src));
assert('Dashboard channel pill action passes channel through data attribute',
  /data-light-page-action="open-channel" data-channel="\$\{escapeAttr\(k\)\}"/.test(src)
    && /lightPageDeps\.openChannelOnLightPage\(actionEl\.dataset\.channel \|\| ''\)/.test(src));

console.log(`\nResults: ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) process.exit(1);
