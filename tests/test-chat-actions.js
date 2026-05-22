#!/usr/bin/env node
// test-chat-actions.js — Chat action buttons + context summary. Window-export
// checks, getContextSummary() shape, buildActionBar() HTML output (Regenerate
// only on last AI msg, Copy always, context toggle, area counts), backward
// compat, plus source-inspection of chat.js / lab-context.js / settings.js /
// service-worker.js / state.js / styles.css.
//
// Run: node tests/test-chat-actions.js  (or via npm test)
//
// DOM-runtime sections (4 renderChatMessages/DOMParser, 10 navigator.clipboard,
// 12 context-toggle live DOM) live in tests/test-chat-actions-dom.js on the
// puppeteer runner.

import './_node-shim.js';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel.replace(/^\//, '')), 'utf-8');

let passed = 0, failed = 0;
function assert(name, condition, detail) {
  if (condition) { passed++; console.log(`  PASS: ${name}`); }
  else { failed++; console.log(`  FAIL: ${name}${detail ? ' — ' + detail : ''}`); }
}

console.log('=== Chat Actions Tests ===\n');

// state.js exposes window._labState; chat.js + lab-context.js expose the
// action-bar / context-summary handlers via Object.assign(window, ...).
await import('../js/state.js');
await import('../js/lab-context.js');
await import('../js/chat.js');
const { buildSummaryTranscript } = await import('../js/chat-summaries.js');
const {
  attachLensSources, buildMultiPersonaInstruction, buildTaggedChatMessages, buildWebSearchHint,
} = await import('../js/chat-prompt-context.js');

const S = window._labState;
const hasState = S && typeof S === 'object';
assert('window._labState exists', hasState, hasState ? 'found' : 'not found');

// ─── Section 1: Window exports ───
console.log('Section 1: Window Exports');
const requiredExports = [
  'getContextSummary', 'buildActionBar', 'regenerateLastMessage',
  'copyMessage', 'toggleContextDetails'
];
for (const fn of requiredExports) {
  assert(`window.${fn} exists`, typeof window[fn] === 'function', typeof window[fn]);
}
assert('window.readAloud removed', typeof window.readAloud === 'undefined', typeof window.readAloud);

// ─── Section 2: getContextSummary() ───
console.log('Section 2: getContextSummary()');
const summary = window.getContextSummary();
assert('getContextSummary returns array', Array.isArray(summary), typeof summary);
if (summary.length > 0) {
  assert('Summary items have label', typeof summary[0].label === 'string', summary[0].label);
  assert('Summary items have detail', typeof summary[0].detail === 'string', summary[0].detail);
} else {
  assert('Summary is empty (no data loaded)', summary.length === 0, 'expected with no data');
}
const allLabelsStr = summary.every(s => typeof s.label === 'string' && s.label.length > 0);
assert('All summary labels are non-empty strings', allLabelsStr, summary.map(s => s.label).join(', '));

// ─── Section 3: buildActionBar() ───
console.log('Section 3: buildActionBar()');
let origHistory;
if (hasState) {
  origHistory = JSON.parse(JSON.stringify(S.chatHistory || []));

  S.chatHistory = [
    { role: 'user', content: 'Hello' },
    { role: 'assistant', content: 'Hi there!', context: [{ label: 'Lab values', detail: '5 markers' }] },
    { role: 'user', content: 'More info' },
    { role: 'assistant', content: 'Sure, here is more.', context: [{ label: 'Diet', detail: 'filled' }, { label: 'Sleep & Rest', detail: 'filled' }] }
  ];

  const userBar = window.buildActionBar(0);
  assert('buildActionBar returns empty for user msg', userBar === '', `got: "${userBar.substring(0, 50)}"`);

  const bar1 = window.buildActionBar(1);
  assert('buildActionBar for AI msg has action bar', bar1.includes('chat-action-bar'), 'contains .chat-action-bar');
  assert('Non-last AI msg has NO Regenerate', !bar1.includes('Regenerate'), 'no Regenerate for non-last');
  assert('AI msg has NO Read button (removed)', !bar1.includes('Read'), 'no Read button');
  assert('AI msg has Copy button', bar1.includes('Copy'), 'contains Copy');

  const bar3 = window.buildActionBar(3);
  assert('Last AI msg has Regenerate', bar3.includes('Regenerate'), 'contains Regenerate');
  assert('Last AI msg has Copy', bar3.includes('Copy'), 'contains Copy');
  assert('Last AI msg has NO Read', !bar3.includes('Read'), 'no Read');

  assert('AI msg with context has context toggle', bar1.includes('chat-context-toggle'), 'contains toggle');
  assert('Context shows area count', bar1.includes('1 area'), 'shows 1 area');
  assert('Context details are hidden by default', bar1.includes('display:none'), 'hidden');
  assert('Context item has checkmark', bar1.includes('✓'), 'has checkmark');

  assert('Second AI msg shows 2 areas', bar3.includes('2 areas'), 'shows 2 areas');
} else {
  console.warn('Skipping buildActionBar tests — _labState not available');
}

// Section 4 (renderChatMessages / DOMParser integration) lives in
// test-chat-actions-dom.js.

// ─── Section 5: Backward compatibility ───
console.log('Section 5: Backward compatibility');
if (hasState) {
  S.chatHistory = [
    { role: 'user', content: 'Hello' },
    { role: 'assistant', content: 'Hi there!' }  // No .context, no .sources
  ];

  const barNoCtx = window.buildActionBar(1);
  assert('Msg without .context has no context toggle', !barNoCtx.includes('chat-context-toggle'), 'no toggle');
  assert('Msg without .sources has no sources toggle', !barNoCtx.includes('chat-sources-toggle'), 'no sources toggle');
  assert('Msg without .context still has action bar', barNoCtx.includes('chat-action-bar'), 'has action bar');
} else {
  console.warn('Skipping backward compat tests — _labState not available');
}

// Section 10 (navigator.clipboard) and Section 12 (context-toggle live DOM)
// live in test-chat-actions-dom.js.

// ─── Section 14: Settings UI ───
console.log('Section 14: Settings UI');
const settingsSrc = read('js/settings.js');
assert('settings.js NO longer has Chat Sources section', !settingsSrc.includes('Chat Sources'), 'removed from settings');
assert('settings.js NO longer has chat-sources-btn', !settingsSrc.includes('chat-sources-btn'), 'removed');
assert('settings.js NO longer has data-sources attribute', !settingsSrc.includes('data-sources'), 'removed');

// ─── Section 15: Service worker bypass ───
console.log('Section 15: Service worker');
const swSrc = read('service-worker.js');
assert('SW bypasses OpenRouter', swSrc.includes('openrouter.ai'), 'found');
assert('SW bypasses Venice', swSrc.includes('api.venice.ai'), 'found');
assert('SW bypasses Routstr', swSrc.includes('api.routstr.com'), 'found');
assert('SW bypasses PPQ', swSrc.includes('api.ppq.ai'), 'found');
assert('SW uses importScripts for version', swSrc.includes("importScripts('/version.js')"), 'found');
assert('SW CACHE_NAME uses semver', swSrc.includes('`labcharts-v${self.APP_VERSION}`'), 'found');

// ─── Section 16: CSS classes ───
console.log('Section 16: CSS classes');
const cssSrc = read('styles.css');
const cssClasses = [
  'chat-action-bar', 'chat-action-btn', 'chat-context-toggle',
  'chat-context-details', 'chat-context-item',
  'chat-toggle-arrow', 'chat-toggle-slider'
];
for (const cls of cssClasses) {
  assert(`CSS .${cls} defined`, cssSrc.includes('.' + cls), 'found in styles.css');
}
assert('CSS has shimmer animation', cssSrc.includes('@keyframes shimmer'), 'found');
assert('CSS .chat-action-btn.active removed', !cssSrc.includes('.chat-action-btn.active'), 'removed');

// ─── Section 17: Source inspection — chat.js ───
console.log('Section 17: Source inspection');
const chatSrc = read('js/chat.js');
const chatAttestationSrc = read('js/chat-attestation.js');
const chatIconsSrc = read('js/chat-icons.js');
const chatSummariesSrc = read('js/chat-summaries.js');
const chatContinuationSrc = read('js/chat-continuation.js');
const chatPromptContextSrc = read('js/chat-prompt-context.js');
const chatPersonalitiesSrc = read('js/chat-personalities.js');
const chatHistorySrc = read('js/chat-history.js');
const labCtxSrc = read('js/lab-context.js');
assert('lab-context.js has getContextSummary', labCtxSrc.includes('function getContextSummary'), 'found');
assert('chat.js has buildActionBar', chatSrc.includes('function buildActionBar'), 'found');
assert('chat.js has regenerateLastMessage', chatSrc.includes('function regenerateLastMessage'), 'found');
assert('chat.js does NOT have readAloud', !chatSrc.includes('function readAloud'), 'removed');
assert('chat.js has copyMessage', chatSrc.includes('function copyMessage'), 'found');
assert('sendChatMessage snapshots context', chatSrc.includes('contextSnapshot'), 'found');
assert('sendChatMessage snapshots provider for API call', chatSrc.includes('const _msgProvider = getAIProvider()') && chatSrc.includes('provider: _msgProvider'), 'found');
assert('sendChatMessage awaits chat saves before repaint-sensitive work',
  (chatSrc.match(/await saveChatHistory\(\)/g) || []).length >= 2, 'found');
assert('chat raises response token headroom', chatContinuationSrc.includes('CHAT_RESPONSE_MAX_TOKENS = 16384'), 'found');
assert('chat auto-continues token-limit stops', chatContinuationSrc.includes('CHAT_AUTO_CONTINUE_LIMIT') && chatContinuationSrc.includes('callChatAPIWithContinuation'), 'found');
assert('chat continuation uses provider snapshot', chatContinuationSrc.includes('provider })') && chatContinuationSrc.includes('}, provider)'), 'found');
assert('chat auto-continues likely mid-sentence stops', chatContinuationSrc.includes('isLikelyIncompleteResponse') && chatContinuationSrc.includes('shouldAutoContinueResponse'), 'found');
assert('chat incomplete heuristic does not continue solely because final line is long',
  !chatSrc.includes('return lastLine.length > 60') && !chatContinuationSrc.includes('return lastLine.length > 60'), 'length-only fallback removed');
assert('chat incomplete heuristic does not continue on terminal high/low adjectives',
  !chatSrc.includes('low|high') && !chatSrc.includes('high|low') && !chatContinuationSrc.includes('low|high') && !chatContinuationSrc.includes('high|low'), 'medical adjectives removed from trailing-word fallback');
assert('chat renders output-limit note', chatContinuationSrc.includes('output limit reached'), 'found');
assert('chat persists truncated assistant state', chatSrc.includes('assistantMsg.truncated = true'), 'found');
assert('renderChatMessages restores truncated note', chatSrc.includes('msg.truncated') && chatSrc.includes('responseLimitNote()'), 'found');
assert('regenerateLastMessage checks _chatAbortController', chatSrc.includes('_chatAbortController') && chatSrc.includes('regenerateLastMessage'), 'found');
assert('chat.js imports chat icon helpers', chatSrc.includes("from './chat-icons.js'"), 'found');
assert('chat-icons.js exports button content helper', chatIconsSrc.includes('export function setIconButtonContent'), 'found');
assert('chat.js imports chat summary helpers', chatSrc.includes("from './chat-summaries.js'"), 'found');
assert('chat-summaries.js exports summarizeThread', chatSummariesSrc.includes('export async function summarizeThread'), 'found');
assert('chat-summaries.js sends one transcript message', chatSummariesSrc.includes('buildSummaryTranscript(state.chatHistory)') && chatSummariesSrc.includes("role: 'user'"), 'found');
assert('chat.js imports continuation helpers', chatSrc.includes("from './chat-continuation.js'"), 'found');
assert('chat-continuation.js exports continuation helper', chatContinuationSrc.includes('export async function callChatAPIWithContinuation'), 'found');
assert('chat.js imports prompt context helpers', chatSrc.includes("from './chat-prompt-context.js'"), 'found');
assert('chat-prompt-context.js exports tagged messages helper', chatPromptContextSrc.includes('export function buildTaggedChatMessages'), 'found');
assert('chat.js imports attestation helpers', chatSrc.includes("from './chat-attestation.js'"), 'found');
assert('chat-attestation.js exports E2EE lock footnote helper', chatAttestationSrc.includes('export function e2eeLockFootnote'), 'found');
assert('chat.js imports personality helpers', chatSrc.includes("from './chat-personalities.js'"), 'found');
assert('chat-personalities.js exports header model helper', chatPersonalitiesSrc.includes('export function updateChatHeaderModel'), 'found');
assert('chat.js imports history helpers', chatSrc.includes("from './chat-history.js'"), 'found');
assert('chat-history.js exports save/load helpers', chatHistorySrc.includes('export async function saveChatHistory') && chatHistorySrc.includes('export async function loadChatHistory'), 'found');
assert('renderChatMessages calls buildActionBar', chatSrc.includes('buildActionBar(i)'), 'found');
assert('API messages tag other personas', chatPromptContextSrc.includes('Response from') && chatPromptContextSrc.includes('personalityName'), 'tags messages from different personas');

// ─── Section 17a: Chat prompt-context helpers ───
console.log('Section 17a: Chat prompt-context helpers');
const taggedMessages = buildTaggedChatMessages([
  { joined: true, joinName: 'Analyst' },
  { role: 'user', content: 'Review this' },
  { role: 'assistant', personalityName: 'Analyst', content: 'First opinion' },
  { role: 'assistant', personalityName: 'House', content: 'Current opinion' },
], 'House');
assert('prompt context skips joined messages', taggedMessages.length === 3, JSON.stringify(taggedMessages));
assert('prompt context tags other assistant personas', taggedMessages[1]?.content.startsWith('[Response from Analyst]'), taggedMessages[1]?.content);
assert('prompt context leaves current persona untagged', taggedMessages[2]?.content === 'Current opinion', taggedMessages[2]?.content);
const multiPersonaInstruction = buildMultiPersonaInstruction([
  { role: 'assistant', personalityName: 'Analyst', content: 'First opinion' },
  { role: 'assistant', personalityName: 'House', content: 'Current opinion' },
], 'House');
assert('prompt context instruction names other persona', multiPersonaInstruction.includes('Analyst') && !multiPersonaInstruction.includes('(House)'), multiPersonaInstruction);
assert('prompt context E2EE hint wins', buildWebSearchHint({ isE2EE: true, webSearchEnabled: true }).includes('E2EE mode'), 'found');
const lensAttached = attachLensSources({}, { sourceName: 'Library', chunks: [{ text: 'x'.repeat(1600), source: 'doc.md', score: 0.91 }] });
assert('prompt context serializes capped lens sources', lensAttached.lensSources?.[0]?.text.length === 1500 && lensAttached.lensSourceName === 'Library', JSON.stringify(lensAttached));

// ─── Section 17b: Summary transcript normalization ───
console.log('Section 17b: Summary transcript normalization');
const transcript = buildSummaryTranscript([
  { role: 'assistant', content: 'Initial assistant note', personalityName: 'Analyst' },
  { role: 'assistant', content: '', personalityName: 'Second analyst' },
  { role: 'user', content: [{ type: 'text', text: 'Here is a screenshot' }, { type: 'image_url' }] },
  { role: 'system', content: 'ignored' },
  { role: 'assistant', content: 'Follow-up opinion', personalityName: 'House' }
]);
assert('summary transcript labels assistant personas', transcript.includes('Assistant (Analyst):') && transcript.includes('Assistant (House):'), transcript);
assert('summary transcript preserves user text attachments', transcript.includes('User:') && transcript.includes('Here is a screenshot') && transcript.includes('[image attached]'), transcript);
assert('summary transcript skips empty/system messages', !transcript.includes('Second analyst') && !transcript.includes('ignored'), transcript);

// ─── Section 18: Regenerate only on last AI message ───
console.log('Section 18: Regenerate placement');
if (hasState) {
  S.chatHistory = [
    { role: 'user', content: 'Q1' },
    { role: 'assistant', content: 'A1' },
    { role: 'user', content: 'Q2' },
    { role: 'assistant', content: 'A2' }
  ];

  const bar0 = window.buildActionBar(1); // first AI msg
  const barLast = window.buildActionBar(3); // last AI msg
  assert('First AI msg (non-last) has no Regenerate', !bar0.includes('regenerateLastMessage'), 'no regenerate');
  assert('Last AI msg has Regenerate', barLast.includes('regenerateLastMessage'), 'has regenerate');
} else {
  console.warn('Skipping regenerate placement tests — _labState not available');
}

// ─── Section 19: setChatPersonality thread behavior ───
// Pure source-inspection of chatSrc — `chatSrc` is read unconditionally
// from the filesystem above, so these run regardless of _labState init
// (the original's `if (hasState)` gate was a carry-over from when chatSrc
// came from a fetch that could be absent before state was ready).
console.log('Section 19: setChatPersonality thread behavior');
assert('setChatPersonality is async', chatPersonalitiesSrc.includes('async function setChatPersonality'), 'found in source');
assert('setChatPersonality switches in-place', chatPersonalitiesSrc.includes('state.currentChatPersonality = id'), 'found');
assert('Updates thread personality in-place', chatPersonalitiesSrc.includes('thread.personality = id'), 'found in setChatPersonality');
assert('Updates thread metadata on switch', chatPersonalitiesSrc.includes('thread.personalityName') && chatPersonalitiesSrc.includes('thread.personalityIcon'), 'found');

// ─── Section 20: state.js exposes _labState ───
console.log('Section 20: State exposure');
const stateSrc = read('js/state.js');
assert('state.js exports _labState to window', stateSrc.includes('window._labState'), 'found');

// ─── Cleanup ───
if (hasState && origHistory) S.chatHistory = origHistory;

console.log(`\nResults: ${passed} passed, ${failed} failed, ${passed + failed} total`);
process.exit(failed > 0 ? 1 : 0);
