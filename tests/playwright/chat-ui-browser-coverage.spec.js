import { expect, test } from './coverage-fixture.js';

function moduleUrl(path) {
  return `${path}?chatUiCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

test('chat image attachments cover previews handlers and lightbox controls', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.waitForSelector('#chat-input');

  const results = await page.evaluate(async ({ chatImagesUrl }) => {
    const [chatImages, { state }] = await Promise.all([
      import(chatImagesUrl),
      import('/js/state.js'),
    ]);
    const outcomes = {};
    const storage = new Map(Array.from({ length: localStorage.length }, (_, i) => {
      const key = localStorage.key(i);
      return [key, localStorage.getItem(key)];
    }));
    const preview = document.getElementById('chat-attach-preview');
    const hdBtn = document.getElementById('chat-hd-btn');
    const attachBtn = document.getElementById('chat-attach-btn');
    const input = document.getElementById('chat-image-input');
    const messages = document.getElementById('chat-messages');
    const inputArea = document.querySelector('.chat-input-area');
    const conversation = document.querySelector('.chat-panel-conversation');
    const dropOverlay = document.getElementById('chat-drop-overlay');
    const originalPreview = preview?.innerHTML;
    const originalPreviewDisplay = preview?.style.display;
    const originalHdDisplay = hdBtn?.style.display;
    const originalHdTitle = hdBtn?.title;
    const originalHdClass = hdBtn?.className;
    const originalAttachDisplay = attachBtn?.style.display;
    const originalInputFiles = input ? Object.getOwnPropertyDescriptor(input, 'files') : null;
    const originalThreadId = state.currentThreadId;
    let sendButtonRefreshes = 0;
    const importedFiles = [];

    const pngBytes = Uint8Array.from(atob(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
    ), char => char.charCodeAt(0));
    const makeImage = (name = 'tiny-lab.png') => new File([pngBytes], name, { type: 'image/png' });

    try {
      const originalImportInput = document.getElementById('pdf-input');
      const isolatedImportInput = originalImportInput?.cloneNode(true);
      let defaultImportFiles = [];
      if (originalImportInput && isolatedImportInput instanceof HTMLInputElement) {
        originalImportInput.replaceWith(isolatedImportInput);
        isolatedImportInput.addEventListener('change', () => {
          defaultImportFiles = Array.from(isolatedImportInput.files || [], file => file.name);
        });
        await chatImages.handleChatFiles([
          new File(['%PDF test'], 'default-route.pdf', { type: 'application/pdf' }),
        ]);
        isolatedImportInput.replaceWith(originalImportInput);
      }
      outcomes.defaultPdfRouteUsesExistingImportInput = defaultImportFiles.includes('default-route.pdf');

      localStorage.setItem('labcharts-ai-provider', 'ollama');
      localStorage.setItem('labcharts-ai-paused', 'false');
      localStorage.setItem('labcharts-hd-images', 'false');
      chatImages.configureChatImages({
        updateSendButtonState: () => { sendButtonRefreshes += 1; },
        importFiles: async files => { importedFiles.push(...files.map(file => file.name)); },
      });
      chatImages.clearAttachments();
      chatImages.updateAttachButtonVisibility();

      outcomes.chatImageHandlersStayModuleOnly = [
        'toggleHDMode',
        'addImageAttachment',
        'removeImageAttachment',
        'renderAttachmentPreview',
        'openImageLightbox',
        'clearAttachments',
        'updateAttachButtonVisibility',
        'initChatImageHandlers',
      ].every(name => typeof window[name] === 'undefined');

      outcomes.attachButtonsVisibleForVisionProvider = attachBtn?.style.display === 'flex'
        && hdBtn?.style.display === 'flex'
        && hdBtn?.classList.contains('active') === false
        && input?.getAttribute('accept')?.includes('.pdf') === true
        && attachBtn?.getAttribute('aria-label')?.includes('import health file') === true;

      chatImages.toggleHDMode();
      outcomes.hdTogglePersistsAndUpdatesButton = localStorage.getItem('labcharts-hd-images') === 'true'
        && hdBtn?.classList.contains('active') === true
        && hdBtn?.title.includes('2048px') === true;

      await chatImages.addImageAttachment(makeImage('tiny <lab>.png'));
      outcomes.addImageCreatesPreview = chatImages.getPendingAttachments().length === 1
        && chatImages.hasPendingAttachments() === true
        && preview?.style.display === 'flex'
        && preview?.querySelector('.chat-attach-count')?.textContent === '1/5'
        && preview?.querySelector('img')?.getAttribute('alt') === 'tiny <lab>.png';

      const attachmentMessage = {};
      chatImages.rememberMessageAttachments(attachmentMessage, chatImages.getPendingAttachments());
      state.currentThreadId = 'attachment-other-thread';
      chatImages.refreshAttachmentDraft();
      const otherThreadStartsEmpty = chatImages.getPendingAttachments().length === 0
        && preview?.style.display === 'none';
      state.currentThreadId = originalThreadId;
      chatImages.refreshAttachmentDraft();
      outcomes.attachmentsAreScopedPerThread = otherThreadStartsEmpty
        && chatImages.getPendingAttachments()[0]?.name === 'tiny <lab>.png';

      chatImages.clearAttachments();
      outcomes.sentImageCanBeRestoredForRetry = chatImages.restoreMessageAttachments(attachmentMessage) === true
        && chatImages.getPendingAttachments()[0]?.name === 'tiny <lab>.png';

      chatImages.removeImageAttachment(0);
      outcomes.removeImageClearsPreview = chatImages.getPendingAttachments().length === 0
        && preview?.style.display === 'none';
      outcomes.attachmentChangesRefreshSendButtonThroughConfiguredCallback = sendButtonRefreshes >= 2
        && typeof window.updateSendButtonState === 'undefined';
      chatImages.configureChatImages({ updateSendButtonState: undefined });
      let invalidCallbackConfigThrew = false;
      try {
        chatImages.removeImageAttachment(99);
      } catch (_) {
        invalidCallbackConfigThrew = true;
      }
      outcomes.invalidCallbackConfigKeepsSafeCallback = invalidCallbackConfigThrew === false
        && sendButtonRefreshes >= 3;

      await chatImages.addImageAttachment(new File(['not an image'], 'note.txt', { type: 'text/plain' }));
      outcomes.invalidImageIsRejected = chatImages.getPendingAttachments().length === 0;

      chatImages.initChatImageHandlers();
      const fileInputImage = makeImage('picked.png');
      if (input) {
        Object.defineProperty(input, 'files', {
          configurable: true,
          value: [fileInputImage],
        });
        input.dispatchEvent(new Event('change', { bubbles: true }));
        for (let i = 0; i < 40 && chatImages.getPendingAttachments().length === 0; i += 1) {
          await new Promise(resolve => setTimeout(resolve, 25));
        }
      }
      outcomes.fileInputHandlerAddsAndResets = chatImages.getPendingAttachments().some(att => att.name === 'picked.png')
        && input?.value === '';

      chatImages.clearAttachments();
      if (conversation && messages) {
        const dragOver = new Event('dragover', { bubbles: true, cancelable: true });
        Object.defineProperty(dragOver, 'dataTransfer', {
          configurable: true,
          value: { types: ['Files'], files: [], dropEffect: 'none' },
        });
        messages.dispatchEvent(dragOver);
        outcomes.dragOverMarksDropArea = conversation.classList.contains('chat-drop-active')
          && dropOverlay?.hidden === false;

        const dragLeave = new Event('dragleave', { bubbles: true });
        Object.defineProperty(dragLeave, 'relatedTarget', {
          configurable: true,
          value: null,
        });
        messages.dispatchEvent(dragLeave);
        outcomes.dragLeaveClearsDropArea = !conversation.classList.contains('chat-drop-active')
          && dropOverlay?.hidden === true;

        const drop = new Event('drop', { bubbles: true, cancelable: true });
        Object.defineProperty(drop, 'dataTransfer', {
          configurable: true,
          value: { files: [makeImage('dropped.png')] },
        });
        messages.dispatchEvent(drop);
        for (let i = 0; i < 40 && chatImages.getPendingAttachments().length === 0; i += 1) {
          await new Promise(resolve => setTimeout(resolve, 25));
        }
      }
      outcomes.dropHandlerAddsImage = chatImages.getPendingAttachments().some(att => att.name === 'dropped.png');

      if (inputArea) {
        const reportDrop = new Event('drop', { bubbles: true, cancelable: true });
        Object.defineProperty(reportDrop, 'dataTransfer', {
          configurable: true,
          value: { files: [new File(['%PDF test'], 'labs.pdf', { type: 'application/pdf' })] },
        });
        inputArea.dispatchEvent(reportDrop);
        for (let i = 0; i < 40 && importedFiles.length === 0; i += 1) {
          await new Promise(resolve => setTimeout(resolve, 25));
        }
      }
      outcomes.dropOnComposerRoutesPdfToImport = importedFiles.includes('labs.pdf')
        && chatImages.getPendingAttachments().every(att => att.name !== 'labs.pdf');

      if (input) {
        Object.defineProperty(input, 'files', {
          configurable: true,
          value: [new File(['marker,value'], 'labs.csv', { type: 'text/csv' })],
        });
        input.dispatchEvent(new Event('change', { bubbles: true }));
        for (let i = 0; i < 40 && !importedFiles.includes('labs.csv'); i += 1) {
          await new Promise(resolve => setTimeout(resolve, 25));
        }
      }
      outcomes.filePickerRoutesHealthDataToImport = importedFiles.includes('labs.csv')
        && input?.value === '';

      chatImages.openImageLightbox('data:image/png;base64,abc');
      const lightbox = document.querySelector('.chat-lightbox');
      outcomes.lightboxOpens = lightbox?.getAttribute('role') === 'dialog'
        && lightbox?.getAttribute('aria-modal') === 'true'
        && !!lightbox.querySelector('img[alt="Attached image preview"]')
        && document.activeElement === lightbox.querySelector('.chat-lightbox-close');
      lightbox?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      outcomes.lightboxClickCloses = !document.querySelector('.chat-lightbox');

      chatImages.openImageLightbox('data:image/png;base64,abc');
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      outcomes.lightboxEscapeCloses = !document.querySelector('.chat-lightbox');
    } finally {
      chatImages.configureChatImages({ updateSendButtonState: () => {}, importFiles: async () => {} });
      chatImages.clearAttachments();
      if (preview) {
        preview.innerHTML = originalPreview || '';
        preview.style.display = originalPreviewDisplay || '';
      }
      if (hdBtn) {
        hdBtn.style.display = originalHdDisplay || '';
        hdBtn.title = originalHdTitle || '';
        hdBtn.className = originalHdClass || '';
      }
      if (attachBtn) attachBtn.style.display = originalAttachDisplay || '';
      if (input && originalInputFiles) Object.defineProperty(input, 'files', originalInputFiles);
      state.currentThreadId = originalThreadId;
      localStorage.clear();
      for (const [key, value] of storage) {
        if (key && value != null) localStorage.setItem(key, value);
      }
    }

    return outcomes;
  }, {
    chatImagesUrl: moduleUrl('/js/chat-images.js'),
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('chat thread search covers message results clearing and jump highlighting', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.waitForSelector('#chat-thread-search');

  const results = await page.evaluate(async ({ threadSearchUrl }) => {
    const [{ state }, threadSearch] = await Promise.all([
      import('/js/state.js'),
      import(threadSearchUrl),
    ]);
    const outcomes = {};
    const storage = new Map(Array.from({ length: localStorage.length }, (_, i) => {
      const key = localStorage.key(i);
      return [key, localStorage.getItem(key)];
    }));
    const original = {
      currentProfile: state.currentProfile,
      chatThreads: state.chatThreads,
      currentThreadId: state.currentThreadId,
      chatHistory: state.chatHistory,
      listHTML: document.getElementById('chat-thread-list')?.innerHTML,
      inputValue: document.getElementById('chat-thread-search')?.value,
      messagesHTML: document.getElementById('chat-messages')?.innerHTML,
    };
    const renderCalls = [];
    const messagesByThread = {
      thread_a: [
        { role: 'user', content: 'Looking for ferritin and thyroid context' },
        { role: 'assistant', content: 'Ferritin is in the lower range.' },
      ],
      thread_b: [
        { role: 'assistant', content: 'Vitamin D and sleep notes only.' },
      ],
    };
    const renderMessages = (messages) => {
      const container = document.getElementById('chat-messages');
      if (!container) return;
      container.innerHTML = messages.map((message, index) =>
        `<div id="chat-msg-${index}" class="chat-msg">${message.content}</div>`
      ).join('');
    };

    try {
      state.currentProfile = 'chat-search-profile';
      state.chatThreads = [
        { id: 'thread_a', name: 'Ferritin <Plan>' },
        { id: 'thread_b', name: 'Sleep Notes' },
      ];
      state.currentThreadId = 'thread_b';
      state.chatHistory = messagesByThread.thread_b;
      for (const [threadId, messages] of Object.entries(messagesByThread)) {
        localStorage.setItem(`chat-search-${threadId}`, JSON.stringify(messages));
      }
      renderMessages(state.chatHistory);

      threadSearch.configureChatThreadSearch({
        getChatThreadKey: threadId => `chat-search-${threadId}`,
        renderThreadList(filter) {
          renderCalls.push(filter || '');
          const list = document.getElementById('chat-thread-list');
          if (!list) return;
          const visible = state.chatThreads.filter(thread =>
            !filter || thread.name.toLowerCase().includes(String(filter).toLowerCase())
          );
          list.innerHTML = visible.length
            ? visible.map(thread => `<div class="chat-thread-item">${thread.name}</div>`).join('')
            : '<div>No matching threads</div>';
        },
        async switchToThread(threadId) {
          state.currentThreadId = threadId;
          state.chatHistory = messagesByThread[threadId] || [];
          renderMessages(state.chatHistory);
        },
      });

      const input = document.getElementById('chat-thread-search');
      input.value = 'ferritin';
      threadSearch.filterThreadList('ferritin');
      await new Promise(resolve => setTimeout(resolve, 320));
      const result = document.querySelector('.chat-search-result');
      outcomes.searchShowsEscapedMessageResult = !!result
        && result.querySelector('.chat-search-result-thread')?.textContent === 'Ferritin <Plan>'
        && result.querySelector('mark')?.textContent.toLowerCase() === 'ferritin'
        && result.getAttribute('data-chat-message-action') === 'jump-search-result'
        && result.getAttribute('data-chat-message-thread-id') === 'thread_a'
        && !result.hasAttribute('onclick')
        && renderCalls.includes('ferritin');

      await threadSearch.jumpToSearchResult('thread_a', 0, messagesByThread.thread_a[0].content.slice(0, 50));
      await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
      const highlighted = document.getElementById('chat-msg-0');
      outcomes.jumpSwitchesThreadAndHighlights = state.currentThreadId === 'thread_a'
        && highlighted?.classList.contains('chat-msg-highlight') === true
        && highlighted?.querySelector('.chat-search-mark')?.textContent.toLowerCase() === 'ferritin';

      input.value = '';
      threadSearch.filterThreadList('');
      outcomes.clearSearchRestoresThreadListAndRemovesMarks = renderCalls.at(-1) === ''
        && !document.querySelector('.chat-search-mark')
        && !document.querySelector('.chat-msg-highlight');

      input.value = 'missing';
      threadSearch.filterThreadList('missing');
      await new Promise(resolve => setTimeout(resolve, 320));
      outcomes.noMessageMatchesReplacesEmptyThreadState =
        document.getElementById('chat-thread-list')?.textContent.includes('No matches in conversations or messages') === true;

      threadSearch.invalidateThreadContentCache();
      input.value = 'ferritin';
      state.chatThreads = state.chatThreads.map(thread =>
        thread.id === 'thread_a' ? { ...thread, name: 'Iron Plan' } : thread
      );
      localStorage.setItem('chat-search-thread_a', '{bad json');
      threadSearch.filterThreadList('ferritin');
      await new Promise(resolve => setTimeout(resolve, 320));
      outcomes.invalidStoredThreadMessagesAreIgnored =
        document.getElementById('chat-thread-list')?.textContent.includes('No matches in conversations or messages') === true;
    } finally {
      state.currentProfile = original.currentProfile;
      state.chatThreads = original.chatThreads;
      state.currentThreadId = original.currentThreadId;
      state.chatHistory = original.chatHistory;
      const list = document.getElementById('chat-thread-list');
      if (list && original.listHTML != null) list.innerHTML = original.listHTML;
      const input = document.getElementById('chat-thread-search');
      if (input && original.inputValue != null) input.value = original.inputValue;
      const messages = document.getElementById('chat-messages');
      if (messages && original.messagesHTML != null) messages.innerHTML = original.messagesHTML;
      localStorage.clear();
      for (const [key, value] of storage) {
        if (key && value != null) localStorage.setItem(key, value);
      }
    }

    return outcomes;
  }, {
    threadSearchUrl: moduleUrl('/js/chat-thread-search.js'),
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('chat panel browser coverage toggles web search and panel chrome', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.waitForSelector('#chat-panel', { state: 'attached' });

  const results = await page.evaluate(async ({ chatPanelUrl }) => {
    const [{ state }, chatPanel] = await Promise.all([
      import('/js/state.js'),
      import(chatPanelUrl),
    ]);
    const outcomes = {};
    const storage = new Map(Array.from({ length: localStorage.length }, (_, i) => {
      const key = localStorage.key(i);
      return [key, key ? localStorage.getItem(key) : null];
    }));
    const panel = document.getElementById('chat-panel');
    const backdrop = document.getElementById('chat-backdrop');
    const fab = document.getElementById('chat-fab');
    const input = document.getElementById('chat-input');
    const sendBtn = document.getElementById('chat-send-btn');
    const label = document.querySelector('#chat-panel .chat-websearch-toggle-label');
    const checkbox = document.getElementById('chat-websearch-checkbox');
    const threadIndexKey = `labcharts-${state.currentProfile}-chat-threads`;
    const original = {
      panelClass: panel?.className,
      backdropClass: backdrop?.className,
      bodyClass: document.body.className,
      fabClass: fab?.className,
      inputValue: input?.value,
      inputDisabled: input?.disabled,
      inputPlaceholder: input?.placeholder,
      sendDisabled: sendBtn?.disabled,
      labelDisplay: label?.style.display,
      checkboxChecked: checkbox?.checked,
    };
    let mobileRefreshes = 0;
    const previousChatPanelCallbacks = chatPanel.configureChatPanel({
      refreshMobileDashboardActiveTab: () => { mobileRefreshes++; },
    });

    try {
      localStorage.setItem('labcharts-ai-provider', 'openrouter');
      localStorage.setItem('labcharts-ai-paused', 'false');
      localStorage.setItem('labcharts-chat-fullscreen', 'false');
      panel?.classList.remove('open', 'chat-panel-fullscreen');
      backdrop?.classList.remove('open');
      document.body.classList.remove('chat-open', 'chat-fullscreen', 'chat-autostart-reserved');
      fab?.classList.remove('hidden');

      chatPanel.setChatWebSearchEnabled(true);
      outcomes.webSearchTogglePersistsOnAndShowsForProvider =
        chatPanel.getChatWebSearchEnabled() === true
        && localStorage.getItem('labcharts-chat-websearch') === 'on'
        && label?.style.display === '';

      chatPanel.setChatWebSearchEnabled(false);
      outcomes.webSearchTogglePersistsOff =
        chatPanel.getChatWebSearchEnabled() === false
        && localStorage.getItem('labcharts-chat-websearch') === 'off';

      localStorage.setItem('labcharts-ai-provider', 'custom');
      chatPanel.refreshWebSearchToggle();
      outcomes.webSearchToggleHidesForUnsupportedProvider = label?.style.display === 'none';

      localStorage.setItem('labcharts-ai-provider', 'ollama');
      localStorage.setItem(threadIndexKey, '{bad json');
      input?.blur();
      await chatPanel.openChatPanel('blocked prompt');
      outcomes.blockedThreadIndexDisablesComposer =
        input?.disabled === true
        && sendBtn?.disabled === true
        && input?.placeholder === 'Conversations are paused to protect saved chats'
        && document.activeElement !== input;

      chatPanel.closeChatPanel();
      localStorage.removeItem(threadIndexKey);
      mobileRefreshes = 0;
      localStorage.setItem('labcharts-ai-provider', 'openrouter');
      await chatPanel.toggleChatPanel();
      outcomes.togglePanelOpensChrome =
        panel?.classList.contains('open') === true
        && backdrop?.classList.contains('open') === true
        && document.body.classList.contains('chat-open') === true
        && fab?.classList.contains('hidden') === true
        && checkbox?.checked === false;

      await chatPanel.toggleChatPanel();
      outcomes.togglePanelClosesChrome =
        panel?.classList.contains('open') === false
        && backdrop?.classList.contains('open') === false
        && document.body.classList.contains('chat-open') === false
        && fab?.classList.contains('hidden') === false
        && mobileRefreshes === 1;
    } finally {
      chatPanel.configureChatPanel(previousChatPanelCallbacks);
      chatPanel.closeChatPanel();
      localStorage.clear();
      for (const [key, value] of storage) {
        if (key && value != null) localStorage.setItem(key, value);
      }
      if (panel && original.panelClass != null) panel.className = original.panelClass;
      if (backdrop && original.backdropClass != null) backdrop.className = original.backdropClass;
      document.body.className = original.bodyClass;
      if (fab && original.fabClass != null) fab.className = original.fabClass;
      if (input && original.inputValue != null) input.value = original.inputValue;
      if (input && original.inputDisabled != null) input.disabled = original.inputDisabled;
      if (input && original.inputPlaceholder != null) input.placeholder = original.inputPlaceholder;
      if (sendBtn && original.sendDisabled != null) sendBtn.disabled = original.sendDisabled;
      if (label && original.labelDisplay != null) label.style.display = original.labelDisplay;
      if (checkbox && original.checkboxChecked != null) checkbox.checked = original.checkboxChecked;
    }

    return outcomes;
  }, {
    chatPanelUrl: moduleUrl('/js/chat-panel.js'),
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('mobile chat panel behaves as a modal and restores the page on close', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/app', { waitUntil: 'load' });
  await page.waitForSelector('#chat-panel', { state: 'attached' });

  const results = await page.evaluate(async ({ chatPanelUrl }) => {
    const chatPanel = await import(chatPanelUrl);
    const panel = document.getElementById('chat-panel');
    const trigger = document.getElementById('sidebar-toggle');
    const main = document.querySelector('.main');
    const sidebar = document.querySelector('.sidebar');
    const storage = new Map(Array.from({ length: localStorage.length }, (_, index) => {
      const key = localStorage.key(index);
      return [key, key ? localStorage.getItem(key) : null];
    }));

    try {
      localStorage.setItem('labcharts-ai-provider', 'openrouter');
      localStorage.setItem('labcharts-ai-paused', 'false');
      trigger?.focus();
      await chatPanel.openChatPanel();
      const opensAsModal = panel?.getAttribute('role') === 'dialog'
        && panel?.getAttribute('aria-modal') === 'true'
        && panel?.getAttribute('aria-hidden') === 'false'
        && panel?.inert === false
        && main?.inert === true
        && sidebar?.inert === true;

      chatPanel.closeChatPanel();
      return {
        opensAsModal,
        closeHidesMobileDialog: panel?.getAttribute('aria-hidden') === 'true'
          && panel?.inert === true
          && !panel?.hasAttribute('aria-modal'),
        closeRestoresBackground: main?.inert === false && sidebar?.inert === false,
        closeRestoresTriggerFocus: document.activeElement === trigger,
      };
    } finally {
      chatPanel.closeChatPanel();
      localStorage.clear();
      for (const [key, value] of storage) {
        if (key && value != null) localStorage.setItem(key, value);
      }
    }
  }, {
    chatPanelUrl: moduleUrl('/js/chat-panel.js'),
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('chat summaries cover saved summary modal actions without network calls', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.waitForSelector('#chat-panel');

  const results = await page.evaluate(async ({ summariesUrl }) => {
    const [{ state }, summaries] = await Promise.all([
      import('/js/state.js'),
      import(summariesUrl),
    ]);
    const outcomes = {};
    const storage = new Map(Array.from({ length: localStorage.length }, (_, i) => {
      const key = localStorage.key(i);
      return [key, localStorage.getItem(key)];
    }));
    const original = {
      importedData: state.importedData,
      chatThreads: state.chatThreads,
      currentThreadId: state.currentThreadId,
      chatHistory: state.chatHistory,
      summariesHTML: document.getElementById('chat-saved-summaries')?.innerHTML,
      open: window.open,
      createObjectURL: URL.createObjectURL,
      revokeObjectURL: URL.revokeObjectURL,
      anchorClick: HTMLAnchorElement.prototype.click,
      clipboard: Object.getOwnPropertyDescriptor(Navigator.prototype, 'clipboard') ||
        Object.getOwnPropertyDescriptor(navigator, 'clipboard'),
    };
    const copied = [];
    const downloads = [];
    const printed = [];
    const revoked = [];

    try {
      localStorage.setItem('labcharts-ai-provider', 'ollama');
      localStorage.setItem('labcharts-ai-paused', 'false');
      state.importedData = {
        ...(state.importedData || {}),
        chatSummaries: [
          {
            id: 's_old',
            threadId: 'old',
            threadName: 'Older Conversation',
            content: 'Old summary',
            createdAt: '2026-01-01T00:00:00.000Z',
            model: 'Older Model',
          },
          {
            id: 's_new',
            threadId: 'sum-thread',
            threadName: 'Wellness <Plan>',
            content: '## Key Findings\nFerritin improved.',
            createdAt: '2026-06-07T12:00:00.000Z',
            model: 'Summary Model',
            cost: { provider: 'openrouter', modelId: 'openai/gpt-4o-mini', modelDisplay: 'Summary Model', inputTokens: 100, outputTokens: 50 },
          },
        ],
      };
      state.chatThreads = [{
        id: 'sum-thread',
        name: 'Wellness <Plan>',
        summary: '## Existing Summary\nFerritin and vitamin D were discussed.',
        summaryDate: '2026-06-07T12:00:00.000Z',
        summaryModel: 'Summary Model',
        summaryCost: { provider: 'openrouter', modelId: 'openai/gpt-4o-mini', modelDisplay: 'Summary Model', inputTokens: 100, outputTokens: 50 },
      }];
      state.currentThreadId = 'sum-thread';
      state.chatHistory = [
        { role: 'user', content: 'What about ferritin?' },
        { role: 'assistant', personalityName: 'Analyst', content: [{ type: 'text', text: 'Ferritin is low.' }, { type: 'image_url' }] },
        { role: 'user', content: 'And vitamin D?' },
        { role: 'assistant', content: 'Vitamin D is adequate.' },
      ];

      const transcript = summaries.buildSummaryTranscript(state.chatHistory);
      outcomes.transcriptIncludesRolesImagesAndPersonality = transcript.includes('User:\nWhat about ferritin?')
        && transcript.includes('Assistant (Analyst):\nFerritin is low.\n[image attached]');

      summaries.renderSavedSummaries();
      const savedItems = [...document.querySelectorAll('.chat-saved-summary-item')];
      outcomes.savedSummariesRenderNewestFirstEscaped = savedItems.length === 2
        && savedItems[0].querySelector('.chat-saved-summary-name')?.textContent === 'Wellness <Plan>'
        && savedItems[0].getAttribute('data-chat-message-action') === 'view-summary'
        && savedItems[0].getAttribute('data-chat-message-summary-id') === 's_new'
        && !savedItems[0].hasAttribute('onclick');

      await summaries.summarizeThread();
      outcomes.existingThreadSummaryOpensModal = document.getElementById('summary-modal-overlay')?.classList.contains('show') === true
        && document.getElementById('summary-modal-body')?.textContent.includes('Existing Summary') === true;

      summaries.viewSavedSummary('s_new');
      outcomes.viewSavedSummarySetsSyncDataset = document.getElementById('summary-modal-overlay')?.dataset.syncRefreshSummaryId === 's_new'
        && document.getElementById('summary-modal-body')?.textContent.includes('Ferritin improved') === true;

      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: async text => copied.push(text) },
      });
      summaries.copySummary();
      await new Promise(resolve => setTimeout(resolve, 0));
      outcomes.copySummaryWritesMarkdown = copied[0]?.includes('Ferritin improved') === true;

      URL.createObjectURL = () => 'blob:summary-test';
      URL.revokeObjectURL = url => revoked.push(url);
      HTMLAnchorElement.prototype.click = function() {
        downloads.push({ href: this.href, download: this.download });
      };
      summaries.downloadSummary();
      outcomes.downloadSummaryBuildsMarkdownFile = downloads[0]?.download === 'Wellness__Plan__summary.md'
        && downloads[0]?.href === 'blob:summary-test'
        && revoked.includes('blob:summary-test');

      window.open = () => ({
        document: {
          write(html) { printed.push(html); },
          close() { printed.push('closed'); },
        },
        print() { printed.push('printed'); },
      });
      summaries.printSummary();
      outcomes.printSummaryWritesWindow = printed.some(item => String(item).includes('Wellness &lt;Plan&gt; - Summary'))
        && printed.includes('printed');

      await summaries.deleteSavedSummary('s_new');
      outcomes.deleteSavedSummaryRemovesItemAndCloses = !state.importedData.chatSummaries.some(s => s.id === 's_new')
        && !document.getElementById('summary-modal-overlay')?.classList.contains('show');

      state.chatHistory = [{ role: 'user', content: 'too short' }];
      await summaries.summarizeThread();
      outcomes.shortHistorySummaryDoesNotOpenModal = !document.getElementById('summary-modal-overlay')?.classList.contains('show');
    } finally {
      state.importedData = original.importedData;
      state.chatThreads = original.chatThreads;
      state.currentThreadId = original.currentThreadId;
      state.chatHistory = original.chatHistory;
      window.open = original.open;
      URL.createObjectURL = original.createObjectURL;
      URL.revokeObjectURL = original.revokeObjectURL;
      HTMLAnchorElement.prototype.click = original.anchorClick;
      if (original.clipboard) Object.defineProperty(navigator, 'clipboard', original.clipboard);
      document.getElementById('summary-modal-overlay')?.remove();
      const saved = document.getElementById('chat-saved-summaries');
      if (saved && original.summariesHTML != null) saved.innerHTML = original.summariesHTML;
      localStorage.clear();
      for (const [key, value] of storage) {
        if (key && value != null) localStorage.setItem(key, value);
      }
    }

    return outcomes;
  }, {
    summariesUrl: moduleUrl('/js/chat-summaries.js'),
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('chat discussion picker lifecycle and resume binding cover browser state paths', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.waitForSelector('#chat-messages', { state: 'attached' });

  const results = await page.evaluate(async ({ pickerUrl, lifecycleUrl, bindingsUrl }) => {
    const [{ state }, { CHAT_PERSONALITIES }, picker, lifecycle, , chatRuntime, chatLoader] = await Promise.all([
      import('/js/state.js'),
      import('/js/constants.js'),
      import(pickerUrl),
      import(lifecycleUrl),
      import(bindingsUrl),
      import('/js/chat-runtime.js'),
      import('/js/chat-loader.js'),
    ]);
    const outcomes = {};
    const storage = new Map(Array.from({ length: localStorage.length }, (_, i) => {
      const key = localStorage.key(i);
      return [key, localStorage.getItem(key)];
    }));
    const original = {
      currentProfile: state.currentProfile,
      chatHistory: state.chatHistory,
      chatThreads: state.chatThreads,
      currentThreadId: state.currentThreadId,
      currentChatPersonality: state.currentChatPersonality,
      messagesHTML: document.getElementById('chat-messages')?.innerHTML,
      inputHTML: document.querySelector('.chat-input-area')?.innerHTML,
    };
    const personas = CHAT_PERSONALITIES.slice(0, 2).map(p => ({ id: p.id, name: p.name, icon: p.icon }));

    try {
      state.currentProfile = 'chat-discuss-profile';
      state.currentThreadId = 'discussion-thread';
      state.currentChatPersonality = 'default';
      state.chatThreads = [{ id: 'discussion-thread', name: 'Discussion Thread' }];
      state.chatHistory = [];
      localStorage.setItem(`labcharts-${state.currentProfile}-chatPersonalityCustom`, JSON.stringify([
        { id: 'custom_lab', name: 'Lab Reviewer', icon: '*', promptText: 'Review labs' },
      ]));

      picker.removeDiscussPersonaPicker();
      picker.showDiscussPersonaPicker();
      const firstPicker = document.querySelector('.discuss-persona-picker');
      const firstInputs = [...firstPicker.querySelectorAll('input:not([data-locked="1"])')];
      firstInputs[0].click();
      outcomes.newDiscussionPickerRequiresOneAdditionalSelection =
        firstPicker.querySelector('.discuss-picker-start')?.disabled === false
        && firstPicker.querySelector('.discuss-picker-start')?.textContent.includes('1 response')
        && firstPicker.querySelector('.discuss-picker-start')?.getAttribute('data-chat-message-action') === 'start-discussion-from-picker'
        && !firstPicker.querySelector('.discuss-picker-start')?.hasAttribute('onclick')
        && picker.readDiscussPersonaPickerSelection()?.allPersonas.length === 2
        && firstInputs.slice(1).every(input => input.disabled)
        && firstPicker.querySelector('input[data-locked="1"]')?.value === 'default';

      picker.removeDiscussPersonaPicker();
      state.chatHistory = [{ role: 'assistant', personalityName: CHAT_PERSONALITIES[0].name, personalityIcon: CHAT_PERSONALITIES[0].icon, content: 'First opinion' }];
      state.chatThreads[0].discussionPersonas = personas;
      state.chatThreads[0].discussionOriginalPersonality = 'default';
      picker.showDiscussPersonaPicker();
      const addPicker = document.querySelector('.discuss-persona-picker');
      const locked = addPicker.querySelector('input[data-locked="1"]');
      const next = addPicker.querySelector('input:not([data-locked="1"]):not(:checked)');
      next.click();
      const selection = picker.readDiscussPersonaPickerSelection();
      outcomes.addDiscussionPickerLocksExistingPersona = locked?.disabled === true
        && locked?.checked === true
        && addPicker.querySelector('.discuss-picker-start')?.disabled === false
        && selection?.newPersonas.length === 1;

      lifecycle.showDiscussContinuePrompt(personas, 'default');
      outcomes.discussionModePersistsThreadState = !!document.querySelector('.chat-discussion-mode')
        && document.querySelector('.chat-discussion-end')?.getAttribute('data-chat-message-action') === 'end-discussion'
        && document.querySelector('.chat-discussion-add')?.getAttribute('data-chat-action') === 'start-discussion'
        && document.getElementById('chat-input')?.placeholder === 'Reply to the discussion…'
        && state.chatThreads[0].discussionPersonas?.length === 2
        && state._discussionPersonas?.length === 2;

      lifecycle.cleanupDiscussionState();
      outcomes.cleanupRemovesTransientUiKeepsThreadMetadata = !document.querySelector('.chat-discussion-mode')
        && !document.querySelector('.discuss-persona-picker')
        && state.chatThreads[0].discussionPersonas?.length === 2;

      lifecycle.restoreDiscussionContinuePrompt();
      outcomes.restoreDiscussionPromptUsesThreadMetadata = !!document.querySelector('.chat-discussion-mode');

      lifecycle.finishDiscussionRound(personas, 'default', 'discussion-thread');
      outcomes.finishRoundRestoresPersonality = state.currentChatPersonality === 'default'
        && localStorage.getItem(`labcharts-${state.currentProfile}-chatPersonality`) === 'default'
        && !!document.querySelector('.chat-discussion-mode');

      state._discussionOriginalPersonality = 'longevity';
      lifecycle.endDiscussion();
      outcomes.endDiscussionMarksThreadEnded = state.chatThreads[0].discussionEnded === true
        && state.currentChatPersonality === 'longevity'
        && localStorage.getItem(`labcharts-${state.currentProfile}-chatPersonality`) === 'longevity';

      localStorage.setItem('labcharts-ai-paused', 'true');
      await chatLoader.loadChatModule();
      chatRuntime.resumeChatAIRuntime();
      outcomes.resumeBindingUnpausesAndKeepsChatImageHelpersModuleOnly = localStorage.getItem('labcharts-ai-paused') === 'false'
        && !('_resumeAI' in window)
        && !('summarizeThread' in window)
        && !('startDiscussion' in window)
        && typeof window.clearAttachments === 'undefined';
    } finally {
      state.currentProfile = original.currentProfile;
      state.chatHistory = original.chatHistory;
      state.chatThreads = original.chatThreads;
      state.currentThreadId = original.currentThreadId;
      state.currentChatPersonality = original.currentChatPersonality;
      document.querySelector('.discuss-persona-picker')?.remove();
      document.querySelector('.chat-discussion-mode')?.remove();
      const messages = document.getElementById('chat-messages');
      if (messages && original.messagesHTML != null) messages.innerHTML = original.messagesHTML;
      const inputArea = document.querySelector('.chat-input-area');
      if (inputArea && original.inputHTML != null) inputArea.innerHTML = original.inputHTML;
      localStorage.clear();
      for (const [key, value] of storage) {
        if (key && value != null) localStorage.setItem(key, value);
      }
    }

    return outcomes;
  }, {
    pickerUrl: moduleUrl('/js/chat-discussion-picker.js'),
    lifecycleUrl: moduleUrl('/js/chat-discussion-lifecycle.js'),
    bindingsUrl: moduleUrl('/js/chat-window-bindings.js'),
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});
