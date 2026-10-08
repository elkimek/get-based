#!/usr/bin/env node
import { createLegacyAssertions } from './helpers/legacy-assertions.js';
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
] as const;

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
] as const;

const actionOwners = {
  'refresh-sun-session': 'js/sun-ai-analysis.js',
  'refresh-device-session': 'js/light-device-ai-analysis.js',
  'refresh-measurement': 'js/light-tools-ai-analysis.js',
  'refresh-audit': 'js/light-audit-ai-analysis.js',
  'refresh-room': 'js/light-env-ai-analysis.js',
  'refresh-screen': 'js/light-screen-ai-analysis.js',
  'refresh-day': 'js/light-today-ai.js',
  'refresh-channel-mix': 'js/light-channels-ai-analysis.js',
  'refresh-burden': 'js/light-burden-ai-analysis.js',
  'refresh-onboarding': 'js/sun-onboarding-ai.js',
} satisfies Record<typeof actions[number], typeof targetFiles[number]>;

const helperSrc = fs.readFileSync(path.join(root, 'js/ai-action-delegates.js'), 'utf8');
const sources = Object.fromEntries(targetFiles.map(file => [
  file,
  fs.readFileSync(path.join(root, file), 'utf8'),
])) as Record<typeof targetFiles[number], string>;
const combined = Object.values(sources).join('\n');
const inlineHandlerRe = /\bon(?:click|keydown|submit|change|input)=/;




const { assert, results: legacyAssertions } = createLegacyAssertions(" -- ");

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
    (combined.includes("aiActionAttrs('stop-propagation')") || fs.readFileSync(path.join(root, 'js/components/LightSessionAI.svelte'), 'utf8').includes('data-ai-action="stop-propagation"')) &&
    (combined.includes('{ stopPropagation: true }') ||
      fs.readFileSync(path.join(root, 'js/components/LightVerdictButton.svelte'), 'utf8').includes("stopPropagation ?? view.mode === 'inline'")));
assert('AI action helper dispatches through registry instead of window globals',
  helperSrc.includes('registerAIActionHandler') &&
    helperSrc.includes('getRegisteredAIActionHandler') &&
    !helperSrc.includes('callWindowAction') &&
    !helperSrc.includes('window.refresh'));

for (const action of actions) {
  assert(`AI action ${action} is declared in helper`,
    helperSrc.includes(`'${action}'`));
  const environmentKinds: Record<string, string> = { 'refresh-measurement': 'measurement', 'refresh-audit': 'audit', 'refresh-room': 'room', 'refresh-screen': 'screen' };
  const kind = environmentKinds[action];
  const environmentProjection = fs.readFileSync(path.join(root, 'js/light-environment-ai-presentation.ts'), 'utf8');
  const authoredEnvironment = fs.readFileSync(path.join(root, 'js/components/LightEnvironmentAI.svelte'), 'utf8');
  const authoredControl = fs.readFileSync(path.join(root, 'js/components/LightVerdictButton.svelte'), 'utf8');
  const reviewKinds: Record<string, string> = { 'refresh-day': 'today', 'refresh-channel-mix': 'weekly', 'refresh-burden': 'burden' };
  const reviewKind = reviewKinds[action];
  const reviewProjection = fs.readFileSync(path.join(root, 'js/light-review-ai-presentation.ts'), 'utf8');
  const reviewComponent = reviewKind ? fs.readFileSync(path.join(root, `js/components/Light${reviewKind === 'today' ? 'Today' : reviewKind === 'weekly' ? 'Weekly' : 'Burden'}AI.svelte`), 'utf8') : '';
  const authoredOnboarding = fs.readFileSync(path.join(root, 'js/components/LightOnboardingAI.svelte'), 'utf8');
  assert(`AI action ${action} is rendered by target modules`,
    combined.includes(`aiActionAttrs('${action}'`) || sources[actionOwners[action]].includes(`action: '${action}'`) ||
      (reviewKind && sources[actionOwners[action]].includes(`kind: '${reviewKind}'`) && reviewProjection.includes(`${reviewKind}: '${action}'`) &&
        reviewComponent.includes('<LightVerdictButton') && authoredControl.includes('data-ai-action={view.action}')) ||
      (action === 'refresh-onboarding' && authoredOnboarding.includes('data-ai-action="refresh-onboarding"')) ||
      (kind && sources[actionOwners[action]].includes(`kind: '${kind}'`) && environmentProjection.includes(`${kind}: '${action}'`) &&
        authoredEnvironment.includes('<LightVerdictButton') && authoredControl.includes('data-ai-action={view.action}')));
  assert(`AI action ${action} is registered by its owner module`,
    sources[actionOwners[action]].includes(`registerAIActionHandler('${action}'`));
}

const dom = new JSDOM('<!doctype html><body></body>');
(globalThis as { window?: unknown }).window = dom.window;
globalThis.document = dom.window.document;
const { aiActionAttrs, getRegisteredAIActionHandler, registerAIActionHandler } = await import('../js/ai-action-delegates.js');
type AIActionArguments = Parameters<Parameters<typeof registerAIActionHandler>[1]>;

let dayArgs: unknown = null;
registerAIActionHandler('refresh-day', (...args: AIActionArguments) => { dayArgs = args; });
document.body.innerHTML = `<button id="day" ${aiActionAttrs('refresh-day')}>Run</button>`;
document.getElementById('day')?.click();
assert('delegated click routes action without a target id',
  Array.isArray(dayArgs) && dayArgs.length === 0);

let channelArgs: unknown = null;
registerAIActionHandler('refresh-channel-mix', (...args: AIActionArguments) => { channelArgs = args; });
document.body.innerHTML = `<button id="channel" ${aiActionAttrs('refresh-channel-mix')}>Run</button>`;
document.getElementById('channel')?.click();
assert('delegated singleton action calls without an empty string argument',
  Array.isArray(channelArgs) && channelArgs.length === 0);

let routedSessionId: AIActionArguments[0] | '' = '';
let rowOpened = false;
registerAIActionHandler('refresh-sun-session', (id: AIActionArguments[0]) => { routedSessionId = id; });
const row = document.createElement('div');
row.addEventListener('click', () => { rowOpened = true; });
row.innerHTML = `<button id="sun" ${aiActionAttrs('refresh-sun-session', 'sun-1', { stopPropagation: true })}>Refresh</button>`;
document.body.append(row);
document.getElementById('sun')?.click();
assert('delegated row action routes target id',
  routedSessionId === 'sun-1');
assert('delegated row action stops parent row click before bubble phase',
  rowOpened === false);
const unregisterDay = registerAIActionHandler('refresh-day', () => {});
assert('registered action handler can be unregistered',
  typeof getRegisteredAIActionHandler('refresh-day') === 'function');
unregisterDay();
assert('unregister only removes the matching registered handler',
  getRegisteredAIActionHandler('refresh-day') === null);

console.log(`\nResults: ${legacyAssertions.pass} passed, ${legacyAssertions.fail} failed, ${legacyAssertions.pass + legacyAssertions.fail} total`);
if (legacyAssertions.fail > 0) process.exit(1);
