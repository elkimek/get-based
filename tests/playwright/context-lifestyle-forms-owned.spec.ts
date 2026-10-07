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
