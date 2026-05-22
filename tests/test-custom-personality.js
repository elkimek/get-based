#!/usr/bin/env node
// test-custom-personality.js — Multiple Custom Personalities. Window-export
// checks, pickPersonaIcon determinism, getCustomPersonalities array storage +
// migrations, compat shim, getActivePersonality, loadChatPersonality
// validation, plus `.toString()` source-inspection of chat module handlers and
// file-read checks of constants.js / backup.js / service-worker.js / api.js /
// styles.css.
//
// Run: node tests/test-custom-personality.js  (or via npm test)
//
// DOM-runtime assertions (sections 11, 12, 17, 21 — updatePersonalityBar
// rendering, document.styleSheets CSS-rule scan, dirty-state save button,
// Discuss button DOM) live in tests/test-custom-personality-dom.js on the
// puppeteer runner.

import './_node-shim.js';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel.replace(/^\//, '')), 'utf-8');

let pass = 0, fail = 0;
function assert(name, condition, detail) {
  if (condition) { pass++; console.log(`  PASS: ${name}`); }
  else { fail++; console.log(`  FAIL: ${name}${detail ? ' — ' + detail : ''}`); }
}

console.log('=== Multiple Custom Personalities Tests ===\n');

// chat.js exposes the personality + discussion handlers via Object.assign(window).
await import('../js/state.js');
await import('../js/chat.js');
const { buildPersonalityPrompt } = await import('../js/chat-prompt-context.js');

const profileId = localStorage.getItem('labcharts-current-profile') || 'default';
const key = `labcharts-${profileId}-chatPersonalityCustom`;
const origVal = localStorage.getItem(key);
const origPersonality = localStorage.getItem(`labcharts-${profileId}-chatPersonality`);

// ── 1. Window exports ──
console.log('1. Window exports');
assert('getCustomPersonalities exported', typeof window.getCustomPersonalities === 'function');
assert('saveCustomPersonalities exported', typeof window.saveCustomPersonalities === 'function');
assert('getCustomPersonality exported', typeof window.getCustomPersonality === 'function');
assert('getCustomPersonalityText exported', typeof window.getCustomPersonalityText === 'function');
assert('pickPersonaIcon exported', typeof window.pickPersonaIcon === 'function');
assert('generateCustomPersonality exported', typeof window.generateCustomPersonality === 'function');
assert('saveCustomPersonality exported', typeof window.saveCustomPersonality === 'function');
assert('startNewCustomPersonality exported', typeof window.startNewCustomPersonality === 'function');
assert('deleteCustomPersonality exported', typeof window.deleteCustomPersonality === 'function');
assert('getActivePersonality exported', typeof window.getActivePersonality === 'function');
assert('autoResizePersonaTextarea exported', typeof window.autoResizePersonaTextarea === 'function');
assert('markPersonalityDirty exported', typeof window.markPersonalityDirty === 'function');
assert('snapshotPersonalityClean exported', typeof window.snapshotPersonalityClean === 'function');

// ── 2. pickPersonaIcon determinism ──
console.log('2. pickPersonaIcon determinism');
const icon1 = window.pickPersonaIcon('Longevity Expert');
const icon2 = window.pickPersonaIcon('Longevity Expert');
assert('pickPersonaIcon returns same icon for same name', icon1 === icon2, `${icon1} vs ${icon2}`);
assert('pickPersonaIcon returns emoji', icon1.length > 0);
const iconEmpty = window.pickPersonaIcon('');
assert('pickPersonaIcon empty name returns pencil', iconEmpty === '✏️', `got: ${iconEmpty}`);
const iconNull = window.pickPersonaIcon(null);
assert('pickPersonaIcon null returns pencil', iconNull === '✏️');
const PERSONA_ICONS = ['🧠', '🎭', '🔮', '🌿', '⚡', '🦊', '🧬', '🌊', '🔥', '🏛️'];
assert('pickPersonaIcon result is from palette', PERSONA_ICONS.includes(icon1), `got: ${icon1}`);

// ── 3. getCustomPersonalities — array storage ──
console.log('3. getCustomPersonalities array storage');
localStorage.removeItem(key);
assert('Empty storage returns []', JSON.stringify(window.getCustomPersonalities()) === '[]');
const arr = [
  { id: 'custom_abc', name: 'Longevity Expert', icon: '🧠', promptText: 'Expert prompt', evidenceBased: true },
  { id: 'custom_def', name: 'Functional Doc', icon: '🔮', promptText: 'Functional prompt', evidenceBased: false }
];
localStorage.setItem(key, JSON.stringify(arr));
const loaded = window.getCustomPersonalities();
assert('Array: returns 2 items', loaded.length === 2);
assert('Array: first item name', loaded[0].name === 'Longevity Expert');
assert('Array: second item name', loaded[1].name === 'Functional Doc');
assert('Array: IDs preserved', loaded[0].id === 'custom_abc' && loaded[1].id === 'custom_def');

// ── 4. Migration from single object ──
console.log('4. Migration from single object');
const singleObj = { name: 'Longevity Expert', icon: '🧠', promptText: 'You are a longevity researcher...', evidenceBased: true };
localStorage.setItem(key, JSON.stringify(singleObj));
const migrated = window.getCustomPersonalities();
assert('Single obj: returns array of 1', migrated.length === 1);
assert('Single obj: id is custom_migrated', migrated[0].id === 'custom_migrated');
assert('Single obj: name preserved', migrated[0].name === 'Longevity Expert');
assert('Single obj: promptText preserved', migrated[0].promptText === 'You are a longevity researcher...');
assert('Single obj: evidenceBased preserved', migrated[0].evidenceBased === true);

// ── 5. Migration from legacy string ──
console.log('5. Migration from legacy string');
localStorage.setItem(key, 'Speak like a pirate doctor');
const legacyArr = window.getCustomPersonalities();
assert('Legacy string: returns array of 1', legacyArr.length === 1);
assert('Legacy string: id is custom_migrated', legacyArr[0].id === 'custom_migrated');
assert('Legacy string: name is Custom Personality', legacyArr[0].name === 'Custom Personality');
assert('Legacy string: promptText is the string', legacyArr[0].promptText === 'Speak like a pirate doctor');
assert('Legacy string: evidenceBased false', legacyArr[0].evidenceBased === false);

// ── 6. getCustomPersonality compat shim ──
console.log('6. getCustomPersonality compat shim');
localStorage.setItem(key, JSON.stringify(arr));
localStorage.setItem(`labcharts-${profileId}-chatPersonality`, 'custom_def');
window.loadChatPersonality();
const compat = window.getCustomPersonality();
assert('Compat shim: returns matching custom', compat.id === 'custom_def');
assert('Compat shim: name is Functional Doc', compat.name === 'Functional Doc');
localStorage.setItem(`labcharts-${profileId}-chatPersonality`, 'default');
window.loadChatPersonality();
const compatFallback = window.getCustomPersonality();
assert('Compat shim: fallback returns first', compatFallback.id === 'custom_abc');
assert('getCustomPersonalityText returns promptText', window.getCustomPersonalityText() === 'Expert prompt');
localStorage.removeItem(key);
const compatEmpty = window.getCustomPersonality();
assert('Compat shim: empty returns blank', compatEmpty.promptText === '' && compatEmpty.name === 'Custom Personality');

// ── 7. saveCustomPersonalities ──
console.log('7. saveCustomPersonalities');
const testArr = [{ id: 'custom_test1', name: 'Test1', icon: '⚡', promptText: 'p1', evidenceBased: false }];
window.saveCustomPersonalities(testArr);
const saved = JSON.parse(localStorage.getItem(key));
assert('saveCustomPersonalities writes array', Array.isArray(saved));
assert('saveCustomPersonalities data correct', saved[0].name === 'Test1');

// ── 8. getActivePersonality for custom IDs ──
console.log('8. getActivePersonality for custom IDs');
localStorage.setItem(key, JSON.stringify(arr));
localStorage.setItem(`labcharts-${profileId}-chatPersonality`, 'custom_abc');
window.loadChatPersonality();
const active = window.getActivePersonality();
assert('Active custom: id is custom_abc', active.id === 'custom_abc');
assert('Active custom: name is Longevity Expert', active.name === 'Longevity Expert');
assert('Active custom: has greeting', typeof active.greeting === 'string' && active.greeting.length > 0);
localStorage.setItem(`labcharts-${profileId}-chatPersonality`, 'custom_nonexistent');
window.loadChatPersonality();
const fallback = window.getActivePersonality();
assert('Deleted custom: falls back to default', fallback.id === 'default');

// ── 9. loadChatPersonality accepts custom IDs ──
console.log('9. loadChatPersonality validation');
localStorage.setItem(key, JSON.stringify(arr));
localStorage.setItem(`labcharts-${profileId}-chatPersonality`, 'custom_abc');
window.loadChatPersonality();
assert('loadChatPersonality accepts custom_abc', window.getActivePersonality().id === 'custom_abc');
localStorage.setItem(`labcharts-${profileId}-chatPersonality`, 'custom_bogus');
window.loadChatPersonality();
assert('loadChatPersonality rejects unknown custom', window.getActivePersonality().id === 'default');
localStorage.setItem(`labcharts-${profileId}-chatPersonality`, 'custom');
window.loadChatPersonality();
assert('loadChatPersonality migrates legacy custom', window.getActivePersonality().id === 'custom_abc');

// ── 10. CHAT_PERSONALITIES no longer has custom entry ──
console.log('10. CHAT_PERSONALITIES static entries');
const constantsSrc = read('js/constants.js');
assert('CHAT_PERSONALITIES has default', constantsSrc.includes("id: 'default'"));
assert('CHAT_PERSONALITIES has house', constantsSrc.includes("id: 'house'"));
assert('CHAT_PERSONALITIES no custom entry', !constantsSrc.includes("id: 'custom'"));

// Sections 11, 12, 17, 21 (DOM-runtime) live in test-custom-personality-dom.js.

// ── 13. sendChatMessage uses custom_ prefix check ──
console.log('13. custom personality prompt context');
const sendSrc = window.sendChatMessage.toString();
const promptContextSrc = read('js/chat-prompt-context.js');
assert('sendChatMessage delegates personality prompt helper', sendSrc.includes('buildPersonalityPrompt'));
assert('prompt context checks custom_ prefix', promptContextSrc.includes("startsWith('custom_')") || promptContextSrc.includes('startsWith("custom_")'));
assert('prompt context uses Persona: prefix', buildPersonalityPrompt({ id: 'custom_abc' }, { promptText: 'Be direct.' }).includes('Persona: Be direct.'));

// ── 14. Thread metadata ──
console.log('14. Thread metadata');
const createSrc = window.createNewThread.toString();
assert('createNewThread has personalityName', createSrc.includes('personalityName'));
assert('createNewThread has personalityIcon', createSrc.includes('personalityIcon'));
const saveSrc = window.saveChatHistory.toString();
assert('saveChatHistory has personalityName', saveSrc.includes('personalityName'));
assert('saveChatHistory has personalityIcon', saveSrc.includes('personalityIcon'));

// ── 15. Backup compat ──
// PER_PROFILE_PREF_SUFFIXES moved from crypto.js to backup.js in the v1.18.5 extraction.
console.log('15. Backup compat');
const backupSrc = read('js/backup.js');
assert('PER_PROFILE_PREF_SUFFIXES has chatPersonalityCustom', backupSrc.includes('chatPersonalityCustom'));

// ── 16. Service worker cache version ──
console.log('16. Service worker version');
const swSrc = read('service-worker.js');
assert('SW uses importScripts for version', swSrc.includes("importScripts('/version.js')"));
assert('SW CACHE_NAME uses semver', swSrc.includes('`labcharts-v${self.APP_VERSION}`'));

// ── 18. Stop button exports ──
console.log('18. Stop button');
assert('sendChatMessage exported', typeof window.sendChatMessage === 'function');
const sendSrc2 = window.sendChatMessage.toString();
assert('sendChatMessage checks _chatAbortController', sendSrc2.includes('_chatAbortController'));
assert('sendChatMessage calls abort()', sendSrc2.includes('.abort()'));
assert('sendChatMessage passes signal', sendSrc2.includes('signal:'));
assert('sendChatMessage handles AbortError', sendSrc2.includes('AbortError'));

// ── 19. Stop button CSS ──
console.log('19. Stop button CSS');
const css = read('styles.css');
const chatSrc = read('js/chat.js');
assert('CSS has .chat-send-btn.streaming', css.includes('.chat-send-btn.streaming'));
assert('CSS has .chat-stopped-note', css.includes('.chat-stopped-note'));

// ── 20. Discuss button exports ──
console.log('20. Discuss button exports');
assert('startDiscussion exported', typeof window.startDiscussion === 'function');
assert('continueDiscussion exported', typeof window.continueDiscussion === 'function');
assert('endDiscussion exported', typeof window.endDiscussion === 'function');
assert('updateDiscussButton exported', typeof window.updateDiscussButton === 'function');
assert('getThreadPersonaCount exported', typeof window.getThreadPersonaCount === 'function');

// ── 22. Discuss button CSS ──
console.log('22. Discuss button CSS');
assert('CSS has .chat-discuss-btn', css.includes('.chat-discuss-btn'));
assert('CSS has .chat-msg-auto', css.includes('.chat-msg-auto'));
assert('CSS has .chat-discuss-continue', css.includes('.chat-discuss-continue'));
assert('CSS has .chat-discuss-continue-btn', css.includes('.chat-discuss-continue-btn'));
assert('CSS has .chat-discuss-done-btn', css.includes('.chat-discuss-done-btn'));

// ── 23. getThreadPersonaCount source ──
console.log('23. getThreadPersonaCount');
const countSrc = window.getThreadPersonaCount.toString();
assert('getThreadPersonaCount checks personalityName', countSrc.includes('personalityName'));
assert('getThreadPersonaCount uses Set', countSrc.includes('new Set'));

// ── 24. API signal pass-through ──
console.log('24. API signal pass-through');
const apiSrc = read('js/api.js');
assert('API passes signal to fetch', apiSrc.includes('signal') && apiSrc.includes('fetch('));
assert('callOllamaChat has signal param', apiSrc.includes('callOllamaChat') && apiSrc.includes('signal }'));
assert('callOpenAICompatibleAPI has signal param', apiSrc.includes('callOpenAICompatibleAPI') && apiSrc.includes('signal }'));

// ── 25. Auto message rendering ──
console.log('25. Auto message rendering');
const renderSrc2 = window.renderChatMessages.toString();
assert('renderChatMessages checks msg.auto', renderSrc2.includes('msg.auto'));
assert('renderChatMessages applies chat-msg-auto class', renderSrc2.includes('chat-msg-auto'));
assert('renderChatMessages checks msg.stopped', renderSrc2.includes('msg.stopped'));

// ── 26. startDiscussion source ──
console.log('26. startDiscussion source');
const discSrc = window.startDiscussion.toString();
assert('startDiscussion shows persona picker', discSrc.includes('showDiscussPersonaPicker'));
const pickerSrc = window.startDiscussionFromPicker.toString();
assert('startDiscussionFromPicker delegates to _runDiscussion', pickerSrc.includes('_runDiscussion'));
const contSrc = window.continueDiscussion.toString();
assert('continueDiscussion removes prompt', contSrc.includes('removeDiscussContinuePrompt'));
assert('continueDiscussion runs another round', contSrc.includes('runDiscussionRound'));
assert('continueDiscussion reads steer input', contSrc.includes('chat-discuss-steer'));
const endSrc = window.endDiscussion.toString();
assert('endDiscussion cleans up state', endSrc.includes('cleanupDiscussionState'));
assert('endDiscussion marks discussion ended', endSrc.includes('markEnded: true'));
assert('chat restores discussion prompt without thread metadata', chatSrc.includes('restoreDiscussionContinuePrompt') && chatSrc.includes('collectDiscussionPersonas()'));
assert('manual messages in active discussion suppress duplicate auto prompt', chatSrc.includes('suppressAutoMsg: true'));
assert('endDiscussion restores personality', endSrc.includes('currentChatPersonality'));

// ── 27. Steer input CSS ──
console.log('27. Steer input');
assert('CSS has .chat-discuss-steer', css.includes('.chat-discuss-steer'));
assert('CSS has .chat-discuss-continue-actions', css.includes('.chat-discuss-continue-actions'));

// ── Restore ──
if (origVal !== null) localStorage.setItem(key, origVal);
else localStorage.removeItem(key);
if (origPersonality !== null) localStorage.setItem(`labcharts-${profileId}-chatPersonality`, origPersonality);
else localStorage.removeItem(`labcharts-${profileId}-chatPersonality`);
if (window.loadChatPersonality) window.loadChatPersonality();

console.log(`\nResults: ${pass} passed, ${fail} failed, ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
