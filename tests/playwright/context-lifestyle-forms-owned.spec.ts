import { expect, test } from './coverage-fixture.js';
import { createRequire } from 'node:module';
const axeScriptPath = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    for (const key of ['emptyTour', 'tour']) localStorage.setItem(`labcharts-default-${key}`, 'completed');
    localStorage.setItem('labcharts-encryption-nudge-dismissed', 'true');
  });
});
const editors = [
  { key: 'lightCircadian', open: 'openLightCircadianEditor', title: 'Light & Circadian', first: 'light-am' },
  { key: 'environment', open: 'openEnvironmentEditor', title: 'Environment & Exposures', first: 'env-setting' },
  { key: 'diet', open: 'openDietEditor', title: 'Diet & Digestion', first: 'diet-type' },
  { key: 'sleepRest', open: 'openSleepRestEditor', title: 'Sleep & Rest', first: 'sleep-duration' },
  { key: 'exercise', open: 'openExerciseEditor', title: 'Exercise', first: 'exercise-freq' },
  { key: 'stress', open: 'openStressEditor', title: 'Stress', first: 'stress-level' },
  { key: 'loveLife', open: 'openLoveLifeEditor', title: 'Love Life & Relationships', first: 'love-status' },
] as const;
test('authored lifestyle forms preserve every field through committed storage, reopen and confirmed clear', async ({ page }) => {
  test.setTimeout(90000);
  await page.goto('/app', { waitUntil: 'load' });
  await page.evaluate(async () => {
    const [{ state }, profile, data] = await Promise.all([import('/js/state.js'), import('/js/profile.js'), import('/js/data.js')]);
    state.importedData = profile.createDefaultProfileData(); state.profileSex = 'female';
    if (!await data.saveImportedData()) throw new Error('Could not seed form profile');
  });
  const modal = page.locator('#detail-modal');
  for (const editor of editors) {
    await page.evaluate(async name => { const module = await import('/js/context-card-lifestyle-editors.js'); await Reflect.apply(Reflect.get(module, name), module, []); }, editor.open);
    await expect(modal.locator('[data-context-form-view]')).toHaveAttribute('data-context-form-view', editor.key);
    await expect(modal.getByRole('heading', { name: editor.title, exact: true })).toBeVisible();
    expect(await modal.locator('[data-ctx-editor-action], [data-lifestyle-action]').count()).toBe(0);
    for (const disclosure of await modal.locator('details summary').all()) await disclosure.click();
    const groups = await modal.locator('[role="group"][id]').all();
    const answers: Record<string, string | string[]> = {};
    for (const group of groups) {
      const control = group.getByRole('button').first(); await control.click(); await expect(control).toHaveAttribute('aria-pressed', 'true');
      const id = await group.getAttribute('id'), value = await control.getAttribute('data-context-value'); answers[id!] = value!;
    }
    if (editor.key === 'diet') for (const meal of ['breakfast', 'lunch', 'dinner', 'snacks']) {
      await modal.locator(`#diet-${meal}`).fill(`  ${meal} <example> & text  `); await modal.locator(`#diet-${meal}-time`).fill('8:30 PM');
    }
    await modal.getByLabel('Notes', { exact: true }).fill(`  Literal <${editor.key}> & note  `);
    await modal.getByRole('button', { name: 'Save', exact: true }).focus(); await page.keyboard.press('Enter');
    await expect(page.locator('#modal-overlay')).not.toHaveClass(/show/);
    const stored = await page.evaluate(async key => {
      const [{ state }, crypto, profile] = await Promise.all([import('/js/state.js'), import('/js/crypto.js'), import('/js/profile.js')]);
      const data = JSON.parse((await crypto.encryptedGetItem(profile.profileStorageKey(state.currentProfile, 'imported')))!);
      return { value: data[key], history: data.changeHistory.filter((item: { field: string }) => item.field === key) };
    }, editor.key);
    expect(stored.value.note).toBe(`Literal <${editor.key}> & note`); expect(stored.history).toHaveLength(1); expect(stored.history[0].snapshot).toEqual(stored.value);
    await page.evaluate(async name => { const module = await import('/js/context-card-lifestyle-editors.js'); await Reflect.apply(Reflect.get(module, name), module, []); }, editor.open);
    for (const [id, value] of Object.entries(answers)) await expect(modal.locator(`#${id} button[data-context-value=${JSON.stringify(value)}]`)).toHaveAttribute('aria-pressed', 'true');
    if (editor.key === 'diet') for (const meal of ['breakfast', 'lunch', 'dinner', 'snacks']) {
      expect(stored.value[meal]).toBe(`${meal} <example> & text`); expect(stored.value[`${meal}Time`]).toBe('20:30');
      await expect(modal.locator(`#diet-${meal}`)).toHaveValue(`${meal} <example> & text`); await expect(modal.locator(`#diet-${meal}-time`)).toHaveValue('20:30');
    }
    await expect(modal.getByLabel('Notes', { exact: true })).toHaveValue(`Literal <${editor.key}> & note`);
    expect(await modal.locator(`${editor.key}, script`).count()).toBe(0);
    await modal.getByRole('button', { name: 'Clear', exact: true }).click(); await expect(page.locator('#confirm-dialog-overlay')).toHaveClass(/show/);
    await page.locator('#confirm-cancel').click(); await expect(modal.getByLabel('Notes', { exact: true })).toHaveValue(`Literal <${editor.key}> & note`);
    await modal.getByRole('button', { name: 'Clear', exact: true }).click(); await page.locator('#confirm-ok').click();
    await expect(page.locator('#modal-overlay')).not.toHaveClass(/show/);
    expect(await page.evaluate(async key => (await import('/js/state.js')).state.importedData[key], editor.key)).toBeNull();
  }
});
test('authored lifestyle forms keep readable themed layouts and keyboard controls', async ({ page }) => {
  test.setTimeout(90000); await page.addInitScript({ path: axeScriptPath }); await page.goto('/app', { waitUntil: 'load' });
  await page.evaluate(async () => {
    const [{ state }, profile, data, editors] = await Promise.all([import('/js/state.js'), import('/js/profile.js'), import('/js/data.js'), import('/js/context-card-lifestyle-editors.js')]);
    state.importedData = profile.createDefaultProfileData(); state.importedData.exercise = { note: 'Existing exercise' }; await data.saveImportedData(); await editors.openExerciseEditor();
    const themes = document.createElement('link'); themes.rel = 'stylesheet'; themes.href = '/themes-extra.css'; document.head.append(themes);
    await new Promise<void>((resolve, reject) => { themes.onload = () => resolve(); themes.onerror = () => reject(new Error('Themes unavailable')); });
  });
  const modal = page.locator('#detail-modal'); await modal.locator('summary').click(); await modal.locator('#exercise-freq button').first().click();
  for (const theme of ['dark', 'light', 'cyberterm', 'glass', 'neuromancer', 'synth-sunrise']) {
    await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
    for (const width of [320, 1100]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await modal.evaluate(root => root.scrollWidth <= root.clientWidth + 1), `${theme}/${width} overflow`).toBe(true);
      const violations = await modal.evaluate(async root => (await (window as unknown as { axe: typeof import('axe-core') }).axe.run(root, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.map(value => ({ id: value.id, nodes: value.nodes.map(node => ({ target: node.target, summary: node.failureSummary })) })));
      expect(violations, `${theme}/${width} accessibility`).toEqual([]);
    }
  }
  const option = modal.locator('#exercise-freq button').first(); await option.click(); await option.focus(); await page.keyboard.press('Space'); await expect(option).toHaveAttribute('aria-pressed', 'true'); await page.keyboard.press('Space'); await expect(option).toHaveAttribute('aria-pressed', 'false');
  await modal.getByRole('button', { name: 'Cancel', exact: true }).focus(); await page.keyboard.press('Enter'); await expect(page.locator('#modal-overlay')).not.toHaveClass(/show/);
});
test('authored lifestyle controls and confirmations retire on profile switches and modal replacement', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.evaluate(async () => {
    const [{ state }, profile, data, editors] = await Promise.all([import('/js/state.js'), import('/js/profile.js'), import('/js/data.js'), import('/js/context-card-lifestyle-editors.js')]);
    state.importedData = profile.createDefaultProfileData(); state.importedData.exercise = { note: 'Keep original' }; await data.saveImportedData(); await editors.openExerciseEditor();
  });
  await page.locator('#detail-modal').getByRole('button', { name: 'Clear', exact: true }).click();
  await page.evaluate(async () => { const { state } = await import('/js/state.js'); state.currentProfile = 'retired-form-profile'; state.importedData = (await import('/js/profile.js')).createDefaultProfileData(); window.dispatchEvent(new CustomEvent('labcharts-profile-switched')); });
  await page.locator('#confirm-ok').click(); await expect(page.locator('#modal-overlay')).not.toHaveClass(/show/);
  expect(await page.evaluate(async () => (await import('/js/state.js')).state.importedData.exercise)).toBeNull();
  await page.evaluate(async () => {
    const module = await import('/js/context-card-lifestyle-editors.js'); await module.openExerciseEditor();
    const retired = document.querySelector<HTMLButtonElement>('#exercise-freq button')!; await module.openStressEditor(); retired.click(); await module.saveExercise();
  });
  await expect(page.locator('[data-context-form-view]')).toHaveAttribute('data-context-form-view', 'stress');
  await expect(page.locator('#detail-modal [aria-pressed="true"]')).toHaveCount(0);
});

test('authored lifestyle forms retain failed drafts and retry actual IndexedDB writes without false success', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.evaluate(async () => {
    const [{ state }, profile, data, editors] = await Promise.all([import('/js/state.js'), import('/js/profile.js'), import('/js/data.js'), import('/js/context-card-lifestyle-editors.js')]);
    state.importedData = profile.createDefaultProfileData(); state.importedData.exercise = { note: 'Original stored note' };
    if (!await data.saveImportedData()) throw new Error('Could not seed profile');
    await editors.openExerciseEditor();
    const original = IDBObjectStore.prototype.put; let writes = 0;
    IDBObjectStore.prototype.put = function(value, key) {
      if (String(key).endsWith('-imported')) { Reflect.set(window, 'lifestyleWriteAttempts', ++writes); if (writes === 1) throw new DOMException('Simulated storage quota', 'QuotaExceededError'); }
      return original.call(this, value, key);
    };
  });
  const modal = page.locator('#detail-modal'); await modal.getByLabel('Notes', { exact: true }).fill('Retained <draft> & note');
  await modal.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(modal.getByRole('status')).toContainText('Not saved — try again');
  await expect(modal.getByLabel('Notes', { exact: true })).toHaveValue('Retained <draft> & note');
  await expect(page.locator('.notification-toast').filter({ hasText: 'Exercise saved' })).toHaveCount(0);
  const read = () => page.evaluate(async () => {
    const [{ state }, crypto, profile] = await Promise.all([import('/js/state.js'), import('/js/crypto.js'), import('/js/profile.js')]);
    return JSON.parse((await crypto.encryptedGetItem(profile.profileStorageKey(state.currentProfile, 'imported')))!);
  });
  expect((await read()).exercise.note).toBe('Original stored note');
  await modal.getByRole('button', { name: 'Save', exact: true }).click(); await expect(page.locator('#modal-overlay')).not.toHaveClass(/show/);
  const stored = await read(); expect(stored.exercise.note).toBe('Retained <draft> & note');
  expect(stored.changeHistory.filter((item: { field: string }) => item.field === 'exercise')).toEqual([expect.objectContaining({ snapshot: stored.exercise })]);
  expect(await page.evaluate(() => Reflect.get(window, 'lifestyleWriteAttempts'))).toBe(2);
});

test('authored lifestyle Diet preserves nutrition precedence, clock formats and legacy estimates in every theme', async ({ page }) => {
  test.setTimeout(90000); await page.addInitScript({ path: axeScriptPath }); await page.goto('/app', { waitUntil: 'load' });
  await page.evaluate(async () => {
    const [{ state }, profile, data, editors, settings] = await Promise.all([import('/js/state.js'), import('/js/profile.js'), import('/js/data.js'), import('/js/context-card-lifestyle-editors.js'), import('/js/lab-context-settings.js')]);
    localStorage.setItem('labcharts-time-format', '12h');
    state.importedData = profile.createDefaultProfileData(); state.unitSystem = 'US';
    state.importedData.diet = { breakfast: 'Literal <eggs> & toast', breakfastTime: '07:15', lunch: 'salad', lunchTime: '12:30', dinner: 'fish', dinnerTime: '20:00', snacks: 'nuts', snacksTime: '15:00', hydration: 'old estimate', proteinIntake: 'old protein' };
    if (!await data.saveImportedData()) throw new Error('Could not seed Diet');
    state.nutritionSummary = { totalMeals: 2 }; settings.setNutritionContextEnabled(true);
    await editors.openDietEditor();
    const themes = document.createElement('link'); themes.rel = 'stylesheet'; themes.href = '/themes-extra.css'; document.head.append(themes);
    await new Promise<void>((resolve, reject) => { themes.onload = () => resolve(); themes.onerror = () => reject(new Error('Themes unavailable')); });
  });
  const modal = page.locator('#detail-modal');
  for (const disclosure of await modal.locator('details summary').all()) await disclosure.click();
  await expect(modal.locator('#diet-meal-precedence')).toContainText('Detailed meal log has priority');
  await expect(modal.getByRole('button', { name: 'Previous estimate: old protein', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(modal.getByRole('button', { name: 'Previous estimate: old estimate', exact: true })).toHaveAttribute('aria-pressed', 'true');
  for (const meal of ['breakfast', 'lunch', 'dinner', 'snacks']) for (const suffix of ['', '-time']) {
    const input = modal.locator(`#diet-${meal}${suffix}`); await expect(input).toBeDisabled(); await expect(input).toHaveAttribute('aria-describedby', 'diet-meal-precedence');
  }
  await expect(modal.getByLabel('Breakfast time', { exact: true })).toHaveValue('7:15 AM');
  await modal.getByRole('button', { name: '68–101 fl oz/day', exact: true }).click();
  for (const theme of ['dark', 'light', 'cyberterm', 'glass', 'neuromancer', 'synth-sunrise']) {
    await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
    for (const width of [320, 1100]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await modal.evaluate(root => root.scrollWidth <= root.clientWidth + 1), `${theme}/${width} Diet overflow`).toBe(true);
      expect(await modal.evaluate(async root => (await (window as unknown as { axe: typeof import('axe-core') }).axe.run(root, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.map(value => ({ id: value.id, nodes: value.nodes.map(node => ({ target: node.target, summary: node.failureSummary })) }))), `${theme}/${width} Diet accessibility`).toEqual([]);
    }
  }
  await modal.getByLabel('Notes', { exact: true }).fill('Paused examples retained');
  await modal.getByRole('button', { name: 'Save', exact: true }).click(); await expect(page.locator('#modal-overlay')).not.toHaveClass(/show/);
  expect(await page.evaluate(async () => (await import('/js/state.js')).state.importedData.diet)).toMatchObject({ breakfast: 'Literal <eggs> & toast', breakfastTime: '07:15', lunch: 'salad', lunchTime: '12:30', dinner: 'fish', dinnerTime: '20:00', snacks: 'nuts', snacksTime: '15:00', hydration: '2–3 L/day', proteinIntake: 'old protein', note: 'Paused examples retained' });
  await page.evaluate(async () => { (await import('/js/lab-context-settings.js')).setNutritionContextEnabled(false); await (await import('/js/context-card-lifestyle-editors.js')).openDietEditor(); });
  await modal.locator('summary').filter({ hasText: 'Typical meals' }).click();
  await expect(modal.getByLabel('Breakfast', { exact: true })).toBeEnabled(); await expect(modal.getByLabel('Breakfast', { exact: true })).toHaveValue('Literal <eggs> & toast');
  await expect(modal.getByLabel('Breakfast time', { exact: true })).toHaveValue('7:15 AM');
});

test('authored lifestyle shell retires cleanly when the Diet contaminant tool replaces it', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.evaluate(async () => {
    const [{ state }, profile, data, editors] = await Promise.all([import('/js/state.js'), import('/js/profile.js'), import('/js/data.js'), import('/js/context-card-lifestyle-editors.js')]);
    state.importedData = profile.createDefaultProfileData(); state.importedData.diet = { breakfast: 'strawberries and yogurt', lunch: 'canned tuna with avocado', note: 'Keep original' };
    if (!await data.saveImportedData()) throw new Error('Could not seed Diet');
    await editors.openDietEditor();
    Reflect.set(window, 'retiredDietSave', Array.from(document.querySelectorAll<HTMLButtonElement>('#detail-modal button')).find(button => button.textContent === 'Save'));
    await editors.showDietContaminantsModal();
  });
  const modal = page.locator('#detail-modal');
  await expect(modal.getByRole('heading', { name: 'Food Contaminant Signals', exact: true })).toBeVisible();
  await expect(modal).toHaveAttribute('aria-label', 'Food Contaminant Signals');
  await expect(modal).toHaveAttribute('aria-labelledby', 'context-food-contaminants-title');
  await expect(modal).toHaveAttribute('data-context-form-modal', '');
  await expect(modal.locator('[data-context-form-view]')).toHaveAttribute('data-context-form-view', 'foodContaminants');
  await expect(modal).toHaveClass(/gb:context-form:w-/);
  await page.evaluate(async () => { Reflect.get(window, 'retiredDietSave').click(); await (await import('/js/context-card-lifestyle-editors.js')).saveDiet(); });
  await expect(modal.getByRole('heading', { name: 'Food Contaminant Signals', exact: true })).toBeVisible();
  expect(await page.evaluate(async () => { const { state } = await import('/js/state.js'); return { note: typeof state.importedData.diet === 'object' ? state.importedData.diet?.note : '', history: state.importedData.changeHistory }; })).toEqual({ note: 'Keep original', history: [] });
});
