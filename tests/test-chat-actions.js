#!/usr/bin/env node
// test-chat-actions.js — Chat action buttons + context summary. Window-export
// checks, getContextSummary() shape, buildActionBar() HTML output (Regenerate
// only on last AI msg, Copy always, context toggle, area counts), backward
// compat, plus source-inspection of chat.js / chat-actions.js / lab-context.js / settings.js /
// service-worker.js / state.js / CSS bundle.
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
const { buildActionBar } = await import('../js/chat-actions.js');
const { buildSummaryTranscript } = await import('../js/chat-summaries.js');
const {
  attachLensSources, buildMultiPersonaInstruction, buildTaggedChatMessages, buildWebSearchHint,
} = await import('../js/chat-prompt-context.js');
const {
  clearCurrentDiscussionThreadState, reopenCurrentDiscussionThread,
} = await import('../js/chat-discussion-state.js');
const {
  DEFAULT_DISCUSS_PROMPT, DISCUSSION_JOIN_PROMPT, INITIAL_DISCUSS_PROMPT,
  buildDiscussionAutoMessage, buildDiscussionJoinMessage, getDiscussionPromptText,
  hasExistingDiscussionResponses,
} = await import('../js/chat-discussion-round-prompts.js');
const { readDiscussPersonaPickerSelection } = await import('../js/chat-discussion-ui.js');

const S = window._labState;
const hasState = S && typeof S === 'object';
assert('window._labState exists', hasState, hasState ? 'found' : 'not found');

// ─── Section 1: Window exports ───
console.log('Section 1: Window Exports');
const requiredExports = [
  'getContextSummary', 'regenerateLastMessage',
  'copyMessage', 'toggleContextDetails'
];
for (const fn of requiredExports) {
  assert(`window.${fn} exists`, typeof window[fn] === 'function', typeof window[fn]);
}
assert('window.readAloud removed', typeof window.readAloud === 'undefined', typeof window.readAloud);

// ─── Section 1a: Discuss Button UI ───
console.log('Section 1a: Discuss button UI');
if (hasState) {
  const origGetElementById = document.getElementById;
  const origHistory = S.chatHistory;
  const btn = { style: {}, title: '' };
  document.getElementById = (id) => (id === 'chat-discuss-btn' ? btn : origGetElementById.call(document, id));

  S.chatHistory = [{ role: 'user', content: 'No assistant yet' }];
  window.updateDiscussButton();
  assert('Discuss button hides without assistant messages', btn.style.display === 'none', btn.style.display);

  S.chatHistory = [{ role: 'assistant', content: 'Direct reply' }];
  window.updateDiscussButton();
  assert('Discuss button shows after assistant response', btn.style.display === 'flex', btn.style.display);
  assert('Discuss button prompts second opinion for one persona', btn.style.opacity === '0.5' && btn.title.includes('second opinion'), btn.title);

  S.chatHistory = [
    { role: 'assistant', personalityName: 'Analyst A', content: 'First' },
    { role: 'assistant', personalityName: 'Analyst B', content: 'Second' },
  ];
  window.updateDiscussButton();
  assert('Discuss button adds another persona for two discussion personas', btn.style.opacity === '1' && btn.title.includes('Add another persona'), btn.title);

  S.chatHistory = origHistory;
  document.getElementById = origGetElementById;
} else {
  console.warn('Skipping Discuss button UI tests — _labState not available');
}

// ─── Section 1b: Discuss Picker Selection ───
console.log('Section 1b: Discuss picker selection');
{
  const origQuerySelector = document.querySelector;
  const makeInput = (id, name = id, icon = id[0].toUpperCase()) => ({
    value: id,
    dataset: { name, icon },
  });
  const withPicker = (locked, checked, fn) => {
    const picker = {
      querySelectorAll(selector) {
        if (selector === 'input[data-locked="1"]') return locked;
        if (selector === 'input:checked:not([data-locked="1"])') return checked;
        return [];
      },
    };
    document.querySelector = (selector) => (selector === '.discuss-persona-picker' ? picker : origQuerySelector.call(document, selector));
    return fn();
  };

  assert('Picker selection returns null when no picker exists',
    readDiscussPersonaPickerSelection() === null,
    'no picker');
  assert('Picker selection requires two new personas for a fresh debate',
    withPicker([], [makeInput('a', 'Analyst A')], () => readDiscussPersonaPickerSelection() === null),
    'one fresh selection');
  assert('Picker selection reads two fresh debate personas',
    withPicker([], [makeInput('a', 'Analyst A'), makeInput('b', 'Analyst B')], () => {
      const selection = readDiscussPersonaPickerSelection();
      return selection?.allPersonas.length === 2 &&
        selection?.newPersonas.length === 2 &&
        selection.allPersonas[0].name === 'Analyst A';
    }),
    'two fresh selections');
  assert('Picker selection requires one new persona for an active debate',
    withPicker([makeInput('a'), makeInput('b')], [], () => readDiscussPersonaPickerSelection() === null),
    'locked without new selection');
  assert('Picker selection reads one added persona for an active debate',
    withPicker([makeInput('a'), makeInput('b')], [makeInput('c', 'Analyst C')], () => {
      const selection = readDiscussPersonaPickerSelection();
      return selection?.allPersonas.length === 3 &&
        selection?.newPersonas.length === 1 &&
        selection.newPersonas[0].id === 'c';
    }),
    'one added persona');

  document.querySelector = origQuerySelector;
}

// ─── Section 1c: Discussion Thread Lifecycle State ───
console.log('Section 1c: Discussion thread lifecycle state');
if (hasState) {
  const origThreads = S.chatThreads;
  const origThreadId = S.currentThreadId;
  const threadIndexKey = `labcharts-${S.currentProfile}-chat-threads`;
  const origThreadIndex = localStorage.getItem(threadIndexKey);

  const thread = {
    id: 'test-discussion-thread',
    discussionPersonas: [{ id: 'a' }, { id: 'b' }],
    discussionOriginalPersonality: 'default',
  };
  S.chatThreads = [thread];
  S.currentThreadId = thread.id;

  clearCurrentDiscussionThreadState();
  assert('Discussion thread lifecycle no-ops without explicit clear/end',
    Array.isArray(thread.discussionPersonas) && thread.discussionOriginalPersonality === 'default',
    'keeps metadata');

  clearCurrentDiscussionThreadState({ markEnded: true });
  assert('Discussion thread lifecycle marks ended and clears metadata',
    thread.discussionEnded === true &&
      !('discussionPersonas' in thread) &&
      !('discussionOriginalPersonality' in thread),
    'ended');

  reopenCurrentDiscussionThread();
  assert('Discussion thread lifecycle reopens ended thread',
    !('discussionEnded' in thread),
    'reopened');

  thread.discussionPersonas = [{ id: 'a' }, { id: 'b' }];
  thread.discussionOriginalPersonality = 'default';
  thread.discussionEnded = true;
  clearCurrentDiscussionThreadState({ clearThread: true });
  assert('Discussion thread lifecycle clears without marking ended',
    !('discussionEnded' in thread) &&
      !('discussionPersonas' in thread) &&
      !('discussionOriginalPersonality' in thread),
    'cleared');

  S.chatThreads = origThreads;
  S.currentThreadId = origThreadId;
  if (origThreadIndex === null) localStorage.removeItem(threadIndexKey);
  else localStorage.setItem(threadIndexKey, origThreadIndex);
} else {
  console.warn('Skipping discussion lifecycle state tests — _labState not available');
}

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

  const userBar = buildActionBar(0);
  assert('buildActionBar returns empty for user msg', userBar === '', `got: "${userBar.substring(0, 50)}"`);

  const bar1 = buildActionBar(1);
  assert('buildActionBar for AI msg has action bar', bar1.includes('chat-action-bar'), 'contains .chat-action-bar');
  assert('Non-last AI msg has NO Regenerate', !bar1.includes('Regenerate'), 'no Regenerate for non-last');
  assert('AI msg has NO Read button (removed)', !bar1.includes('Read'), 'no Read button');
  assert('AI msg has Copy button', bar1.includes('Copy'), 'contains Copy');

  const bar3 = buildActionBar(3);
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

  const barNoCtx = buildActionBar(1);
  assert('Msg without .context has no context toggle', !barNoCtx.includes('chat-context-toggle'), 'no toggle');
  assert('Msg without .sources has no sources toggle', !barNoCtx.includes('chat-sources-toggle'), 'no sources toggle');
  assert('Msg without .context still has action bar', barNoCtx.includes('chat-action-bar'), 'has action bar');
} else {
  console.warn('Skipping backward compat tests — _labState not available');
}

// Section 10 (navigator.clipboard) and Section 12 (context-toggle live DOM)
// live in test-chat-actions-dom.js.

// ─── Section 13: Discussion Round Prompt Helpers ───
console.log('Section 13: Discussion round prompt helpers');
assert('discussion first persona gets initial prompt',
  getDiscussionPromptText({ hasExistingDebate: false, personaIndex: 0 }) === INITIAL_DISCUSS_PROMPT,
  'fresh first turn');
assert('discussion first persona honors steer prompt',
  getDiscussionPromptText({ hasExistingDebate: false, personaIndex: 0, steerPrompt: 'Go deeper' }) === 'Go deeper',
  'steered first turn');
assert('discussion later persona gets default prompt',
  getDiscussionPromptText({ hasExistingDebate: false, personaIndex: 1 }) === DEFAULT_DISCUSS_PROMPT,
  'fresh later turn');
assert('discussion existing debate gets default prompt',
  getDiscussionPromptText({ hasExistingDebate: true, personaIndex: 0 }) === DEFAULT_DISCUSS_PROMPT,
  'existing debate');
assert('discussion existing debate honors steer prompt',
  getDiscussionPromptText({ hasExistingDebate: true, personaIndex: 0, steerPrompt: 'Compare positions' }) === 'Compare positions',
  'steered existing debate');
assert('hasExistingDiscussionResponses ignores plain assistant messages',
  !hasExistingDiscussionResponses([{ role: 'assistant', content: 'Direct chat reply' }]),
  'plain assistant');
assert('hasExistingDiscussionResponses detects persona assistant messages',
  hasExistingDiscussionResponses([{ role: 'assistant', personalityName: 'Skeptic', content: 'Counterpoint' }]),
  'persona assistant');
assert('buildDiscussionAutoMessage creates hidden auto user message',
  JSON.stringify(buildDiscussionAutoMessage('Continue', { hideAutoMsg: true })) === JSON.stringify({ role: 'user', content: 'Continue', auto: true, hidden: true }),
  'hidden auto message');
assert('buildDiscussionJoinMessage creates joined-persona marker',
  JSON.stringify(buildDiscussionJoinMessage({ name: 'Analyst', icon: 'A' })) === JSON.stringify({ joined: true, joinName: 'Analyst', joinIcon: 'A' }),
  'joined marker');
assert('discussion join prompt remains available',
  DISCUSSION_JOIN_PROMPT.includes('just joined this conversation'),
  'join prompt');

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
const cssSrc = ['styles.css', 'css/chat-panel.css'].map(read).join('\n');
const cssClasses = [
  'chat-action-bar', 'chat-action-btn', 'chat-context-toggle',
  'chat-context-details', 'chat-context-item',
  'chat-toggle-arrow', 'chat-toggle-slider'
];
for (const cls of cssClasses) {
  assert(`CSS .${cls} defined`, cssSrc.includes('.' + cls), 'found in CSS bundle');
}
assert('CSS has shimmer animation', cssSrc.includes('@keyframes shimmer'), 'found');
assert('CSS .chat-action-btn.active removed', !cssSrc.includes('.chat-action-btn.active'), 'removed');

// ─── Section 17: Source inspection — chat.js ───
console.log('Section 17: Source inspection');
const chatSrc = read('js/chat.js');
const chatWindowBindingsSrc = read('js/chat-window-bindings.js');
const chatActionsSrc = read('js/chat-actions.js');
const chatAttestationSrc = read('js/chat-attestation.js');
const chatIconsSrc = read('js/chat-icons.js');
const chatSummariesSrc = read('js/chat-summaries.js');
const chatContinuationSrc = read('js/chat-continuation.js');
const chatMarkerPromptsSrc = read('js/chat-marker-prompts.js');
const chatPromptContextSrc = read('js/chat-prompt-context.js');
const chatPersonalitiesSrc = read('js/chat-personalities.js');
const chatHistorySrc = read('js/chat-history.js');
const chatPanelSrc = read('js/chat-panel.js');
const chatNudgeSrc = read('js/chat-nudge.js');
const chatDiscussionSrc = read('js/chat-discussion.js');
const chatDiscussionCallbacksSrc = read('js/chat-discussion-callbacks.js');
const chatDiscussionFlowSrc = read('js/chat-discussion-flow.js');
const chatDiscussionLifecycleSrc = read('js/chat-discussion-lifecycle.js');
const chatDiscussionTurnsSrc = read('js/chat-discussion-turns.js');
const chatDiscussionRoundRunnerSrc = read('js/chat-discussion-round-runner.js');
const chatDiscussionRoundPromptsSrc = read('js/chat-discussion-round-prompts.js');
const chatDiscussionRoundRequestSrc = read('js/chat-discussion-round-request.js');
const chatDiscussionRoundStateSrc = read('js/chat-discussion-round-state.js');
const chatDiscussionRoundViewSrc = read('js/chat-discussion-round-view.js');
const chatDiscussionStateSrc = read('js/chat-discussion-state.js');
const chatDiscussionPickerSrc = read('js/chat-discussion-picker.js');
const chatDiscussionUiSrc = read('js/chat-discussion-ui.js');
const chatOnboardingSrc = read('js/chat-onboarding.js');
const chatRenderSrc = read('js/chat-render.js');
const chatSendSrc = read('js/chat-send.js');
const labCtxSrc = read('js/lab-context.js');
assert('lab-context.js has getContextSummary', labCtxSrc.includes('function getContextSummary'), 'found');
assert('chat.js loads window bindings entry', chatSrc.includes("import './chat-window-bindings.js'"), 'found');
assert('chat.js imports action helpers', chatSrc.includes("from './chat-actions.js'"), 'found');
assert('chat-actions.js exports buildActionBar', chatActionsSrc.includes('export function buildActionBar'), 'found');
assert('chat-actions.js keeps buildActionBar off window', !chatActionsSrc.includes('  buildActionBar,'), 'not a window handler');
assert('chat-actions.js exports regenerateLastMessage', chatActionsSrc.includes('export function regenerateLastMessage'), 'found');
assert('chat.js does NOT have readAloud', !chatSrc.includes('function readAloud'), 'removed');
assert('chat-actions.js exports copyMessage', chatActionsSrc.includes('export function copyMessage'), 'found');
assert('sendChatMessage snapshots context', chatSendSrc.includes('contextSnapshot'), 'found');
assert('sendChatMessage snapshots provider for API call', chatSendSrc.includes('const _msgProvider = getAIProvider()') && chatSendSrc.includes('provider: _msgProvider'), 'found');
assert('sendChatMessage awaits chat saves before repaint-sensitive work',
  (chatSendSrc.match(/await saveChatHistory\(\)/g) || []).length >= 2, 'found');
assert('sendChatMessage keeps AI placeholder in abort-handler scope',
  chatSendSrc.includes('let aiMsgEl = null') && !chatSendSrc.includes('const aiMsgEl = document.createElement'),
  'found');
assert('chat raises response token headroom', chatContinuationSrc.includes('CHAT_RESPONSE_MAX_TOKENS = 16384'), 'found');
assert('chat auto-continues token-limit stops', chatContinuationSrc.includes('CHAT_AUTO_CONTINUE_LIMIT') && chatContinuationSrc.includes('callChatAPIWithContinuation'), 'found');
assert('chat continuation uses provider snapshot', chatContinuationSrc.includes('provider })') && chatContinuationSrc.includes('}, provider)'), 'found');
assert('chat auto-continues likely mid-sentence stops', chatContinuationSrc.includes('isLikelyIncompleteResponse') && chatContinuationSrc.includes('shouldAutoContinueResponse'), 'found');
assert('chat incomplete heuristic does not continue solely because final line is long',
  !chatSrc.includes('return lastLine.length > 60') && !chatSendSrc.includes('return lastLine.length > 60') && !chatContinuationSrc.includes('return lastLine.length > 60'), 'length-only fallback removed');
assert('chat incomplete heuristic does not continue on terminal high/low adjectives',
  !chatSrc.includes('low|high') && !chatSrc.includes('high|low') && !chatSendSrc.includes('low|high') && !chatSendSrc.includes('high|low') && !chatContinuationSrc.includes('low|high') && !chatContinuationSrc.includes('high|low'), 'medical adjectives removed from trailing-word fallback');
assert('chat renders output-limit note', chatContinuationSrc.includes('output limit reached'), 'found');
assert('chat persists truncated assistant state', chatSendSrc.includes('assistantMsg.truncated = true'), 'found');
assert('renderChatMessages restores truncated note', chatRenderSrc.includes('msg.truncated') && chatRenderSrc.includes('responseLimitNote()'), 'found');
assert('regenerateLastMessage checks streaming state via chat.js callback',
  chatActionsSrc.includes('window.isChatStreaming?.()') && chatSendSrc.includes('export function isChatStreaming'), 'found');
assert('regenerateLastMessage checks render/send callbacks before mutating',
  chatActionsSrc.indexOf("typeof renderChatMessages !== 'function'") < chatActionsSrc.indexOf('state.chatHistory.pop()')
    && chatActionsSrc.indexOf("typeof sendChatMessage !== 'function'") < chatActionsSrc.indexOf('state.chatHistory.pop()'), 'found');
assert('chat-send.js imports chat icon helpers', chatSendSrc.includes("from './chat-icons.js'"), 'found');
assert('chat-icons.js exports button content helper', chatIconsSrc.includes('export function setIconButtonContent'), 'found');
assert('chat window bindings import chat summary helpers',
  chatWindowBindingsSrc.includes("from './chat-summaries.js'"), 'found');
assert('chat-summaries.js exports summarizeThread', chatSummariesSrc.includes('export async function summarizeThread'), 'found');
assert('chat-summaries.js sends one transcript message', chatSummariesSrc.includes('buildSummaryTranscript(state.chatHistory)') && chatSummariesSrc.includes("role: 'user'"), 'found');
assert('chat-send.js imports continuation helpers', chatSendSrc.includes("from './chat-continuation.js'"), 'found');
assert('chat-continuation.js exports continuation helper', chatContinuationSrc.includes('export async function callChatAPIWithContinuation'), 'found');
assert('chat-send.js imports prompt context helpers', chatSendSrc.includes("from './chat-prompt-context.js'"), 'found');
assert('chat-prompt-context.js exports tagged messages helper', chatPromptContextSrc.includes('export function buildTaggedChatMessages'), 'found');
assert('chat-send.js imports attestation helpers', chatSendSrc.includes("from './chat-attestation.js'"), 'found');
assert('chat-attestation.js exports E2EE lock footnote helper', chatAttestationSrc.includes('export function e2eeLockFootnote'), 'found');
assert('chat.js imports personality helpers', chatSrc.includes("from './chat-personalities.js'"), 'found');
assert('chat-personalities.js exports header model helper', chatPersonalitiesSrc.includes('export function updateChatHeaderModel'), 'found');
assert('chat.js imports history helpers', chatSrc.includes("from './chat-history.js'"), 'found');
assert('chat-history.js exports save/load helpers', chatHistorySrc.includes('export async function saveChatHistory') && chatHistorySrc.includes('export async function loadChatHistory'), 'found');
assert('chat-actions.js saves regenerated history through chat-history helper', chatActionsSrc.includes('saveChatHistory'), 'found');
assert('chat.js imports chat render helpers', chatSrc.includes("from './chat-render.js'"), 'found');
assert('chat-render.js exports renderChatMessages', chatRenderSrc.includes('export function renderChatMessages'), 'found');
assert('chat.js imports chat send helpers', chatSrc.includes("from './chat-send.js'"), 'found');
assert('chat-send.js exports sendChatMessage', chatSendSrc.includes('export async function sendChatMessage'), 'found');
assert('chat.js imports marker prompt helpers', chatSrc.includes("from './chat-marker-prompts.js'"), 'found');
assert('chat-marker-prompts.js exports marker and correlation prompts',
  chatMarkerPromptsSrc.includes('export function askAIAboutMarker') &&
    chatMarkerPromptsSrc.includes('export function askAIAboutCorrelations'),
  'found');
assert('chat marker prompts create a fresh thread when current thread has history',
  chatMarkerPromptsSrc.includes('state.chatHistory.length > 0') &&
    chatMarkerPromptsSrc.includes('createNewThread()'),
  'found');
assert('chat marker prompts name the target thread from the source',
  chatMarkerPromptsSrc.includes('renameThread(state.currentThreadId, threadName)') &&
    chatMarkerPromptsSrc.includes('Correlations: ${names.join'),
  'found');
assert('renderChatMessages calls buildActionBar', chatRenderSrc.includes('buildActionBar(i)'), 'found');
assert('API messages tag other personas', chatPromptContextSrc.includes('Response from') && chatPromptContextSrc.includes('personalityName'), 'tags messages from different personas');
assert('chat.js imports chat panel helpers', chatSrc.includes("from './chat-panel.js'"), 'found');
assert('chat-panel.js exports open/close helpers', chatPanelSrc.includes('export async function openChatPanel') && chatPanelSrc.includes('export function closeChatPanel'), 'found');
assert('chat-panel.js owns web-search toggle state', chatPanelSrc.includes('export function getChatWebSearchEnabled') && chatPanelSrc.includes('export function setChatWebSearchEnabled'), 'found');
assert('chat-panel scopes web-search selector to chat panel', chatPanelSrc.includes("querySelector('#chat-panel .chat-websearch-toggle-label')"), 'found');
assert('chat.js imports chat nudge helpers', chatSrc.includes("from './chat-nudge.js'"), 'found');
assert('chat-nudge.js owns FAB nudge state', chatNudgeSrc.includes('export function setChatNudge') && chatNudgeSrc.includes('export function updateChatNudge'), 'found');
assert('chat-panel delegates nudge dismissal', chatPanelSrc.includes("from './chat-nudge.js'") && chatPanelSrc.includes('dismissCurrentChatNudge()'), 'found');
assert('chat window bindings import chat nudge helpers', chatWindowBindingsSrc.includes("from './chat-nudge.js'"), 'found');
assert('chat.js imports discussion helpers', chatSrc.includes("from './chat-discussion.js'"), 'found');
assert('chat-discussion-flow.js owns discussion user-action handlers',
  chatDiscussionSrc.includes("from './chat-discussion-flow.js'") &&
    chatDiscussionFlowSrc.includes("from './chat-discussion-turns.js'") &&
    chatDiscussionFlowSrc.includes("from './chat-discussion-lifecycle.js'") &&
    chatDiscussionFlowSrc.includes('export async function startDiscussion') &&
    chatDiscussionFlowSrc.includes('export async function continueDiscussion') &&
    chatDiscussionFlowSrc.includes('export async function sendDiscussionUserTurn') &&
    !chatDiscussionFlowSrc.includes('runDiscussionRound(') &&
    !chatDiscussionSrc.includes('async function runDiscussionRound'),
  'found');
assert('chat-discussion-lifecycle.js owns discussion cleanup and completion',
  chatDiscussionLifecycleSrc.includes('export function restoreDiscussionContinuePrompt') &&
    chatDiscussionLifecycleSrc.includes('export function showDiscussContinuePrompt') &&
    chatDiscussionLifecycleSrc.includes('export function cleanupDiscussionState') &&
    chatDiscussionLifecycleSrc.includes('export function endDiscussion') &&
    chatDiscussionLifecycleSrc.includes('export function finishDiscussionRound') &&
    chatDiscussionLifecycleSrc.includes('updateChatHeaderTitle()'),
  'found');
assert('chat-discussion-turns.js owns discussion round turn execution',
  chatDiscussionTurnsSrc.includes("from './chat-discussion-round-runner.js'") &&
    chatDiscussionTurnsSrc.includes('export async function runDiscussionContinuation') &&
    chatDiscussionTurnsSrc.includes('export async function runSingleDiscussionTurn') &&
    chatDiscussionTurnsSrc.includes('export async function runDiscussion') &&
    chatDiscussionTurnsSrc.includes('runDiscussionRound(') &&
    chatDiscussionTurnsSrc.includes('finishDiscussionRound('),
  'found');
assert('chat-discussion-callbacks.js owns discussion callback bridge',
  chatDiscussionSrc.includes("from './chat-discussion-callbacks.js'") &&
    chatDiscussionSrc.includes("export { configureChatDiscussion } from './chat-discussion-callbacks.js'") &&
    chatDiscussionCallbacksSrc.includes('export function configureChatDiscussion') &&
    chatDiscussionCallbacksSrc.includes('export function getChatAbortController') &&
    chatDiscussionCallbacksSrc.includes('export function createDiscussionTypewriter'),
  'found');
assert('chat-discussion-round-prompts.js owns round prompt helpers',
  chatDiscussionTurnsSrc.includes("from './chat-discussion-round-prompts.js'") &&
    chatDiscussionRoundPromptsSrc.includes('export const DEFAULT_DISCUSS_PROMPT') &&
    chatDiscussionRoundPromptsSrc.includes('export const INITIAL_DISCUSS_PROMPT') &&
    chatDiscussionRoundPromptsSrc.includes('export const DISCUSSION_JOIN_PROMPT') &&
    chatDiscussionRoundPromptsSrc.includes('export function getDiscussionPromptText') &&
    chatDiscussionRoundPromptsSrc.includes('export function buildDiscussionAutoMessage') &&
    chatDiscussionRoundPromptsSrc.includes('export function buildDiscussionJoinMessage'),
  'found');
assert('chat-discussion-round-runner.js owns per-persona round execution',
  chatDiscussionRoundRunnerSrc.includes('export async function runDiscussionRound') &&
    chatDiscussionRoundRunnerSrc.includes('callChatAPIWithContinuation') &&
    chatDiscussionRoundRunnerSrc.includes('buildDiscussionRoundRequest') &&
    chatDiscussionRoundRunnerSrc.includes('renderFinalDiscussionMessage') &&
    chatDiscussionRoundRunnerSrc.includes('appendDiscussionUsageFootnote') &&
    chatDiscussionRoundRunnerSrc.includes('setChatAbortController(null)') &&
    !chatDiscussionSrc.includes('callChatAPIWithContinuation'),
  'found');
assert('chat-discussion-state.js owns persona state helpers',
  chatDiscussionSrc.includes("from './chat-discussion-state.js'") &&
    chatDiscussionFlowSrc.includes("from './chat-discussion-state.js'") &&
    chatDiscussionLifecycleSrc.includes("from './chat-discussion-state.js'") &&
    chatDiscussionStateSrc.includes('export function getCurrentDiscussionState') &&
    chatDiscussionStateSrc.includes('export function collectDiscussionPersonas') &&
    chatDiscussionStateSrc.includes('export function clearCurrentDiscussionThreadState') &&
    chatDiscussionStateSrc.includes('export function reopenCurrentDiscussionThread') &&
    chatDiscussionLifecycleSrc.includes('clearCurrentDiscussionThreadState({ clearThread, markEnded })') &&
    chatDiscussionFlowSrc.includes('reopenCurrentDiscussionThread()') &&
    !chatDiscussionSrc.includes('saveChatThreadIndex'),
  'found');
assert('chat-discussion-ui.js owns discussion button and continuation controls',
  chatDiscussionSrc.includes("from './chat-discussion-ui.js'") &&
    chatDiscussionFlowSrc.includes("from './chat-discussion-ui.js'") &&
    chatDiscussionUiSrc.includes("from './chat-discussion-picker.js'") &&
    chatDiscussionUiSrc.includes('export function updateDiscussButton') &&
    chatDiscussionUiSrc.includes('export function showDiscussContinuePrompt') &&
    chatDiscussionUiSrc.includes('export function removeDiscussContinuePrompt') &&
    chatDiscussionFlowSrc.includes('readDiscussPersonaPickerSelection()') &&
    !chatDiscussionSrc.includes("querySelector('.discuss-persona-picker')") &&
    !chatDiscussionSrc.includes('export function updateDiscussButton'),
  'found');
assert('chat-discussion-picker.js owns discussion picker DOM and selection',
  chatDiscussionPickerSrc.includes('export function removeDiscussPersonaPicker') &&
    chatDiscussionPickerSrc.includes('export function readDiscussPersonaPickerSelection') &&
    chatDiscussionPickerSrc.includes('export function showDiscussPersonaPicker') &&
    chatDiscussionPickerSrc.includes('const addingToExisting = activePersonaIds.size > 0') &&
    chatDiscussionPickerSrc.includes('checkedCount !== maxNewSelections') &&
    !chatDiscussionUiSrc.includes("querySelector('.discuss-persona-picker')"),
  'found');
assert('Discuss button does not duplicate inline Continue',
  window.startDiscussion.toString().includes('showDiscussPersonaPicker') &&
    !window.startDiscussion.toString().includes('_runDiscussion'),
  'opens persona picker instead of running another round directly');
assert('chat-discussion-round-request.js owns round API request setup',
  chatDiscussionRoundRunnerSrc.includes("from './chat-discussion-round-request.js'") &&
    chatDiscussionRoundRequestSrc.includes('export async function buildDiscussionRoundRequest') &&
    chatDiscussionRoundRequestSrc.includes('queryLensMulti(msgText') &&
    chatDiscussionRoundRequestSrc.includes('buildTaggedChatMessages(roundHistory, personality.name)') &&
    chatDiscussionRoundRequestSrc.includes('export function buildDiscussionAssistantMessage') &&
    chatDiscussionRoundRequestSrc.includes('export function trackDiscussionUsage'),
  'found');
assert('chat-discussion-round-state.js owns thread-bound round persistence',
  chatDiscussionRoundRunnerSrc.includes("from './chat-discussion-round-state.js'") &&
    chatDiscussionRoundStateSrc.includes('export function isRoundThreadActive') &&
    chatDiscussionRoundStateSrc.includes('export function persistDiscussionThreadState') &&
    chatDiscussionRoundStateSrc.includes('export function renderRoundMessages') &&
    chatDiscussionRoundStateSrc.includes('export async function saveRoundChatHistory'),
  'found');
assert('chat-discussion-round-view.js owns live discussion round DOM',
  chatDiscussionRoundRunnerSrc.includes("from './chat-discussion-round-view.js'") &&
    chatDiscussionRoundViewSrc.includes('export function createDiscussionTypingIndicator') &&
    chatDiscussionRoundViewSrc.includes('export function appendRoundPersonaLabel') &&
    chatDiscussionRoundViewSrc.includes('export function renderFinalDiscussionMessage') &&
    chatDiscussionRoundViewSrc.includes('export function appendDiscussionUsageFootnote') &&
    chatDiscussionRoundViewSrc.includes('export function renderDiscussionRoundError'),
  'found');
assert('chat discussion rounds stay bound to origin thread during streaming',
  chatDiscussionRoundRunnerSrc.includes('const roundThreadId = opts.threadId || state.currentThreadId') &&
    chatDiscussionRoundRunnerSrc.includes('saveRoundChatHistory(roundThreadId, roundHistory)') &&
    chatDiscussionTurnsSrc.includes('persistDiscussionThreadState(threadId, allPersonas, originalPersonality)'),
  'prevents thread switches mid-stream from dropping the continue prompt');
assert('chat discussion live stream restores persona label after thread switch',
  chatDiscussionRoundViewSrc.includes('export function appendRoundPersonaLabel') &&
    chatDiscussionRoundRunnerSrc.includes('appendRoundPersonaLabel(roundThreadId, container, labelEl);') &&
    /onStream\(text\)[\s\S]{0,180}appendRoundPersonaLabel\(roundThreadId, container, labelEl\);[\s\S]{0,80}typewriter\.update\(text\)/.test(chatDiscussionRoundRunnerSrc),
  're-entering the origin thread mid-stream should show whose response is streaming');
assert('chat-discussion.js typewriter callback degrades safely',
  !chatDiscussionCallbacksSrc.includes('Chat discussion typewriter callback not configured') &&
    /function createDiscussionTypewriter[\s\S]{0,180}update\(\) \{\}[\s\S]{0,80}stop\(\) \{\}/.test(chatDiscussionCallbacksSrc),
  'fallback typewriter should no-op instead of throwing before cleanup');
assert('chat.js imports onboarding helpers', chatSrc.includes("from './chat-onboarding.js'"), 'found');
assert('chat-onboarding.js owns onboarding handlers',
  chatOnboardingSrc.includes('export function startOnboardingLabImport') &&
    chatOnboardingSrc.includes('export function saveChatProfile') &&
    chatOnboardingSrc.includes('export function _renderProviderQuiz'),
  'found');
assert('chat window bindings configure onboarding callbacks',
  chatWindowBindingsSrc.includes('configureChatOnboarding') &&
    chatWindowBindingsSrc.includes('sendChatMessage') &&
    chatWindowBindingsSrc.includes('updateChatNudge'),
  'found');

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

  const bar0 = buildActionBar(1); // first AI msg
  const barLast = buildActionBar(3); // last AI msg
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
