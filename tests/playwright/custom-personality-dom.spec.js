import { expect, test } from '@playwright/test';

test('custom personality DOM renders editor controls and delegated discuss action', async ({ page }) => {
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
      outcomes.customButtonsRender = customBtns.length === 2
        && customBtns[0]?.dataset.personality === 'custom_abc'
        && customBtns[1]?.dataset.personality === 'custom_def'
        && customBtns[0]?.classList.contains('active') === true
        && customBtns[1]?.classList.contains('active') === false;
      outcomes.customEditorControlsRender = !!addBtn
        && addBtn.textContent.includes('New Personality')
        && deleteBtns.length === 2
        && !!customArea
        && nameInput?.type === 'text'
        && nameInput.placeholder.toLowerCase().includes('longevity')
        && genBtn?.textContent.trim() === 'Generate'
        && !!textarea
        && !!saveBtn;
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
      const disabledAfterSnapshot = saveBtn2?.disabled === true;
      window.markPersonalityDirty();
      outcomes.cleanSnapshotKeepsSaveDisabled = disabledAfterSnapshot && saveBtn2?.disabled === true;

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

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});
