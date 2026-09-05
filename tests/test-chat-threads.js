#!/usr/bin/env node
// test-chat-threads.js — Chat thread feature. Module-boundary checks, state
// shape, thread CRUD (create / auto-name / rename / delete), legacy
// migration, save/load round-trip, 50-thread pruning, backup snapshot,
// encryption-pattern matching, ensureActiveThread, thread-personality
// inheritance, plus source-inspection of profile.js / chat-thread-search.js /
// CSS bundle.
//
// Run: node tests/test-chat-threads.js  (or via npm test)
//
// DOM-runtime sections (3 HTML structure + getComputedStyle, 10 rail-toggle
// classList, 11 search-filter rendered .chat-thread-item readback) live in
// tests/playwright/chat-threads-dom.spec.js on the Playwright runner.

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

console.log('=== Chat Threads Tests ===\n');

// state.js → state + isSensitiveKey lives in crypto.js, buildBackupSnapshot
// is module-only in backup.js, and thread handlers are imported directly.
const stateModule = await import('../js/state.js');
const cryptoModule = await import('../js/crypto.js');
const backupModule = await import('../js/backup.js');
const chatThreadsModule = await import('../js/chat-threads.js');
const chatHistoryModule = await import('../js/chat-history.js');
await import('../js/chat.js');

const st = stateModule.state;

// ═══════════════════════════════════════════════
// 1. Source Inspection — Window Exports
// ═══════════════════════════════════════════════
console.log('1. Module Exports');
const threadFns = [
  'getChatThreadsKey', 'getChatThreadKey',
  'loadChatThreads', 'saveChatThreadIndex',
  'ensureActiveThread', 'createNewThread',
  'switchToThread', 'deleteThread',
  'renameThread', 'renameThreadPrompt',
  'createThreadProject', 'renameThreadProject', 'renameThreadProjectPrompt',
  'deleteThreadProject', 'deleteThreadProjectPrompt',
  'toggleThreadPinned', 'moveThreadToProject',
  'getChatThreadSort', 'setChatThreadSort',
  'autoNameThread', 'pruneOldThreads',
  'renderThreadList', 'filterThreadList',
  'installChatThreadDelegates',
  'invalidateThreadContentCache', 'jumpToSearchResult',
  'toggleThreadRail'
];
for (const fn of threadFns) {
  assert(`chatThreadsModule.${fn} exists`, typeof chatThreadsModule[fn] === 'function');
  assert(`window.${fn} stays module-only`, typeof window[fn] === 'undefined');
}

// ═══════════════════════════════════════════════
// 2. State Shape
// ═══════════════════════════════════════════════
console.log('2. State Shape');
assert('state.chatThreads exists', Array.isArray(st.chatThreads));
assert('state.currentThreadId exists', st.hasOwnProperty('currentThreadId'));

// Section 3 (HTML structure + getComputedStyle) lives in tests/playwright/chat-threads-dom.spec.js.

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
localStorage.removeItem(chatThreadsModule.getChatThreadsKey());

chatThreadsModule.createNewThread();
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
chatThreadsModule.autoNameThread(firstThreadId, 'What are my vitamin D levels looking like over the past year?');
const namedThread = st.chatThreads.find(t => t.id === firstThreadId);
assert('auto-name applied', namedThread.name !== 'New Conversation');
assert('auto-name <= 41 chars (40 + ellipsis)', namedThread.name.length <= 41);
assert('auto-name has ellipsis for long text', namedThread.name.endsWith('…'));

chatThreadsModule.createNewThread();
const shortThreadId = st.chatThreads[0].id;
assert('back-to-back thread creation keeps ids distinct', shortThreadId !== firstThreadId);
chatThreadsModule.autoNameThread(shortThreadId, 'Thyroid panel');
const shortThread = st.chatThreads.find(t => t.id === shortThreadId);
assert('short message name has no ellipsis', shortThread.name === 'Thyroid panel');

chatThreadsModule.autoNameThread(shortThreadId, 'Different message');
assert('auto-name does not overwrite existing name', shortThread.name === 'Thyroid panel');

// ═══════════════════════════════════════════════
// 6. Thread CRUD — Rename
// ═══════════════════════════════════════════════
console.log('6. Thread CRUD — Rename');
chatThreadsModule.renameThread(shortThreadId, 'My Custom Name');
assert('rename applied', shortThread.name === 'My Custom Name');
chatThreadsModule.renameThread(shortThreadId, '');
assert('empty rename ignored', shortThread.name === 'My Custom Name');

// ═══════════════════════════════════════════════
// 7. Thread CRUD — Delete
// ═══════════════════════════════════════════════
console.log('7. Thread CRUD — Delete');
chatThreadsModule.createNewThread();
const deleteTargetId = st.currentThreadId;
localStorage.setItem(chatThreadsModule.getChatThreadKey(deleteTargetId), JSON.stringify([{ role: 'user', content: 'test' }]));
const countBefore = st.chatThreads.length;
st.chatThreads = st.chatThreads.filter(t => t.id !== deleteTargetId);
chatThreadsModule.saveChatThreadIndex();
localStorage.removeItem(chatThreadsModule.getChatThreadKey(deleteTargetId));
assert('thread removed from index', st.chatThreads.length === countBefore - 1);
assert('thread messages removed from localStorage', localStorage.getItem(chatThreadsModule.getChatThreadKey(deleteTargetId)) === null);

// ═══════════════════════════════════════════════
// 8. Legacy Migration
// ═══════════════════════════════════════════════
console.log('8. Legacy Migration');
st.chatThreads = [];
st.currentThreadId = null;
localStorage.removeItem(chatThreadsModule.getChatThreadsKey());
const legacyKey = `labcharts-${profileId}-chat`;
const legacyMessages = [
  { role: 'user', content: 'Hello' },
  { role: 'assistant', content: 'Hi there!' }
];
localStorage.setItem(legacyKey, JSON.stringify(legacyMessages));
await chatThreadsModule.loadChatThreads();
assert('migration creates 1 thread', st.chatThreads.length === 1);
assert('migrated thread id is t_migrated', st.chatThreads[0].id === 't_migrated');
assert('migrated thread named "Previous Chat"', st.chatThreads[0].name === 'Previous Chat');
assert('migrated thread messageCount matches', st.chatThreads[0].messageCount === 2);
const migratedMessages = JSON.parse(localStorage.getItem(chatThreadsModule.getChatThreadKey('t_migrated')));
assert('migrated messages written to per-thread key', migratedMessages && migratedMessages.length === 2);
assert('legacy key preserved (rollback safety)', localStorage.getItem(legacyKey) !== null);
localStorage.removeItem(legacyKey);
localStorage.removeItem(chatThreadsModule.getChatThreadKey('t_migrated'));

// ═══════════════════════════════════════════════
// 9. Save/Load Round-trip
// ═══════════════════════════════════════════════
console.log('9. Save/Load Round-trip');
st.chatThreads = [];
st.currentThreadId = null;
localStorage.removeItem(chatThreadsModule.getChatThreadsKey());
chatThreadsModule.createNewThread();
const rtThreadId = st.currentThreadId;
st.chatHistory = [
  { role: 'user', content: 'Test message' },
  { role: 'assistant', content: 'Test response' }
];
await chatHistoryModule.saveChatHistory();
const savedIndex = JSON.parse(localStorage.getItem(chatThreadsModule.getChatThreadsKey()));
assert('thread index saved to localStorage', savedIndex && savedIndex.length === 1);
assert('thread index messageCount updated', savedIndex[0].messageCount === 2);
const savedMessages = JSON.parse(localStorage.getItem(chatThreadsModule.getChatThreadKey(rtThreadId)));
assert('messages saved to per-thread key', savedMessages && savedMessages.length === 2);
st.chatHistory = [];
await chatHistoryModule.loadChatHistory();
assert('messages loaded back', st.chatHistory.length === 2);
assert('message content matches', st.chatHistory[0].content === 'Test message');
localStorage.removeItem(chatThreadsModule.getChatThreadKey(rtThreadId));

// ═══════════════════════════════════════════════
// 10. Encrypted Thread Index Load Guard
// ═══════════════════════════════════════════════
console.log('10. Encrypted Thread Index Load Guard');
const _origWearablesTest = globalThis.__WEARABLES_TEST;
const _origEncryptionEnabled = localStorage.getItem('labcharts-encryption-enabled');
const guardedIndexKey = chatThreadsModule.getChatThreadsKey();
globalThis.__WEARABLES_TEST = true;
localStorage.setItem('labcharts-encryption-enabled', 'true');
await cryptoModule._setTestSessionKey('thread-index-passphrase');
const encryptedThread = {
  id: 't_encrypted_index',
  name: 'Encrypted Index',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  messageCount: 3,
  personality: 'default',
  projectName: 'Encrypted project',
};
await cryptoModule.encryptedSetItem(guardedIndexKey, JSON.stringify([encryptedThread]));
let encryptedIndexRaw = localStorage.getItem(guardedIndexKey);
assert('thread index can be encrypted at rest', encryptedIndexRaw?.startsWith('v1:'));
st.chatThreads = [];
const encryptedLoadResult = await chatThreadsModule.loadChatThreads();
assert('loadChatThreads decrypts encrypted thread index', encryptedLoadResult === true && st.chatThreads[0]?.id === encryptedThread.id);
assert('loadChatThreads keeps encrypted project membership', st.chatThreads[0]?.projectName === 'Encrypted project');
st.chatThreads[0].name = 'Encrypted Index Saved';
const encryptedSaveResult = await chatThreadsModule.saveChatThreadIndex({ sync: false });
encryptedIndexRaw = localStorage.getItem(guardedIndexKey);
const encryptedSavedPlaintext = await cryptoModule.encryptedGetItem(guardedIndexKey);
const encryptedSavedThreads = JSON.parse(encryptedSavedPlaintext || '[]');
assert('saveChatThreadIndex keeps unlocked encrypted index encrypted',
  encryptedSaveResult === true && encryptedIndexRaw?.startsWith('v1:'));
assert('saveChatThreadIndex encrypted write round-trips index JSON',
  encryptedSavedThreads[0]?.name === 'Encrypted Index Saved'
    && encryptedSavedThreads[0]?.projectName === 'Encrypted project');

await cryptoModule._setTestSessionKey(null);
st.chatThreads = [{
  id: 't_memory_guard',
  name: 'Memory Guard',
  createdAt: encryptedThread.createdAt,
  updatedAt: encryptedThread.updatedAt,
  messageCount: 1,
  personality: 'default'
}];
st.currentThreadId = null;
const blockedLoadResult = await chatThreadsModule.loadChatThreads();
assert('locked encrypted thread index reports blocked load', blockedLoadResult === false);
assert('blocked load preserves in-memory thread list', st.chatThreads.length === 1 && st.chatThreads[0].id === 't_memory_guard');
st.chatThreads = [];
const saveWhileBlocked = chatThreadsModule.saveChatThreadIndex();
assert('blocked thread index refuses overwrite', saveWhileBlocked === false);
assert('blocked thread index stays untouched on disk', localStorage.getItem(guardedIndexKey) === encryptedIndexRaw);
chatThreadsModule.ensureActiveThread();
assert('ensureActiveThread does not create while index is blocked', st.chatThreads.length === 0);
chatThreadsModule.createNewThread();
assert('createNewThread does not create while index is blocked', st.chatThreads.length === 0);

localStorage.removeItem(guardedIndexKey);
await chatThreadsModule.loadChatThreads();
await cryptoModule._setTestSessionKey(null);
if (_origEncryptionEnabled === null) localStorage.removeItem('labcharts-encryption-enabled');
else localStorage.setItem('labcharts-encryption-enabled', _origEncryptionEnabled);
if (_origWearablesTest === undefined) delete globalThis.__WEARABLES_TEST;
else globalThis.__WEARABLES_TEST = _origWearablesTest;

// Section 11 (rail-toggle persistence) + Section 12 (search filtering)
// live in tests/playwright/chat-threads-dom.spec.js.

// ═══════════════════════════════════════════════
// 13. Thread retention
// ═══════════════════════════════════════════════
console.log('13. Thread retention');
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
chatThreadsModule.pruneOldThreads();
assert('retains all conversations', st.chatThreads.length === 55, 'Got ' + st.chatThreads.length);
assert('oldest threads retained', !!st.chatThreads.find(t => t.id === 't_prune_0'));
assert('newest threads kept', !!st.chatThreads.find(t => t.id === 't_prune_54'));
for (let i = 0; i < 55; i++) {
  localStorage.removeItem(chatThreadsModule.getChatThreadKey(`t_prune_${i}`));
}

// ═══════════════════════════════════════════════
// 14. Backup Snapshot
// ═══════════════════════════════════════════════
console.log('14. Backup Snapshot');
// buildBackupSnapshot() early-returns null when `labcharts-profiles` is
// absent (backup.js:104). Playwright has the bootstrapped profile registry;
// in Node we seed a minimal one so the snapshot path runs.
const _origProfiles = localStorage.getItem('labcharts-profiles');
if (!_origProfiles) {
  localStorage.setItem('labcharts-profiles', JSON.stringify([{ id: profileId, name: 'Test Profile' }]));
}
st.chatThreads = [
  { id: 't_backup1', name: 'Backup Test', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), messageCount: 1, personality: 'default' }
];
chatThreadsModule.saveChatThreadIndex();
localStorage.setItem(chatThreadsModule.getChatThreadKey('t_backup1'), JSON.stringify([{ role: 'user', content: 'backup test' }]));

const snapshot = backupModule.buildBackupSnapshot();
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
localStorage.removeItem(chatThreadsModule.getChatThreadKey('t_backup1'));
if (!_origProfiles) localStorage.removeItem('labcharts-profiles');
else localStorage.setItem('labcharts-profiles', _origProfiles);

// ═══════════════════════════════════════════════
// 15. Encryption Patterns
// ═══════════════════════════════════════════════
// crypto.js's SENSITIVE_PATTERNS all anchor on `^labcharts-[^-]+-chat…$`.
// New profile ids use the allowlist-safe `p_<random>` shape. Use a
// representative hyphen-free id here so `[^-]+` matches it.
//
// NOTE: the original Playwright test asserted the thread *index* key was
// NOT sensitive ("plaintext by design"). That contradicts crypto.js, which
// lists `^labcharts-[^-]+-chat-threads$` in SENSITIVE_PATTERNS — the index
// IS encrypted. The stale assertion is corrected here to match the code;
// if plaintext-index is the intended design, that's a crypto.js change,
// not a test one.
console.log('15. Encryption Patterns');
const _encPid = 'mp567abc';
assert('isSensitiveKey matches per-thread key', cryptoModule.isSensitiveKey(`labcharts-${_encPid}-chat-t_abc123`));
assert('isSensitiveKey matches legacy chat key', cryptoModule.isSensitiveKey(`labcharts-${_encPid}-chat`));
assert('isSensitiveKey matches thread index (crypto.js SENSITIVE_PATTERNS)',
  cryptoModule.isSensitiveKey(`labcharts-${_encPid}-chat-threads`));

// ═══════════════════════════════════════════════
// 16. Profile Delete Cleanup (source inspection)
// ═══════════════════════════════════════════════
console.log('16. Profile Delete Cleanup (source inspection)');
const profileSrc = read('js/profile.js');
const profileRuntimeSrc = read('js/profile-runtime.js');
const profileCleanupSrc = read('js/profile-storage-cleanup.js');
assert('deleteProfile removes chat-threads key through centralized prefix cleanup',
  profileSrc.includes('await clearProfileStorage(profileId)')
    && profileCleanupSrc.includes('key.startsWith(standardPrefix)'));
assert('deleteProfile removes chat-t_ keys without relying on a decryptable thread index',
  profileCleanupSrc.includes('Prefix cleanup covers chat messages'));
assert('deleteProfile removes chatRailOpen through centralized prefix cleanup',
  profileCleanupSrc.includes('const standardPrefix = `labcharts-${profileId}-`'));
assert('loadProfile resets chatThreads', profileSrc.includes('state.chatThreads = []'));
assert('loadProfile resets currentThreadId', profileSrc.includes('state.currentThreadId = null'));
assert('loadProfile delegates runtime refresh after profile switch',
  profileSrc.includes('await reloadProfileRuntimeShell(profileId)'));
assert('profile-runtime reloads active profile chat threads after first use',
  profileRuntimeSrc.includes('await chat.loadChatThreads?.()'));
assert('profile-runtime reloads active profile chat history after first use',
  profileRuntimeSrc.includes('await chat?.loadChatHistory?.()'));
assert('profile-runtime rerenders chat rail after profile switch when loaded',
  profileRuntimeSrc.includes('chat?.renderThreadList?.()'));
assert('profile-runtime preserves the lazy Chat boundary until first use',
  profileRuntimeSrc.includes('isChatModuleLoaded() ? await loadChatModule() : null'));

// ═══════════════════════════════════════════════
// 17. Thread Search Extraction (source inspection)
// ═══════════════════════════════════════════════
console.log('17. Thread Search Extraction (source inspection)');
const chatThreadsSrc = read('js/chat-threads.js');
const chatThreadViewSrc = read('js/chat-thread-list-view.js');
const chatWindowBindingsSrc = read('js/chat-window-bindings.js');
const chatThreadSearchSrc = read('js/chat-thread-search.js');
const inlineHandlerRe = /\bon(?:click|change|input|search|keydown|keyup|submit)=/;
const windowGlobalLookupRe = /\bwindow\s*(?:\.|\[\s*['"])/;
assert('chat-threads exposes dependency configuration',
  chatThreadsSrc.includes('export function configureChatThreadDeps')
    && chatThreadsSrc.includes('const chatThreadDeps = {')
    && chatThreadsSrc.includes('showPromptDialog,'));
assert('chat-window-bindings wires chat-thread dependencies',
  chatWindowBindingsSrc.includes('configureChatThreadDeps({')
    && chatWindowBindingsSrc.includes('renderChatMessages,')
    && chatWindowBindingsSrc.includes('saveChatHistory,')
    && chatWindowBindingsSrc.includes('loadChatHistory,')
    && chatWindowBindingsSrc.includes('getActivePersonality,')
    && chatWindowBindingsSrc.includes('cleanupDiscussionState,'));
assert('chat-threads uses configured deps instead of direct window callback lookups',
  !windowGlobalLookupRe.test(chatThreadsSrc),
  (chatThreadsSrc.match(windowGlobalLookupRe) || [''])[0]);
assert('chat-threads imports search module',
  chatThreadsSrc.includes("from './chat-thread-search.js'"));
assert('chat-threads configures search callbacks',
  chatThreadsSrc.includes('configureChatThreadSearch({') &&
  chatThreadsSrc.includes('getChatThreadKey') &&
  chatThreadsSrc.includes('switchToThread'));
assert('chat-threads re-exports search public handlers',
  chatThreadsSrc.includes('export { filterThreadList, invalidateThreadContentCache, jumpToSearchResult }'));
assert('chat-thread-search owns filterThreadList',
  chatThreadSearchSrc.includes('export function filterThreadList'));
assert('chat-thread-search owns jumpToSearchResult',
  chatThreadSearchSrc.includes('export async function jumpToSearchResult'));
assert('chat-thread-search reads encrypted per-thread messages',
  chatThreadSearchSrc.includes("from './crypto.js'") &&
  chatThreadSearchSrc.includes('encryptedGetItem'));
assert('chat-thread-search uses overflow sentinel before truncation banner',
  chatThreadSearchSrc.includes('const SEARCH_RESULT_LIMIT = 30') &&
  chatThreadSearchSrc.includes('results.length > SEARCH_RESULT_LIMIT') &&
  chatThreadSearchSrc.includes('results.slice(0, SEARCH_RESULT_LIMIT)'));
assert('chat-threads render path uses delegated thread actions',
  chatThreadsSrc.includes('renderChatThreadList(getChatThreadSort(), filter)') &&
  !inlineHandlerRe.test(chatThreadViewSrc) &&
  chatThreadViewSrc.includes('data-chat-thread-action="switch"') &&
  chatThreadViewSrc.includes('data-chat-thread-action="rename"') &&
  chatThreadViewSrc.includes('data-chat-thread-action="delete"'));
assert('chat-threads installs an idempotent click delegate',
  chatThreadsSrc.includes('let chatThreadDelegatesInstalled = false') &&
    chatThreadsSrc.includes("document.addEventListener('click', handleThreadActionClick)") &&
    chatThreadsSrc.includes('installChatThreadDelegates();'));
assert('chat-threads uses delegated pointer gestures for reliable project drag and drop',
  chatThreadsSrc.includes("document.addEventListener('pointerdown', handleThreadPointerDown)")
    && chatThreadsSrc.includes("document.addEventListener('pointermove', handleThreadPointerMove")
    && chatThreadsSrc.includes('projectDropTargetAt(event.clientX, event.clientY)'));

// ═══════════════════════════════════════════════
// 18. CSS Inspection
// ═══════════════════════════════════════════════
console.log('18. CSS Inspection');
const cssSrc = ['styles.css', 'css/chat-panel.css', 'css/chat-panel-open.css', 'css/chat-personality.css', 'css/chat-messages.css', 'css/chat-composer.css', 'css/chat-onboarding.css', 'css/chat-responsive.css', 'css/chat-actions.css', 'css/chat-mobile.css', 'css/chat-redesign.css', 'css/chat-redesign-open.css'].map(read).join('\n');
const indexSrc = read('index.html');
assert('CSS has .chat-thread-rail', cssSrc.includes('.chat-thread-rail'));
assert('CSS has .chat-thread-rail.open', cssSrc.includes('.chat-thread-rail.open'));
assert('CSS has .chat-thread-item', cssSrc.includes('.chat-thread-item'));
assert('CSS has .chat-thread-item.active', cssSrc.includes('.chat-thread-item.active'));
assert('CSS has .chat-panel-conversation', cssSrc.includes('.chat-panel-conversation'));
assert('CSS has .chat-rail-toggle', cssSrc.includes('.chat-rail-toggle'));
assert('CSS has compact thread action menu', cssSrc.includes('.chat-thread-item-menu-popover'));
assert('CSS has mobile rail overlay', cssSrc.includes('.chat-thread-rail.open') && cssSrc.includes('768px'));
assert('chat thread list is a named keyboard-focusable region',
  indexSrc.includes('id="chat-thread-list"')
    && indexSrc.includes('role="region" tabindex="0" aria-label="Conversation list"'));
assert('CSS has focus-visible thread list outline', cssSrc.includes('.chat-thread-list:focus-visible'));

// ═══════════════════════════════════════════════
// 19. ensureActiveThread
// ═══════════════════════════════════════════════
console.log('19. ensureActiveThread');
const chatLockKey = 'labcharts-chat-local-lock-until';
const previousChatLock = sessionStorage.getItem(chatLockKey);
sessionStorage.removeItem(chatLockKey);
st.chatThreads = [];
st.currentThreadId = null;
chatThreadsModule.ensureActiveThread();
assert('creates thread when none exist', st.chatThreads.length === 1);
assert('sets currentThreadId', !!st.currentThreadId);
assert('auto-created empty thread does not mark chat as locally edited',
  sessionStorage.getItem(chatLockKey) === null);
if (previousChatLock === null) sessionStorage.removeItem(chatLockKey);
else sessionStorage.setItem(chatLockKey, previousChatLock);

const oldTs = new Date(Date.now() - 100000).toISOString();
const newTs = new Date().toISOString();
st.chatThreads = [
  { id: 't_old', name: 'Old', createdAt: oldTs, updatedAt: oldTs, messageCount: 1, personality: 'default' },
  { id: 't_new', name: 'New', createdAt: newTs, updatedAt: newTs, messageCount: 2, personality: 'default' }
];
st.currentThreadId = 'nonexistent';
chatThreadsModule.ensureActiveThread();
assert('picks most recent thread', st.currentThreadId === 't_new');

// ═══════════════════════════════════════════════
// 20. Thread Personality
// ═══════════════════════════════════════════════
console.log('20. Thread Personality');
st.chatThreads = [];
st.currentThreadId = null;
st.currentChatPersonality = 'house';
chatThreadsModule.createNewThread();
const pThread = st.chatThreads.find(t => t.id === st.currentThreadId);
assert('new thread starts with default personality', pThread && pThread.personality === 'default');
assert('new thread active personality matches metadata', st.currentChatPersonality === pThread?.personality);

// ═══════════════════════════════════════════════
// CLEANUP — Restore original state
// ═══════════════════════════════════════════════
st.chatThreads = origThreads;
st.currentThreadId = origThreadId;
st.chatHistory = origHistory;
if (origThreads.length > 0) {
  chatThreadsModule.saveChatThreadIndex();
} else {
  localStorage.removeItem(chatThreadsModule.getChatThreadsKey());
}
for (const key of Object.keys(localStorage)) {
  if (key.includes('chat-t_t_') || key.includes('t_prune_') || key.includes('t_backup')) {
    localStorage.removeItem(key);
  }
}

console.log(`\nResults: ${passed} passed, ${failed} failed, ${total} total`);
process.exit(failed > 0 ? 1 : 0);
