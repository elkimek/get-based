import { expect, test } from './coverage-fixture.js';

test('Context hub opens from Personalize AI alias and dismisses', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  await expect(page.locator('#context-hub-overlay.show')).toHaveCount(0);

  await page.evaluate(async () => {
    const cards = await import('/js/context-cards.js');
    cards.openPersonalizeAIPicker();
  });

  const overlay = page.locator('#context-hub-overlay');
  await expect(overlay).toHaveClass(/show/);
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe('hidden');
  await expect(overlay.locator('.ai-picker-card')).toHaveCount(2);
  await expect(overlay.locator('.context-source-row')).toHaveCount(9);
  await expect(overlay.locator('.context-source-desc')).toHaveCount(9);
  await expect(overlay).toContainText('Health goals, medical history, diet, exercise, sleep, stress, environment, notes, biometrics, and cycle context.');
  await expect(overlay.locator('.context-grounding-panel + .context-source-panel')).toHaveCount(1);
  await expect(overlay).toContainText('Context');
  await expect(overlay).toContainText('Data sources');
  await expect(overlay).toContainText('Included');
  await expect(overlay).toContainText('No data');
  await expect(overlay.locator('.context-summary-metric')).toHaveCount(3);
  await expect(overlay.locator('.context-hub-scroll')).toBeVisible();
  await expect(overlay.locator('.context-hub-actions')).toContainText('Changes save automatically.');
  await expect(overlay.locator('.context-source-section-wide[data-context-section="labs"]')).toHaveCount(1);
  const sourceSectionOrder = await overlay.locator('[data-context-section]').evaluateAll(sections =>
    sections.map(section => section.getAttribute('data-context-section'))
  );
  expect(sourceSectionOrder).toEqual(['profile', 'genome', 'labs', 'light-sun', 'body']);
  await expect(overlay).toContainText('Answer grounding');
  await expect(overlay).toContainText('Personalize how AI answers');
  await expect(overlay).toContainText('Interpretive Lens');
  await expect(overlay.locator('.ai-picker-kicker')).toHaveCount(2);
  await expect(overlay.locator('.ai-picker-icon')).toHaveCount(0);
  await expect(overlay).toContainText('Knowledge Base');
  await expect(overlay).toContainText('Insight Context Cards');
  await expect(overlay).toContainText('Supplements & Medications');
  await expect(overlay).toContainText('Blood marker results');
  await expect(overlay).toContainText('APOE & mtDNA summary');
  await expect(overlay).toContainText('Priority SNP findings');
  await expect(overlay).toContainText('Light & Sun context');
  await expect(overlay).toContainText('Wearable recovery context');
  await expect(overlay).toContainText('Other SNP lookup inventory');
  await expect(overlay).not.toContainText('DNA Data');
  await expect(overlay).not.toContainText('Protect your data');
  await expect(overlay.locator('#context-hub-close')).toBeVisible();

  const toggleNames = await overlay.locator('[data-context-toggle]').evaluateAll(inputs => inputs.map(input => {
    const labelIds = (input.getAttribute('aria-labelledby') || '').split(/\s+/).filter(Boolean);
    return labelIds.map(id => document.getElementById(id)?.textContent?.trim() || '').join(' ').trim();
  }));
  expect(toggleNames).toHaveLength(9);
  expect(toggleNames.every(Boolean)).toBe(true);
  const describedByCounts = await overlay.locator('[data-context-toggle]').evaluateAll(inputs =>
    inputs.map(input => (input.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean).length)
  );
  expect(describedByCounts.every(count => count === 2)).toBe(true);

  await overlay.locator('.ai-picker-card[data-pick="lens"]').click();
  const editorOverlay = page.locator('#modal-overlay');
  await expect(editorOverlay).toHaveClass(/show/);
  await expect(page.locator('#detail-modal .context-back-btn')).toHaveAttribute('aria-label', 'Back to Context');
  await expect(page.locator('#detail-modal .context-back-btn svg')).toBeVisible();
  await page.locator('#detail-modal .context-back-btn').evaluate(el => el.click());
  await expect(editorOverlay).not.toHaveClass(/show/);
  await expect(overlay).toHaveClass(/show/);

  await overlay.locator('.ai-picker-card[data-pick="kb"]').click();
  const kbOverlay = page.locator('#kb-modal-overlay');
  await expect(kbOverlay).toHaveClass(/show/);
  await expect(page.locator('#kb-modal .context-back-btn')).toHaveAttribute('aria-label', 'Back to Context');
  await expect(page.locator('#kb-modal .context-back-btn svg')).toBeVisible();
  await page.locator('#kb-modal .context-back-btn').evaluate(el => el.click());
  await expect(kbOverlay).not.toHaveClass(/show/);
  await expect(overlay).toHaveClass(/show/);

  await expect(overlay.locator('#context-hub-cancel')).toBeVisible();
  await expect(overlay.locator('#context-hub-cancel')).toHaveText('Done');
  await overlay.locator('#context-hub-cancel').click();
  await expect(overlay).not.toHaveClass(/show/);
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe('');
});

test('Context hub data source toggles control prompt and score context', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const cards = await import('/js/context-cards.js');
    const data = await import('/js/data.js');
    const lab = await import('/js/lab-context.js');
    localStorage.setItem('labcharts-active-profile', 'context-source-coverage');
    state.importedData = {
      ...(state.importedData || {}),
      customMarkers: {
        'coverage.contextCrp': {
          categoryLabel: 'Coverage Labs',
          name: 'Context CRP',
          unit: 'mg/L',
          refMin: 0,
          refMax: 3,
        },
        'metabolomixFA.omega3Index': {
          categoryLabel: 'Metabolomix+',
          group: 'Fatty Acids',
          name: 'Omega-3 Index',
          unit: '%',
          refMin: 8,
          refMax: 12,
        },
      },
      entries: [
        { date: '2026-06-01', markers: { 'coverage.contextCrp': 4.2, 'metabolomixFA.omega3Index': 5.4 } },
      ],
      healthGoals: [{ text: 'Resolve context fatigue', severity: 'major' }],
      diagnoses: {
        conditions: [{ name: 'Context asthma', severity: 'mild', since: '2021' }],
        note: 'Context diagnoses note',
        flags: { intenseTrainingRecent: true },
      },
      diet: { type: 'Context diet', breakfast: 'eggs and oats' },
      supplements: [{ name: 'Context magnesium', dosage: '200 mg', type: 'supplement', startDate: '2026-01-01', note: 'Context supplement note' }],
      exercise: { activityLevel: 'high', trainingLoad: 'recent hard training' },
      contextNotes: 'Context notes fixture',
      lightCircadian: { morningLight: 'none' },
      sunSessions: [],
      deviceSessions: [],
      lightMeasurements: [],
      wearableSummary: { metrics: { hrv_rmssd: { rolling: { d7: 22 }, baselineP25: 35 } } },
      genetics: {
        source: 'Context source fixture',
        apoe: 'ε3/ε4',
        snps: {
          rs1801133: { genotype: 'GA', gene: 'MTHFR', variant: 'C677T', category: 'methylation', effect: 'moderate', markers: ['coverage.contextCrp'] },
          rs1800562: { genotype: 'GG', gene: 'HFE', variant: 'C282Y', category: 'iron', effect: 'none' },
        },
      },
    };
    await (await import('/js/health-data-loader.js')).loadDnaModule();
    lab.configureLabContext({
      buildSunContext: () => '[section:sun]\nLight context fixture\n[/section:sun]\n\n',
    });
    lab.setInsightContextCardsEnabled(true);
    lab.setSupplementsMedsContextEnabled(true);
    lab.setLabMarkersContextEnabled(true);
    lab.setGeneticsSummaryInAIContext(true);
    lab.setGeneticsPriorityInAIContext(true);
    lab.setLightSunContextEnabled(true);
    lab.setWearableContextEnabled(true);
    lab.setGeneticsInventoryInAIContext(false);
    data.invalidateActiveDataCache();
    lab.invalidateLabContextCache();
    cards.openContextModal();
  });

  const overlay = page.locator('#context-hub-overlay');
  await expect(overlay).toHaveClass(/show/);
  await expect(overlay).toContainText('Metabolomix+ · Fatty Acids');
  await expect(overlay.locator('.context-source-row[data-context-group="Fatty Acids"] [data-context-toggle="lab-group"]')).toBeChecked();
  await expect(overlay.locator('.context-affect-chip').filter({ hasText: 'Scores' }).first()).toBeVisible();
  await expect(overlay.locator('[data-context-toggle="body-regions"]')).toHaveCount(0);

  const configuredLightRollups = await page.evaluate(async () => {
    const { loadLightSunModules } = await import('/js/light-sun-loader.js');
    await loadLightSunModules();
    const { getBiologyProfileContext } = await import('/js/profile-context.js');
    const { light } = getBiologyProfileContext();
    return { vitD7: light.vitD7, circadian7: light.circadian7 };
  });

  await overlay.locator('.context-source-row[data-context-group="Fatty Acids"] [data-context-toggle="lab-group"]').evaluate(el => {
    const input = /** @type {HTMLInputElement} */ (el);
    input.checked = false;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  const labWithoutFattyAcids = await page.evaluate(async () => {
    const lab = await import('/js/lab-context.js');
    return lab.buildLabContext();
  });

  await overlay.locator('[data-context-toggle="genome-summary"]').evaluate(el => {
    const input = /** @type {HTMLInputElement} */ (el);
    input.checked = false;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await overlay.locator('[data-context-toggle="genome-priority"]').evaluate(el => {
    const input = /** @type {HTMLInputElement} */ (el);
    input.checked = false;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  const labWithoutDna = await page.evaluate(async () => {
    const lab = await import('/js/lab-context.js');
    return lab.buildLabContext();
  });

  await overlay.locator('[data-context-toggle="light-sun"]').evaluate(el => {
    const input = /** @type {HTMLInputElement} */ (el);
    input.checked = false;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await overlay.locator('[data-context-toggle="body-wearables"]').evaluate(el => {
    const input = /** @type {HTMLInputElement} */ (el);
    input.checked = false;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await overlay.locator('[data-context-toggle="genome-lookup"]').evaluate(el => {
    const input = /** @type {HTMLInputElement} */ (el);
    input.checked = true;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await overlay.locator('[data-context-toggle="insight-cards"]').evaluate(el => {
    const input = /** @type {HTMLInputElement} */ (el);
    input.checked = false;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });

  const insightOffSupplementsOn = await page.evaluate(async () => {
    const lab = await import('/js/lab-context.js');
    return lab.buildLabContext();
  });

  await overlay.locator('[data-context-toggle="supplements-meds"]').evaluate(el => {
    const input = /** @type {HTMLInputElement} */ (el);
    input.checked = false;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });

  const result = await page.evaluate(async () => {
    const lab = await import('/js/lab-context.js');
    const { state } = await import('/js/state.js');
    const { getBiologyProfileContext } = await import('/js/profile-context.js');
    const profileContext = getBiologyProfileContext();
    return {
      lightOn: lab.isLightSunContextEnabled(),
      bodyOn: lab.isWearableContextEnabled(),
      insightOn: lab.isInsightContextCardsEnabled(),
      supplementsOn: lab.isSupplementsMedsContextEnabled(),
      labOn: lab.isLabMarkersContextEnabled(),
      genomeSummaryOn: lab.isGeneticsSummaryInAIContext(),
      genomePriorityOn: lab.isGeneticsPriorityInAIContext(),
      genomeLookupOn: lab.isGeneticsInventoryInAIContext(),
      fattyAcidGroupOn: lab.isGroupInAIContext('Fatty Acids'),
      fattyAcidSetting: state.importedData.contextSourceSettings?.['lab-group-Fatty Acids'],
      labContext: lab.buildLabContext(),
      lightIncluded: profileContext.light.includeLight,
      bodyIncluded: profileContext.body.includeBody,
      lowSunlightExposure: profileContext.lowSunlightExposure,
      recentHardTraining: profileContext.recentHardTraining,
    };
  });

  await page.evaluate(() => {
    localStorage.removeItem('labcharts-active-profile');
    localStorage.removeItem('labcharts-ai-ctx-genetics-inventory');
    localStorage.removeItem('labcharts-context-source-coverage-ai-ctx-insight-cards');
    localStorage.removeItem('labcharts-context-source-coverage-ai-ctx-supplements-meds');
    localStorage.removeItem('labcharts-context-source-coverage-ai-ctx-lab-markers');
    localStorage.removeItem('labcharts-context-source-coverage-ai-ctx-genetics-summary');
    localStorage.removeItem('labcharts-context-source-coverage-ai-ctx-genetics-priority');
    localStorage.removeItem('labcharts-context-source-coverage-ai-ctx-genetics-inventory');
    localStorage.removeItem('labcharts-context-source-coverage-ai-ctx-light-sun');
    localStorage.removeItem('labcharts-context-source-coverage-ai-ctx-wearables');
    localStorage.removeItem('labcharts-context-source-coverage-ai-ctx-lab-group-Fatty Acids');
  });

  expect(labWithoutDna).toContain('Context CRP');
  expect(labWithoutDna).toContain('Medical History / Diagnoses');
  expect(labWithoutDna).toContain('Context diet');
  expect(labWithoutDna).toContain('Context magnesium');
  expect(labWithoutDna).not.toContain('GENETICS');
  expect(configuredLightRollups).toEqual({ vitD7: 0, circadian7: null });
  expect(labWithoutFattyAcids).toContain('Context CRP');
  expect(labWithoutFattyAcids).not.toContain('Omega-3 Index');
  expect(insightOffSupplementsOn).not.toContain('Medical History / Diagnoses');
  expect(insightOffSupplementsOn).not.toContain('Context diet');
  expect(insightOffSupplementsOn).not.toContain('Context notes fixture');
  expect(insightOffSupplementsOn).toContain('Context magnesium');
  expect(result.lightOn).toBe(false);
  expect(result.bodyOn).toBe(false);
  expect(result.insightOn).toBe(false);
  expect(result.supplementsOn).toBe(false);
  expect(result.labOn).toBe(true);
  expect(result.fattyAcidGroupOn).toBe(false);
  expect(result.fattyAcidSetting).toBe(false);
  expect(result.genomeSummaryOn).toBe(false);
  expect(result.genomePriorityOn).toBe(false);
  expect(result.genomeLookupOn).toBe(true);
  expect(result.labContext).not.toContain('Light context fixture');
  expect(result.labContext).not.toContain('Medical History / Diagnoses');
  expect(result.labContext).not.toContain('Context diet');
  expect(result.labContext).not.toContain('Context notes fixture');
  expect(result.labContext).not.toContain('Context magnesium');
  expect(result.labContext).toContain('Imported SNP inventory for lookup');
  expect(result.labContext).toContain('HFE C282Y');
  expect(result.labContext).not.toContain('APOE:');
  expect(result.labContext).toContain('MTHFR C677T rs1801133');
  expect(result.lightIncluded).toBe(false);
  expect(result.bodyIncluded).toBe(false);
  expect(result.lowSunlightExposure).toBe(false);
  expect(result.recentHardTraining).toBe(false);
});

test('chat header shows clickable green AI Context status chip', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const { saveLensConfig } = await import('/js/lens.js');
    const { openChatPanel } = await import('/js/chat-panel.js');
    const chat = await import('/js/chat-personalities.js');
    localStorage.removeItem('labcharts-ai-paused');
    localStorage.setItem('labcharts-ai-provider', 'ollama');
    localStorage.removeItem('labcharts-lens-config');
    localStorage.setItem('labcharts-lens-local-count', '24');
    saveLensConfig({ backend: 'in-browser', enabled: true, name: 'Research Notes', topK: 5, multiQuery: true });
    state.importedData.interpretiveLens = 'Functional endocrinology';
    await openChatPanel();
    chat.updateChatHeaderModel();
  });

  const chip = page.locator('.chat-context-status');
  await expect(chip).toBeVisible();
  await expect(chip).toContainText('AI Context: Lens + Research Notes');
  await expect(chip.locator('.chat-context-dot')).toBeVisible();
  await expect(chip).toHaveAttribute('aria-label', /Click to manage Context/);
  await expect(page.locator('#chat-lens-indicator')).toHaveCount(0);

  await chip.evaluate(el => el.click());
  const overlay = page.locator('#context-hub-overlay');
  await expect(overlay).toHaveClass(/show/);
  await expect(overlay).toContainText('Personalize how AI answers');
  await expect(overlay).toContainText('Interpretive Lens is enabled');
});

test('chat AI Context chip carries the last Knowledge Base search error', async ({ page }) => {
  await page.route('https://kb-error.example/**', route => route.fulfill({
    status: 503,
    contentType: 'application/json',
    body: JSON.stringify({ error: 'worker unavailable' }),
  }));
  await page.goto('/app', { waitUntil: 'load' });

  await page.evaluate(async () => {
    const { saveLensConfig, queryLens } = await import('/js/lens.js');
    const { updateKeyCache } = await import('/js/crypto.js');
    const { openChatPanel } = await import('/js/chat-panel.js');
    localStorage.removeItem('labcharts-ai-paused');
    localStorage.setItem('labcharts-ai-provider', 'ollama');
    saveLensConfig({
      backend: 'external-server',
      enabled: true,
      name: 'Research Notes',
      url: 'https://kb-error.example/query',
      topK: 5,
      multiQuery: false,
    });
    updateKeyCache('labcharts-lens-key', 'test-key');
    await openChatPanel();
    await queryLens('vitamin D');
  });

  const chip = page.locator('.chat-context-status');
  await expect(chip).toBeVisible();
  await expect(chip).toContainText('AI Context: Research Notes');
  await expect(chip).toHaveClass(/chat-context-status-error/);
  await expect(chip).toHaveAttribute('aria-label', /could not be searched.*worker unavailable/i);
  await expect(page.locator('#chat-context-live-status')).toContainText(/could not be searched/i);
});

test('chat header shows pending KB state when Knowledge Base is enabled but empty', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const { saveLensConfig } = await import('/js/lens.js');
    const { openChatPanel } = await import('/js/chat-panel.js');
    const chat = await import('/js/chat-personalities.js');
    localStorage.removeItem('labcharts-ai-paused');
    localStorage.setItem('labcharts-ai-provider', 'ollama');
    localStorage.removeItem('labcharts-lens-local-count');
    state.importedData.interpretiveLens = '';
    saveLensConfig({ backend: 'in-browser', enabled: true, name: 'Research Notes', topK: 5, multiQuery: true });
    await openChatPanel();
    chat.updateChatHeaderModel();
  });

  const chip = page.locator('.chat-context-status');
  await expect(chip).toBeVisible();
  await expect(chip).toContainText('AI Context: KB empty');
  await expect(chip).toHaveClass(/chat-context-status-pending/);
  await expect(chip).toHaveAttribute('aria-label', /no library is indexed yet/);

  await chip.evaluate(el => el.click());
  const overlay = page.locator('#context-hub-overlay');
  await expect(overlay).toHaveClass(/show/);
  await expect(overlay).toContainText('Knowledge Base is enabled, but no documents are indexed yet');
  await expect(overlay).toContainText('Add documents');
});

test('clearing Interpretive Lens immediately clears chat header context chip', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const { openChatPanel } = await import('/js/chat-panel.js');
    const chat = await import('/js/chat-personalities.js');
    localStorage.removeItem('labcharts-ai-paused');
    localStorage.setItem('labcharts-ai-provider', 'ollama');
    localStorage.removeItem('labcharts-lens-config');
    localStorage.removeItem('labcharts-lens-local-count');
    state.importedData.interpretiveLens = 'Functional endocrinology';
    await openChatPanel();
    chat.updateChatHeaderModel();
  });

  const chip = page.locator('.chat-context-status');
  await expect(chip).toBeVisible();
  await expect(chip).toContainText('AI Context: Lens');

  await chip.evaluate(el => el.click());
  const contextOverlay = page.locator('#context-hub-overlay');
  await expect(contextOverlay).toHaveClass(/show/);
  await contextOverlay.locator('.ai-picker-card[data-pick="lens"]').click();

  const editorOverlay = page.locator('#modal-overlay');
  await expect(editorOverlay).toHaveClass(/show/);
  await page.locator('[data-lifestyle-action="clear-interpretive-lens"]').evaluate(el => el.click());

  await expect(editorOverlay).not.toHaveClass(/show/);
  await expect(chip).toBeHidden();
  await page.evaluate(() => {
    if (document.querySelector('.chat-context-status:not([hidden])')) throw new Error('Context chip stayed visible after clearing Lens');
  });
});

test('chat header hides AI Context status chip when no AI provider is configured', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const { openChatPanel } = await import('/js/chat-panel.js');
    const chat = await import('/js/chat-personalities.js');
    localStorage.removeItem('labcharts-ai-provider');
    localStorage.removeItem('labcharts-ai-paused');
    localStorage.removeItem('labcharts-lens-config');
    localStorage.removeItem('labcharts-lens-local-count');
    state.importedData.interpretiveLens = 'Functional endocrinology';
    await openChatPanel();
    chat.updateChatHeaderModel();
  });

  await expect(page.locator('.chat-context-status')).toBeHidden();
});
