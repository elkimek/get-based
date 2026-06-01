#!/usr/bin/env node
// Light page view delegated-action source guards.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'js/light-page-view.js'), 'utf8');

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
assert('Light page view installs one click delegate',
  /root\.addEventListener\('click', handleLightPageActionClick\)/.test(src)
    && /installLightPageActionDelegates\(\)/.test(src));
assert('Light page actions are scoped through closest data action lookup',
  /target\.closest\('\[data-light-page-action\]'\)/.test(src)
    && /event\.currentTarget\?\.contains\(actionEl\)/.test(src));

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
    && /_openChannelOnLightPage\?\.\(actionEl\.dataset\.channel/.test(src));

console.log(`\nResults: ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) process.exit(1);
