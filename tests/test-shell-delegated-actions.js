#!/usr/bin/env node
// Static shell delegated-action source guards.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const appEventsSrc = fs.readFileSync(path.join(root, 'js/app-event-listeners.js'), 'utf8');
const mainSrc = fs.readFileSync(path.join(root, 'js/main.js'), 'utf8');
const shellSrc = fs.readFileSync(path.join(root, 'js/shell-actions.js'), 'utf8');

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

console.log('=== Static Shell Delegated Actions ===');

const body = (html.match(/<body>[\s\S]*?<script src="version\.js"/) || [''])[0];
const inlineHandlerRe = /\bon(?:click|change|input|search|keydown|keyup|submit)=/;

assert('Static body shell has no inline event attributes',
  body && !inlineHandlerRe.test(body));
assert('main installs shell action delegates',
  mainSrc.includes("import { installShellActionDelegates } from './shell-actions.js'")
    && mainSrc.includes('installShellActionDelegates();'));

[
  'toggle-mobile-sidebar',
  'close-mobile-sidebar',
  'trigger-import',
  'share-profile',
  'open-tweaks',
  'open-settings',
  'open-ai-settings',
  'open-feedback',
  'import-status',
].forEach(action => {
  assert(`Shell action ${action} is rendered`, html.includes(`data-shell-action="${action}"`));
  assert(`Shell action ${action} is handled`, shellSrc.includes(`action === '${action}'`));
});

[
  'toggle-panel',
  'close-panel',
  'toggle-thread-rail',
  'create-thread',
  'summarize-thread',
  'clear-history',
  'toggle-fullscreen',
  'toggle-personality',
  'set-personality',
  'attach-image',
  'toggle-hd',
  'start-discussion',
  'send-message',
].forEach(action => {
  assert(`Chat action ${action} is rendered`, html.includes(`data-chat-action="${action}"`));
  assert(`Chat action ${action} is handled`, shellSrc.includes(`action === '${action}'`));
});

assert('Thread search uses delegated input/search action',
  html.includes('data-chat-input-action="filter-thread-list"')
    && shellSrc.includes("document.addEventListener('input', handleShellInput)")
    && shellSrc.includes("document.addEventListener('search', handleShellInput)")
    && shellSrc.includes('window.filterThreadList?.(input.value)'));
assert('Web search toggle uses delegated change action',
  html.includes('data-chat-change-action="set-websearch"')
    && shellSrc.includes("document.addEventListener('change', handleShellChange)")
    && shellSrc.includes('window.setChatWebSearchEnabled?.(input.checked)'));
assert('Chat key handlers are delegated',
  html.includes('data-chat-key-action="message-input"')
    && html.includes('data-chat-key-action="toggle-personality"')
    && shellSrc.includes("document.addEventListener('keydown', handleShellKeydown)")
    && shellSrc.includes('window.handleChatKeydown?.(event)')
    && shellSrc.includes('window.togglePersonalityBar?.()'));
assert('Click delegate only prevents default for handled actions',
  shellSrc.includes('const handled = shellAction')
    && shellSrc.includes('if (handled) event.preventDefault();')
    && shellSrc.includes('return false;')
    && !shellSrc.includes('event.preventDefault();\n  if (shellAction)'));
assert('Generic role-button key shim skips delegated chat key actions',
  appEventsSrc.includes("t.hasAttribute('data-chat-key-action')"));

console.log(`\nResults: ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) process.exit(1);
