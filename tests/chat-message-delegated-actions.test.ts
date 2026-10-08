import { expect, it } from 'vitest';
import { createLegacyAssertions } from './helpers/legacy-assertions.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

it('retains chat-message delegated-action source contracts', () => {
  const { assert, results: legacyAssertions } = createLegacyAssertions();
  const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
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
  assert('chat-actions exports delegated action attributes helper', actionsSrc.includes("export { chatMessageActionAttrs } from './chat-message-action-attrs.js'")
      && attrsSrc.includes('export function chatMessageActionAttrs(action, attrs = {})')
      && attrsSrc.includes('data-chat-message-action')
      && attrsSrc.includes('data-chat-message-index'));
  assert('chat-actions installs idempotent click and keydown delegates', actionsSrc.includes('let chatMessageDelegatesInstalled = false;')
      && actionsSrc.includes("root.addEventListener('click', handleChatMessageClick)")
      && actionsSrc.includes("root.addEventListener('keydown', handleChatMessageKeydown)")
      && actionsSrc.includes('installChatMessageActionDelegates();'));
  const messageActions = read('js/components/ChatMessageActions.svelte');
  const messageContract = read('js/chat-message-actions-contract.ts');
  assert('chat-actions delegates the shared authored message action bar controls',
      actionsSrc.includes("renderChatMessageActions(msgIndex, 'assistant')")
      && messageActions.includes('data-chat-message-action="copy-message"')
      && messageActions.includes('data-chat-message-action="toggle-context-details"')
      && messageActions.includes('data-chat-message-action={view.retry.action}')
      && messageContract.includes("action: 'regenerate-last-message'")
      && actionsSrc.includes("action === 'regenerate-last-message'")
      && actionsSrc.includes("action === 'copy-message'")
      && actionsSrc.includes("action === 'toggle-context-details'"));
  assert('chat-actions delegates dynamic chat controls', [
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
  assert('chat image message actions use configured module dependencies', actionsSrc.includes('chatMessageActionDeps.removeImageAttachment(index)')
      && actionsSrc.includes('chatMessageActionDeps.openImageLightbox(src)')
      && !actionsSrc.includes('appWindow.removeImageAttachment')
      && !actionsSrc.includes('appWindow.openImageLightbox'));
  const renderSrc = read('js/chat-render.js');
  const sendSrc = read('js/chat-send.js');
  const summariesSrc = read('js/chat-summaries.js');
  const discussionUiSrc = read('js/chat-discussion-ui.js');
  assert('chat-actions keyboard activates delegated role button actions', actionsSrc.includes("event.key !== 'Enter' && event.key !== ' '")
      && actionsSrc.includes("actionEl.getAttribute('role') !== 'button'")
      && actionsSrc.includes('runChatMessageAction(actionEl, event)'));
  const messageView = read('js/components/ChatMessage.svelte');
  const imagesView = read('js/components/ChatStoredImages.svelte');
  const citationsView = read('js/components/ChatCitations.svelte');
  const recommendationsView = read('js/components/ChatRecommendations.svelte');
  assert('chat render shares authored message controls and direct disclosure containment',
      renderSrc.includes('renderChatTranscript(container, projectChatTranscript(')
      && imagesView.includes('data-chat-message-action="open-image-lightbox"')
      && messageView.includes('data-chat-message-action="open-emf-assessment"')
      && citationsView.includes('data-chat-message-action="contain-click"')
      && citationsView.includes('event.stopPropagation()')
      && citationsView.includes("root.addEventListener('click', contain)")
      && citationsView.includes("root.removeEventListener('click', contain)"));
  assert('live completion shares owned recommendations with direct containment and disposal',
      sendSrc.includes('completeChatLiveMessage(aiMsgEl, assistantMsg')
      && messageView.includes('<ChatRecommendations ')
      && recommendationsView.includes('event.stopPropagation()')
      && recommendationsView.includes("root.addEventListener('click', contain)")
      && recommendationsView.includes("root.removeEventListener('click', contain)")
      && !sendSrc.includes("wrapper.setAttribute('data-chat-message-action', 'contain-click')"));
  const savedSummaryView = read('js/components/ChatSavedSummaries.svelte');
  const summaryDialogView = read('js/components/ChatSummaryDialog.svelte');
  assert('summary list and modal use delegated summary actions',
      summariesSrc.includes("renderSummaryPresentation({ kind: 'list'")
      && summariesSrc.includes("renderSummaryPresentation({ kind: 'dialog'")
      && savedSummaryView.includes('data-chat-message-action="view-summary"')
      && savedSummaryView.includes('data-chat-message-summary-id={row.id}')
      && summaryDialogView.includes('data-chat-message-action="close-summary"')
      && summaryDialogView.includes('data-chat-message-action="copy-summary"')
      && summaryDialogView.includes('data-chat-message-action="download-summary"')
      && summaryDialogView.includes('data-chat-message-action="print-summary"')
      && summaryDialogView.includes('data-chat-message-action="delete-summary"')
      && summaryDialogView.includes('data-chat-message-summary-id={view.savedId}'));
  const discussionView = read('js/components/ChatDiscussion.svelte');
  assert('discussion mode publishes owned delegated resume and end controls',
      discussionUiSrc.includes('publishDiscussionRound(chatDiscussionScope(),')
      && discussionView.includes('data-chat-message-action="resume-discussion"')
      && discussionView.includes('data-chat-message-action="end-discussion"')
      && discussionView.includes('data-chat-action="start-discussion"'));
  console.log(`\nChat message delegated actions tests: ${legacyAssertions.pass} passed, ${legacyAssertions.fail} failed`);

  expect(legacyAssertions.fail).toBe(0);
});
