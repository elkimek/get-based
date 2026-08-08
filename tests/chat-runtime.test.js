import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const MOCK_PATHS = [
  '../js/api.js',
  '../js/state.js',
  '../js/chat-threads.js',
  '../js/crypto.js',
  '../js/chat-history.js',
  '../js/chat-discussion-round-runner.js',
  '../js/chat-discussion-round-state.js',
  '../js/chat-discussion-round-prompts.js',
  '../js/chat-discussion-lifecycle.js',
  '../js/chat-discussion-state.js',
  '../js/chat-discussion-callbacks.js',
  '../js/chat-discussion-ui.js',
  '../js/chat-discussion-turns.js',
  '../js/constants.js',
  '../js/schema.js',
  '../js/lab-context.js',
  '../js/lens.js',
  '../js/chat-personalities.js',
  '../js/chat-prompt-context.js',
  '../js/chat-panel.js',
  '../js/utils.js',
  '../js/data.js',
  '../js/marker-analysis.js',
];

const realGetElementById = globalThis.document?.getElementById;

beforeEach(async () => {
  await vi.resetModules();
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  if (globalThis.document && realGetElementById) {
    globalThis.document.getElementById = realGetElementById;
  }
});

afterEach(() => {
  for (const path of MOCK_PATHS) vi.doUnmock(path);
  vi.restoreAllMocks();
  vi.useRealTimers();
  if (globalThis.document && realGetElementById) {
    globalThis.document.getElementById = realGetElementById;
  }
});

async function loadContinuation(callClaudeAPI) {
  vi.doMock('../js/api.js', () => ({ callClaudeAPI }));
  return import('../js/chat-continuation.js');
}

describe('chat continuation runtime behavior', () => {
  it('detects hard token stops and likely incomplete prose', async () => {
    const mod = await loadContinuation(vi.fn());

    expect(mod.responseLimitNote()).toContain('output limit reached');
    expect(mod.isAIResponseTruncated({ truncated: true })).toBe(true);
    expect(mod.isAIResponseTruncated({ finishReason: 'length' })).toBe(true);
    expect(mod.isAIResponseTruncated({ finishReason: 'MAX_COMPLETION_TOKENS' })).toBe(true);
    expect(mod.isAIResponseTruncated({ finishReason: 'provider_token_limit' })).toBe(true);
    expect(mod.isAIResponseTruncated({ finishReason: 'stop' })).toBe(false);

    const longPrefix = `${'context '.repeat(90)}`;
    expect(mod.isLikelyIncompleteResponse('short unfinished because')).toBe(false);
    expect(mod.isLikelyIncompleteResponse(`${longPrefix}complete sentence.`)).toBe(false);
    expect(mod.isLikelyIncompleteResponse(`${longPrefix}\n## New section`)).toBe(true);
    expect(mod.isLikelyIncompleteResponse(`${longPrefix}because`)).toBe(true);
    expect(mod.isLikelyIncompleteResponse(`${longPrefix}Items:`)).toBe(true);
    expect(mod.isLikelyIncompleteResponse(`${longPrefix}\n\`\`\``)).toBe(false);
    expect(mod.shouldAutoContinueResponse({ finishReason: 'stop' }, `${longPrefix}and`)).toBe(true);
  });

  it('continues truncated responses, streams merged text, and accumulates usage', async () => {
    const callClaudeAPI = vi.fn()
      .mockResolvedValueOnce({
        text: 'first half ',
        finishReason: 'length',
        usage: { inputTokens: 10, outputTokens: 20 },
      })
      .mockImplementationOnce(async ({ onStream }) => {
        onStream?.('second half.');
        return {
          text: 'second half.',
          finishReason: 'stop',
          usage: { inputTokens: 3, outputTokens: 7 },
        };
      });
    const mod = await loadContinuation(callClaudeAPI);
    const onStream = vi.fn();

    const result = await mod.callChatAPIWithContinuation({
      system: 'system prompt',
      messages: [{ role: 'user', content: 'question' }],
      maxTokens: mod.CHAT_RESPONSE_MAX_TOKENS,
      signal: new AbortController().signal,
      onStream,
      webSearch: true,
      provider: 'openrouter',
    });

    expect(callClaudeAPI).toHaveBeenCalledTimes(2);
    expect(callClaudeAPI.mock.calls[1][0].messages).toEqual([
      { role: 'user', content: 'question' },
      { role: 'assistant', content: 'first half ' },
      {
        role: 'user',
        content: 'Continue exactly where you stopped. Do not repeat anything already written. Finish the interrupted sentence first, then complete the answer.',
      },
    ]);
    expect(onStream).toHaveBeenCalledWith('first half second half.');
    expect(result).toMatchObject({
      text: 'first half second half.',
      usage: { inputTokens: 13, outputTokens: 27 },
      continued: 1,
      truncated: false,
    });
  });

  it('does not auto-continue when the caller aborts after the first response', async () => {
    const callClaudeAPI = vi.fn(async () => ({
      text: 'partial',
      finishReason: 'length',
      usage: { inputTokens: 1, outputTokens: 2 },
    }));
    const controller = new AbortController();
    controller.abort();
    const mod = await loadContinuation(callClaudeAPI);

    const result = await mod.callChatAPIWithContinuation({
      system: '',
      messages: [],
      maxTokens: 100,
      signal: controller.signal,
      provider: 'venice',
    });

    expect(callClaudeAPI).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ text: 'partial', continued: 0, truncated: true });
  });
});

describe('chat discussion callback bridge runtime behavior', () => {
  it('defaults to no-op callbacks and can be configured by chat-send', async () => {
    const callbacks = await import('../js/chat-discussion-callbacks.js');
    expect(callbacks.getChatAbortController()).toBeNull();
    const defaultTypewriter = callbacks.createDiscussionTypewriter({}, {}, {});
    expect(() => {
      defaultTypewriter.update('ignored');
      defaultTypewriter.stop();
    }).not.toThrow();

    const controller = new AbortController();
    const setChatAbortController = vi.fn();
    const renderChatMessages = vi.fn();
    const setSendButtonMode = vi.fn();
    const typewriter = { update: vi.fn(), stop: vi.fn() };
    const createTypewriter = vi.fn(() => typewriter);
    callbacks.configureChatDiscussion({
      createTypewriter,
      getChatAbortController: () => controller,
      renderChatMessages,
      setChatAbortController,
      setSendButtonMode,
    });

    const btn = {};
    expect(callbacks.getChatAbortController()).toBe(controller);
    callbacks.setChatAbortController(null);
    callbacks.renderChatMessages();
    callbacks.setSendButtonMode(btn, 'streaming');
    expect(callbacks.createDiscussionTypewriter('msg', 'typing', 'container')).toBe(typewriter);
    expect(setChatAbortController).toHaveBeenCalledWith(null);
    expect(renderChatMessages).toHaveBeenCalled();
    expect(setSendButtonMode).toHaveBeenCalledWith(btn, 'streaming');
    expect(createTypewriter).toHaveBeenCalledWith('msg', 'typing', 'container');
  });
});

describe('chat presentation stylesheet runtime behavior', () => {
  it('loads the ordered group, resets after failure, and reuses successful links', async () => {
    const originalCreateElement = document.createElement;
    const originalQuerySelector = document.querySelector;
    const originalQuerySelectorAll = document.querySelectorAll;
    const originalHeadInsertBefore = document.head.insertBefore;
    const links = [];
    const failOnce = new Set(['onboarding']);
    const anchorParent = {
      insertBefore(link) {
        links.push(link);
        link.isConnected = true;
        queueMicrotask(() => {
          if (failOnce.delete(link.dataset.chatPresentationStylesheet)) {
            link.dispatchEvent(new Event('error'));
          } else {
            link.sheet = {};
            link.dispatchEvent(new Event('load'));
          }
        });
      },
    };
    const anchor = { parentNode: anchorParent };

    function createLink() {
      const events = new EventTarget();
      return {
        rel: '',
        href: '',
        dataset: {},
        isConnected: false,
        sheet: null,
        addEventListener: events.addEventListener.bind(events),
        dispatchEvent: events.dispatchEvent.bind(events),
        remove() {
          this.isConnected = false;
          const index = links.indexOf(this);
          if (index >= 0) links.splice(index, 1);
        },
      };
    }

    document.createElement = vi.fn(tag => tag === 'link' ? createLink() : originalCreateElement(tag));
    document.querySelector = vi.fn(selector => {
      if (selector === '[data-chat-presentation-stylesheet-anchor]') return anchor;
      if (selector === '[data-chat-redesign-open-stylesheet-anchor]') return anchor;
      const match = selector.match(/^link\[data-chat-presentation-stylesheet="([^"]+)"\]$/);
      return match ? links.find(link => link.dataset.chatPresentationStylesheet === match[1]) || null : null;
    });
    document.querySelectorAll = vi.fn(selector => (
      selector === 'link[rel="stylesheet"][href]' ? links : []
    ));
    document.head.insertBefore = anchorParent.insertBefore;

    try {
      const chatPanel = await import('../js/chat-panel.js');
      expect(chatPanel.configureChatPanel({})).toEqual({
        restoreDiscussionContinuePrompt: null,
        refreshMobileDashboardActiveTab: null,
        stopVoiceActivity: null,
      });
      expect(chatPanel.isChatThreadInputBlocked()).toBe(false);
      await expect(chatPanel.loadChatPresentationStylesheets()).rejects.toThrow(
        'Chat onboarding stylesheet could not be loaded',
      );
      expect(chatPanel.areChatPresentationStylesheetsLoaded()).toBe(false);
      expect(links).toHaveLength(8);

      const loaded = await chatPanel.loadChatPresentationStylesheets();
      expect(loaded).toHaveLength(9);
      expect(chatPanel.areChatPresentationStylesheetsLoaded()).toBe(true);
      expect(links).toHaveLength(9);
      expect(links.find(link => link.dataset.chatPresentationStylesheet === 'onboarding')?.href)
        .toContain('lazy-retry=1');

      await expect(chatPanel.loadChatPresentationStylesheetsForAction()).resolves.toBe(true);
      await expect(chatPanel.loadChatPresentationStylesheets()).resolves.toEqual(loaded);

      const chatImages = await import('../js/chat-images.js');
      chatImages.removeImageAttachment(0);
      expect(chatImages.hasPendingAttachments()).toBe(false);
    } finally {
      document.createElement = originalCreateElement;
      document.querySelector = originalQuerySelector;
      document.querySelectorAll = originalQuerySelectorAll;
      document.head.insertBefore = originalHeadInsertBefore;
    }
  });
});

function installRoundStateMocks() {
  const deps = {
    state: {
      currentThreadId: 'active-thread',
      chatThreads: [
        { id: 'active-thread', messageCount: 1 },
        {
          id: 'background-thread',
          messageCount: 1,
          updatedAt: '2026-01-01T00:00:00.000Z',
          discussionEnded: true,
        },
      ],
      chatHistory: [{ role: 'user', content: 'old' }],
    },
    getChatThreadKey: vi.fn(threadId => `chat-thread:${threadId}`),
    invalidateThreadContentCache: vi.fn(),
    renderThreadList: vi.fn(),
    saveChatThreadIndex: vi.fn(),
    encryptedSetItem: vi.fn(async () => {}),
    saveChatHistory: vi.fn(async () => {}),
  };

  vi.doMock('../js/state.js', () => ({ state: deps.state }));
  vi.doMock('../js/chat-threads.js', () => ({
    getChatThreadKey: deps.getChatThreadKey,
    invalidateThreadContentCache: deps.invalidateThreadContentCache,
    renderThreadList: deps.renderThreadList,
    saveChatThreadIndex: deps.saveChatThreadIndex,
  }));
  vi.doMock('../js/crypto.js', () => ({
    encryptedSetItem: deps.encryptedSetItem,
  }));
  vi.doMock('../js/chat-history.js', () => ({
    saveChatHistory: deps.saveChatHistory,
  }));
  return deps;
}

describe('chat discussion round state runtime behavior', () => {
  it('persists thread discussion metadata and renders only for the active thread', async () => {
    const deps = installRoundStateMocks();
    const mod = await import('../js/chat-discussion-round-state.js');
    const personas = [{ id: 'a' }, { id: 'b' }];

    expect(mod.isRoundThreadActive()).toBe(true);
    expect(mod.isRoundThreadActive('active-thread')).toBe(true);
    expect(mod.isRoundThreadActive('background-thread')).toBe(false);

    mod.persistDiscussionThreadState('background-thread', personas, 'default');
    expect(deps.state.chatThreads[1]).toMatchObject({
      discussionPersonas: personas,
      discussionOriginalPersonality: 'default',
    });
    expect(deps.state.chatThreads[1].discussionEnded).toBeUndefined();
    expect(deps.saveChatThreadIndex).toHaveBeenCalledTimes(1);

    const renderMessages = vi.fn();
    mod.renderRoundMessages('background-thread', [{ role: 'assistant' }], renderMessages);
    expect(renderMessages).not.toHaveBeenCalled();
    expect(deps.state.chatHistory).toEqual([{ role: 'user', content: 'old' }]);

    mod.renderRoundMessages('active-thread', [{ role: 'assistant', content: 'new' }], renderMessages);
    expect(deps.state.chatHistory).toEqual([{ role: 'assistant', content: 'new' }]);
    expect(renderMessages).toHaveBeenCalled();
  });

  it('saves active thread history through chat-history and inactive history through the storage wrapper', async () => {
    const deps = installRoundStateMocks();
    const mod = await import('../js/chat-discussion-round-state.js');
    const activeMessages = [{ role: 'user', content: 'active' }];
    const backgroundMessages = [
      { role: 'user', content: 'background' },
      { role: 'assistant', content: 'saved' },
    ];

    await mod.saveRoundChatHistory('active-thread', activeMessages);
    expect(deps.state.chatHistory).toBe(activeMessages);
    expect(deps.saveChatHistory).toHaveBeenCalled();
    expect(deps.invalidateThreadContentCache).not.toHaveBeenCalled();

    await mod.saveRoundChatHistory('background-thread', backgroundMessages);
    expect(deps.invalidateThreadContentCache).toHaveBeenCalled();
    expect(deps.encryptedSetItem).toHaveBeenCalledWith('chat-thread:background-thread', JSON.stringify(backgroundMessages));
    expect(localStorage.getItem('chat-thread:background-thread')).toBeNull();
    expect(deps.state.chatThreads[1].messageCount).toBe(2);
    expect(deps.state.chatThreads[1].updatedAt).not.toBe('2026-01-01T00:00:00.000Z');
    expect(deps.saveChatThreadIndex).toHaveBeenCalledTimes(1);
    expect(deps.renderThreadList).toHaveBeenCalled();
  });

  it('does not bypass the storage wrapper for credential-shaped chat content', async () => {
    const deps = installRoundStateMocks();
    const mod = await import('../js/chat-discussion-round-state.js');
    const messages = [{ role: 'user', content: { api_key: 'sensitive-value' } }];

    await mod.saveRoundChatHistory('background-thread', messages);

    expect(deps.encryptedSetItem).toHaveBeenCalledWith('chat-thread:background-thread', JSON.stringify(messages));
    expect(localStorage.getItem('chat-thread:background-thread')).toBeNull();
  });
});

function installDiscussionTurnMocks() {
  const deps = {
    state: {
      currentChatPersonality: 'baseline',
      currentThreadId: 'thread-1',
      chatHistory: [],
    },
    runDiscussionRound: vi.fn(async () => ({ remainingPersonas: [] })),
    persistDiscussionThreadState: vi.fn(),
    persistDiscussionPendingPersonas: vi.fn(),
    buildDiscussionJoinMessage: vi.fn(persona => ({
      joined: true,
      joinName: persona.name,
      joinIcon: persona.icon,
    })),
    finishDiscussionRound: vi.fn(),
    showDiscussContinuePrompt: vi.fn(),
  };
  vi.doMock('../js/state.js', () => ({ state: deps.state }));
  vi.doMock('../js/chat-discussion-round-runner.js', () => ({
    runDiscussionRound: deps.runDiscussionRound,
  }));
  vi.doMock('../js/chat-discussion-round-state.js', () => ({
    persistDiscussionThreadState: deps.persistDiscussionThreadState,
    persistDiscussionPendingPersonas: deps.persistDiscussionPendingPersonas,
  }));
  vi.doMock('../js/chat-discussion-round-prompts.js', () => ({
    buildDiscussionJoinMessage: deps.buildDiscussionJoinMessage,
    DISCUSSION_JOIN_PROMPT: 'join prompt',
  }));
  vi.doMock('../js/chat-discussion-lifecycle.js', () => ({
    finishDiscussionRound: deps.finishDiscussionRound,
    showDiscussContinuePrompt: deps.showDiscussContinuePrompt,
  }));
  return deps;
}

describe('chat discussion turn runtime behavior', () => {
  it('runs continuations with explicit thread state and restores original personality', async () => {
    const deps = installDiscussionTurnMocks();
    const turns = await import('../js/chat-discussion-turns.js');
    const personas = [{ id: 'one' }, { id: 'two' }];

    await turns.runDiscussionContinuation(personas, 'starter', 'steer this', {
      suppressAutoMsg: true,
      threadId: 'thread-2',
    });

    expect(deps.persistDiscussionThreadState).toHaveBeenCalledWith('thread-2', personas, 'starter');
    expect(deps.persistDiscussionPendingPersonas).toHaveBeenCalledWith('thread-2', []);
    expect(deps.runDiscussionRound).toHaveBeenCalledWith(personas, 'steer this', {
      suppressAutoMsg: true,
      threadId: 'thread-2',
    });
    expect(deps.finishDiscussionRound).toHaveBeenCalledWith(personas, 'starter', 'thread-2');
  });

  it('runs a single joined persona turn and regular full discussion rounds', async () => {
    const deps = installDiscussionTurnMocks();
    const turns = await import('../js/chat-discussion-turns.js');
    const newPersona = { id: 'reviewer', name: 'Reviewer', icon: 'R' };
    const allPersonas = [{ id: 'main', name: 'Main' }, newPersona];

    await turns.runSingleDiscussionTurn(newPersona, allPersonas);
    expect(deps.persistDiscussionThreadState).toHaveBeenCalledWith('thread-1', allPersonas, 'baseline');
    expect(deps.state.chatHistory).toEqual([{ joined: true, joinName: 'Reviewer', joinIcon: 'R' }]);
    expect(deps.runDiscussionRound).toHaveBeenCalledWith([newPersona], 'join prompt', {
      hideAutoMsg: true,
      threadId: 'thread-1',
    });
    expect(deps.finishDiscussionRound).toHaveBeenCalledWith(allPersonas, 'baseline', 'thread-1');

    deps.runDiscussionRound.mockClear();
    await turns.runDiscussion(allPersonas);
    expect(deps.runDiscussionRound).toHaveBeenCalledWith(allPersonas, null, {
      suppressAutoMsg: undefined,
      threadId: 'thread-1',
    });
  });
});

function installDiscussionFlowMocks({ abortController = null, pickerSelection = null, discussionState = null } = {}) {
  const deps = {
    state: {
      currentThreadId: 'thread-flow',
      _discussionPersonas: [{ id: 'one' }, { id: 'two' }],
      _discussionOriginalPersonality: 'original',
    },
    getCurrentDiscussionState: vi.fn(() => discussionState),
    reopenCurrentDiscussionThread: vi.fn(),
    getChatAbortController: vi.fn(() => abortController),
    readDiscussPersonaPickerSelection: vi.fn(() => pickerSelection),
    removeDiscussContinuePrompt: vi.fn(),
    removeDiscussPersonaPicker: vi.fn(),
    showDiscussPersonaPicker: vi.fn(),
    runDiscussion: vi.fn(async () => 'discussion'),
    runDiscussionContinuation: vi.fn(async () => 'continuation'),
    runSingleDiscussionTurn: vi.fn(async () => 'single'),
  };
  vi.doMock('../js/state.js', () => ({ state: deps.state }));
  vi.doMock('../js/chat-discussion-state.js', () => ({
    getCurrentDiscussionState: deps.getCurrentDiscussionState,
    reopenCurrentDiscussionThread: deps.reopenCurrentDiscussionThread,
  }));
  vi.doMock('../js/chat-discussion-callbacks.js', () => ({
    getChatAbortController: deps.getChatAbortController,
  }));
  vi.doMock('../js/chat-discussion-ui.js', () => ({
    readDiscussPersonaPickerSelection: deps.readDiscussPersonaPickerSelection,
    removeDiscussContinuePrompt: deps.removeDiscussContinuePrompt,
    removeDiscussPersonaPicker: deps.removeDiscussPersonaPicker,
    showDiscussPersonaPicker: deps.showDiscussPersonaPicker,
  }));
  vi.doMock('../js/chat-discussion-turns.js', () => ({
    runDiscussion: deps.runDiscussion,
    runDiscussionContinuation: deps.runDiscussionContinuation,
    runSingleDiscussionTurn: deps.runSingleDiscussionTurn,
  }));
  vi.doMock('../js/chat-discussion-lifecycle.js', () => ({
    cleanupDiscussionState: vi.fn(),
    endDiscussion: vi.fn(),
    restoreDiscussionContinuePrompt: vi.fn(),
    showDiscussContinuePrompt: vi.fn(),
  }));
  return deps;
}

describe('chat discussion flow runtime behavior', () => {
  it('routes user turns through the discussion continuation helper and keeps one composer', async () => {
    const discussionState = {
      personas: [{ id: 'alpha' }, { id: 'beta' }],
      originalPersonality: 'base',
    };
    const deps = installDiscussionFlowMocks({ discussionState });
    const composer = { focus: vi.fn() };
    globalThis.document.getElementById = vi.fn(id => id === 'chat-input' ? composer : null);
    const flow = await import('../js/chat-discussion-flow.js');

    await flow.sendDiscussionUserTurn('follow-up');
    expect(deps.removeDiscussContinuePrompt).toHaveBeenCalledTimes(1);
    expect(deps.runDiscussionContinuation).toHaveBeenCalledWith(
      discussionState.personas,
      'base',
      'follow-up',
      { suppressAutoMsg: true, threadId: 'thread-flow' },
    );

    await flow.continueDiscussion();
    expect(deps.removeDiscussContinuePrompt).toHaveBeenCalledTimes(1);
    expect(deps.runDiscussionContinuation).toHaveBeenCalledTimes(1);
    expect(composer.focus).toHaveBeenCalled();
  });

  it('does nothing while streaming', async () => {
    const blocked = installDiscussionFlowMocks({ abortController: new AbortController() });
    const flow = await import('../js/chat-discussion-flow.js');

    await flow.sendDiscussionUserTurn('ignored', { personas: [{ id: 'a' }, { id: 'b' }], originalPersonality: 'base' });
    await flow.continueDiscussion();
    await flow.startDiscussion();
    expect(blocked.runDiscussionContinuation).not.toHaveBeenCalled();
    expect(blocked.showDiscussPersonaPicker).not.toHaveBeenCalled();
  });

  it('opens the persona picker when idle', async () => {
    const idle = installDiscussionFlowMocks();
    const idleFlow = await import('../js/chat-discussion-flow.js');

    await idleFlow.startDiscussion();

    expect(idle.reopenCurrentDiscussionThread).toHaveBeenCalled();
    expect(idle.showDiscussPersonaPicker).toHaveBeenCalled();
  });

  it('lets only the newly added persona answer when starting from an existing reply', async () => {
    const selection = {
      allPersonas: [{ id: 'analyst' }, { id: 'house' }],
      newPersonas: [{ id: 'house' }],
      addingToExisting: false,
    };
    const deps = installDiscussionFlowMocks({ pickerSelection: selection });
    const flow = await import('../js/chat-discussion-flow.js');

    await expect(flow.startDiscussionFromPicker()).resolves.toBe('single');
    expect(deps.removeDiscussPersonaPicker).toHaveBeenCalled();
    expect(deps.runSingleDiscussionTurn).toHaveBeenCalledWith(selection.newPersonas[0], selection.allPersonas);
    expect(deps.runDiscussion).not.toHaveBeenCalled();
  });

  it('runs a full discussion from picker selection when no new personas are selected', async () => {
    const selection = {
      allPersonas: [{ id: 'one' }, { id: 'two' }],
      newPersonas: [],
      addingToExisting: false,
    };
    const existing = installDiscussionFlowMocks({
      pickerSelection: selection,
    });
    const flowExisting = await import('../js/chat-discussion-flow.js');

    await expect(flowExisting.startDiscussionFromPicker()).resolves.toBe('discussion');

    expect(existing.runDiscussion).toHaveBeenCalledWith(selection.allPersonas);
  });
});

function installRoundRequestMocks({ lens = true, provider = 'venice', e2ee = true } = {}) {
  const deps = {
    trackUsage: vi.fn(),
    getAIProvider: vi.fn(() => provider),
    getActiveModelId: vi.fn(() => 'model-1'),
    getActiveModelDisplay: vi.fn(() => 'Model One'),
    supportsWebSearch: vi.fn(() => true),
    isVeniceE2EEActive: vi.fn(() => e2ee),
    buildLabContext: vi.fn(() => 'base lab context'),
    injectLensChunks: vi.fn(() => 'lab context with lens'),
    hasLens: vi.fn(() => lens),
    queryLensMulti: vi.fn(async () => ({ chunks: [{ id: 'chunk-1' }] })),
    getActivePersonality: vi.fn(() => ({ id: 'analyst', name: 'Analyst', icon: 'A' })),
    getCustomPersonality: vi.fn(() => ({ id: 'custom' })),
    attachLensSources: vi.fn((message, lensResult) => { message.sourcesAttached = lensResult?.chunks?.length || 0; }),
    buildChatSystemPrompt: vi.fn(parts => `system:${parts.labContext}:${parts.webHint}`),
    buildMultiPersonaInstruction: vi.fn(() => 'multi persona'),
    buildPersonalityPrompt: vi.fn(() => 'personality prompt'),
    buildTaggedChatMessages: vi.fn(() => [{ role: 'user', content: 'tagged' }]),
    buildWebSearchHint: vi.fn(() => 'web hint'),
    getChatWebSearchEnabled: vi.fn(() => true),
  };

  vi.doMock('../js/constants.js', () => ({ CHAT_SYSTEM_PROMPT: 'base system' }));
  vi.doMock('../js/schema.js', () => ({ trackUsage: deps.trackUsage }));
  vi.doMock('../js/api.js', () => ({
    getAIProvider: deps.getAIProvider,
    getActiveModelId: deps.getActiveModelId,
    getActiveModelDisplay: deps.getActiveModelDisplay,
    supportsWebSearch: deps.supportsWebSearch,
    isVeniceE2EEActive: deps.isVeniceE2EEActive,
  }));
  vi.doMock('../js/lab-context.js', () => ({
    buildLabContext: deps.buildLabContext,
    injectLensChunks: deps.injectLensChunks,
  }));
  vi.doMock('../js/lens.js', () => ({
    hasLens: deps.hasLens,
    queryLensMulti: deps.queryLensMulti,
  }));
  vi.doMock('../js/chat-personalities.js', () => ({
    getActivePersonality: deps.getActivePersonality,
    getCustomPersonality: deps.getCustomPersonality,
  }));
  vi.doMock('../js/chat-prompt-context.js', () => ({
    attachLensSources: deps.attachLensSources,
    buildChatSystemPrompt: deps.buildChatSystemPrompt,
    buildMultiPersonaInstruction: deps.buildMultiPersonaInstruction,
    buildPersonalityPrompt: deps.buildPersonalityPrompt,
    buildTaggedChatMessages: deps.buildTaggedChatMessages,
    buildWebSearchHint: deps.buildWebSearchHint,
  }));
  vi.doMock('../js/chat-panel.js', () => ({ getChatWebSearchEnabled: deps.getChatWebSearchEnabled }));
  return deps;
}

describe('chat discussion round request runtime behavior', () => {
  it('builds persona-aware discussion API requests with lens and web-search context', async () => {
    const deps = installRoundRequestMocks();
    const mod = await import('../js/chat-discussion-round-request.js');
    const signal = new AbortController().signal;
    const roundHistory = [{ role: 'assistant', personalityName: 'Other' }];

    const request = await mod.buildDiscussionRoundRequest({ msgText: 'compare markers', roundHistory, signal });

    expect(deps.queryLensMulti).toHaveBeenCalledWith('compare markers', { signal });
    expect(deps.injectLensChunks).toHaveBeenCalledWith('base lab context', { chunks: [{ id: 'chunk-1' }] });
    expect(deps.buildWebSearchHint).toHaveBeenCalledWith({
      isE2EE: true,
      webSearchEnabled: true,
      webSearchSupported: true,
      includeActiveSearchHints: false,
    });
    expect(deps.buildChatSystemPrompt).toHaveBeenCalledWith(expect.objectContaining({
      basePrompt: 'base system',
      labContext: 'lab context with lens',
      personalityPrompt: 'personality prompt',
      multiPersonaInstruction: 'multi persona',
      webHint: 'web hint',
    }));
    expect(deps.buildTaggedChatMessages).toHaveBeenCalledWith(roundHistory, 'Analyst');
    expect(request).toMatchObject({
      apiMessages: [{ role: 'user', content: 'tagged' }],
      e2ee: true,
      modelDisplay: 'Model One',
      modelId: 'model-1',
      personality: { id: 'analyst', name: 'Analyst', icon: 'A' },
      provider: 'venice',
      systemPrompt: 'system:lab context with lens:web hint',
      webSearch: true,
    });
  });

  it('builds assistant messages with truncation, search, E2EE, and lens metadata', async () => {
    const deps = installRoundRequestMocks();
    const mod = await import('../js/chat-discussion-round-request.js');
    const message = mod.buildDiscussionAssistantMessage({
      fullText: 'analysis',
      request: {
        e2ee: true,
        lensResult: { chunks: [{ id: 'chunk-1' }] },
        modelDisplay: 'Model One',
        modelId: 'model-1',
        personality: { name: 'Analyst', icon: 'A' },
        provider: 'venice',
        webSearch: true,
      },
      aiResult: { finishReason: 'max_tokens' },
      responseTruncated: true,
      attestation: { verified: true },
    });

    expect(message).toMatchObject({
      role: 'assistant',
      content: 'analysis',
      personalityName: 'Analyst',
      personalityIcon: 'A',
      provider: 'venice',
      modelId: 'model-1',
      modelDisplay: 'Model One',
      truncated: true,
      finishReason: 'max_tokens',
      webSearch: true,
      e2ee: true,
      attestation: { verified: true },
      sourcesAttached: 1,
    });

    mod.trackDiscussionUsage({ provider: 'venice', modelId: 'model-1' }, {});
    expect(deps.trackUsage).not.toHaveBeenCalled();
    mod.trackDiscussionUsage({ provider: 'venice', modelId: 'model-1' }, { inputTokens: 2, outputTokens: 5 });
    expect(deps.trackUsage).toHaveBeenCalledWith('venice', 'model-1', 2, 5);
  });
});

function installMarkerPromptMocks() {
  const state = {
    currentThreadId: 'thread-marker',
    chatHistory: [],
    markerRegistry: {},
    selectedCorrelationMarkers: [],
  };
  const deps = {
    state,
    formatValue: vi.fn(value => `v${value}`),
    getStatus: vi.fn(() => 'optimal'),
    getActiveData: vi.fn(),
    getEffectiveRange: vi.fn(() => ({ min: 1, max: 5 })),
    getEffectiveRangeForDate: vi.fn(() => ({ min: 10, max: 20 })),
    getLatestValueIndex: vi.fn(values => values.length - 1),
    openChatPanel: vi.fn(async () => {}),
    createNewThread: vi.fn(() => { state.currentThreadId = 'thread-new'; }),
    ensureActiveThread: vi.fn(),
    loadChatThreads: vi.fn(),
    renameThread: vi.fn(),
    loadChatHistory: vi.fn(async () => {}),
    saveChatHistory: vi.fn(async () => {}),
  };
  vi.doMock('../js/state.js', () => ({ state: deps.state }));
  vi.doMock('../js/utils.js', () => ({
    formatValue: deps.formatValue,
    getStatus: deps.getStatus,
  }));
  vi.doMock('../js/data.js', () => ({ getActiveData: deps.getActiveData }));
  vi.doMock('../js/marker-analysis.js', () => ({
    getEffectiveRange: deps.getEffectiveRange,
    getEffectiveRangeForDate: deps.getEffectiveRangeForDate,
    getLatestValueIndex: deps.getLatestValueIndex,
  }));
  vi.doMock('../js/chat-panel.js', () => ({ openChatPanel: deps.openChatPanel }));
  vi.doMock('../js/chat-threads.js', () => ({
    createNewThread: deps.createNewThread,
    ensureActiveThread: deps.ensureActiveThread,
    loadChatThreads: deps.loadChatThreads,
    renameThread: deps.renameThread,
  }));
  vi.doMock('../js/chat-history.js', () => ({
    loadChatHistory: deps.loadChatHistory,
    saveChatHistory: deps.saveChatHistory,
  }));
  return deps;
}

describe('chat marker prompt runtime behavior', () => {
  it('opens a marker-specific prompt with trends, phase ranges, and current status', async () => {
    const deps = installMarkerPromptMocks();
    deps.state.chatHistory = [{ role: 'user', content: 'existing' }];
    deps.state.markerRegistry.ferritin = {
      name: 'Ferritin',
      unit: 'ng/mL',
      values: [100, null, 150],
      refMin: 30,
      refMax: 200,
      optimalMin: 70,
      optimalMax: 120,
      phaseLabels: ['follicular', null, 'luteal'],
      phaseRefRanges: [{ min: 20, max: 100 }, null, { min: 40, max: 160 }],
    };
    deps.getActiveData.mockReturnValue({ dates: ['2026-01-01', '2026-02-01', '2026-03-01'] });
    const closeModal = vi.fn();
    const chatRuntime = await import('../js/chat-runtime.js');
    const previousChatRuntime = chatRuntime.configureChatRuntimeCallbacks({ closeModal });
    const mod = await import('../js/chat-marker-prompts.js');

    mod.askAIAboutMarker('ferritin');

    await vi.waitFor(() => expect(deps.openChatPanel).toHaveBeenCalled());
    expect(closeModal).toHaveBeenCalled();
    expect(deps.loadChatThreads).toHaveBeenCalled();
    expect(deps.ensureActiveThread).toHaveBeenCalled();
    expect(deps.saveChatHistory).toHaveBeenCalled();
    expect(deps.createNewThread).toHaveBeenCalled();
    expect(deps.renameThread).toHaveBeenCalledWith('thread-new', 'Ferritin');
    const prompt = deps.openChatPanel.mock.calls[0][0];
    expect(prompt).toContain('Tell me about my Ferritin results.');
    expect(prompt).toContain('2026-01-01: v100 ng/mL (follicular phase, ref v20–v100)');
    expect(prompt).toContain('2026-03-01: v150 ng/mL (luteal phase, ref v40–v160)');
    expect(prompt).toContain('Reference range: 30–200 ng/mL');
    expect(prompt).toContain('Optimal range: 70–120');
    expect(prompt).toContain('Current status: optimal');
    expect(prompt).toContain('Trend: up 50% from previous.');
    expect(prompt).toContain('phase-specific for the menstrual cycle');
    chatRuntime.configureChatRuntimeCallbacks(previousChatRuntime);
  });

  it('opens a correlation prompt for selected markers and ignores missing markers', async () => {
    const deps = installMarkerPromptMocks();
    deps.state.selectedCorrelationMarkers = ['met.glucose', 'horm.cortisol', 'missing.marker'];
    deps.getActiveData.mockReturnValue({
      dates: ['2026-01-01', '2026-02-01'],
      categories: {
        met: {
          markers: {
            glucose: {
              name: 'Glucose',
              unit: 'mg/dL',
              values: [88, 92],
              refMin: 70,
              refMax: 99,
              optimalMin: 80,
              optimalMax: 90,
            },
          },
        },
        horm: {
          markers: {
            cortisol: {
              name: 'Cortisol',
              unit: 'ug/dL',
              values: [12, null],
              refMin: 5,
              refMax: 25,
            },
          },
        },
      },
    });
    const mod = await import('../js/chat-marker-prompts.js');

    mod.askAIAboutCorrelations();

    await vi.waitFor(() => expect(deps.openChatPanel).toHaveBeenCalled());
    expect(deps.renameThread).toHaveBeenCalledWith('thread-marker', 'Correlations: Glucose + Cortisol + missing.marker');
    const prompt = deps.openChatPanel.mock.calls[0][0];
    expect(prompt).toContain('Analyze the correlation between these biomarkers: Glucose, Cortisol, missing.marker.');
    expect(prompt).toContain('- Glucose: 2026-01-01: v88 mg/dL, 2026-02-01: v92 mg/dL');
    expect(prompt).toContain('optimal: 80–90');
    expect(prompt).toContain('- Cortisol: 2026-01-01: v12 ug/dL');
    expect(prompt).not.toContain('- missing.marker');
  });

  it('does not open prompt panels for unknown markers or too few selected correlations', async () => {
    const deps = installMarkerPromptMocks();
    const mod = await import('../js/chat-marker-prompts.js');

    mod.askAIAboutMarker('missing');
    mod.askAIAboutCorrelations();

    await vi.waitFor(() => {
      expect(deps.openChatPanel).not.toHaveBeenCalled();
    });
  });
});
