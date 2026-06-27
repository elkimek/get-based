import { expect, test } from './coverage-fixture.js';

function moduleUrl(path) {
  return `${path}?customPersonalityCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

test('custom personality DOM renders editor controls and delegated discuss action', async ({ page }) => {
  const expectedOutcomeKeys = [
    'customSectionRenders',
    'customSectionHasNoInlineHandlers',
    'customButtonsRender',
    'customEditorControlsRender',
    'customEditorFieldsPopulate',
    'editInactiveKeepsPickerOpen',
    'editInactiveLoadsFields',
    'cssSelectorsExist',
    'saveDisabledAfterSnapshot',
    'saveStaysDisabledWhenStateMatchesSnapshot',
    'discussButtonDelegated',
  ];

  await page.goto('/app', { waitUntil: 'load' });
  await page.waitForFunction(() =>
    typeof window.loadChatPersonality === 'function'
      && typeof window.updatePersonalityBar === 'function'
      && typeof window.startNewCustomPersonality === 'function'
  );

  const results = await page.evaluate(async () => {
    const profileId = localStorage.getItem('labcharts-current-profile') || 'default';
    const customKey = `labcharts-${profileId}-chatPersonalityCustom`;
    const personalityKey = `labcharts-${profileId}-chatPersonality`;
    const originalCustom = localStorage.getItem(customKey);
    const originalPersonality = localStorage.getItem(personalityKey);
    const personalities = [
      { id: 'custom_abc', name: 'Longevity Expert', icon: 'L', promptText: 'Expert prompt', evidenceBased: true },
      { id: 'custom_def', name: 'Functional Doc', icon: 'F', promptText: 'Functional prompt', evidenceBased: false },
    ];
    const outcomes = {};

    try {
      localStorage.setItem(customKey, JSON.stringify(personalities));
      localStorage.setItem(personalityKey, 'custom_abc');
      window.loadChatPersonality();
      window.updatePersonalityBar();

      const section = document.getElementById('chat-personality-custom-section');
      const customBtns = section?.querySelectorAll('.chat-personality-opt') || [];
      const addBtn = section?.querySelector('.chat-personality-add-btn');
      const deleteBtns = section?.querySelectorAll('.chat-personality-delete') || [];
      const customArea = section?.querySelector('.chat-personality-custom-area');
      const nameInput = document.getElementById('chat-personality-custom-name');
      const genBtn = document.getElementById('chat-personality-generate-btn');
      const textarea = section?.querySelector('.chat-personality-custom-textarea');
      const saveBtn = section?.querySelector('.chat-personality-custom-save');

      outcomes.customSectionRenders = !!section;
      outcomes.customSectionHasNoInlineHandlers =
        section?.querySelectorAll('[onclick],[oninput]').length === 0;
      outcomes.customButtonsRender = customBtns.length === 2
        && customBtns[0]?.dataset.personality === 'custom_abc'
        && customBtns[0]?.getAttribute('data-chat-action') === 'set-personality'
        && customBtns[1]?.dataset.personality === 'custom_def'
        && customBtns[1]?.getAttribute('data-chat-action') === 'set-personality'
        && customBtns[0]?.classList.contains('active') === true
        && customBtns[1]?.classList.contains('active') === false;
      outcomes.customEditorControlsRender = !!addBtn
        && addBtn.textContent.includes('New Personality')
        && addBtn.getAttribute('data-chat-personality-action') === 'start-new-custom'
        && deleteBtns.length === 2
        && deleteBtns[0]?.getAttribute('data-chat-personality-action') === 'delete-custom'
        && !!customArea
        && nameInput?.type === 'text'
        && nameInput.getAttribute('data-chat-personality-input') === 'mark-dirty'
        && nameInput.placeholder.toLowerCase().includes('longevity')
        && genBtn?.textContent.trim() === 'Generate'
        && genBtn?.getAttribute('data-chat-personality-action') === 'generate-custom'
        && !!textarea
        && textarea.getAttribute('data-chat-personality-input') === 'resize-and-mark-dirty'
        && saveBtn?.getAttribute('data-chat-personality-action') === 'save-custom';
      outcomes.customEditorFieldsPopulate = nameInput?.value === 'Longevity Expert'
        && textarea?.value === 'Expert prompt';

      const bar = document.querySelector('.chat-personality-bar');
      bar?.classList.add('open');
      section?.querySelectorAll('.chat-personality-edit')[1]?.click();
      await Promise.resolve();
      outcomes.editInactiveKeepsPickerOpen = bar?.classList.contains('open') === true;
      outcomes.editInactiveLoadsFields = document.getElementById('chat-personality-custom-name')?.value === 'Functional Doc'
        && document.querySelector('.chat-personality-custom-textarea')?.value === 'Functional prompt';

      const selectors = new Set();
      for (const sheet of Array.from(document.styleSheets)) {
        try {
          for (const rule of sheet.cssRules || []) {
            if (rule.selectorText) selectors.add(rule.selectorText);
          }
        } catch (_) {}
      }
      const hasSelectorContaining = needle => Array.from(selectors).some(selector => selector.includes(needle));
      outcomes.cssSelectorsExist = [
        '.chat-personality-delete',
        '.chat-personality-add-btn',
        '.chat-personality-opt-wrapper',
        '.chat-personality-custom-header',
        '.chat-personality-custom-name-input',
        '.chat-personality-generate-btn',
        '.chat-personality-custom-footer',
        '.chat-personality-custom-save:disabled',
      ].every(hasSelectorContaining);

      window.startNewCustomPersonality();
      const saveBtn2 = document.querySelector('.chat-personality-custom-save');
      window.snapshotPersonalityClean();
      outcomes.saveDisabledAfterSnapshot = saveBtn2?.disabled === true;
      window.markPersonalityDirty();
      outcomes.saveStaysDisabledWhenStateMatchesSnapshot = saveBtn2?.disabled === true;

      const discussBtn = document.getElementById('chat-discuss-btn');
      outcomes.discussButtonDelegated = !!discussBtn
        && discussBtn.style.display === 'none'
        && discussBtn.getAttribute('data-chat-action') === 'start-discussion';
    } finally {
      if (originalCustom == null) localStorage.removeItem(customKey);
      else localStorage.setItem(customKey, originalCustom);
      if (originalPersonality == null) localStorage.removeItem(personalityKey);
      else localStorage.setItem(personalityKey, originalPersonality);
      window.loadChatPersonality?.();
      window.updatePersonalityBar?.();
    }

    return outcomes;
  });

  for (const name of expectedOutcomeKeys) {
    expect(results[name], name).toBe(true);
  }
});

test('custom personality generator fills prompt and preserves selected custom text', async ({ page }) => {
  const expectedOutcomeKeys = [
    'customPersonalityTextReturnsSelectedPrompt',
    'generatorWritesFinalPersona',
    'generatorResetsButtonPlaceholderAndEnablesSave',
  ];

  await page.route('**/chat-personality-generator-coverage', route => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><html><body></body></html>',
  }));
  await page.route('**/js/api.js*', route => route.fulfill({
    contentType: 'application/javascript',
    body: `
      export function hasAIProvider() { return true; }
      export function getAIProvider() { return 'stub'; }
      export function getActiveModelDisplay() { return 'Stub Model'; }
      export function isVeniceE2EEActive() { return false; }
      export function isPpqPrivateModeActive() { return false; }
      export async function callClaudeAPI(opts = {}) {
        opts.onStream?.('draft persona');
        return { text: '\\u{1F9CA}\\n\\nYou are a deliberate cold exposure coach.' };
      }
    `,
  }));
  await page.route('**/js/chat-threads.js*', route => route.fulfill({
    contentType: 'application/javascript',
    body: `
      export function saveChatThreadIndex() {}
      export function renderThreadList() {}
    `,
  }));
  await page.route('**/js/chat-icons.js*', route => route.fulfill({
    contentType: 'application/javascript',
    body: `
      export const CHAT_ICON_EDIT = '<span>Edit</span>';
      export const CHAT_ICON_X = '<span>Delete</span>';
    `,
  }));
  await page.route('**/js/chat-attestation.js*', route => route.fulfill({
    contentType: 'application/javascript',
    body: `
      export function e2eeLockHTML() { return ''; }
    `,
  }));
  await page.route('**/js/constants.js*', route => route.fulfill({
    contentType: 'application/javascript',
    body: `
      export const CHAT_PERSONALITIES = [
        { id: 'default', name: 'Health Intelligence', icon: 'A', promptAddition: null },
      ];
      export const COUNTRY_LATITUDES = {};
      export const LATITUDE_BANDS = {};
      export const COUNTRY_CENTROIDS = {};
    `,
  }));
  await page.route('**/js/utils.js*', route => route.fulfill({
    contentType: 'application/javascript',
    body: `
      export function escapeHTML(value) {
        return String(value ?? '').replace(/[&<>"']/g, ch => ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;',
        })[ch]);
      }
      export const escapeAttr = escapeHTML;
      export function hashString(value) {
        let hash = 0;
        for (const ch of String(value ?? '')) hash = ((hash << 5) - hash + ch.charCodeAt(0)) | 0;
        return String(Math.abs(hash));
      }
      export function formatValue(value) { return String(value ?? ''); }
      export function formatDate(value) { return String(value ?? ''); }
      export function queryRequired(root, selector) { const el = root.querySelector(selector); if (!el) throw new Error(selector); return el; }
      export function safeMarkerId(value) { return String(value ?? '').replace(/[^a-zA-Z0-9_.-]/g, '_'); }
      export function sanitizeMarkerKey(value) { return String(value ?? '').replace(/[^a-zA-Z0-9_.-]/g, ''); }
      export function hasDirtyFormFields() { return false; }
      export function bindDetachedModalSyncRefresh() {}
      export function bindModalSyncRefresh() {}
      export function getStatus() { return 'normal'; }
      export function getRangePosition() { return 0.5; }
      export function getTrend() { return 'flat'; }
      export function showNotification() {}
      export async function showConfirmDialog() { return true; }
      export async function showPromptDialog() { return ''; }
      export async function showChoiceDialog() { return null; }
      export function isPIIReviewEnabled() { return false; }
      export function bindDetailModalSyncRefresh() {}
      export function linearRegression() { return { slope: 0, intercept: 0, r2: 0 }; }
      export function isDebugMode() { return false; }
    `,
  }));

  await page.goto('/chat-personality-generator-coverage', { waitUntil: 'load' });

  const results = await page.evaluate(async ({ personalityUrl }) => {
    const [{ state }, personalities] = await Promise.all([
      import('/js/state.js'),
      import(personalityUrl),
    ]);
    const storage = new Map(Array.from({ length: localStorage.length }, (_, index) => {
      const key = localStorage.key(index);
      return [key, localStorage.getItem(key)];
    }));
    const original = {
      currentProfile: state.currentProfile,
      currentChatPersonality: state.currentChatPersonality,
      body: document.body.innerHTML,
    };
    const outcomes = {};

    try {
      state.currentProfile = 'chat-personality-generator';
      state.currentChatPersonality = 'custom_selected';
      const customKey = `labcharts-${state.currentProfile}-chatPersonalityCustom`;
      localStorage.setItem(customKey, JSON.stringify([
        { id: 'custom_other', name: 'Other', icon: 'O', promptText: 'Other prompt' },
        { id: 'custom_selected', name: 'Selected', icon: 'S', promptText: 'Selected prompt' },
      ]));
      outcomes.customPersonalityTextReturnsSelectedPrompt =
        personalities.getCustomPersonalityText() === 'Selected prompt';

      document.body.innerHTML = `
        <input id="chat-personality-custom-name" value="Cold Exposure Coach">
        <textarea class="chat-personality-custom-textarea"></textarea>
        <button id="chat-personality-generate-btn">Generate</button>
        <button class="chat-personality-custom-save" disabled>Save</button>
      `;
      await personalities.generateCustomPersonality();
      const textarea = document.querySelector('.chat-personality-custom-textarea');
      const generateButton = document.getElementById('chat-personality-generate-btn');
      const saveButton = document.querySelector('.chat-personality-custom-save');
      outcomes.generatorWritesFinalPersona =
        textarea?.value === 'You are a deliberate cold exposure coach.';
      outcomes.generatorResetsButtonPlaceholderAndEnablesSave =
        generateButton?.disabled === false
        && generateButton?.textContent === 'Generate'
        && textarea?.placeholder.includes('Describe how you want the AI')
        && saveButton?.disabled === false;
    } finally {
      state.currentProfile = original.currentProfile;
      state.currentChatPersonality = original.currentChatPersonality;
      document.body.innerHTML = original.body;
      localStorage.clear();
      for (const [key, value] of storage) {
        if (key && value != null) localStorage.setItem(key, value);
      }
    }

    return outcomes;
  }, {
    personalityUrl: moduleUrl('/js/chat-personalities.js'),
  });

  for (const name of expectedOutcomeKeys) {
    expect(results[name], name).toBe(true);
  }
});

test('custom personality save path updates picker, header, and persisted state', async ({ page }) => {
  const expectedOutcomeKeys = [
    'headerTitleCombinesAssistantPersonas',
    'summaryButtonReflectsThreadSummary',
    'summaryButtonClearsWithoutSummary',
    'pickerToggleUpdatesOpenClassAndAria',
    'newCustomEditorEnablesSave',
    'saveNewCustomPersistsSelectsAndUpdatesDisplay',
    'editCustomUpdatesExistingWithoutDuplicate',
    'loadLegacyCustomMigratesToFirstSavedCustom',
    'loadUnknownCustomFallsBackDefault',
    'deleteCustomConfirmsRemovesAndFallsBack',
  ];

  await page.goto('/app', { waitUntil: 'load' });
  await page.waitForFunction(() =>
    typeof window.loadChatPersonality === 'function'
      && typeof window.updatePersonalityBar === 'function'
      && typeof window.saveCustomPersonality === 'function'
      && typeof window.deleteCustomPersonality === 'function'
      && !!window._labState
  );

  const results = await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const storage = new Map(Array.from({ length: localStorage.length }, (_, index) => {
      const key = localStorage.key(index);
      return [key, localStorage.getItem(key)];
    }));
    const original = {
      currentProfile: state.currentProfile,
      chatHistory: state.chatHistory,
      chatThreads: state.chatThreads,
      currentThreadId: state.currentThreadId,
      currentChatPersonality: state.currentChatPersonality,
      renderChatMessages: window.renderChatMessages,
      dateNow: Date.now,
    };
    const outcomes = {};
    const waitFor = async (predicate, timeoutMs = 1000) => {
      const start = performance.now();
      while (performance.now() - start < timeoutMs) {
        if (predicate()) return true;
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      return false;
    };

    try {
      Date.now = () => 1781150000000;
      state.currentProfile = 'chat-personality-coverage';
      state.currentThreadId = 'personality-thread';
      state.currentChatPersonality = 'default';
      state.chatThreads = [{
        id: 'personality-thread',
        name: 'Personality Thread',
        createdAt: '2026-06-11T00:00:00.000Z',
        updatedAt: '2026-06-11T00:00:00.000Z',
        messageCount: 2,
        personality: 'default',
        summary: 'Synthetic summary',
      }];
      state.chatHistory = [
        { role: 'assistant', personalityName: 'Analyst One', personalityIcon: 'A', content: 'First view' },
        { role: 'assistant', personalityName: 'Coach Two', personalityIcon: 'C', content: 'Second view' },
      ];
      window.renderChatMessages = () => {};

      const customKey = `labcharts-${state.currentProfile}-chatPersonalityCustom`;
      const personalityKey = `labcharts-${state.currentProfile}-chatPersonality`;
      localStorage.setItem(customKey, '[]');
      localStorage.setItem(personalityKey, 'default');

      window.updateChatHeaderTitle();
      const summaryBtn = document.querySelector('.chat-summary-btn');
      outcomes.headerTitleCombinesAssistantPersonas =
        document.querySelector('.chat-header-title')?.textContent === 'A Analyst One & C Coach Two';
      outcomes.summaryButtonReflectsThreadSummary =
        summaryBtn?.classList.contains('has-summary') === true
        && summaryBtn?.getAttribute('title') === 'View summary';

      delete state.chatThreads[0].summary;
      window.updateSummaryButton();
      outcomes.summaryButtonClearsWithoutSummary =
        summaryBtn?.classList.contains('has-summary') === false
        && summaryBtn?.getAttribute('title') === 'Summarize this conversation';

      const bar = document.querySelector('.chat-personality-bar');
      const trigger = document.querySelector('.chat-personality-current');
      bar?.classList.remove('open');
      trigger?.setAttribute('aria-expanded', 'false');
      window.togglePersonalityBar();
      const opened = bar?.classList.contains('open') === true
        && trigger?.getAttribute('aria-expanded') === 'true';
      window.togglePersonalityBar();
      outcomes.pickerToggleUpdatesOpenClassAndAria = opened
        && bar?.classList.contains('open') === false
        && trigger?.getAttribute('aria-expanded') === 'false';

      state.chatHistory = [];
      window.updateChatHeaderTitle();
      window.updatePersonalityBar();
      document.querySelector('.chat-personality-add-btn')?.click();
      await waitFor(() => !!document.getElementById('chat-personality-custom-name'));
      const nameInput = document.getElementById('chat-personality-custom-name');
      const textarea = document.querySelector('.chat-personality-custom-textarea');
      nameInput.value = 'Methodical Reviewer';
      nameInput.dispatchEvent(new InputEvent('input', { bubbles: true }));
      textarea.value = 'Prefer careful concise lab review.';
      textarea.dispatchEvent(new InputEvent('input', { bubbles: true }));
      outcomes.newCustomEditorEnablesSave =
        document.querySelector('.chat-personality-custom-save')?.disabled === false;

      document.querySelector('.chat-personality-custom-save')?.click();
      const savedCustoms = JSON.parse(localStorage.getItem(customKey) || '[]');
      const created = savedCustoms.find(personality => personality.name === 'Methodical Reviewer');
      outcomes.saveNewCustomPersistsSelectsAndUpdatesDisplay =
        savedCustoms.length === 1
        && created?.id?.startsWith('custom_') === true
        && created.promptText === 'Prefer careful concise lab review.'
        && state.currentChatPersonality === created.id
        && localStorage.getItem(personalityKey) === created.id
        && document.querySelector('.chat-personality-current-name')?.textContent === 'Methodical Reviewer'
        && document.querySelector('.chat-header-title')?.textContent === 'Methodical Reviewer'
        && document.querySelector('.chat-personality-custom-save')?.disabled === true;

      window.editCustomPersonality(created.id);
      document.getElementById('chat-personality-custom-name').value = 'Updated Reviewer';
      document.querySelector('.chat-personality-custom-textarea').value = 'Updated prompt';
      window.markPersonalityDirty();
      window.saveCustomPersonality();
      const editedCustoms = JSON.parse(localStorage.getItem(customKey) || '[]');
      outcomes.editCustomUpdatesExistingWithoutDuplicate =
        editedCustoms.length === 1
        && editedCustoms[0].id === created.id
        && editedCustoms[0].name === 'Updated Reviewer'
        && editedCustoms[0].promptText === 'Updated prompt'
        && document.querySelector('.chat-personality-current-name')?.textContent === 'Updated Reviewer';

      localStorage.setItem(customKey, JSON.stringify([
        { id: 'custom_migrate', name: 'Migrated Voice', icon: 'M', promptText: 'Migrate prompt' },
      ]));
      localStorage.setItem(personalityKey, 'custom');
      window.loadChatPersonality();
      outcomes.loadLegacyCustomMigratesToFirstSavedCustom =
        state.currentChatPersonality === 'custom_migrate'
        && localStorage.getItem(personalityKey) === 'custom_migrate';

      localStorage.setItem(personalityKey, 'custom_missing');
      window.loadChatPersonality();
      outcomes.loadUnknownCustomFallsBackDefault = state.currentChatPersonality === 'default';

      state.currentChatPersonality = 'custom_migrate';
      localStorage.setItem(personalityKey, 'custom_migrate');
      window.updatePersonalityBar();
      const deleteResultPromise = window.deleteCustomPersonality('custom_migrate')
        .then(() => ({ ok: true }))
        .catch(error => ({ ok: false, error: error?.message || String(error) }));
      const confirmReady = await waitFor(() => !!document.getElementById('confirm-ok'));
      if (confirmReady) {
        const promptText = document.getElementById('confirm-dialog-overlay')?.textContent || '';
        document.getElementById('confirm-ok')?.click();
        const deleteResult = await deleteResultPromise;
        const afterDelete = JSON.parse(localStorage.getItem(customKey) || '[]');
        outcomes.deleteCustomConfirmsRemovesAndFallsBack =
          deleteResult.ok === true
          && promptText.includes('Migrated Voice')
          && afterDelete.length === 0
          && state.currentChatPersonality === 'default'
          && localStorage.getItem(personalityKey) === 'default'
          && document.querySelector('.chat-header-title')?.textContent === 'Health Intelligence';
      } else {
        outcomes.deleteCustomConfirmsRemovesAndFallsBack = false;
      }
    } finally {
      Date.now = original.dateNow;
      state.currentProfile = original.currentProfile;
      state.chatHistory = original.chatHistory;
      state.chatThreads = original.chatThreads;
      state.currentThreadId = original.currentThreadId;
      state.currentChatPersonality = original.currentChatPersonality;
      window.renderChatMessages = original.renderChatMessages;
      document.getElementById('confirm-dialog-overlay')?.remove();
      localStorage.clear();
      for (const [key, value] of storage) {
        if (key && value != null) localStorage.setItem(key, value);
      }
      window.loadChatPersonality?.();
      window.updatePersonalityBar?.();
      window.updateChatHeaderTitle?.();
    }

    return outcomes;
  });

  for (const name of expectedOutcomeKeys) {
    expect(results[name], name).toBe(true);
  }
});
