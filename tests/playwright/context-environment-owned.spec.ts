import { expect, test } from './coverage-fixture.js';
import type { Page } from '@playwright/test';
import { createRequire } from 'node:module';
const axeScriptPath = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    for (const key of ['emptyTour', 'tour']) localStorage.setItem(`labcharts-default-${key}`, 'completed');
    localStorage.setItem('labcharts-encryption-nudge-dismissed', 'true');
  });
});
async function seed(page: Page, assessments = false) {
  await page.evaluate(async hasAssessment => {
    const [{ state }, profile, data, editors] = await Promise.all([import('/js/state.js'), import('/js/profile.js'), import('/js/data.js'), import('/js/context-card-lifestyle-editors.js')]);
    state.importedData = profile.createDefaultProfileData();
    state.importedData.environment = { setting: 'urban', emf: [hasAssessment ? 'Legacy <source> & literal' : 'WiFi router nearby'], emfMitigation: [hasAssessment ? 'Legacy mitigation' : 'WiFi off at night'], note: 'Saved environment' };
    state.importedData.emfAssessment = { assessments: hasAssessment ? [{ id: 'owned-emf', date: '2026-10-07', rooms: [{ sleeping: true, measurements: { acElectric: { value: 50 } } }] }] : [] };
    if (!await data.saveImportedData()) throw new Error('Could not seed Environment');
    await editors.openEnvironmentEditor();
  }, assessments);
}
async function launch(page: Page) {
  await page.locator('#detail-modal summary').filter({ hasText: /^EMF/ }).click();
  await page.locator('[data-context-emf-launcher]').focus(); await page.keyboard.press('Enter');
}
async function stored(page: Page) {
  return page.evaluate(async () => {
    const [{ state }, crypto, profile] = await Promise.all([import('/js/state.js'), import('/js/crypto.js'), import('/js/profile.js')]);
    return JSON.parse((await crypto.encryptedGetItem(profile.profileStorageKey(state.currentProfile, 'imported')))!);
  });
}
test('authored Environment preserves hidden legacy EMF values and readable launcher layouts in every theme', async ({ page }) => {
  test.setTimeout(90000); await page.addInitScript({ path: axeScriptPath }); await page.goto('/app', { waitUntil: 'load' });
  await page.evaluate(async () => {
    const themes = document.createElement('link'); themes.rel = 'stylesheet'; themes.href = '/themes-extra.css'; document.head.append(themes);
    await new Promise<void>((resolve, reject) => { themes.onload = () => resolve(); themes.onerror = () => reject(new Error('Themes unavailable')); });
  });
  const modal = page.locator('#detail-modal');
  for (const hasAssessment of [false, true]) {
    await seed(page, hasAssessment);
    for (const disclosure of await modal.locator('details summary').all()) await disclosure.click();
    await expect(modal.locator('[data-context-emf-launcher]')).toContainText(hasAssessment ? '1 saved' : 'Start EMF assessment');
    await expect(modal.locator('#env-emf')).toHaveCount(hasAssessment ? 0 : 1);
    if (hasAssessment) await expect(modal.locator('[data-context-emf-launcher]')).toContainText('Extreme concern');
    for (const theme of ['dark', 'light', 'cyberterm', 'glass', 'neuromancer', 'synth-sunrise']) {
      await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
      for (const width of [320, 1100]) {
        await page.setViewportSize({ width, height: 900 });
        expect(await modal.evaluate(root => root.scrollWidth <= root.clientWidth + 1), `${theme}/${width}/${hasAssessment} overflow`).toBe(true);
        expect(await modal.evaluate(async root => (await (window as unknown as { axe: typeof import('axe-core') }).axe.run(root, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.map(value => ({ id: value.id, nodes: value.nodes.map(node => ({ target: node.target, summary: node.failureSummary })) }))), `${theme}/${width}/${hasAssessment} accessibility`).toEqual([]);
      }
    }
    await modal.getByLabel('Notes', { exact: true }).fill('Updated <environment> & text');
    await modal.getByRole('button', { name: 'Save', exact: true }).click(); await expect(page.locator('#modal-overlay')).not.toHaveClass(/show/);
    const saved = await stored(page);
    expect(saved.environment).toMatchObject({ emf: [hasAssessment ? 'Legacy <source> & literal' : 'WiFi router nearby'], emfMitigation: [hasAssessment ? 'Legacy mitigation' : 'WiFi off at night'], note: 'Updated <environment> & text' });
    expect(saved.changeHistory.find((item: { field: string }) => item.field === 'environment').snapshot).toEqual(saved.environment);
    if (hasAssessment) {
      await page.evaluate(async () => { await (await import('/js/context-card-lifestyle-editors.js')).openEnvironmentEditor(); });
      await modal.getByRole('button', { name: 'Clear', exact: true }).click(); await page.locator('#confirm-ok').click(); await expect(page.locator('#modal-overlay')).not.toHaveClass(/show/);
      const cleared = await stored(page); expect(cleared.environment).toBeNull(); expect(cleared.emfAssessment).toEqual(saved.emfAssessment);
    }
  }
});
test('authored Environment retains drafts after an EMF stylesheet failure and retries the real assessment workflow', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' }); await seed(page); let attempts = 0;
  await page.route('**/css/emf.css*', route => ++attempts === 1 ? route.abort('failed') : route.continue());
  const modal = page.locator('#detail-modal'); await modal.getByLabel('Notes', { exact: true }).fill('Retained pending draft'); await launch(page);
  await expect(modal.getByRole('status')).toContainText('Could not open EMF assessment'); await expect(modal.getByLabel('Notes', { exact: true })).toHaveValue('Retained pending draft');
  expect((await stored(page)).environment.note).toBe('Saved environment');
  await modal.locator('[data-context-emf-launcher]').click();
  await expect(modal.getByRole('heading', { name: 'Baubiologie EMF Assessment', exact: true })).toBeVisible();
  await expect(modal).toHaveAttribute('aria-label', 'Baubiologie EMF Assessment'); await expect(modal).not.toHaveAttribute('data-context-form-modal', '');
  await modal.locator('[data-emf-action="add-assessment"]').click();
  await modal.locator('[data-emf-action="return-to-origin"]').click();
  await expect(modal.locator('[data-context-form-view]')).toHaveAttribute('data-context-form-view', 'environment');
  await expect(modal.getByLabel('Notes', { exact: true })).toHaveValue('Saved environment'); await expect(modal.locator('#env-emf')).toHaveCount(0);
  await expect.poll(async () => (await stored(page)).emfAssessment.assessments.length).toBe(1);
  expect((await stored(page)).environment).toMatchObject({ emf: ['WiFi router nearby'], emfMitigation: ['WiFi off at night'] }); expect(attempts).toBe(2);
});
for (const retirement of ['profile switch', 'replacement modal']) test(`authored Environment retires a delayed EMF open after ${retirement}`, async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' }); await seed(page);
  let release!: () => void, requested = false; const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/css/emf.css*', async route => { requested = true; await gate; await route.continue(); });
  try {
    await launch(page); await expect.poll(() => requested).toBe(true);
    await page.evaluate(async switchProfile => {
      if (switchProfile) { const { state } = await import('/js/state.js'); state.currentProfile = 'environment-other'; state.importedData = (await import('/js/profile.js')).createDefaultProfileData(); window.dispatchEvent(new CustomEvent('labcharts-profile-switched')); }
      await (await import('/js/context-card-lifestyle-editors.js')).openStressEditor();
    }, retirement === 'profile switch');
    release();
    await page.evaluate(async () => { const runtime = await import('/js/emf-runtime.js'); await Promise.all([runtime.loadEMFModule(), runtime.loadEMFStylesheet()]); });
    await expect(page.locator('[data-context-form-view]')).toHaveAttribute('data-context-form-view', 'stress');
    await expect(page.locator('#detail-modal').getByRole('heading', { name: 'Baubiologie EMF Assessment', exact: true })).toHaveCount(0);
  } finally { release(); }
});
test('authored Environment return callbacks cannot replace newer forms or another profile', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.evaluate(async () => {
    const runtime = await import('/js/emf-runtime.js');
    runtime.configureEMFRuntimeDeps({ loadModule: async () => {
      const module = await import('/js/emf.js');
      return { configureEMFRuntimeDeps: module.configureEMFRuntimeDeps, closeEMFInterpretation: module.closeEMFInterpretation, openEMFAssessmentEditor: (options: import('../../js/emf-runtime.js').EMFEditorOptions = {}) => { Reflect.set(window, 'retiredEnvironmentReturn', options.onReturn); return module.openEMFAssessmentEditor(options); } };
    } });
  });
  for (const switchProfile of [false, true]) {
    await seed(page); await launch(page); await expect(page.locator('#detail-modal').getByRole('heading', { name: 'Baubiologie EMF Assessment', exact: true })).toBeVisible();
    await page.evaluate(async switched => {
      if (switched) { const { state } = await import('/js/state.js'); state.currentProfile = 'environment-return-other'; state.importedData = (await import('/js/profile.js')).createDefaultProfileData(); window.dispatchEvent(new CustomEvent('labcharts-profile-switched')); }
      await (await import('/js/context-card-lifestyle-editors.js')).openStressEditor(); Reflect.get(window, 'retiredEnvironmentReturn')();
    }, switchProfile);
    await expect(page.locator('[data-context-form-view]')).toHaveAttribute('data-context-form-view', 'stress');
  }
});

test('authored Environment delayed return cannot replace a newly mounted modal', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' }); await seed(page); await launch(page);
  await expect(page.locator('#detail-modal').getByRole('heading', { name: 'Baubiologie EMF Assessment', exact: true })).toBeVisible();
  await page.evaluate(async () => {
    const modal = document.getElementById('detail-modal')!;
    modal.querySelector<HTMLButtonElement>('[data-emf-action="return-to-origin"]')!.click();
    const replacement = modal.cloneNode(false) as HTMLElement; replacement.textContent = 'New modal owner'; modal.replaceWith(replacement);
    document.getElementById('modal-overlay')!.classList.add('show');
    // Run after the real return timer; the replacement did not open through the lifestyle facade.
    await new Promise<void>(resolve => setTimeout(resolve, 0));
  });
  await expect(page.locator('#detail-modal')).toHaveText('New modal owner'); await expect(page.locator('[data-context-form-view]')).toHaveCount(0);
});
