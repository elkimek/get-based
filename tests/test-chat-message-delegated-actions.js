#!/usr/bin/env node
// Source-inspection coverage for delegated chat message controls.

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

console.log('=== Chat Message Delegated Actions Tests ===');

const files = [
  'js/chat-message-action-attrs.js',
  'js/chat-actions.js',
  'js/chat-render.js',
  'js/chat-images.js',
  'js/chat-send.js',
  'js/chat-thread-search.js',
  'js/chat-summaries.js',
  'js/chat-discussion-picker.js',
  'js/chat-discussion-ui.js',
];
const inlineEventPattern = /\bon(?:click|keydown|change|input|submit)=["']/;

for (const file of files) {
  assert(`${file} has no inline event attributes`, !inlineEventPattern.test(read(file)));
}

const actionsSrc = read('js/chat-actions.js');
const attrsSrc = read('js/chat-message-action-attrs.js');
assert('chat-actions exports delegated action attributes helper',
  actionsSrc.includes("export { chatMessageActionAttrs } from './chat-message-action-attrs.js'")
    && attrsSrc.includes('export function chatMessageActionAttrs(action, attrs = {})')
    && attrsSrc.includes('data-chat-message-action')
    && attrsSrc.includes('data-chat-message-index'));
assert('chat-actions installs idempotent click and keydown delegates',
  actionsSrc.includes('let chatMessageDelegatesInstalled = false;')
    && actionsSrc.includes("root.addEventListener('click', handleChatMessageClick)")
    && actionsSrc.includes("root.addEventListener('keydown', handleChatMessageKeydown)")
    && actionsSrc.includes('installChatMessageActionDelegates();'));
assert('chat-actions delegates message action bar controls',
  actionsSrc.includes("chatMessageActionAttrs('regenerate-last-message')")
    && actionsSrc.includes("chatMessageActionAttrs('copy-message', { index: msgIndex })")
    && actionsSrc.includes("chatMessageActionAttrs('toggle-context-details', { index: msgIndex })")
    && actionsSrc.includes("action === 'regenerate-last-message'")
    && actionsSrc.includes("action === 'copy-message'")
    && actionsSrc.includes("action === 'toggle-context-details'"));
assert('chat-actions delegates dynamic chat controls',
  [
    'remove-image-attachment',
    'open-image-lightbox',
    'open-emf-assessment',
    'jump-search-result',
    'view-summary',
    'delete-summary',
    'start-discussion-from-picker',
    'continue-discussion',
    'resume-discussion',
    'end-discussion',
  ].every(action => actionsSrc.includes(`action === '${action}'`)));
assert('chat image message actions use configured module dependencies',
  actionsSrc.includes('chatMessageActionDeps.removeImageAttachment(index)')
    && actionsSrc.includes('chatMessageActionDeps.openImageLightbox(src)')
    && !actionsSrc.includes('appWindow.removeImageAttachment')
    && !actionsSrc.includes('appWindow.openImageLightbox'));

const renderSrc = read('js/chat-render.js');
const sendSrc = read('js/chat-send.js');
const summariesSrc = read('js/chat-summaries.js');
const discussionUiSrc = read('js/chat-discussion-ui.js');
assert('chat-actions keyboard activates delegated role button actions',
  actionsSrc.includes("event.key !== 'Enter' && event.key !== ' '")
    && actionsSrc.includes("actionEl.getAttribute('role') !== 'button'")
    && actionsSrc.includes('runChatMessageAction(actionEl, event)'));
assert('chat render uses delegated image emf lens and recommendation actions',
  renderSrc.includes("chatMessageActionAttrs('open-image-lightbox')")
    && renderSrc.includes("chatMessageActionAttrs('open-emf-assessment')")
    && renderSrc.includes("chatMessageActionAttrs('contain-click')")
    && renderSrc.includes("el.addEventListener('click', event => event.stopPropagation())")
    && renderSrc.includes('bindRenderedChatContainClicks(container)'));
assert('dynamic recommendation wrapper keeps direct containment without dead delegated attr',
  sendSrc.includes("wrapper.addEventListener('click', e => e.stopPropagation())")
    && !sendSrc.includes("wrapper.setAttribute('data-chat-message-action', 'contain-click')"));
assert('summary list and modal use delegated summary actions',
  summariesSrc.includes("chatMessageActionAttrs('view-summary', { summaryId: s.id })")
    && summariesSrc.includes("chatMessageActionAttrs('close-summary')")
    && summariesSrc.includes("chatMessageActionAttrs('copy-summary')")
    && summariesSrc.includes("chatMessageActionAttrs('download-summary')")
    && summariesSrc.includes("chatMessageActionAttrs('print-summary')")
    && summariesSrc.includes("chatMessageActionAttrs('delete-summary', { summaryId: thread._savedId })"));
assert('discussion mode uses delegated resume and end buttons',
  discussionUiSrc.includes("chatMessageActionAttrs('resume-discussion')")
    && discussionUiSrc.includes("chatMessageActionAttrs('end-discussion')")
    && discussionUiSrc.includes('data-chat-action="start-discussion"'));

console.log(`\nChat message delegated actions tests: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
