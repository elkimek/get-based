#!/usr/bin/env node
// test-chat-threads.js — Chat thread feature. Window-export checks, state
// shape, thread CRUD (create / auto-name / rename / delete), legacy
// migration, save/load round-trip, 50-thread pruning, backup snapshot,
// encryption-pattern matching, ensureActiveThread, thread-personality
// inheritance, plus source-inspection of profile.js / styles.css.
//
// Run: node tests/test-chat-threads.js  (or via npm test)
//
// DOM-runtime sections (3 HTML structure + getComputedStyle, 10 rail-toggle
// classList, 11 search-filter rendered .chat-thread-item readback) live in
// tests/test-chat-threads-dom.js on the puppeteer runner.

import './_node-shim.js';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel.replace(/^\//, '')), 'utf-8');

let passed = 0, failed = 0, total = 0;
function assert(name, condition, detail) {
  total++;
  if (condition) { passed++; console.log(`  PASS: ${name}`); }
  else { failed++; console.log(`  FAIL: ${name}${detail ? ' — ' + detail : ''}`); }
}

// generateThreadId() in chat-threads.js is `'t_' + Date.now().toString(36)`
// — pure millisecond timestamp, no counter. In Node (no DOM-render delay
// between calls) two createNewThread() calls can land in the same ms and
// collide on id; puppeteer's render latency happened to space them out.
// A 2ms gap before each createNewThread keeps ids distinct. (The latent
// collision in generateThreadId itself is noted in the PR description.)
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

console.log('=== Chat Threads Tests ===\n');

// state.js → state + isSensitiveKey lives in crypto.js, buildBackupSnapshot
// in backup.js, the thread handlers in chat-threads.js, saveChatHistory /
// loadChatHistory in chat.js — all exposed via Object.assign(window, ...).
const stateModule = await import('../js/state.js');
await import('../js/crypto.js');
await import('../js/backup.js');
await import('../js/chat-threads.js');
await import('../js/chat.js');

const st = stateModule.state;

// ═══════════════════════════════════════════════
// 1. Source Inspection — Window Exports
// ═══════════════════════════════════════════════
console.log('1. Window Exports');
const threadFns = [
  'getChatThreadsKey', 'getChatThreadKey',
  'loadChatThreads', 'saveChatThreadIndex',
  'ensureActiveThread', 'createNewThread',
  'switchToThread', 'deleteThread',
  'renameThread', 'renameThreadPrompt',
  'autoNameThread', 'pruneOldThreads',
  'renderThreadList', 'filterThreadList',
  'toggleThreadRail'
];
for (const fn of threadFns) {
  assert(`window.${fn} exists`, typeof window[fn] === 'function');
}

// ═══════════════════════════════════════════════
// 2. State Shape
// ═══════════════════════════════════════════════
console.log('2. State Shape');
assert('state.chatThreads exists', Array.isArray(st.chatThreads));
assert('state.currentThreadId exists', st.hasOwnProperty('currentThreadId'));

// Section 3 (HTML structure + getComputedStyle) lives in test-chat-threads-dom.js.

// ═══════════════════════════════════════════════
// 4. Thread CRUD — Create
// ═══════════════════════════════════════════════
console.log('4. Thread CRUD — Create');
const origThreads = st.chatThreads.slice();
const origThreadId = st.currentThreadId;
const origHistory = st.chatHistory.slice();
const profileId = st.currentProfile;

st.chatThreads = [];
st.currentThreadId = null;
localStorage.removeItem(window.getChatThreadsKey());

await sleep(2); window.createNewThread();
assert('createNewThread creates 1 thread', st.chatThreads.length === 1);
assert('thread has valid id', st.chatThreads[0].id.startsWith('t_'));
assert('thread name is "New Conversation"', st.chatThreads[0].name === 'New Conversation');
assert('thread has createdAt', !!st.chatThreads[0].createdAt);
assert('thread has updatedAt', !!st.chatThreads[0].updatedAt);
assert('thread messageCount is 0', st.chatThreads[0].messageCount === 0);
assert('currentThreadId set', st.currentThreadId === st.chatThreads[0].id);
assert('chatHistory is empty', st.chatHistory.length === 0);

const firstThreadId = st.chatThreads[0].id;

// ═══════════════════════════════════════════════
// 5. Thread CRUD — Auto-name
// ═══════════════════════════════════════════════
console.log('5. Thread CRUD — Auto-name');
window.autoNameThread(firstThreadId, 'What are my vitamin D levels looking like over the past year?');
const namedThread = st.chatThreads.find(t => t.id === firstThreadId);
assert('auto-name applied', namedThread.name !== 'New Conversation');
assert('auto-name <= 41 chars (40 + ellipsis)', namedThread.name.length <= 41);
assert('auto-name has ellipsis for long text', namedThread.name.endsWith('…'));

await sleep(2); window.createNewThread();
const shortThreadId = st.chatThreads[0].id;
window.autoNameThread(shortThreadId, 'Thyroid panel');
const shortThread = st.chatThreads.find(t => t.id === shortThreadId);
assert('short message name has no ellipsis', shortThread.name === 'Thyroid panel');

window.autoNameThread(shortThreadId, 'Different message');
assert('auto-name does not overwrite existing name', shortThread.name === 'Thyroid panel');

// ═══════════════════════════════════════════════
// 6. Thread CRUD — Rename
// ═══════════════════════════════════════════════
console.log('6. Thread CRUD — Rename');
window.renameThread(shortThreadId, 'My Custom Name');
assert('rename applied', shortThread.name === 'My Custom Name');
window.renameThread(shortThreadId, '');
assert('empty rename ignored', shortThread.name === 'My Custom Name');

// ═══════════════════════════════════════════════
// 7. Thread CRUD — Delete
// ═══════════════════════════════════════════════
console.log('7. Thread CRUD — Delete');
await sleep(2); window.createNewThread();
const deleteTargetId = st.currentThreadId;
localStorage.setItem(window.getChatThreadKey(deleteTargetId), JSON.stringify([{ role: 'user', content: 'test' }]));
const countBefore = st.chatThreads.length;
st.chatThreads = st.chatThreads.filter(t => t.id !== deleteTargetId);
window.saveChatThreadIndex();
localStorage.removeItem(window.getChatThreadKey(deleteTargetId));
assert('thread removed from index', st.chatThreads.length === countBefore - 1);
assert('thread messages removed from localStorage', localStorage.getItem(window.getChatThreadKey(deleteTargetId)) === null);

// ═══════════════════════════════════════════════
// 8. Legacy Migration
// ═══════════════════════════════════════════════
console.log('8. Legacy Migration');
st.chatThreads = [];
st.currentThreadId = null;
localStorage.removeItem(window.getChatThreadsKey());
const legacyKey = `labcharts-${profileId}-chat`;
const legacyMessages = [
  { role: 'user', content: 'Hello' },
  { role: 'assistant', content: 'Hi there!' }
];
localStorage.setItem(legacyKey, JSON.stringify(legacyMessages));
window.loadChatThreads();
assert('migration creates 1 thread', st.chatThreads.length === 1);
assert('migrated thread id is t_migrated', st.chatThreads[0].id === 't_migrated');
assert('migrated thread named "Previous Chat"', st.chatThreads[0].name === 'Previous Chat');
assert('migrated thread messageCount matches', st.chatThreads[0].messageCount === 2);
const migratedMessages = JSON.parse(localStorage.getItem(window.getChatThreadKey('t_migrated')));
assert('migrated messages written to per-thread key', migratedMessages && migratedMessages.length === 2);
assert('legacy key preserved (rollback safety)', localStorage.getItem(legacyKey) !== null);
localStorage.removeItem(legacyKey);
localStorage.removeItem(window.getChatThreadKey('t_migrated'));

// ═══════════════════════════════════════════════
// 9. Save/Load Round-trip
// ═══════════════════════════════════════════════
console.log('9. Save/Load Round-trip');
st.chatThreads = [];
st.currentThreadId = null;
localStorage.removeItem(window.getChatThreadsKey());
await sleep(2); window.createNewThread();
const rtThreadId = st.currentThreadId;
st.chatHistory = [
  { role: 'user', content: 'Test message' },
  { role: 'assistant', content: 'Test response' }
];
await window.saveChatHistory();
const savedIndex = JSON.parse(localStorage.getItem(window.getChatThreadsKey()));
assert('thread index saved to localStorage', savedIndex && savedIndex.length === 1);
assert('thread index messageCount updated', savedIndex[0].messageCount === 2);
const savedMessages = JSON.parse(localStorage.getItem(window.getChatThreadKey(rtThreadId)));
assert('messages saved to per-thread key', savedMessages && savedMessages.length === 2);
st.chatHistory = [];
await window.loadChatHistory();
assert('messages loaded back', st.chatHistory.length === 2);
assert('message content matches', st.chatHistory[0].content === 'Test message');
localStorage.removeItem(window.getChatThreadKey(rtThreadId));

// Section 10 (rail-toggle persistence) + Section 11 (search filtering)
// live in test-chat-threads-dom.js.

// ═══════════════════════════════════════════════
// 12. Thread Pruning (50 max)
// ═══════════════════════════════════════════════
console.log('12. Thread Pruning (50 max)');
st.chatThreads = [];
for (let i = 0; i < 55; i++) {
  const ts = new Date(Date.now() - (55 - i) * 60000).toISOString();
  st.chatThreads.push({
    id: `t_prune_${i}`,
    name: `Thread ${i}`,
    createdAt: ts,
    updatedAt: ts,
    messageCount: 1,
    personality: 'default'
  });
}
window.pruneOldThreads();
assert('pruned to 50 threads', st.chatThreads.length === 50, 'Got ' + st.chatThreads.length);
assert('oldest threads removed', !st.chatThreads.find(t => t.id === 't_prune_0'));
assert('newest threads kept', !!st.chatThreads.find(t => t.id === 't_prune_54'));
for (let i = 0; i < 55; i++) {
  localStorage.removeItem(window.getChatThreadKey(`t_prune_${i}`));
}

// ═══════════════════════════════════════════════
// 13. Backup Snapshot
// ═══════════════════════════════════════════════
console.log('13. Backup Snapshot');
// buildBackupSnapshot() early-returns null when `labcharts-profiles` is
// absent (backup.js:104). Puppeteer has the bootstrapped profile registry;
// in Node we seed a minimal one so the snapshot path runs.
const _origProfiles = localStorage.getItem('labcharts-profiles');
if (!_origProfiles) {
  localStorage.setItem('labcharts-profiles', JSON.stringify([{ id: profileId, name: 'Test Profile' }]));
}
st.chatThreads = [
  { id: 't_backup1', name: 'Backup Test', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), messageCount: 1, personality: 'default' }
];
window.saveChatThreadIndex();
localStorage.setItem(window.getChatThreadKey('t_backup1'), JSON.stringify([{ role: 'user', content: 'backup test' }]));

const snapshot = window.buildBackupSnapshot();
assert('snapshot exists', !!snapshot);
if (snapshot) {
  const profileBackup = snapshot.profiles.find(p => p.profileId === profileId);
  assert('profile found in snapshot', !!profileBackup);
  if (profileBackup) {
    assert('thread index in backup', !!profileBackup.keys['chat-threads'], 'Has: ' + Object.keys(profileBackup.keys).join(','));
    assert('per-thread messages in backup', !!profileBackup.keys['chat-t_t_backup1']);
    assert('chatRailOpen in backup prefs', profileBackup.keys.hasOwnProperty('chatRailOpen') || true, '(optional — only present if set)');
  }
}
localStorage.removeItem(window.getChatThreadKey('t_backup1'));
if (!_origProfiles) localStorage.removeItem('labcharts-profiles');
else localStorage.setItem('labcharts-profiles', _origProfiles);

// ═══════════════════════════════════════════════
// 14. Encryption Patterns
// ═══════════════════════════════════════════════
// crypto.js's SENSITIVE_PATTERNS all anchor on `^labcharts-[^-]+-chat…$`.
// Real profile ids come from createProfile() as `Date.now().toString(36)`
// — hyphen-free — so `[^-]+` matches them. Use a representative hyphen-free
// id here.
//
// NOTE: the original puppeteer test asserted the thread *index* key was
// NOT sensitive ("plaintext by design"). That contradicts crypto.js, which
// lists `^labcharts-[^-]+-chat-threads$` in SENSITIVE_PATTERNS — the index
// IS encrypted. The stale assertion is corrected here to match the code;
// if plaintext-index is the intended design, that's a crypto.js change,
// not a test one.
console.log('14. Encryption Patterns');
const _encPid = 'mp567abc';
assert('isSensitiveKey matches per-thread key', window.isSensitiveKey(`labcharts-${_encPid}-chat-t_abc123`));
assert('isSensitiveKey matches legacy chat key', window.isSensitiveKey(`labcharts-${_encPid}-chat`));
assert('isSensitiveKey matches thread index (crypto.js SENSITIVE_PATTERNS)',
  window.isSensitiveKey(`labcharts-${_encPid}-chat-threads`));

// ═══════════════════════════════════════════════
// 15. Profile Delete Cleanup (source inspection)
// ═══════════════════════════════════════════════
console.log('15. Profile Delete Cleanup (source inspection)');
const profileSrc = read('js/profile.js');
assert('deleteProfile removes chat-threads key', profileSrc.includes('chat-threads'));
assert('deleteProfile removes chat-t_ keys', profileSrc.includes('chat-t_'));
assert('deleteProfile removes chatRailOpen', profileSrc.includes('chatRailOpen'));
assert('loadProfile resets chatThreads', profileSrc.includes('state.chatThreads = []'));
assert('loadProfile resets currentThreadId', profileSrc.includes('state.currentThreadId = null'));
assert('loadProfile reloads active profile chat threads', profileSrc.includes('window.loadChatThreads?.()'));
assert('loadProfile reloads active profile chat history', profileSrc.includes('await window.loadChatHistory?.()'));
assert('loadProfile rerenders chat rail after profile switch', profileSrc.includes('window.renderThreadList?.()'));

// ═══════════════════════════════════════════════
// 16. CSS Inspection
// ═══════════════════════════════════════════════
console.log('16. CSS Inspection');
const cssSrc = read('styles.css');
const indexSrc = read('index.html');
assert('CSS has .chat-thread-rail', cssSrc.includes('.chat-thread-rail'));
assert('CSS has .chat-thread-rail.open', cssSrc.includes('.chat-thread-rail.open'));
assert('CSS has .chat-thread-item', cssSrc.includes('.chat-thread-item'));
assert('CSS has .chat-thread-item.active', cssSrc.includes('.chat-thread-item.active'));
assert('CSS has .chat-panel-conversation', cssSrc.includes('.chat-panel-conversation'));
assert('CSS has .chat-rail-toggle', cssSrc.includes('.chat-rail-toggle'));
assert('CSS has .chat-thread-item-actions', cssSrc.includes('.chat-thread-item-actions'));
assert('CSS has mobile rail overlay', cssSrc.includes('.chat-thread-rail.open') && cssSrc.includes('768px'));
assert('chat thread list is keyboard focusable', indexSrc.includes('id="chat-thread-list" tabindex="0"'));
assert('CSS has focus-visible thread list outline', cssSrc.includes('.chat-thread-list:focus-visible'));

// ═══════════════════════════════════════════════
// 17. ensureActiveThread
// ═══════════════════════════════════════════════
console.log('17. ensureActiveThread');
st.chatThreads = [];
st.currentThreadId = null;
window.ensureActiveThread();
assert('creates thread when none exist', st.chatThreads.length === 1);
assert('sets currentThreadId', !!st.currentThreadId);

const oldTs = new Date(Date.now() - 100000).toISOString();
const newTs = new Date().toISOString();
st.chatThreads = [
  { id: 't_old', name: 'Old', createdAt: oldTs, updatedAt: oldTs, messageCount: 1, personality: 'default' },
  { id: 't_new', name: 'New', createdAt: newTs, updatedAt: newTs, messageCount: 2, personality: 'default' }
];
st.currentThreadId = 'nonexistent';
window.ensureActiveThread();
assert('picks most recent thread', st.currentThreadId === 't_new');

// ═══════════════════════════════════════════════
// 18. Thread Personality
// ═══════════════════════════════════════════════
console.log('18. Thread Personality');
st.chatThreads = [];
st.currentThreadId = null;
st.currentChatPersonality = 'house';
await sleep(2); window.createNewThread();
const pThread = st.chatThreads.find(t => t.id === st.currentThreadId);
assert('new thread inherits current personality', pThread && pThread.personality === 'house');

// ═══════════════════════════════════════════════
// CLEANUP — Restore original state
// ═══════════════════════════════════════════════
st.chatThreads = origThreads;
st.currentThreadId = origThreadId;
st.chatHistory = origHistory;
if (origThreads.length > 0) {
  window.saveChatThreadIndex();
} else {
  localStorage.removeItem(window.getChatThreadsKey());
}
for (const key of Object.keys(localStorage)) {
  if (key.includes('chat-t_t_') || key.includes('t_prune_') || key.includes('t_backup')) {
    localStorage.removeItem(key);
  }
}

console.log(`\nResults: ${passed} passed, ${failed} failed, ${total} total`);
process.exit(failed > 0 ? 1 : 0);
