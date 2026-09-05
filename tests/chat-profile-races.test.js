// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { state } from '../js/state.js';
import { encryptedGetItem, encryptedSetItem } from '../js/crypto.js';
import { loadChatThreads, saveChatThreadIndex } from '../js/chat-threads.js';
import { loadChatHistory, saveChatHistory } from '../js/chat-history.js';
import { summarizeThread, closeSummaryModal } from '../js/chat-summaries.js';
import { callAssistantFeatureAI } from '../js/ai-feature-routing.js';
import { saveImportedData } from '../js/data.js';
import { configureChatImages, handleDroppedChatFiles } from '../js/chat-images.js';
import {
  configureChatThreadProjects, configureChatThreadSearch, filterThreadList,
  invalidateThreadContentCache, renameThreadProject, renameThreadProjectPrompt,
} from '../js/chat-thread-search.js';

vi.mock('../js/crypto.js', async original => ({
  ...await original(),
  encryptedGetItem: vi.fn(),
  encryptedSetItem: vi.fn(),
  getEncryptionEnabled: () => true,
}));
vi.mock('../js/sync.js', async original => ({ ...await original(), onChatSaved: vi.fn() }));
vi.mock('../js/chat-runtime.js', async original => ({
  ...await original(), renderChatMessagesRuntime: vi.fn(),
}));
vi.mock('../js/ai-feature-routing.js', () => ({
  callAssistantFeatureAI: vi.fn(), hasAssistantFeatureProvider: () => true,
  getAssistantFeatureIdentity: () => ({ provider: 'codex', modelId: 'test', modelDisplay: 'Test', subscription: true }),
}));
vi.mock('../js/data.js', async original => ({ ...await original(), saveImportedData: vi.fn().mockResolvedValue(true) }));

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
function switchProfile(id) {
  state.currentProfile = id;
  state.currentThreadId = 't_shared';
  state.chatThreads = [{ id: 't_shared', name: id, projectName: 'Project', updatedAt: '2026-09-05', messageCount: 1 }];
  state.chatHistory = [{ role: 'user', content: id }];
  state.importedData = { entries: [], chatSummaries: [] };
}
let saved;
beforeEach(() => {
  saved = { currentProfile: state.currentProfile, currentThreadId: state.currentThreadId, chatThreads: state.chatThreads, chatHistory: state.chatHistory, importedData: state.importedData };
  vi.clearAllMocks();
  localStorage.clear();
  invalidateThreadContentCache();
  document.body.innerHTML = '<input id="chat-thread-search" value="private"><div id="chat-thread-list"></div>';
  switchProfile('profile-a');
  vi.mocked(encryptedSetItem).mockResolvedValue(undefined);
});
afterEach(() => {
  closeSummaryModal();
  filterThreadList('');
  invalidateThreadContentCache();
  Object.assign(state, saved);
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('chat operations stay within their originating profile', () => {
  it.each(['index', 'legacy'])('does not load a stale %s after a profile switch', async kind => {
    const read = deferred();
    localStorage.setItem(`labcharts-profile-a-${kind === 'index' ? 'chat-threads' : 'chat'}`, 'encrypted');
    vi.mocked(encryptedGetItem).mockReturnValueOnce(read.promise);
    const pending = loadChatThreads();
    switchProfile('profile-b');
    read.resolve(JSON.stringify(kind === 'index' ? [{ id: 't_old', name: 'Private A' }] : [{ role: 'user', content: 'Private A' }]));
    expect(await pending).toBe(false);
    expect(state.chatThreads[0].name).toBe('profile-b');
    expect(encryptedSetItem).not.toHaveBeenCalled();
  });

  it.each(['profile', 'thread'])('discards history if the active %s changed during decryption', async kind => {
    const read = deferred();
    localStorage.setItem('labcharts-profile-a-chat-t_t_shared', 'encrypted');
    vi.mocked(encryptedGetItem).mockReturnValueOnce(read.promise);
    const pending = loadChatHistory();
    if (kind === 'profile') switchProfile('profile-b');
    else { state.currentThreadId = 't_other'; state.chatHistory = [{ role: 'user', content: 'other' }]; }
    const expected = state.chatHistory;
    read.resolve(JSON.stringify([{ role: 'user', content: 'Private A' }]));
    expect(await pending).toBe(false);
    expect(state.chatHistory).toBe(expected);
  });

  it('does not update the new profile’s thread metadata after an old history write', async () => {
    const write = deferred();
    vi.mocked(encryptedSetItem).mockReturnValueOnce(write.promise);
    const pending = saveChatHistory();
    switchProfile('profile-b');
    const expected = structuredClone(state.chatThreads);
    write.resolve();
    await pending;
    expect(state.chatThreads).toEqual(expected);
    expect(encryptedSetItem).toHaveBeenCalledTimes(1);
  });

  it('does not signal chat sync for a different profile after an index write', async () => {
    const { onChatSaved } = await import('../js/sync.js');
    const write = deferred();
    vi.mocked(encryptedSetItem).mockReturnValueOnce(write.promise);
    const pending = saveChatThreadIndex();
    switchProfile('profile-b');
    write.resolve();
    await pending;
    expect(onChatSaved).not.toHaveBeenCalled();
  });

  it('cancels a project rename dialog when its profile changes', async () => {
    const prompt = deferred();
    const save = vi.fn().mockResolvedValue(true);
    configureChatThreadProjects({ showPromptDialog: () => prompt.promise, saveChatThreadIndex: save, renderThreadList: () => {} });
    const pending = renameThreadProjectPrompt('Project');
    switchProfile('profile-b');
    prompt.resolve('Private A project');
    expect(await pending).toBe(false);
    expect(state.chatThreads[0].projectName).toBe('Project');
    expect(save).not.toHaveBeenCalled();
  });

  it('never rolls a failed project write back into another profile', async () => {
    const write = deferred();
    configureChatThreadProjects({ saveChatThreadIndex: () => write.promise, renderThreadList: () => {} });
    const pending = renameThreadProject('Project', 'Renamed');
    switchProfile('profile-b');
    state.chatThreads[0].projectName = 'Different';
    write.resolve(false);
    await pending;
    expect(state.chatThreads[0].projectName).toBe('Different');
  });

  it.each([true, false])('does not render old-profile search snippets (cache invalidated: %s)', async invalidate => {
    vi.useFakeTimers();
    const read = deferred();
    vi.mocked(encryptedGetItem).mockReturnValueOnce(read.promise);
    configureChatThreadSearch({ getChatThreadKey: id => `labcharts-${state.currentProfile}-chat-${id}`, renderThreadList: () => {} });
    filterThreadList('private');
    vi.advanceTimersByTime(250);
    expect(encryptedGetItem).toHaveBeenCalledOnce();
    switchProfile('profile-b');
    if (invalidate) invalidateThreadContentCache();
    read.resolve(JSON.stringify([{ role: 'user', content: 'private A health details' }]));
    await vi.advanceTimersByTimeAsync(0);
    expect(document.getElementById('chat-thread-list').textContent).not.toContain('private A');
  });

  it.each(['profile switch', 'closed modal'])('discards summary streams and results after %s', async action => {
    const response = deferred();
    state.chatHistory = Array.from({ length: 4 }, () => ({ role: 'user', content: 'Synthetic private context' }));
    vi.mocked(callAssistantFeatureAI).mockReturnValueOnce(response.promise);
    const pending = summarizeThread();
    const request = vi.mocked(callAssistantFeatureAI).mock.calls[0][0];
    if (action === 'profile switch') switchProfile('profile-b');
    else closeSummaryModal();
    request.onStream('Private A result');
    response.resolve({ text: 'Private A final result' });
    await pending;
    expect(state.importedData.chatSummaries).toEqual([]);
    expect(state.chatThreads[0].summary).toBeUndefined();
    expect(document.getElementById('summary-modal-body')?.textContent).not.toContain('Private A');
    expect(saveImportedData).not.toHaveBeenCalled();
  });

  it('still persists a successful summary for the originating profile', async () => {
    state.chatHistory = Array.from({ length: 4 }, () => ({ role: 'user', content: 'Synthetic context' }));
    vi.mocked(callAssistantFeatureAI).mockResolvedValueOnce({ text: 'Synthetic summary' });
    await summarizeThread();
    expect(state.chatThreads[0].summary).toBe('Synthetic summary');
    expect(state.importedData.chatSummaries[0].content).toBe('Synthetic summary');
    expect(saveImportedData).toHaveBeenCalledOnce();
  });

  it('does not keep a failed summary write as a successful cached summary', async () => {
    state.chatHistory = Array.from({ length: 4 }, () => ({ role: 'user', content: 'Synthetic context' }));
    vi.mocked(callAssistantFeatureAI).mockResolvedValueOnce({ text: 'Unsaved summary' });
    vi.mocked(encryptedSetItem).mockRejectedValueOnce(new Error('Storage full'));
    await summarizeThread();
    expect(state.chatThreads[0].summary).toBeUndefined();
    expect(saveImportedData).not.toHaveBeenCalled();
  });

  it.each([true, false])('keeps dropped health files in their starting profile (switch: %s)', async changed => {
    let finishRead;
    vi.stubGlobal('FileReader', class {
      readAsArrayBuffer() {
        finishRead = () => { this.result = new ArrayBuffer(8); this.onload(); };
      }
    });
    const importFiles = vi.fn().mockResolvedValue(undefined);
    configureChatImages({ importFiles });
    const pending = handleDroppedChatFiles([new File(['synthetic'], 'lab.pdf', { type: 'application/pdf' })]);
    if (changed) switchProfile('profile-b');
    finishRead();
    await pending;
    expect(importFiles).toHaveBeenCalledTimes(changed ? 0 : 1);
  });
});
