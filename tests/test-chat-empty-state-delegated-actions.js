#!/usr/bin/env node
// Chat empty-state delegated-action source guards.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'js/chat-empty-state.js'), 'utf8');

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

console.log('=== Chat Empty State Delegated Actions ===');

const inlineHandlerRe = /\bon(?:click|change|input|submit|keydown|keyup)=/;
const directAssignmentRe = /\.(?:onclick|onchange|oninput)\s*=/;

assert('chat-empty-state.js has no inline event attributes',
  !inlineHandlerRe.test(src));
assert('chat-empty-state.js avoids direct event property assignment',
  !directAssignmentRe.test(src));
assert('Chat empty state installs click/change/input delegates on the container',
  /container\.addEventListener\('click', handleChatEmptyClick\)/.test(src)
    && /container\.addEventListener\('change', handleChatEmptyChange\)/.test(src)
    && /container\.addEventListener\('input', handleChatEmptyInput\)/.test(src));
assert('renderEmptyChatState installs delegates before rendering branches',
  /export function renderEmptyChatState\(container, panel\) \{\s*installChatEmptyStateDelegates\(container\);/.test(src));
assert('Chat empty actions are scoped to the current container',
  /event\.currentTarget\?\.contains\(actionEl\)/.test(src));

[
  'save-profile',
  'set-profile-sex',
  'height-unit-changed',
  'save-location',
  'save-profile-advance',
  'resume-ai',
  'skip-extras',
  'open-cycle-editor',
  'open-supplements-editor',
  'import-dna',
  'import-mtdna',
  'import-mtdna-file',
  'open-wearables-settings',
  'use-prompt',
  'request-lab-import-provider',
  'open-provider-quiz',
  'scroll-context-cards',
  'start-lab-import',
  'set-onboarding-focus',
].forEach(action => {
  assert(`Chat empty action ${action} is rendered or handled`,
    src.includes(`data-chat-empty-action="${action}"`) || src.includes(`action === '${action}'`));
});

assert('Profile sex action passes sex through data attribute',
  /data-chat-empty-action="set-profile-sex" data-sex="male"/.test(src)
    && /setChatProfileSex\(actionEl\.dataset\.sex/.test(src));
assert('Prompt buttons store prompt text in data attributes',
  /data-chat-empty-action="use-prompt" data-prompt=/.test(src)
    && /useChatPrompt\(actionEl\.dataset\.prompt/.test(src));
assert('mtDNA file import clears the file input after handoff',
  /action === 'import-mtdna-file'[\s\S]*handleMtDNAFile[\s\S]*actionEl\.value = '';/.test(src));

console.log(`\nResults: ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) process.exit(1);
