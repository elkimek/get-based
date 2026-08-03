import { expect, test } from './coverage-fixture.js';

function moduleUrl(path) {
  return `${path}?chatDiscussionCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

test('chat discussion state reopens ended current thread in browser', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.waitForSelector('#chat-input');

  const results = await page.evaluate(async ({ discussionStateUrl }) => {
    const [{ state }, discussionState, chatThreads] = await Promise.all([
      import('/js/state.js'),
      import(discussionStateUrl),
      import('/js/chat-threads.js'),
    ]);
    const outcomes = {};
    const profileId = `discussion-reopen-${Date.now()}`;
    const saved = {
      currentProfile: state.currentProfile,
      currentThreadId: state.currentThreadId,
      chatThreads: state.chatThreads,
    };
    let threadIndexKey = null;
    let previousIndex = null;

    try {
      state.currentProfile = profileId;
      state.currentThreadId = 'discussion-reopen-thread';
      state.chatThreads = [{
        id: 'discussion-reopen-thread',
        name: 'Ended discussion',
        createdAt: '2026-06-12T00:00:00.000Z',
        updatedAt: '2026-06-12T00:00:00.000Z',
        messageCount: 2,
        personality: 'default',
        discussionEnded: true,
        discussionPersonas: [
          { id: 'default', name: 'Analyst' },
          { id: 'skeptic', name: 'Skeptic' },
        ],
      }];
      threadIndexKey = chatThreads.getChatThreadsKey();
      previousIndex = localStorage.getItem(threadIndexKey);
      localStorage.removeItem(threadIndexKey);

      const reopened = discussionState.reopenCurrentDiscussionThread();
      const storedThreads = JSON.parse(localStorage.getItem(threadIndexKey) || '[]');
      outcomes.reopenClearsEndedFlagAndPersistsIndex =
        reopened?.id === 'discussion-reopen-thread'
        && !('discussionEnded' in reopened)
        && storedThreads.some(thread => thread.id === 'discussion-reopen-thread' && !('discussionEnded' in thread));

      const reopenedAgain = discussionState.reopenCurrentDiscussionThread();
      outcomes.reopenAlreadyOpenThreadReturnsThread =
        reopenedAgain?.id === 'discussion-reopen-thread'
        && !('discussionEnded' in reopenedAgain);

      state.currentThreadId = 'missing-thread';
      outcomes.reopenMissingCurrentThreadReturnsNull =
        discussionState.reopenCurrentDiscussionThread() === null;
    } finally {
      if (threadIndexKey) {
        if (previousIndex == null) localStorage.removeItem(threadIndexKey);
        else localStorage.setItem(threadIndexKey, previousIndex);
      }
      state.currentProfile = saved.currentProfile;
      state.currentThreadId = saved.currentThreadId;
      state.chatThreads = saved.chatThreads;
    }

    return outcomes;
  }, { discussionStateUrl: moduleUrl('/js/chat-discussion-state.js') });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('chat prompt context attestation and discussion prompt helpers cover browser branches', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.waitForSelector('#chat-input');

  const results = await page.evaluate(async ({ promptContextUrl, attestationUrl, promptsUrl, dcapUrl }) => {
    const [promptContext, attestation, prompts, dcap] = await Promise.all([
      import(promptContextUrl),
      import(attestationUrl),
      import(promptsUrl),
      import(dcapUrl),
    ]);
    const outcomes = {};

    outcomes.dcapVerifierBundleLoadsInBrowser =
      dcap.PHALA_PCCS_URL === 'https://pccs.phala.network'
      && typeof dcap.createDcapVerifier() === 'function';

    outcomes.personalityPromptsCoverCustomAndBuiltIn =
      promptContext.buildPersonalityPrompt(
        { id: 'custom_reviewer' },
        { promptText: 'Challenge weak claims.' }
      ).includes('Challenge weak claims.')
      && promptContext.buildPersonalityPrompt({ promptAddition: 'Use evidence.' }).includes('Use evidence.')
      && promptContext.buildPersonalityPrompt({ id: 'custom_empty' }, { promptText: '' }) === '';

    const roundHistory = [
      { role: 'user', content: 'What changed?' },
      { role: 'assistant', personalityName: 'Skeptic', content: 'Ferritin still needs context.' },
      { role: 'assistant', personalityName: 'Protocol Reviewer', content: 'Current persona response.' },
      { joined: true, role: 'user', content: 'hidden join marker' },
    ];
    const tagged = promptContext.buildTaggedChatMessages(roundHistory, 'Protocol Reviewer');
    outcomes.multiPersonaAndTaggedMessages =
      promptContext.buildMultiPersonaInstruction(roundHistory, 'Protocol Reviewer').includes('Skeptic')
      && tagged.length === 3
      && tagged[1].content.startsWith('[Response from Skeptic]')
      && tagged.every(message => message.content !== 'hidden join marker');

    outcomes.webSearchHintsCoverModes =
      promptContext.buildWebSearchHint({ isE2EE: true }).includes('E2EE mode')
      && promptContext.buildWebSearchHint({ webSearchEnabled: true }).includes('WEB SEARCH ACTIVE')
      && promptContext.buildWebSearchHint({ webSearchSupported: true }).includes('NO WEB ACCESS')
      && promptContext.buildWebSearchHint({ webSearchSupported: true, includeActiveSearchHints: false }) === '';

    outcomes.systemPromptComposesSections = promptContext.buildChatSystemPrompt({
      basePrompt: 'Base prompt.',
      labContext: 'Ferritin context.',
      webHint: ' Web hint.',
      personalityPrompt: ' Persona note.',
      multiPersonaInstruction: ' Multi persona note.',
    }) === 'Base prompt. Web hint.\n\nCurrent lab data:\nFerritin context. Persona note. Multi persona note.';

    const lensResult = {
      sourceName: 'Knowledge Base',
      chunks: Array.from({ length: 12 }, (_, index) => ({
        text: index === 0 ? 'x'.repeat(1700) : `chunk ${index}`,
        source: `doc-${index}`,
        score: index === 1 ? 0.42 : 'bad-score',
      })),
    };
    const serialized = promptContext.serializeLensSources(lensResult);
    const message = { role: 'assistant', content: 'Lens answer' };
    const attached = promptContext.attachLensSources(message, lensResult);
    outcomes.lensSourcesAreCappedAndNormalized =
      serialized.lensSources.length === 10
      && serialized.lensSources[0].text.length === 1500
      && serialized.lensSources[1].score === 0.42
      && serialized.lensSources[2].score === null
      && serialized.lensSourceName === 'Knowledge Base'
      && attached === message
      && message.lensSources.length === 10
      && promptContext.serializeLensSources({ chunks: [] }) === null;

    const okAttestation = {
      nonceVerified: true,
      signingKeyBound: true,
      debugMode: false,
      serverTdxValid: true,
      dcapVerified: true,
      dcap: { status: 'UpToDate <quoted>' },
    };
    const failedAttestation = {
      nonceVerified: false,
      signingKeyBound: true,
      debugMode: true,
      serverTdxValid: false,
    };
    outcomes.attestationMarkupReflectsState =
      attestation.attestationTooltip(null).includes('no data')
      && attestation.attestationTooltip(okAttestation).includes('Intel DCAP verified')
      && attestation.attestationTooltip(failedAttestation).includes('FAILED')
      && attestation.e2eeLockHTML(okAttestation).includes('#38bdf8')
      && attestation.e2eeLockHTML(okAttestation).includes('D')
      && attestation.e2eeLockHTML(okAttestation).includes('&lt;quoted&gt;')
      && attestation.e2eeLockHTML(failedAttestation).includes('#ef4444')
      && attestation.e2eeLockFootnote(okAttestation).includes('e2ee');

    outcomes.discussionPromptHelpersCoverInitialSteerAndJoin =
      prompts.hasExistingDiscussionResponses(roundHistory) === true
      && prompts.hasExistingDiscussionResponses([{ role: 'assistant', content: 'No persona' }]) === false
      && prompts.getDiscussionPromptText({ hasExistingDebate: false, personaIndex: 0, steerPrompt: '' }).includes('Share your analysis')
      && prompts.getDiscussionPromptText({ hasExistingDebate: true, personaIndex: 1, steerPrompt: 'Focus on ferritin.' }) === 'Focus on ferritin.'
      && prompts.buildDiscussionAutoMessage('hidden prompt', { hideAutoMsg: true }).hidden === true
      && prompts.buildDiscussionJoinMessage({ name: 'Skeptic', icon: 'S' }).joinName === 'Skeptic';

    return outcomes;
  }, {
    promptContextUrl: moduleUrl('/js/chat-prompt-context.js'),
    attestationUrl: moduleUrl('/js/chat-attestation.js'),
    promptsUrl: moduleUrl('/js/chat-discussion-round-prompts.js'),
    dcapUrl: moduleUrl('/vendor/venice-dcap.js'),
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('E2EE attestation badge reveals verification details on hover and focus', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.waitForSelector('#chat-input');

  await page.evaluate(async ({ attestationUrl }) => {
    const attestation = await import(attestationUrl);
    const host = document.createElement('div');
    host.id = 'attestation-tooltip-coverage';
    host.style.cssText = 'position:fixed;left:160px;top:120px;z-index:1300';
    host.innerHTML = attestation.e2eeLockFootnote({
      verificationLevel: 'dcap',
      nonceVerified: true,
      signingKeyBound: true,
      debugMode: false,
      dcapVerified: true,
      dcap: { status: 'UpToDate' },
      measurementsVerified: null,
      errors: [],
    });
    document.body.appendChild(host);
  }, { attestationUrl: moduleUrl('/js/chat-attestation.js') });

  const badge = page.locator('#attestation-tooltip-coverage .e2ee-attestation-badge');
  const tooltip = page.locator('#e2ee-attestation-tooltip');
  await badge.hover();
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toContainText('Intel DCAP verified');
  await expect(tooltip).toContainText('Client DCAP: UpToDate');
  await expect(badge).toHaveAttribute('aria-expanded', 'true');

  await page.mouse.move(700, 400);
  await expect(tooltip).toBeHidden();
  await badge.focus();
  await expect(tooltip).toBeVisible();
});

test('discussion round state persists active and inactive thread histories', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.waitForSelector('#chat-input');

  const results = await page.evaluate(async ({ roundStateUrl }) => {
    const [roundState, chatThreads, { state }] = await Promise.all([
      import(roundStateUrl),
      import('/js/chat-threads.js'),
      import('/js/state.js'),
    ]);
    const outcomes = {};
    const profileId = 'discussion-round-state-coverage';
    const saved = {
      currentProfile: state.currentProfile,
      currentThreadId: state.currentThreadId,
      chatThreads: state.chatThreads,
      chatHistory: state.chatHistory,
      encryptionEnabled: localStorage.getItem('labcharts-encryption-enabled'),
    };
    const removeProfileChatKeys = () => {
      for (const key of Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index)).filter(Boolean)) {
        if (key.startsWith(`labcharts-${profileId}-chat`)) localStorage.removeItem(key);
      }
    };
    const initialUpdatedAt = new Date(Date.now() - 86400000).toISOString();

    try {
      localStorage.setItem('labcharts-encryption-enabled', 'false');
      removeProfileChatKeys();
      state.currentProfile = profileId;
      state.currentThreadId = 'active-thread';
      state.chatHistory = [{ role: 'user', content: 'before' }];
      state.chatThreads = [
        { id: 'active-thread', title: 'Active', messageCount: 1, updatedAt: initialUpdatedAt },
        { id: 'inactive-thread', title: 'Inactive', messageCount: 1, updatedAt: initialUpdatedAt },
      ];

      let renderCalls = 0;
      const activeMessages = [{ role: 'assistant', content: 'active render' }];
      const inactiveMessages = [{ role: 'assistant', content: 'inactive render' }];
      roundState.renderRoundMessages('inactive-thread', inactiveMessages, () => { renderCalls += 1; });
      const inactiveRenderSkipped = renderCalls === 0
        && state.chatHistory[0].content === 'before';
      roundState.renderRoundMessages('active-thread', activeMessages, () => { renderCalls += 1; });
      outcomes.renderRoundMessagesOnlyRendersActiveThread = inactiveRenderSkipped
        && renderCalls === 1
        && state.chatHistory === activeMessages;

      await roundState.saveRoundChatHistory(null, [{ role: 'assistant', content: 'ignored' }]);
      const activeSaveMessages = [{ role: 'assistant', content: 'active saved' }];
      await roundState.saveRoundChatHistory('active-thread', activeSaveMessages);
      outcomes.activeRoundSaveUsesSharedChatHistory =
        state.chatHistory === activeSaveMessages;

      const inactiveSaveMessages = [
        { role: 'assistant', content: 'inactive saved' },
        { role: 'user', content: 'follow up' },
      ];
      const beforeUpdatedAt = state.chatThreads.find(thread => thread.id === 'inactive-thread')?.updatedAt;
      await roundState.saveRoundChatHistory('inactive-thread', inactiveSaveMessages);
      const inactiveThread = state.chatThreads.find(thread => thread.id === 'inactive-thread');
      const inactiveStored = JSON.parse(localStorage.getItem(chatThreads.getChatThreadKey('inactive-thread')) || '[]');
      const savedThreadIndex = JSON.parse(localStorage.getItem(chatThreads.getChatThreadsKey()) || '[]');
      outcomes.inactiveRoundSavePersistsThreadAndUpdatesIndex =
        inactiveStored.length === 2
        && inactiveStored[0].content === 'inactive saved'
        && inactiveThread.messageCount === 2
        && inactiveThread.updatedAt !== beforeUpdatedAt
        && savedThreadIndex.some(thread => thread.id === 'inactive-thread' && thread.messageCount === 2);
    } finally {
      removeProfileChatKeys();
      state.currentProfile = saved.currentProfile;
      state.currentThreadId = saved.currentThreadId;
      state.chatThreads = saved.chatThreads;
      state.chatHistory = saved.chatHistory;
      if (saved.encryptionEnabled == null) localStorage.removeItem('labcharts-encryption-enabled');
      else localStorage.setItem('labcharts-encryption-enabled', saved.encryptionEnabled);
      chatThreads.renderThreadList();
    }

    return outcomes;
  }, {
    roundStateUrl: moduleUrl('/js/chat-discussion-round-state.js'),
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('chat discussion request builder covers personality model assistant and usage metadata', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.waitForSelector('#chat-input');

  const results = await page.evaluate(async ({ requestUrl }) => {
    const [{ state }, data, labContext, roundRequest] = await Promise.all([
      import('/js/state.js'),
      import('/js/data.js'),
      import('/js/lab-context.js'),
      import(requestUrl),
    ]);
    const outcomes = {};
    const storage = new Map(Array.from({ length: localStorage.length }, (_, index) => {
      const key = localStorage.key(index);
      return [key, key ? localStorage.getItem(key) : null];
    }));
    const original = {
      currentProfile: state.currentProfile,
      importedData: state.importedData,
      profileSex: state.profileSex,
      profileDob: state.profileDob,
      currentChatPersonality: state.currentChatPersonality,
      chatHistory: state.chatHistory,
    };

    try {
      state.currentProfile = 'chat-discussion-coverage';
      state.profileSex = 'female';
      state.profileDob = '1990-01-01';
      state.currentChatPersonality = 'custom_discuss';
      state.chatHistory = [];
      state.importedData = {
        ...state.importedData,
        entries: [
          { date: '2026-05-01', markers: { 'iron.ferritin': 18, 'iron.transferrin': 3.4 } },
          { date: '2026-06-01', markers: { 'iron.ferritin': 34, 'iron.transferrin': 2.8 } },
        ],
        healthGoals: [{ severity: 'major', text: 'Improve iron stores' }],
        customMarkers: {},
      };
      localStorage.setItem('labcharts-ai-provider', 'ollama');
      localStorage.setItem('labcharts-ai-paused', 'false');
      localStorage.setItem('labcharts-ollama-model', 'browser-chat-model');
      localStorage.setItem('labcharts-chat-websearch', 'on');
      localStorage.setItem('labcharts-lens-config', JSON.stringify({ enabled: false }));
      localStorage.setItem('labcharts-chat-discussion-coverage-chatPersonalityCustom', JSON.stringify([{
        id: 'custom_discuss',
        name: 'Protocol Reviewer',
        icon: 'P',
        promptText: 'Challenge weak claims.',
      }]));
      data.invalidateActiveDataCache();
      labContext.invalidateLabContextCache();

      const request = await roundRequest.buildDiscussionRoundRequest({
        msgText: 'How is ferritin changing?',
        roundHistory: [
          { role: 'user', content: 'Review ferritin.' },
          { role: 'assistant', personalityName: 'Skeptic', content: 'I want stronger evidence.' },
        ],
        signal: new AbortController().signal,
      });

      outcomes.requestIncludesBrowserState =
        request.provider === 'ollama'
        && request.modelId === 'browser-chat-model'
        && request.modelDisplay === 'browser-chat-model'
        && request.personality.name === 'Protocol Reviewer'
        && request.systemPrompt.includes('Challenge weak claims.')
        && request.systemPrompt.includes('Ferritin')
        && request.systemPrompt.includes('Skeptic')
        && request.apiMessages.some(message => message.content.includes('[Response from Skeptic]'))
        && request.webSearch === false
        && request.e2ee === false
        && request.lensResult === null;

      const assistant = roundRequest.buildDiscussionAssistantMessage({
        fullText: 'Ferritin improved.',
        request: {
          ...request,
          webSearch: true,
          e2ee: true,
          lensResult: {
            sourceName: 'Study notes',
            chunks: [{ text: 'Ferritin responds to repletion.', source: 'note.md', score: 0.9 }],
          },
        },
        aiResult: { finishReason: 'length' },
        responseTruncated: true,
        attestation: { nonceVerified: true, signingKeyBound: true, debugMode: false },
      });

      outcomes.assistantMessagePreservesMetadata =
        assistant.role === 'assistant'
        && assistant.content === 'Ferritin improved.'
        && assistant.personalityName === 'Protocol Reviewer'
        && assistant.truncated === true
        && assistant.finishReason === 'length'
        && assistant.webSearch === true
        && assistant.e2ee === true
        && assistant.attestation?.nonceVerified === true
        && assistant.lensSources?.[0]?.source === 'note.md'
        && assistant.lensSourceName === 'Study notes';

      localStorage.removeItem('labcharts-chat-discussion-coverage-usage');
      localStorage.removeItem('labcharts-global-usage');
      roundRequest.trackDiscussionUsage(request, { inputTokens: 12, outputTokens: 8 });
      roundRequest.trackDiscussionUsage(request, {});
      const profileUsage = JSON.parse(localStorage.getItem('labcharts-chat-discussion-coverage-usage') || 'null');
      const globalUsage = JSON.parse(localStorage.getItem('labcharts-global-usage') || 'null');
      outcomes.usageTrackingRecordsNonEmptyUsage =
        profileUsage?.totalInputTokens === 12
        && profileUsage?.totalOutputTokens === 8
        && profileUsage?.requestCount === 1
        && globalUsage?.totalInputTokens === 12
        && globalUsage?.requestCount === 1;
    } finally {
      state.currentProfile = original.currentProfile;
      state.importedData = original.importedData;
      state.profileSex = original.profileSex;
      state.profileDob = original.profileDob;
      state.currentChatPersonality = original.currentChatPersonality;
      state.chatHistory = original.chatHistory;
      data.invalidateActiveDataCache();
      labContext.invalidateLabContextCache();
      localStorage.clear();
      for (const [key, value] of storage) {
        if (key && value != null) localStorage.setItem(key, value);
      }
    }

    return outcomes;
  }, {
    requestUrl: moduleUrl('/js/chat-discussion-round-request.js'),
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('chat discussion flow guards and empty rounds cover no-network browser controls', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.waitForSelector('#chat-input');

  const results = await page.evaluate(async ({ flowUrl, turnsUrl }) => {
    const [{ state }, callbacks, flow, turns] = await Promise.all([
      import('/js/state.js'),
      import('/js/chat-discussion-callbacks.js'),
      import(flowUrl),
      import(turnsUrl),
    ]);
    const outcomes = {};
    const storage = new Map(Array.from({ length: localStorage.length }, (_, index) => {
      const key = localStorage.key(index);
      return [key, key ? localStorage.getItem(key) : null];
    }));
    const original = {
      currentProfile: state.currentProfile,
      currentThreadId: state.currentThreadId,
      currentChatPersonality: state.currentChatPersonality,
      chatHistory: state.chatHistory,
      chatThreads: state.chatThreads,
      hasDiscussionPersonas: Object.prototype.hasOwnProperty.call(state, '_discussionPersonas'),
      discussionPersonas: state._discussionPersonas,
      hasDiscussionOriginalPersonality: Object.prototype.hasOwnProperty.call(state, '_discussionOriginalPersonality'),
      discussionOriginalPersonality: state._discussionOriginalPersonality,
      messagesHTML: document.getElementById('chat-messages')?.innerHTML,
    };
    let currentAbortController = new AbortController();
    const controllerTransitions = [];
    const sendButtonModes = [];
    let renderCalls = 0;

    try {
      localStorage.setItem('labcharts-ai-provider', 'ollama');
      localStorage.setItem('labcharts-ai-paused', 'false');
      localStorage.setItem('labcharts-ollama-model', 'browser-chat-model');
      state.currentProfile = 'chat-flow-coverage';
      state.currentThreadId = 'discussion-empty';
      state.currentChatPersonality = 'default';
      state.chatThreads = [{
        id: 'discussion-empty',
        name: 'Discussion Empty',
        createdAt: '2026-06-01T00:00:00.000Z',
        updatedAt: '2026-06-01T00:00:00.000Z',
        messageCount: 2,
        personality: 'default',
      }];
      state.chatHistory = [
        { role: 'assistant', personalityName: 'Skeptic', personalityIcon: 'S', content: 'Ferritin may still be low.' },
        { role: 'assistant', personalityName: 'Protocol Reviewer', personalityIcon: 'P', content: 'Check trend and context.' },
      ];

      callbacks.configureChatDiscussion({
        getChatAbortController: () => currentAbortController,
        setChatAbortController(controller) {
          currentAbortController = controller;
          controllerTransitions.push(controller ? 'set' : 'clear');
        },
        setSendButtonMode(_btn, mode) {
          sendButtonModes.push(mode);
        },
        renderChatMessages() {
          renderCalls += 1;
        },
        createTypewriter() {
          return { update() {}, stop() {} };
        },
      });

      await flow.sendDiscussionUserTurn('ignored', null);
      await flow.continueDiscussion();
      await flow.startDiscussion();
      await flow.startDiscussionFromPicker();
      outcomes.flowGuardBranchesAvoidUiWork =
        !document.querySelector('.chat-discuss-picker')
        && !document.querySelector('.chat-discuss-continue');

      currentAbortController = null;
      await turns.runDiscussionContinuation([], 'default', 'No-network steer', { threadId: 'discussion-empty' });
      await turns.runDiscussion([]);
      outcomes.emptyRoundsSetAndClearControllers =
        controllerTransitions.filter(value => value === 'set').length >= 2
        && controllerTransitions.filter(value => value === 'clear').length >= 2;
      outcomes.emptyRoundsResetSendButton =
        sendButtonModes.includes('streaming')
        && sendButtonModes.at(-1) === 'idle';
      outcomes.emptyRoundsPersistDiscussionThread =
        state.currentChatPersonality === 'default'
        && state.chatThreads[0].discussionOriginalPersonality === 'default'
        && Array.isArray(state.chatThreads[0].discussionPersonas);
      outcomes.emptyRoundsShowContinuePromptWithoutRenderingMessages =
        document.querySelector('.chat-discuss-continue') !== null
        && renderCalls === 0;
    } finally {
      callbacks.configureChatDiscussion({
        getChatAbortController: () => null,
        setChatAbortController: () => {},
        setSendButtonMode: () => {},
        renderChatMessages: () => {},
        createTypewriter: null,
      });
      state.currentProfile = original.currentProfile;
      state.currentThreadId = original.currentThreadId;
      state.currentChatPersonality = original.currentChatPersonality;
      state.chatHistory = original.chatHistory;
      state.chatThreads = original.chatThreads;
      if (original.hasDiscussionPersonas) state._discussionPersonas = original.discussionPersonas;
      else delete state._discussionPersonas;
      if (original.hasDiscussionOriginalPersonality) state._discussionOriginalPersonality = original.discussionOriginalPersonality;
      else delete state._discussionOriginalPersonality;
      const messages = document.getElementById('chat-messages');
      if (messages && original.messagesHTML != null) messages.innerHTML = original.messagesHTML;
      localStorage.clear();
      for (const [key, value] of storage) {
        if (key && value != null) localStorage.setItem(key, value);
      }
    }

    return outcomes;
  }, {
    flowUrl: moduleUrl('/js/chat-discussion-flow.js'),
    turnsUrl: moduleUrl('/js/chat-discussion-turns.js'),
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('chat marker and correlation prompt handoffs prefill chat threads from browser state', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.waitForSelector('#chat-input');

  const results = await page.evaluate(async ({ markerPromptsUrl }) => {
    const [{ state }, data, markerPrompts, chatRuntime] = await Promise.all([
      import('/js/state.js'),
      import('/js/data.js'),
      import(markerPromptsUrl),
      import('/js/chat-runtime.js'),
    ]);
    const outcomes = {};
    const storage = new Map(Array.from({ length: localStorage.length }, (_, index) => {
      const key = localStorage.key(index);
      return [key, key ? localStorage.getItem(key) : null];
    }));
    const original = {
      currentProfile: state.currentProfile,
      importedData: state.importedData,
      profileSex: state.profileSex,
      profileDob: state.profileDob,
      markerRegistry: state.markerRegistry,
      selectedCorrelationMarkers: state.selectedCorrelationMarkers,
      chatHistory: state.chatHistory,
      chatThreads: state.chatThreads,
      currentThreadId: state.currentThreadId,
      currentChatPersonality: state.currentChatPersonality,
      inputValue: document.getElementById('chat-input')?.value,
      panelClass: document.getElementById('chat-panel')?.className,
    };
    let closeCalls = 0;
    const previousChatRuntime = chatRuntime.configureChatRuntimeCallbacks({
      closeModal: () => { closeCalls += 1; },
    });
    const waitFor = async (predicate) => {
      for (let i = 0; i < 60; i += 1) {
        if (predicate()) return true;
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      return false;
    };

    try {
      state.currentProfile = 'chat-marker-prompt-coverage';
      state.profileSex = 'female';
      state.profileDob = '1990-01-01';
      state.currentChatPersonality = 'default';
      state.chatHistory = [];
      state.chatThreads = [];
      state.currentThreadId = null;
      state.selectedCorrelationMarkers = [];
      state.importedData = {
        ...state.importedData,
        entries: [
          { date: '2026-05-01', markers: { 'iron.ferritin': 18, 'iron.transferrin': 3.4 } },
          { date: '2026-06-01', markers: { 'iron.ferritin': 34, 'iron.transferrin': 2.8 } },
        ],
        customMarkers: {},
      };
      localStorage.setItem('labcharts-ai-provider', 'ollama');
      localStorage.setItem('labcharts-ai-paused', 'false');
      localStorage.setItem('labcharts-ollama-model', 'browser-chat-model');
      localStorage.removeItem('labcharts-chat-marker-prompt-coverage-chat-threads');
      data.invalidateActiveDataCache();
      const activeData = data.getActiveData();
      state.markerRegistry = {
        ferritin: {
          ...activeData.categories.iron.markers.ferritin,
          id: 'ferritin',
        },
      };
      const input = document.getElementById('chat-input');
      input.value = '';
      markerPrompts.askAIAboutMarker('missing-marker');
      await new Promise(resolve => setTimeout(resolve, 50));
      outcomes.missingMarkerIsGuarded = input.value === '';

      markerPrompts.askAIAboutMarker('ferritin');
      const markerReady = await waitFor(() => input.value.includes('Tell me about my Ferritin results'));
      const markerPrompt = input.value;
      outcomes.markerPromptPrefillsChatAndRenamesThread =
        markerReady
        && closeCalls === 1
        && document.getElementById('chat-panel')?.classList.contains('open') === true
        && markerPrompt.includes('Trend: up')
        && markerPrompt.includes('Optimal range')
        && state.chatThreads.some(thread => thread.name === 'Ferritin');

      state.selectedCorrelationMarkers = ['iron.ferritin', 'iron.transferrin'];
      markerPrompts.askAIAboutCorrelations();
      const correlationReady = await waitFor(() => input.value.includes('Analyze the correlation between these biomarkers'));
      const correlationPrompt = input.value;
      outcomes.correlationPromptPrefillsNamesValuesAndThread =
        correlationReady
        && correlationPrompt.includes('Ferritin, Transferrin')
        && correlationPrompt.includes('- Ferritin:')
        && correlationPrompt.includes('- Transferrin:')
        && correlationPrompt.includes('status: normal')
        && state.chatThreads.some(thread => thread.name === 'Correlations: Ferritin + Transferrin');
    } finally {
      state.currentProfile = original.currentProfile;
      state.importedData = original.importedData;
      state.profileSex = original.profileSex;
      state.profileDob = original.profileDob;
      state.markerRegistry = original.markerRegistry;
      state.selectedCorrelationMarkers = original.selectedCorrelationMarkers;
      state.chatHistory = original.chatHistory;
      state.chatThreads = original.chatThreads;
      state.currentThreadId = original.currentThreadId;
      state.currentChatPersonality = original.currentChatPersonality;
      chatRuntime.configureChatRuntimeCallbacks(previousChatRuntime);
      data.invalidateActiveDataCache();
      const input = document.getElementById('chat-input');
      if (input && original.inputValue != null) input.value = original.inputValue;
      const panel = document.getElementById('chat-panel');
      if (panel && original.panelClass != null) panel.className = original.panelClass;
      localStorage.clear();
      for (const [key, value] of storage) {
        if (key && value != null) localStorage.setItem(key, value);
      }
    }

    return outcomes;
  }, {
    markerPromptsUrl: moduleUrl('/js/chat-marker-prompts.js'),
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});
