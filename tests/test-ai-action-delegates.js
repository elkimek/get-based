#!/usr/bin/env node
// Static guards for delegated AI verdict controls.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { JSDOM } from 'jsdom';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const targetFiles = [
  'js/sun-ai-analysis.js',
  'js/light-device-ai-analysis.js',
  'js/light-tools-ai-analysis.js',
  'js/light-env-ai-analysis.js',
  'js/light-screen-ai-analysis.js',
  'js/light-audit-ai-analysis.js',
  'js/light-today-ai.js',
  'js/light-channels-ai-analysis.js',
  'js/light-burden-ai-analysis.js',
  'js/sun-onboarding-ai.js',
];

const actions = [
  'refresh-sun-session',
  'refresh-device-session',
  'refresh-measurement',
  'refresh-audit',
  'refresh-room',
  'refresh-screen',
  'refresh-day',
  'refresh-channel-mix',
  'refresh-burden',
  'refresh-onboarding',
];

const helperSrc = fs.readFileSync(path.join(root, 'js/ai-action-delegates.js'), 'utf8');
const sources = Object.fromEntries(targetFiles.map(file => [
  file,
  fs.readFileSync(path.join(root, file), 'utf8'),
]));
const combined = Object.values(sources).join('\n');
const inlineHandlerRe = /\bon(?:click|keydown|submit|change|input)=/;

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

console.log('=== AI Action Delegates ===');

for (const [file, src] of Object.entries(sources)) {
  assert(`${file} renders no inline event attributes`,
    !inlineHandlerRe.test(src));
  assert(`${file} imports shared AI action delegate`,
    src.includes("from './ai-action-delegates.js'"));
}

assert('AI action helper installs one delegated capture click listener',
  helperSrc.includes("root.addEventListener('click', _handleAIActionClick, true)") &&
    helperSrc.includes('aiActionDelegatesInstalled'));
assert('AI action helper escapes action and target attributes',
  helperSrc.includes('escapeAttr(action)') &&
    helperSrc.includes('escapeAttr(String(targetId))'));
assert('AI action helper handles row-level stop propagation',
  helperSrc.includes("action === 'stop-propagation'") &&
    combined.includes("aiActionAttrs('stop-propagation')") &&
    combined.includes('{ stopPropagation: true }'));

for (const action of actions) {
  assert(`AI action ${action} is mapped in helper`,
    helperSrc.includes(`'${action}'`));
  assert(`AI action ${action} is rendered by target modules`,
    combined.includes(`aiActionAttrs('${action}'`));
}

const dom = new JSDOM('<!doctype html><body></body>');
globalThis.window = dom.window;
globalThis.document = dom.window.document;
const { aiActionAttrs } = await import('../js/ai-action-delegates.js');

let dayCalls = 0;
window.refreshDayAIAnalysis = () => { dayCalls++; };
document.body.innerHTML = `<button id="day" ${aiActionAttrs('refresh-day')}>Run</button>`;
document.getElementById('day')?.click();
assert('delegated click routes action without a target id', dayCalls === 1);

let routedSessionId = '';
let rowOpened = false;
window.refreshSessionAIAnalysis = id => { routedSessionId = id; };
const row = document.createElement('div');
row.addEventListener('click', () => { rowOpened = true; });
row.innerHTML = `<button id="sun" ${aiActionAttrs('refresh-sun-session', 'sun-1', { stopPropagation: true })}>Refresh</button>`;
document.body.append(row);
document.getElementById('sun')?.click();
assert('delegated row action routes target id',
  routedSessionId === 'sun-1');
assert('delegated row action stops parent row click before bubble phase',
  rowOpened === false);

console.log(`\nResults: ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) process.exit(1);
