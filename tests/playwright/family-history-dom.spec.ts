import { expect, test } from './coverage-fixture.js';
import type { Page } from '@playwright/test';
import { createRequire } from 'node:module';
const axePath = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    for (const key of ['tour', 'emptyTour']) localStorage.setItem(`labcharts-default-${key}`, 'completed');
    localStorage.setItem('labcharts-encryption-nudge-dismissed', 'true'); localStorage.setItem('labcharts-ai-paused', 'true');
  });
});
async function seed(page: Page) {
  await page.evaluate(async () => {
    const [{ state }, profile, data, editor] = await Promise.all([import('/js/state.js'), import('/js/profile.js'), import('/js/data.js'), import('/js/context-card-medical-history-editor.js')]);
    state.importedData = profile.createDefaultProfileData(); state.profileSex = 'male';
    state.importedData.diagnoses = { conditions: [{ name: 'Hypertension', severity: 'mild', since: '2020', status: 'controlled', source: { id: 'legacy-condition' } }], familyHistory: [{ relative: 'paternal_relative', condition: 'Later row', source: 'family-peer' }, { relative: 'mother', condition: 'Type 2 Diabetes', onsetAge: 45, note: 'metformin' }], flags: { futureFlag: true }, note: 'Original <note>', proceduresNote: '', extension: { keep: true } };
    if (!await data.saveImportedData()) throw new Error('Medical seed failed'); await editor.openDiagnosesEditor();
  });
  await expect(page.locator('[data-context-medical-view]')).toBeVisible();
}
async function stored(page: Page) {
  return page.evaluate(async () => { const [{ state }, crypto, profile] = await Promise.all([import('/js/state.js'), import('/js/crypto.js'), import('/js/profile.js')]); return JSON.parse((await crypto.encryptedGetItem(profile.profileStorageKey(state.currentProfile, 'imported')))!); });
}
const open = (page: Page) => page.evaluate(async () => { await (await import('/js/context-card-medical-history-editor.js')).openDiagnosesEditor(); });
test('authored medical history edits literal conditions, sorted relatives, procedures and all flags without losing metadata or drafts', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' }); await seed(page); const modal = page.locator('#detail-modal'); const baseline = await stored(page);
  await modal.locator('#ctx-note-input').fill('  Literal <script> & notes  '); await modal.locator('summary').filter({ hasText: /^Major procedures/ }).click(); await modal.locator('#diagnosis-procedures-input').fill('  Surgery <literal>  ');
  await modal.locator('summary').filter({ hasText: /^Interpretation flags/ }).click(); for (const key of ['lowMuscleMass', 'hormoneTherapy', 'postmenopause', 'intenseTrainingRecent', 'acuteIllnessNearDraw']) await modal.locator(`#diagnosis-flag-${key}`).check();
  await modal.locator('#ctx-family-section > summary').click(); await modal.locator('#fh-note').fill('Family input kept');
  const condition = modal.getByRole('combobox', { name: 'Condition name' }); await condition.fill('PCOS'); await expect(modal.locator('#condition-suggestions')).toBeHidden(); await condition.fill('Alzheimer'); await expect(modal.getByRole('option', { name: "Alzheimer's Disease", exact: true })).toBeVisible();
  await condition.press('ArrowDown'); await condition.press('Enter'); await expect(condition).toHaveValue("Alzheimer's Disease"); await condition.press('Enter');
  await expect(modal.locator('.ctx-condition-item')).toHaveCount(2); await expect(modal.locator('#fh-note')).toHaveValue('Family input kept'); await expect(modal.locator('#ctx-note-input')).toHaveValue('  Literal <script> & notes  '); await expect(modal.locator('#diagnosis-flag-lowMuscleMass')).toBeChecked();
  await condition.fill('Alzheimer'); await expect(modal.getByRole('option', { name: "Alzheimer's Disease", exact: true })).toHaveCount(0);
  await modal.locator('.ctx-condition-item').first().getByRole('button', { name: 'Edit condition', exact: true }).click(); await expect(condition).toHaveValue('Hypertension'); await modal.locator('#condition-severity').getByRole('button', { name: 'High', exact: true }).click(); await modal.locator('#condition-status').getByRole('button', { name: 'resolved', exact: true }).click(); await condition.fill('Psoriasis <literal>'); await modal.locator('#condition-since').fill('2022'); await modal.getByRole('button', { name: 'Update condition', exact: true }).click();
  const relatives = modal.locator('.ctx-family-item'); await expect(relatives.first()).toContainText('Mother'); await expect(relatives.nth(1)).toContainText('Other paternal relative');
  await relatives.nth(1).getByRole('button', { name: 'Edit family history entry', exact: true }).click(); await modal.locator('#fh-relative').selectOption('father'); await modal.locator('#fh-condition').fill('Heart Attack (MI)'); await modal.locator('#fh-age').fill('130'); await modal.locator('#fh-note').fill('stent <note>'); await modal.getByRole('button', { name: 'Update family entry', exact: true }).click();
  await expect(relatives).toHaveCount(2); await expect(relatives.nth(1)).toContainText('Father'); await expect(relatives.nth(1)).toContainText('age 120'); expect(await stored(page)).toEqual(baseline); expect(await modal.locator('script, literal').count()).toBe(0);
  await modal.getByRole('button', { name: 'Save', exact: true }).focus(); await page.keyboard.press('Enter'); await expect(page.locator('#modal-overlay')).not.toHaveClass(/show/);
  const saved = await stored(page); expect(saved.diagnoses.conditions[0]).toEqual({ name: 'Psoriasis <literal>', severity: 'major', status: 'resolved', since: '2022', source: { id: 'legacy-condition' } }); expect(saved.diagnoses.familyHistory[0]).toEqual({ relative: 'father', condition: 'Heart Attack (MI)', onsetAge: 120, note: 'stent <note>', source: 'family-peer' }); expect(saved.diagnoses.familyHistory[1]).toEqual(baseline.diagnoses.familyHistory[1]); expect(saved.diagnoses.note).toBe('Literal <script> & notes'); expect(saved.diagnoses.proceduresNote).toBe('Surgery <literal>'); expect(saved.diagnoses.extension).toEqual({ keep: true }); expect(saved.diagnoses.flags).toEqual({ futureFlag: true, lowMuscleMass: true, hormoneTherapy: true, postmenopause: true, intenseTrainingRecent: true, acuteIllnessNearDraw: true }); expect(saved.changeHistory.filter((entry: { field: string }) => entry.field === 'diagnoses')).toEqual([expect.objectContaining({ snapshot: saved.diagnoses })]);
  await open(page); await modal.locator('.ctx-condition-item').first().getByRole('button', { name: 'Remove condition', exact: true }).click(); await modal.locator('#ctx-family-section > summary').click(); await modal.locator('.ctx-family-item').first().getByRole('button', { name: 'Remove entry', exact: true }).click(); await modal.getByRole('button', { name: 'Save', exact: true }).click(); await expect(page.locator('#modal-overlay')).not.toHaveClass(/show/); const deleted = await stored(page); expect(deleted.diagnoses.conditions).toHaveLength(1); expect(deleted.diagnoses.familyHistory).toEqual([saved.diagnoses.familyHistory[0]]);
});
test('authored medical history cancels edits, dismisses suggestions, and confirms clear without premature writes', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' }); await seed(page); const before = await stored(page), modal = page.locator('#detail-modal');
  await modal.locator('.ctx-condition-item').getByRole('button', { name: 'Edit condition', exact: true }).click(); await modal.locator('#condition-input').fill('Discard condition'); await modal.getByRole('button', { name: 'Cancel condition edit', exact: true }).click(); await expect(modal.locator('#condition-input')).toHaveValue('');
  await modal.locator('#ctx-family-section > summary').click(); await modal.locator('.ctx-family-item').first().getByRole('button', { name: 'Edit family history entry', exact: true }).click(); await modal.locator('#fh-condition').fill('Alzheimer'); await expect(modal.getByRole('option', { name: "Alzheimer's Disease", exact: true })).toBeVisible(); await modal.locator('#fh-condition').press('Escape'); await expect(modal.locator('#fh-condition-suggestions')).toBeHidden(); await expect(page.locator('#modal-overlay')).toHaveClass(/show/); await modal.getByRole('button', { name: 'Cancel family edit', exact: true }).click();
  await modal.locator('#condition-input').fill('Migraine'); await modal.getByRole('heading', { name: 'Medical History', exact: true }).click(); await expect(modal.locator('#condition-suggestions')).toBeHidden(); await modal.locator('#ctx-note-input').fill('Discard notes'); await modal.getByRole('button', { name: 'Cancel', exact: true }).click(); expect(await stored(page)).toEqual(before);
  await open(page); await modal.getByRole('button', { name: 'Clear', exact: true }).click(); await page.locator('#confirm-cancel').click(); expect(await stored(page)).toEqual(before); await expect(modal.locator('#ctx-note-input')).toHaveValue(before.diagnoses.note);
  await modal.getByRole('button', { name: 'Clear', exact: true }).click(); await page.locator('#confirm-ok').click(); await expect(page.locator('#modal-overlay')).not.toHaveClass(/show/); const saved = await stored(page); expect(saved.diagnoses).toBeNull(); expect(saved.changeHistory.at(-1)).toMatchObject({ field: 'diagnoses', snapshot: null });
});
test('authored medical history keeps a failed storage draft for retry', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' }); await seed(page); const before = await stored(page), modal = page.locator('#detail-modal');
  await page.evaluate(() => { const original = IDBObjectStore.prototype.put; let attempts = 0; IDBObjectStore.prototype.put = function(value, key) { if (String(key).endsWith('-imported') && ++attempts === 1) throw new DOMException('Simulated storage failure', 'QuotaExceededError'); return original.call(this, value, key); }; });
  await modal.locator('#ctx-note-input').fill('Retry <notes>'); await modal.getByRole('button', { name: 'Save', exact: true }).click(); await expect(modal.getByRole('status')).toContainText('Not saved — try again'); await expect(modal.locator('#ctx-note-input')).toHaveValue('Retry <notes>'); expect(await stored(page)).toEqual(before);
  await modal.getByRole('button', { name: 'Save', exact: true }).click(); await expect(page.locator('#modal-overlay')).not.toHaveClass(/show/); expect((await stored(page)).diagnoses.note).toBe('Retry <notes>');
});
test('authored medical history retains a draft and refuses to overwrite a peer edit', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' }); await seed(page); const modal = page.locator('#detail-modal'); await modal.locator('#ctx-note-input').fill('Local draft');
  await page.evaluate(async () => { const [{ state }, crypto, profile] = await Promise.all([import('/js/state.js'), import('/js/crypto.js'), import('/js/profile.js')]); const key = profile.profileStorageKey(state.currentProfile, 'imported'), saved = JSON.parse((await crypto.encryptedGetItem(key))!); saved.diagnoses.note = 'Peer note'; await crypto.encryptedSetItem(key, JSON.stringify(saved)); window.dispatchEvent(new CustomEvent('labcharts-sync-applied')); });
  await expect(modal.locator('#ctx-note-input')).toHaveValue('Local draft'); await modal.getByRole('button', { name: 'Save', exact: true }).click(); await expect(modal.getByRole('status')).toContainText('changed elsewhere'); await expect(modal.locator('#ctx-note-input')).toHaveValue('Local draft'); expect((await stored(page)).diagnoses.note).toBe('Peer note');
});
test('authored medical history public helpers affect only current controls and retire with replacement/profile change', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' }); await seed(page); const modal = page.locator('#detail-modal');
  await page.evaluate(async () => { const editor = await import('/js/context-card-medical-history-editor.js'); (document.querySelector('#condition-input') as HTMLInputElement).value = "Alzheimer's Disease"; editor.selectConditionSuggestion("Alzheimer's Disease"); editor.addCondition(); editor.editCondition(1); editor.cancelConditionEdit(); editor.filterFamilyConditionSuggestions(); editor.selectFamilyConditionSuggestion('Breast Cancer'); editor.syncDiagnosesNote(); });
  await expect(modal.locator('.ctx-condition-item')).toHaveCount(2); await expect(modal.locator('#fh-condition')).toHaveValue('Breast Cancer');
  await page.evaluate(async () => { Reflect.set(window, 'retiredMedicalSave', document.querySelector('[data-context-medical-view] footer button')); await (await import('/js/context-card-lifestyle-editors.js')).openSleepRestEditor(); (Reflect.get(window, 'retiredMedicalSave') as HTMLButtonElement).click(); await (await import('/js/context-card-medical-history-editor.js')).saveDiagnoses(); });
  await expect(modal.locator('[data-context-form-view="sleepRest"]')).toBeVisible(); expect((await stored(page)).diagnoses.conditions).toHaveLength(1);
  await open(page); await modal.getByRole('button', { name: 'Clear', exact: true }).click(); await page.evaluate(async () => { const [{ state }, profile] = await Promise.all([import('/js/state.js'), import('/js/profile.js')]); state.currentProfile = 'retired-medical'; state.importedData = profile.createDefaultProfileData(); state.importedData.diagnoses = { note: 'Other' }; window.dispatchEvent(new CustomEvent('labcharts-profile-switched')); }); await page.locator('#confirm-ok').click(); await expect(page.locator('#modal-overlay')).not.toHaveClass(/show/); expect(await page.evaluate(async () => (await import('/js/state.js')).state.importedData.diagnoses)).toEqual({ note: 'Other' });
});
test('authored medical history cold module replies cannot open over a replacement dialog', async ({ page }) => {
  let release!: () => void, requested!: () => void; const held = new Promise<void>(resolve => { release = resolve; }), started = new Promise<void>(resolve => { requested = resolve; });
  await page.route('**/js/context-card-medical-history-editor-impl.js*', async route => { requested(); await held; await route.continue(); }); await page.goto('/app', { waitUntil: 'load' });
  const opening = page.evaluate(async () => { await (await import('/js/context-card-medical-history-editor.js')).openDiagnosesEditor(); }); await started; await page.evaluate(async () => { await (await import('/js/context-card-lifestyle-editors.js')).openStressEditor(); }); release(); await opening; await expect(page.locator('[data-context-form-view="stress"]')).toBeVisible(); await expect(page.locator('[data-context-medical-view]')).toHaveCount(0);
});
test('authored medical history retries a failed stylesheet using the fixed retry URL', async ({ page }) => {
  const requests: string[] = []; await page.route('**/css/context-editor.css*', async route => { requests.push(route.request().url()); if (!route.request().url().includes('lazy-retry=1')) return route.fulfill({ status: 503, body: '', contentType: 'text/css' }); await route.continue(); });
  await page.goto('/app', { waitUntil: 'load' }); await open(page); await expect(page.locator('[data-context-medical-view]')).toHaveCount(0); await expect(page.locator('.notification-toast')).toContainText('could not be loaded'); await open(page); await expect(page.locator('[data-context-medical-view]')).toBeVisible(); expect(requests).toHaveLength(2); expect(requests[1]).toContain('lazy-retry=1');
});
// Dense fine-pointer controls retain their native sizing; touch targets use the coarse-pointer styles.
for (const hasTouch of [false, true]) {
  test.describe(`${hasTouch ? 'coarse' : 'fine'}-pointer medical history controls`, () => {
    test.use({ hasTouch });
    test.beforeEach(async ({ page }) => {
      expect(await page.evaluate(() => ({
        coarse: matchMedia('(pointer: coarse)').matches,
        fine: matchMedia('(pointer: fine)').matches,
        touch: navigator.maxTouchPoints > 0,
      }))).toEqual({ coarse: hasTouch, fine: !hasTouch, touch: hasTouch });
    });

    test('authored medical history themes and narrow layouts retain accessible keyboard controls', async ({ page }) => {
      test.setTimeout(120000); await page.addInitScript({ path: axePath }); await page.goto('/app', { waitUntil: 'load' }); await seed(page); const modal = page.locator('#detail-modal');
      await page.evaluate(async () => { const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = '/themes-extra.css'; document.head.append(link); await new Promise<void>((resolve, reject) => { link.onload = () => resolve(); link.onerror = () => reject(new Error('Themes unavailable')); }); });
      await modal.locator('#ctx-family-section > summary').click(); await modal.locator('summary').filter({ hasText: /^Major procedures/ }).click(); await modal.locator('summary').filter({ hasText: /^Interpretation flags/ }).click();
      await modal.locator('.ctx-family-item').nth(1).getByRole('button', { name: 'Edit family history entry', exact: true }).click();
      await modal.locator('#fh-condition').fill("Alzheimer's Disease with early cognitive symptoms and a very long literal description");
      await modal.locator('#fh-note').fill('Long family note retained in storage and readable through the full field when editing');
      await modal.getByRole('button', { name: 'Update family entry', exact: true }).click();
      for (const theme of ['dark', 'light', 'cyberterm', 'glass', 'neuromancer', 'synth-sunrise']) for (const width of [320, 1100]) {
        await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme); await page.setViewportSize({ width, height: 900 }); expect(await modal.evaluate(root => root.scrollWidth <= root.clientWidth + 1), `${theme}/${width} overflow`).toBe(true);
        expect(await modal.evaluate(async root => (await (window as unknown as { axe: typeof import('axe-core') }).axe.run(root, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.map(violation => ({ id: violation.id, nodes: violation.nodes.map(node => ({ target: node.target, summary: node.failureSummary })) }))), `${theme}/${width} accessibility`).toEqual([]);
        expect(await modal.locator('.ctx-condition-name').first().evaluate(name => name.getBoundingClientRect().height <= parseFloat(getComputedStyle(name).fontSize) * 1.5), `${theme}/${width} condition name stays on one line`).toBe(true);
        const familyCondition = modal.locator('.ctx-family-condition').nth(1);
        await expect(familyCondition).toHaveCSS('white-space', 'nowrap'); await expect(familyCondition).toHaveCSS('text-overflow', 'ellipsis');
        if (width > 600) {
          if (!hasTouch) expect((await modal.locator('.ctx-family-item').nth(1).boundingBox())!.height, `${theme} compact fine-pointer family row`).toBeLessThanOrEqual(56);
          await expect(modal.locator('[title="Other paternal relative"]').first()).toHaveCSS('text-overflow', 'ellipsis');
        }
        if (hasTouch) for (const control of await modal.getByRole('button').all()) expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      }
      await modal.locator('#condition-input').fill('Migraine'); await modal.locator('#condition-input').press('ArrowDown'); await modal.locator('#condition-input').press('Enter'); await expect(modal.locator('#condition-input')).toHaveValue('Migraine'); await modal.locator('#condition-input').press('Enter'); await expect(modal.locator('.ctx-condition-item')).toHaveCount(2);
    });
  });
}
