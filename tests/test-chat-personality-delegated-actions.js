#!/usr/bin/env node
// Source-inspection coverage for chat personality delegated actions.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

let pass = 0;
let fail = 0;

function assert(name, condition) {
  if (condition) {
    pass += 1;
    console.log(`  PASS: ${name}`);
  } else {
    fail += 1;
    console.log(`  FAIL: ${name}`);
  }
}

const personalitySrc = read('js/chat-personalities.js');
const personalityEditorSrc = read('js/chat-personality-editor.js');
const eventNames = ['click', 'keydown', 'change', 'input', 'submit', 'blur', 'toggle'];
const inlineEventPattern = new RegExp(`\\bon(?:${eventNames.join('|')})=["']`);

console.log('=== Chat Personality Delegated Actions Tests ===');

assert('chat-personalities.js renderer emits no inline event attributes',
  !inlineEventPattern.test(personalitySrc)
  && !inlineEventPattern.test(personalityEditorSrc));

assert('chat-personalities imports escapeAttr for delegated data attributes',
  /import\s*\{[^}]*\bescapeAttr\b[^}]*\}\s*from\s*['"]\.\/utils\.js['"]/.test(personalitySrc));

assert('chat personality action and input helpers are exported',
  /export function chatPersonalityActionAttrs\(action, attrs = \{\}\)/.test(personalitySrc)
  && /export function chatPersonalityInputAttrs\(action, attrs = \{\}\)/.test(personalitySrc)
  && personalitySrc.includes('data-chat-personality-action')
  && personalitySrc.includes('data-chat-personality-input'));

assert('chat personality delegates install idempotent click and input listeners',
  personalitySrc.includes('const chatPersonalityDelegateRoots = new WeakSet();')
  && personalitySrc.includes("root.addEventListener('click', handleChatPersonalityClick)")
  && personalitySrc.includes("root.addEventListener('input', handleChatPersonalityInput)")
  && personalitySrc.includes('installChatPersonalityActionDelegates();'));

assert('custom personality selection reuses shell delegated chat action',
  personalitySrc.includes('data-chat-action="set-personality"')
  && personalitySrc.includes('data-personality="${escapeAttr(cp.id)}"'));

assert('custom edit and delete buttons use delegated actions with containment',
  personalitySrc.includes("chatPersonalityActionAttrs('edit-custom', { id: cp.id })")
  && personalitySrc.includes("chatPersonalityActionAttrs('delete-custom', { id: cp.id })")
  && personalitySrc.includes("action === 'edit-custom'")
  && personalitySrc.includes("action === 'delete-custom'")
  && personalitySrc.includes('containPersonalityClick(event);'));

assert('custom add generate and save buttons use delegated actions',
  personalitySrc.includes("chatPersonalityActionAttrs('start-new-custom')")
  && personalityEditorSrc.includes("actionAttrs('generate-custom')")
  && personalityEditorSrc.includes("actionAttrs('save-custom')")
  && personalitySrc.includes("action === 'start-new-custom'")
  && personalitySrc.includes("action === 'generate-custom'")
  && personalitySrc.includes("action === 'save-custom'"));

assert('custom name and textarea inputs use delegated input actions',
  personalityEditorSrc.includes("inputAttrs('mark-dirty')")
  && personalityEditorSrc.includes("inputAttrs('resize-and-mark-dirty')")
  && personalitySrc.includes("action === 'mark-dirty'")
  && personalitySrc.includes("action === 'resize-and-mark-dirty'")
  && personalitySrc.includes('autoResizePersonaTextarea();')
  && personalitySrc.includes('markPersonalityDirty();'));

console.log(`\nChat personality delegated actions tests: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
