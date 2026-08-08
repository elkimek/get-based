import { expect, test } from './coverage-fixture.js';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('labcharts-default-emptyTour', 'completed');
    localStorage.setItem('labcharts-default-tour', 'completed');
  });
});

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
    'editInactiveClosesPickerAndKeepsDialog',
    'editInactiveDoesNotActivatePersona',
    'editInactiveLoadsFields',
    'cssSelectorsExist',
    'saveDisabledAfterSnapshot',
    'saveStaysDisabledWhenStateMatchesSnapshot',
    'escapeKeepsDirtyEditorWhenDiscardDeclined',
    'cancelReturnsToPicker',
    'discussButtonDelegated',
  ];

  await page.goto('/app', { waitUntil: 'load' });

  const results = await page.evaluate(async () => {
    const chatPersonalities = await import('/js/chat-personalities.js');
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
    const waitFor = async (predicate, timeoutMs = 1000) => {
      const start = performance.now();
      while (performance.now() - start < timeoutMs) {
        if (predicate()) return true;
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      return false;
    };

    try {
      localStorage.setItem(customKey, JSON.stringify(personalities));
      localStorage.setItem(personalityKey, 'custom_abc');
      chatPersonalities.loadChatPersonality();
      chatPersonalities.updatePersonalityBar();

      const section = document.getElementById('chat-personality-custom-section');
      section?.querySelectorAll('.chat-personality-edit')[0]?.click();
      await Promise.resolve();
      const customBtns = section?.querySelectorAll('.chat-personality-opt') || [];
      const addBtn = section?.querySelector('.chat-personality-add-btn');
      const deleteBtns = section?.querySelectorAll('.chat-personality-delete') || [];
      const nameInput = document.getElementById('chat-personality-custom-name');
      const genBtn = document.getElementById('chat-personality-generate-btn');
      const textarea = document.querySelector('.chat-personality-custom-textarea');
      const saveBtn = document.querySelector('.chat-personality-custom-save');
      const editor = document.querySelector('.chat-personality-editor');

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
        && editor?.getAttribute('role') === 'dialog'
        && editor?.getAttribute('aria-modal') === 'true'
        && document.querySelector('#chat-personality-editor-title') !== null
        && nameInput?.type === 'text'
        && nameInput.getAttribute('data-chat-personality-input') === 'mark-dirty'
        && nameInput.placeholder.toLowerCase().includes('longevity')
        && genBtn?.textContent.trim() === 'Generate draft'
        && genBtn?.getAttribute('data-chat-personality-action') === 'generate-custom'
        && !!textarea
        && textarea.getAttribute('data-chat-personality-input') === 'resize-and-mark-dirty'
        && saveBtn?.getAttribute('data-chat-personality-action') === 'save-custom'
        && saveBtn?.textContent.trim() === 'Save changes'
        && document.querySelector('.chat-personality-custom-cancel')?.getAttribute('data-chat-personality-action') === 'cancel-custom'
        && document.querySelector('.chat-personality-disclaimer')?.textContent.includes('AI-generated interpretations')
        && document.getElementById('chat-personality-agreement-checkbox') === null;
      outcomes.customEditorFieldsPopulate = nameInput?.value === 'Longevity Expert'
        && textarea?.value === 'Expert prompt';

      const bar = document.querySelector('.chat-personality-bar');
      bar?.classList.add('open');
      section?.querySelectorAll('.chat-personality-edit')[1]?.click();
      await Promise.resolve();
      outcomes.editInactiveClosesPickerAndKeepsDialog = bar?.classList.contains('open') === false
        && document.querySelector('.chat-personality-editor')?.getAttribute('role') === 'dialog';
      outcomes.editInactiveDoesNotActivatePersona = chatPersonalities.getActivePersonality().id === 'custom_abc';
      outcomes.editInactiveLoadsFields = document.getElementById('chat-personality-custom-name')?.value === 'Functional Doc'
        && document.querySelector('.chat-personality-custom-textarea')?.value === 'Functional prompt';

      await (await import('/js/chat-panel.js')).loadChatPresentationStylesheets();
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
        '.chat-personality-editor.modal',
        '.chat-personality-editor-body',
        '.chat-personality-custom-header',
        '.chat-personality-custom-name-input',
        '.chat-personality-generate-btn',
        '.chat-personality-custom-footer',
        '.chat-personality-agreement',
        '.chat-personality-custom-save:disabled',
      ].every(hasSelectorContaining);

      chatPersonalities.startNewCustomPersonality();
      const saveBtn2 = document.querySelector('.chat-personality-custom-save');
      chatPersonalities.snapshotPersonalityClean();
      outcomes.saveDisabledAfterSnapshot = saveBtn2?.disabled === true;
      chatPersonalities.markPersonalityDirty();
      outcomes.saveStaysDisabledWhenStateMatchesSnapshot = saveBtn2?.disabled === true;

      const draftName = document.getElementById('chat-personality-custom-name');
      draftName.value = 'Unsaved persona';
      draftName.dispatchEvent(new InputEvent('input', { bubbles: true }));
      document.querySelector('.chat-personality-editor')?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      );
      const discardPromptOpened = await waitFor(() => !!document.getElementById('confirm-cancel'));
      document.getElementById('confirm-cancel')?.click();
      await new Promise(resolve => setTimeout(resolve, 0));
      outcomes.escapeKeepsDirtyEditorWhenDiscardDeclined = discardPromptOpened
        && !!document.getElementById('chat-personality-editor-overlay');

      draftName.value = '';
      draftName.dispatchEvent(new InputEvent('input', { bubbles: true }));
      await chatPersonalities.cancelCustomPersonalityEditor();
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      outcomes.cancelReturnsToPicker = !document.getElementById('chat-personality-editor-overlay')
        && bar?.classList.contains('open') === true
        && document.activeElement === document.querySelector('.chat-personality-add-btn');

      const discussBtn = document.getElementById('chat-discuss-btn');
      outcomes.discussButtonDelegated = !!discussBtn
        && discussBtn.style.display === 'none'
        && discussBtn.getAttribute('data-chat-action') === 'start-discussion';
    } finally {
      await chatPersonalities.cancelCustomPersonalityEditor();
      if (originalCustom == null) localStorage.removeItem(customKey);
      else localStorage.setItem(customKey, originalCustom);
      if (originalPersonality == null) localStorage.removeItem(personalityKey);
      else localStorage.setItem(personalityKey, originalPersonality);
      chatPersonalities.loadChatPersonality();
      chatPersonalities.updatePersonalityBar();
    }

    return outcomes;
  });

  for (const name of expectedOutcomeKeys) {
    expect(results[name], name).toBe(true);
  }
});

test('persona instructions scroll with the mouse wheel inside the editor', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.evaluate(async () => {
    const chatPersonalities = await import('/js/chat-personalities.js');
    chatPersonalities.startNewCustomPersonality();
  });

  const instructions = page.locator('.chat-personality-custom-textarea');
  await expect(instructions).toBeVisible();
  await instructions.fill(Array.from(
    { length: 80 },
    (_, index) => `Persona instruction ${index + 1}: respond with careful, specific reasoning.`,
  ).join('\n'));
  await expect.poll(() => instructions.evaluate(element => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
  }))).toMatchObject({ clientHeight: expect.any(Number), scrollHeight: expect.any(Number) });

  const dimensions = await instructions.evaluate(element => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
  }));
  expect(dimensions.scrollHeight).toBeGreaterThan(dimensions.clientHeight);

  await instructions.hover();
  await page.mouse.wheel(0, 480);
  await expect.poll(() => instructions.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
});

test('mobile persona editor fits the viewport without zoom-sized inputs or clipped actions', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/app', { waitUntil: 'load' });
  const geometry = await page.evaluate(async () => {
    const [panel, chatPersonalities] = await Promise.all([
      import('/js/chat-panel.js'),
      import('/js/chat-personalities.js'),
    ]);
    await panel.openChatPanel();
    chatPersonalities.startNewCustomPersonality({ hostname: 'app.getbased.health' });
    const overlay = /** @type {HTMLElement | null} */ (document.getElementById('chat-personality-editor-overlay'));
    const editor = /** @type {HTMLElement | null} */ (document.querySelector('.chat-personality-editor'));
    const body = /** @type {HTMLElement | null} */ (document.querySelector('.chat-personality-editor-body'));
    const footer = /** @type {HTMLElement | null} */ (document.querySelector('.chat-personality-custom-footer'));
    const close = /** @type {HTMLElement | null} */ (document.querySelector('.chat-personality-editor-close'));
    const save = /** @type {HTMLElement | null} */ (document.querySelector('.chat-personality-custom-save'));
    const name = /** @type {HTMLElement | null} */ (document.querySelector('.chat-personality-custom-name-input'));
    const textarea = /** @type {HTMLElement | null} */ (document.querySelector('.chat-personality-custom-textarea'));
    const rect = element => element?.getBoundingClientRect();
    return {
      overlay: rect(overlay),
      editor: rect(editor),
      footer: rect(footer),
      close: rect(close),
      save: rect(save),
      bodyCanScroll: !!body && body.scrollHeight >= body.clientHeight,
      nameFontSize: name ? getComputedStyle(name).fontSize : '',
      textareaFontSize: textarea ? getComputedStyle(textarea).fontSize : '',
      horizontalOverflow: editor ? editor.scrollWidth - editor.clientWidth : 999,
    };
  });

  expect(geometry.overlay?.left).toBeGreaterThanOrEqual(0);
  expect(geometry.overlay?.right).toBeLessThanOrEqual(390);
  expect(geometry.editor?.top).toBeGreaterThanOrEqual(0);
  expect(geometry.editor?.bottom).toBeLessThanOrEqual(844);
  expect(geometry.footer?.bottom).toBeLessThanOrEqual(844);
  expect(geometry.close?.width).toBeGreaterThanOrEqual(44);
  expect(geometry.close?.height).toBeGreaterThanOrEqual(44);
  expect(geometry.save?.height).toBeGreaterThanOrEqual(44);
  expect(geometry.nameFontSize).toBe('16px');
  expect(geometry.textareaFontSize).toBe('16px');
  expect(geometry.horizontalOverflow).toBeLessThanOrEqual(1);
  expect(geometry.bodyCanScroll).toBe(true);
});

test('hosted persona agreement requires explicit assent and records it per persona', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.evaluate(async () => {
    const [{ state }, chatPersonalities] = await Promise.all([
      import('/js/state.js'),
      import('/js/chat-personalities.js'),
    ]);
    localStorage.removeItem(`labcharts-${state.currentProfile}-chatPersonalityCustom`);
    localStorage.removeItem(`labcharts-${state.currentProfile}-chatPersonaAgreement`);
    chatPersonalities.startNewCustomPersonality({ hostname: 'app.getbased.health' });
  });

  const checkbox = page.locator('#chat-personality-agreement-checkbox');
  const saveButton = page.locator('.chat-personality-custom-save');
  await expect(checkbox).toBeVisible();
  await expect(checkbox).toHaveAttribute('required', '');
  await expect(checkbox).not.toBeChecked();
  await expect(page.locator('.chat-personality-agreement')).toContainText('not the real person or endorsed by them');

  await page.locator('#chat-personality-custom-name').fill('Hosted Persona');
  await page.locator('.chat-personality-custom-textarea').fill('Use a precise and concise communication style.');
  await expect(saveButton).toBeDisabled();

  const blockedSaveCount = await page.evaluate(async () => {
    const chatPersonalities = await import('/js/chat-personalities.js');
    chatPersonalities.saveCustomPersonality();
    return chatPersonalities.getCustomPersonalities().length;
  });
  expect(blockedSaveCount).toBe(0);
  await expect(checkbox).toBeFocused();

  await checkbox.check();
  await expect(saveButton).toBeEnabled();
  await saveButton.click();
  await expect(page.locator('#chat-personality-editor-overlay')).toHaveCount(0);

  const saved = await page.evaluate(async () => {
    const [{ state }, chatPersonalities] = await Promise.all([
      import('/js/state.js'),
      import('/js/chat-personalities.js'),
    ]);
    return {
      personas: chatPersonalities.getCustomPersonalities(),
      legacyAgreement: localStorage.getItem(`labcharts-${state.currentProfile}-chatPersonaAgreement`),
    };
  });
  expect(saved.personas).toHaveLength(1);
  expect(saved.personas[0]).toMatchObject({
    name: 'Hosted Persona',
    personaAgreement: {
      accepted: true,
      version: 1,
      host: 'app.getbased.health',
    },
  });
  expect(saved.personas[0].personaAgreement.acceptedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  expect(saved.personas[0].personaAgreement.statement).toContain('not to use it to impersonate a real person');
  expect(saved.legacyAgreement).toBeNull();

  const beforeReload = await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const storageKey = `labcharts-${state.currentProfile}-chatPersonalityCustom`;
    return {
      profileId: state.currentProfile,
      storageKey,
      raw: localStorage.getItem(storageKey),
      legacyPersonaLock: sessionStorage.getItem('labcharts-chat-persona-local-lock-until'),
    };
  });
  expect(beforeReload.raw).toContain('Hosted Persona');
  expect(beforeReload.legacyPersonaLock).toBeNull();

  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(async () => {
    const { state } = await import('/js/state.js');
    return state.currentProfile !== '';
  });
  const afterReload = await page.evaluate(async () => {
    const [{ state }, chatPersonalities] = await Promise.all([
      import('/js/state.js'),
      import('/js/chat-personalities.js'),
    ]);
    return {
      profileId: state.currentProfile,
      raw: localStorage.getItem(`labcharts-${state.currentProfile}-chatPersonalityCustom`),
      personas: chatPersonalities.getCustomPersonalities(),
    };
  });
  expect(afterReload.profileId).toBe(beforeReload.profileId);
  expect(afterReload.raw).toBe(beforeReload.raw);
  expect(afterReload.personas).toEqual(expect.arrayContaining([
    expect.objectContaining({ name: 'Hosted Persona' }),
  ]));
});

test('custom persona UI keeps instructions usable while data protection stores ciphertext', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  const setup = await page.evaluate(async () => {
    const [{ state }, cryptoModule, chatPersonalities] = await Promise.all([
      import('/js/state.js'),
      import('/js/crypto.js'),
      import('/js/chat-personalities.js'),
    ]);
    const profileId = `persona-encryption-${Date.now()}`;
    const original = {
      profileId: state.currentProfile,
      encryptionEnabled: localStorage.getItem('labcharts-encryption-enabled'),
      wearablesTest: window.__WEARABLES_TEST,
    };
    state.currentProfile = profileId;
    window.__WEARABLES_TEST = true;
    localStorage.setItem('labcharts-encryption-enabled', 'true');
    await cryptoModule._setTestSessionKey('PersonaEncryptionPass1!');
    chatPersonalities.startNewCustomPersonality({ hostname: 'localhost' });
    return { profileId, original };
  });

  try {
    await page.locator('#chat-personality-custom-name').fill('Encrypted Persona');
    await page.locator('.chat-personality-custom-textarea').fill('Use a private, careful communication framework.');
    await page.evaluate(async () => {
      const chatPersonalities = await import('/js/chat-personalities.js');
      await chatPersonalities.saveCustomPersonality();
    });
    await expect(page.locator('#chat-personality-editor-overlay')).toHaveCount(0);
    await expect(page.locator('.chat-personality-opt-wrapper')).toContainText('Encrypted Persona');

    const stored = await page.evaluate(async profileId => {
      const [cryptoModule, chatPersonalities] = await Promise.all([
        import('/js/crypto.js'),
        import('/js/chat-personalities.js'),
      ]);
      const key = `labcharts-${profileId}-chatPersonalityCustom`;
      return {
        raw: localStorage.getItem(key),
        decrypted: await cryptoModule.encryptedGetItem(key),
        visible: chatPersonalities.getCustomPersonalities(),
      };
    }, setup.profileId);
    expect(stored.raw).toMatch(/^v1:/);
    expect(stored.raw).not.toContain('private, careful');
    expect(JSON.parse(stored.decrypted)[0]).toMatchObject({
      name: 'Encrypted Persona',
      promptText: 'Use a private, careful communication framework.',
    });
    expect(stored.visible[0]).toMatchObject({ name: 'Encrypted Persona' });
  } finally {
    await page.evaluate(async ({ profileId, original }) => {
      const [{ state }, cryptoModule] = await Promise.all([
        import('/js/state.js'),
        import('/js/crypto.js'),
      ]);
      localStorage.removeItem(`labcharts-${profileId}-chatPersonalityCustom`);
      localStorage.removeItem(`labcharts-${profileId}-chatPersonality`);
      sessionStorage.removeItem('labcharts-chat-persona-local-lock-until');
      await cryptoModule._setTestSessionKey(null);
      if (original.encryptionEnabled == null) localStorage.removeItem('labcharts-encryption-enabled');
      else localStorage.setItem('labcharts-encryption-enabled', original.encryptionEnabled);
      if (original.wearablesTest === undefined) delete window.__WEARABLES_TEST;
      else window.__WEARABLES_TEST = original.wearablesTest;
      state.currentProfile = original.profileId;
      document.getElementById('chat-personality-editor-overlay')?.remove();
    }, setup);
  }
});

test('cross-device persona apply refreshes the encrypted personality picker UI', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  const setup = await page.evaluate(async () => {
    const [{ state }, cryptoModule, chatLoader, chatApply] = await Promise.all([
      import('/js/state.js'),
      import('/js/crypto.js'),
      import('/js/chat-loader.js'),
      import('/js/sync-chat-apply.js'),
    ]);
    const profileId = `persona-sync-ui-${Date.now()}`;
    const original = {
      profileId: state.currentProfile,
      encryptionEnabled: localStorage.getItem('labcharts-encryption-enabled'),
      wearablesTest: window.__WEARABLES_TEST,
    };
    state.currentProfile = profileId;
    state.chatThreads = [];
    state.chatHistory = [];
    window.__WEARABLES_TEST = true;
    localStorage.setItem('labcharts-encryption-enabled', 'true');
    await cryptoModule._setTestSessionKey('PersonaSyncUiPass1!');
    await chatLoader.loadChatModule();
    const applied = await chatApply.applyChatData(profileId, {
      threads: [],
      activePersonality: 'custom_synced_ui',
      customPersonalities: [{
        id: 'custom_synced_ui',
        name: 'Synced Systems Coach',
        icon: 'S',
        promptText: 'Explain systems clearly and carefully.',
        evidenceBased: false,
      }],
    });
    await chatLoader.refreshChatPersonalitiesIfLoaded();
    return { profileId, original, applied };
  });

  try {
    expect(setup.applied).toBe(true);
    await expect(page.locator('.chat-personality-opt-wrapper')).toContainText('Synced Systems Coach');
    await expect(page.locator('.chat-personality-current-name')).toHaveText('Synced Systems Coach');
    const raw = await page.evaluate(profileId =>
      localStorage.getItem(`labcharts-${profileId}-chatPersonalityCustom`), setup.profileId);
    expect(raw).toMatch(/^v1:/);
  } finally {
    await page.evaluate(async ({ profileId, original }) => {
      const [{ state }, cryptoModule] = await Promise.all([
        import('/js/state.js'),
        import('/js/crypto.js'),
      ]);
      localStorage.removeItem(`labcharts-${profileId}-chatPersonalityCustom`);
      localStorage.removeItem(`labcharts-${profileId}-chatPersonality`);
      localStorage.removeItem(`labcharts-${profileId}-chat-threads`);
      await cryptoModule._setTestSessionKey(null);
      if (original.encryptionEnabled == null) localStorage.removeItem('labcharts-encryption-enabled');
      else localStorage.setItem('labcharts-encryption-enabled', original.encryptionEnabled);
      if (original.wearablesTest === undefined) delete window.__WEARABLES_TEST;
      else window.__WEARABLES_TEST = original.wearablesTest;
      state.currentProfile = original.profileId;
    }, setup);
  }
});

test('custom personality generator fills prompt and preserves selected custom text', async ({ page }) => {
  const expectedOutcomeKeys = [
    'customPersonalityTextReturnsSelectedPrompt',
    'generatorWritesFinalPersona',
    'generatorResetsButtonPlaceholderAndEnablesSave',
    'generatorFailurePreservesExistingDraft',
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
      export function isRoutstrPrivateModeActive() { return false; }
      export async function callClaudeAPI(opts = {}) {
        if (opts.messages?.[0]?.content?.includes('Failure')) throw new Error('Synthetic failure');
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
        { id: 'default', name: 'AI Lab Analyst', icon: 'A', promptAddition: null },
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
        && generateButton?.textContent === 'Generate draft'
        && textarea?.placeholder.includes('Describe how you want the AI')
        && saveButton?.disabled === false;
      textarea.value = 'Keep this carefully written draft.';
      document.getElementById('chat-personality-custom-name').value = 'Failure Persona';
      await personalities.generateCustomPersonality();
      outcomes.generatorFailurePreservesExistingDraft =
        textarea.value === 'Keep this carefully written draft.'
        && generateButton.disabled === false
        && generateButton.textContent === 'Generate draft';
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
    'newPersonalityOpensDialogOnFirstClick',
    'newCustomEditorEnablesSave',
    'saveNewCustomPersistsSelectsAndUpdatesDisplay',
    'editCustomUpdatesExistingWithoutDuplicate',
    'loadLegacyCustomMigratesToFirstSavedCustom',
    'loadUnknownCustomFallsBackDefault',
    'deleteCustomConfirmsRemovesAndFallsBack',
  ];

  await page.goto('/app', { waitUntil: 'load' });
  await page.waitForFunction(async () => {
    const { state } = await import('/js/state.js');
    return !!state;
  });

  const results = await page.evaluate(async () => {
    const [{ state }, chatPersonalities, chatRuntime] = await Promise.all([
      import('/js/state.js'),
      import('/js/chat-personalities.js'),
      import('/js/chat-runtime.js'),
    ]);
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
      dateNow: Date.now,
    };
    const previousChatRuntime = chatRuntime.configureChatRuntimeCallbacks({
      renderChatMessages: () => {},
    });
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
      const customKey = `labcharts-${state.currentProfile}-chatPersonalityCustom`;
      const personalityKey = `labcharts-${state.currentProfile}-chatPersonality`;
      localStorage.setItem(customKey, '[]');
      localStorage.setItem(personalityKey, 'default');

      chatPersonalities.updateChatHeaderTitle();
      const summaryBtn = document.querySelector('.chat-summary-btn');
      outcomes.headerTitleCombinesAssistantPersonas =
        document.querySelector('.chat-header-title')?.textContent === 'A Analyst One + 1 perspective'
        && document.querySelector('.chat-header-title')?.title.includes('C Coach Two');
      outcomes.summaryButtonReflectsThreadSummary =
        summaryBtn?.classList.contains('has-summary') === true
        && summaryBtn?.getAttribute('title') === 'View summary';

      delete state.chatThreads[0].summary;
      chatPersonalities.updateSummaryButton();
      outcomes.summaryButtonClearsWithoutSummary =
        summaryBtn?.classList.contains('has-summary') === false
        && summaryBtn?.getAttribute('title') === 'Summary available after four messages'
        && summaryBtn?.disabled === true;

      const bar = document.querySelector('.chat-personality-bar');
      const trigger = document.querySelector('.chat-personality-current');
      bar?.classList.remove('open');
      trigger?.setAttribute('aria-expanded', 'false');
      chatPersonalities.togglePersonalityBar();
      const opened = bar?.classList.contains('open') === true
        && trigger?.getAttribute('aria-expanded') === 'true';
      chatPersonalities.togglePersonalityBar();
      outcomes.pickerToggleUpdatesOpenClassAndAria = opened
        && bar?.classList.contains('open') === false
        && trigger?.getAttribute('aria-expanded') === 'false';

      state.chatHistory = [];
      chatPersonalities.updateChatHeaderTitle();
      chatPersonalities.updatePersonalityBar();
      document.querySelector('.chat-personality-add-btn')?.click();
      await waitFor(() => !!document.getElementById('chat-personality-custom-name'));
      await waitFor(() => document.activeElement === document.getElementById('chat-personality-custom-name'));
      outcomes.newPersonalityOpensDialogOnFirstClick =
        document.querySelector('.chat-personality-editor')?.getAttribute('role') === 'dialog'
        && bar?.classList.contains('open') === false
        && document.activeElement === document.getElementById('chat-personality-custom-name');
      const nameInput = document.getElementById('chat-personality-custom-name');
      const textarea = document.querySelector('.chat-personality-custom-textarea');
      nameInput.value = 'Methodical Reviewer';
      nameInput.dispatchEvent(new InputEvent('input', { bubbles: true }));
      textarea.value = 'Prefer careful concise lab review.';
      textarea.dispatchEvent(new InputEvent('input', { bubbles: true }));
      outcomes.newCustomEditorEnablesSave =
        document.querySelector('.chat-personality-custom-save')?.disabled === false;

      document.querySelector('.chat-personality-custom-save')?.click();
      await waitFor(() => !document.getElementById('chat-personality-editor-overlay'));
      const savedCustoms = JSON.parse(localStorage.getItem(customKey) || '[]');
      const created = savedCustoms.find(personality => personality.name === 'Methodical Reviewer');
      outcomes.saveNewCustomPersistsSelectsAndUpdatesDisplay =
        savedCustoms.length === 1
        && created?.id?.startsWith('custom_') === true
        && created.promptText === 'Prefer careful concise lab review.'
        && state.currentChatPersonality === 'default'
        && localStorage.getItem(personalityKey) === 'default'
        && document.querySelector('.chat-personality-current-name')?.textContent === 'AI Lab Analyst'
        && localStorage.getItem(`labcharts-${state.currentProfile}-chatPersonaAgreement`) === null
        && bar?.classList.contains('open') === true
        && !document.getElementById('chat-personality-editor-overlay');

      chatPersonalities.editCustomPersonality(created.id);
      document.getElementById('chat-personality-custom-name').value = 'Updated Reviewer';
      document.querySelector('.chat-personality-custom-textarea').value = 'Updated prompt';
      chatPersonalities.markPersonalityDirty();
      await chatPersonalities.saveCustomPersonality();
      const editedCustoms = JSON.parse(localStorage.getItem(customKey) || '[]');
      outcomes.editCustomUpdatesExistingWithoutDuplicate =
        editedCustoms.length === 1
        && editedCustoms[0].id === created.id
        && editedCustoms[0].name === 'Updated Reviewer'
        && editedCustoms[0].promptText === 'Updated prompt'
        && state.currentChatPersonality === 'default'
        && document.querySelector('.chat-personality-current-name')?.textContent === 'AI Lab Analyst';

      localStorage.setItem(customKey, JSON.stringify([
        { id: 'custom_migrate', name: 'Migrated Voice', icon: 'M', promptText: 'Migrate prompt' },
      ]));
      localStorage.setItem(personalityKey, 'custom');
      chatPersonalities.loadChatPersonality();
      outcomes.loadLegacyCustomMigratesToFirstSavedCustom =
        state.currentChatPersonality === 'custom_migrate'
        && localStorage.getItem(personalityKey) === 'custom_migrate';

      localStorage.setItem(personalityKey, 'custom_missing');
      chatPersonalities.loadChatPersonality();
      outcomes.loadUnknownCustomFallsBackDefault = state.currentChatPersonality === 'default';

      state.currentChatPersonality = 'custom_migrate';
      localStorage.setItem(personalityKey, 'custom_migrate');
      chatPersonalities.updatePersonalityBar();
      const deleteResultPromise = chatPersonalities.deleteCustomPersonality('custom_migrate')
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
          && document.querySelector('.chat-header-title')?.textContent === 'AI Lab Analyst';
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
      chatRuntime.configureChatRuntimeCallbacks(previousChatRuntime);
      document.getElementById('chat-personality-editor-overlay')?.remove();
      document.getElementById('confirm-dialog-overlay')?.remove();
      localStorage.clear();
      for (const [key, value] of storage) {
        if (key && value != null) localStorage.setItem(key, value);
      }
      chatPersonalities.loadChatPersonality();
      chatPersonalities.updatePersonalityBar();
      chatPersonalities.updateChatHeaderTitle();
    }

    return outcomes;
  });

  for (const name of expectedOutcomeKeys) {
    expect(results[name], name).toBe(true);
  }
});
