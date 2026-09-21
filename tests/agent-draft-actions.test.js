// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ save: vi.fn(), apply: vi.fn(), notify: vi.fn(), render: vi.fn(), claim: vi.fn() }));
vi.mock('../js/agent-draft-claims.js', () => ({ claimAgentDraft: mocks.claim }));
vi.mock('../js/chat-history.js', () => ({ saveChatHistory: mocks.save }));
vi.mock('../js/agent-drafts.js', () => ({ applyAgentDraft: mocks.apply, renderAgentDraftCards: () => '' }));
vi.mock('../js/utils.js', () => ({ escapeHTML: s => s, showNotification: mocks.notify }));
vi.mock('../js/emf-runtime.js', () => ({ openEMFAssessmentEditor: vi.fn() }));
vi.mock('../js/chat-composer.js', () => ({ setChatInputValue: vi.fn() }));
vi.mock('../js/chat-images.js', () => ({ restoreMessageAttachments: vi.fn() }));
import { state } from '../js/state.js';
import { configureChatMessageActionDeps } from '../js/chat-actions.js';
import { normalizeChatMessages } from '../js/chat-storage-safety.js';
let draft;
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
function click(action = 'apply-agent-draft') {
  document.body.innerHTML = `<button data-chat-message-action="${action}" data-chat-message-index="0" data-chat-message-draft-id="draft-1">Apply</button>`;
  document.querySelector('button').click();
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.save.mockResolvedValue(true);
  mocks.apply.mockResolvedValue('Saved');
  configureChatMessageActionDeps({ renderChatMessages: mocks.render });
  state.currentProfile = 'a'; state.currentThreadId = 'thread-a';
  draft = { id: 'draft-1', profileId: 'a', kind: 'note', status: 'pending', payload: { scope: 'profile', text: 'Note', mode: 'append' } };
  state.chatHistory = [{ role: 'assistant', content: '', agentDrafts: [draft] }];
});
it('persists a claim before applying and rejects duplicate clicks while pending', async () => {
  const gate = deferred(); mocks.save.mockReturnValueOnce(gate.promise);
  click(); click();
  expect(draft.status).toBe('applying'); expect(mocks.apply).not.toHaveBeenCalled();
  gate.resolve(true);
  await vi.waitFor(() => expect(draft.status).toBe('applied'));
  expect(mocks.apply).toHaveBeenCalledTimes(1); expect(mocks.save).toHaveBeenCalledTimes(2);
});
it.each([false, 'throw'])('does not mutate when persisting the claim fails: %s', async result => {
  if (result === 'throw') mocks.save.mockRejectedValueOnce(new Error('Disk full'));
  else mocks.save.mockResolvedValueOnce(false);
  click();
  await vi.waitFor(() => expect(draft.status).toBe('pending'));
  expect(mocks.apply).not.toHaveBeenCalled(); expect(mocks.notify).toHaveBeenCalled();
});
it.each(['profile', 'thread', 'history'])('does not apply after a %s switch during claim persistence', async scope => {
  const gate = deferred(); mocks.save.mockReturnValueOnce(gate.promise); click();
  if (scope === 'profile') state.currentProfile = 'b';
  if (scope === 'thread') state.currentThreadId = 'thread-b';
  if (scope === 'history') state.chatHistory = [];
  gate.resolve(true);
  await new Promise(r => setTimeout(r, 0));
  expect(mocks.apply).not.toHaveBeenCalled(); expect(mocks.save).toHaveBeenCalledTimes(1);
});
it('never saves the destination conversation when application finishes after navigation', async () => {
  const gate = deferred(); mocks.apply.mockReturnValue(gate.promise); click();
  await vi.waitFor(() => expect(mocks.apply).toHaveBeenCalled());
  state.currentProfile = 'b'; state.currentThreadId = 'thread-b'; state.chatHistory = [];
  mocks.render.mockClear(); gate.resolve('Saved');
  await vi.waitFor(() => expect(draft.status).toBe('applied'));
  expect(mocks.save).toHaveBeenCalledTimes(1); expect(mocks.render).not.toHaveBeenCalled(); expect(mocks.notify).not.toHaveBeenCalled();
});
it('does not re-enable application after the data committed but the status save failed', async () => {
  mocks.save.mockResolvedValueOnce(true).mockRejectedValueOnce(new Error('Disk full'));
  click();
  await vi.waitFor(() => expect(mocks.notify).toHaveBeenCalled());
  expect(draft.status).toBe('applied'); click(); expect(mocks.apply).toHaveBeenCalledTimes(1);
});
it('keeps uncertain mutation failures out of the retry path', async () => {
  mocks.apply.mockRejectedValue(new Error('Partial write'));
  click(); await vi.waitFor(() => expect(draft.status).toBe('failed'));
  click(); expect(mocks.apply).toHaveBeenCalledTimes(1);
});
it('handles discard persistence failure without losing the pending proposal', async () => {
  mocks.save.mockRejectedValue(new Error('Disk full')); click('discard-agent-draft');
  await vi.waitFor(() => expect(draft.status).toBe('pending'));
  expect(mocks.apply).not.toHaveBeenCalled(); expect(mocks.notify).toHaveBeenCalled();
});
it.each(['applying', 'failed'])('restores persisted %s proposals as non-actionable uncertain outcomes', status => {
  draft.status = status;
  const messages = normalizeChatMessages(state.chatHistory);
  expect(messages[0].agentDrafts[0].status).toBe('failed');
});

it('never mutates when the durable proposal claim is already taken or cannot be saved', async () => {
  mocks.claim.mockRejectedValue(new Error('Already attempted'));
  click(); await vi.waitFor(() => expect(draft.status).toBe('failed'));
  expect(mocks.apply).not.toHaveBeenCalled();
});
it('does not mutate a different view after waiting for a cross-tab claim', async () => {
  const gate = deferred(); mocks.claim.mockReturnValue(gate.promise); click();
  await vi.waitFor(() => expect(mocks.claim).toHaveBeenCalled());
  state.currentProfile = 'b'; state.chatHistory = [];
  gate.resolve(); await vi.waitFor(() => expect(draft.status).toBe('failed'));
  expect(mocks.apply).not.toHaveBeenCalled();
});
