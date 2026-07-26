#!/usr/bin/env node
// Light channel view delegated-action and dependency wiring guards.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'js/light-channel-view.js'), 'utf8');
const hooksSrc = fs.readFileSync(path.join(root, 'js/light-channel-view-hooks.js'), 'utf8');
const uiHooksSrc = fs.readFileSync(path.join(root, 'js/light-channel-view-ui-hooks.js'), 'utf8');
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

console.log('=== Light Channel View Delegated Actions ===');

const inlineHandlerRe = /\bon(?:click|change|input|submit|keydown|keyup)=/;
const directAssignmentRe = /\.(?:onclick|onchange|oninput)\s*=/;

assert('light-channel-view.js has no inline event attributes',
  !inlineHandlerRe.test(src));
assert('light-channel-view.js avoids direct event property assignment',
  !directAssignmentRe.test(src));
assert('Light channel view exposes dependency configurator',
  /export function configureLightChannelView\(deps = \{\}\)/.test(src)
    && /Object\.assign\(lightChannelDeps, deps\)/.test(src));
assert('Light channel view avoids direct window globals',
  !/window\./.test(src));
assert('Light channel actions stay delegated through data attributes',
  /lightChannelActionDelegateRoots = new WeakSet\(\);/.test(src)
    && /root\.addEventListener\('click', handleLightChannelActionClick\)/.test(src)
    && /data-light-channel-action="toggle-detail"/.test(src)
    && /data-light-channel-action="quick-log-sun"/.test(src)
    && /data-light-channel-action="quick-log-device"/.test(src));
assert('Light channel feature hook wires runtime dependencies',
  /configureLightChannelView\(\{/.test(hooksSrc)
    && /channelDisplay: CHANNEL_DISPLAY/.test(hooksSrc)
    && /dailyChannelBreakdown/.test(hooksSrc)
    && /dailyVitaminDIUBreakdown/.test(hooksSrc)
    && /pbmJoulesPerCm2/.test(hooksSrc)
    && /rollingDeviceTotals/.test(hooksSrc)
    && /quickLogDeviceSession/.test(hooksSrc)
    && /quickLogSunSession/.test(hooksSrc));
assert('Light channel UI hook wires router dependency',
  /import \{ navigate \} from '\.\/views\.js';/.test(uiHooksSrc)
    && /configureLightChannelView\(\{ navigate \}\);/.test(uiHooksSrc));
assert('Light channel hooks and router wiring load behind the feature boundary',
  lightSunModulesSrc.includes("import './light-channel-view-hooks.js';")
    && lightSunModulesSrc.includes('configureLightChannelView({ navigate });')
    && !uiShellModulesSrc.includes("import './light-channel-view-ui-hooks.js';"));
assert('Service worker caches Light channel hooks',
  swSrc.includes("'/js/light-channel-view-hooks.js'")
    && swSrc.includes("'/js/light-channel-view-ui-hooks.js'"));

console.log(`\nResults: ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) process.exit(1);
