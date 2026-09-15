import fs from 'node:fs';
import { expect, test } from './coverage-fixture.js';

const catalog = JSON.parse(fs.readFileSync('data/snp-health.json', 'utf8'));

async function prepareReport(page) {
  await page.goto('/app', { waitUntil: 'load' });
  await page.waitForSelector('#notification-container', { state: 'attached' });
  await page.evaluate(async catalog => {
    const { state } = await import('/js/state.js');
    const { invalidateActiveDataCache } = await import('/js/data.js');
    state.currentProfile = 'synthetic-report';
    state.profiles = [{ id: 'synthetic-report', name: 'Synthetic report review', sex: 'female', dob: '1990-01-01' }];
    state.profileSex = 'female';
    state.profileDob = '1990-01-01';
    state.rangeMode = 'reference';
    state.unitSystem = 'EU';
    state.importedData = {
      entries: [{ date: '2026-01-01', markers: { 'biochemistry.glucose': 5.2 } }, { date: '2026-04-02', markers: { 'biochemistry.glucose': 6.2 } }],
      notes: [{ date: '2026-04-03', text: 'Synthetic follow-up note for layout review.' }],
      supplements: [{ name: 'Synthetic supplement', dosage: '100 mg', type: 'supplement', startDate: '2026-02-01' }],
      diagnoses: { conditions: [{ name: 'Synthetic history', note: 'Fixture only' }] },
      diet: { pattern: 'Synthetic dietary context' },
      customMarkers: {},
      nutritionMeals: [{ id: 'meal', localDate: '2026-04-02', name: 'Synthetic meal', nutrients: { energyKcal: 350, proteinG: 20, fluidMl: 250 }, source: { kind: 'manual' } }],
      wearableSummary: { metrics: { weight: { latest: 65, latestDate: '2026-04-02', primarySource: 'manual' } } },
      sunSessions: [{ startedAt: Date.parse('2026-04-02T12:00:00Z'), endedAt: Date.parse('2026-04-02T12:15:00Z'), durationMin: 15, doses: { nir_solar: 10000 }, safety: { erythemalSED: 0.1 } }],
      lightEnvironment: { rooms: [{ name: 'Synthetic bedroom', primarySource: 'led', cct: 2700 }] },
      genetics: {
        source: 'Synthetic catalog fixture', importDate: '2026-04-02', coverage: { found: 60, total: 60 },
        snps: Object.fromEntries(Object.entries(catalog).filter(([id]) => ['rs855791', 'rs11591147', 'rs10741657'].includes(id)).map(([id, entry]) => [id, { genotype: id === 'rs11591147' ? 'GT' : Object.keys(entry.genotypes)[0] }])),
        mtdna: { haplogroup: 'J1c', source: 'Synthetic maternal-lineage fixture', details: 'Lineage context included in the selected report.', matchedMutations: 4, totalDiagnostic: 7 },
      },
    };
    invalidateActiveDataCache();
    const { openReportBuilder } = await import('/js/export-report-builder.js');
    openReportBuilder('full');
  }, catalog);
}

test('cold summary report opens with selected Genome calls and aggregated histories', async ({ page }) => {
  await prepareReport(page);
  await page.locator('[data-report-action="set-preset"][data-report-preset="full"]').click();
  if (process.env.REPORT_BUILDER_SCREENSHOT) await page.screenshot({ path: process.env.REPORT_BUILDER_SCREENSHOT });
  await page.locator('#report-range-mode').selectOption('both');
  await page.locator('#report-genome-mode').selectOption('all');
  await page.locator('#report-purpose').fill('Review the latest results and recorded lifestyle changes.');
  if (process.env.REPORT_OPTIONS_SCREENSHOT) {
    await page.locator('[data-report-for="context"] summary').click();
    await page.locator('[data-report-for="genetics"]').scrollIntoViewIfNeeded();
    await page.screenshot({ path: process.env.REPORT_OPTIONS_SCREENSHOT });
  }
  const popupPromise = page.waitForEvent('popup');
  await page.locator('[data-report-action="export"]').click();
  const popup = await popupPromise;
  await expect(popup.locator('.genetics-table tbody tr')).toHaveCount(3);
  await expect(popup.locator('.genetics-table')).toContainText('informational trait');
  await expect(popup.locator('.genetics-table')).toContainText('protective association');
  await expect(popup.locator('.genetics-table')).toContainText('Strong / replicated');
  await expect(popup.locator('.genome-risk').first()).toHaveCSS('color', 'rgb(185, 28, 28)');
  await expect(popup.locator('.genome-trait').first()).toHaveCSS('color', 'rgb(29, 78, 216)');
  await expect(popup.locator('.genome-protective').first()).toHaveCSS('color', 'rgb(22, 101, 52)');
  await expect(popup.locator('.genetics-table a').first()).toHaveAttribute('href', /^https:\/\/pubmed\.ncbi\.nlm\.nih\.gov\/\d+\/$/);
  await expect(popup.locator('.report-meta')).toContainText('Reference + optimal');
  expect(await page.evaluate(async () => (await import('/js/state.js')).state.rangeMode)).toBe('reference');
  await expect(page.locator('#report-builder-overlay')).toHaveCount(0);
  await expect(popup.locator('.report-history-summary')).toHaveCount(4);
  await expect(popup.locator('body')).toContainText('350 kcal');
  await expect(popup.locator('body')).not.toContainText('Synthetic meal');
  await expect(popup.locator('body')).toContainText('Synthetic bedroom');
  await expect(popup.locator('body')).toContainText('1 days / 1 readings');
  expect(await popup.locator('.genetics-table').evaluate(table => table.scrollWidth <= table.clientWidth + 1)).toBe(true);
  await popup.emulateMedia({ media: 'print' });
  await expect(popup.locator('.report-print-btn')).toBeHidden();
  if (process.env.REPORT_REVIEW_PDF) await popup.pdf({ path: process.env.REPORT_REVIEW_PDF, format: 'A4', printBackground: true });
  await popup.close();
});

test('unchecked sections stay out of the generated report', async ({ page }) => {
  await prepareReport(page);
  await page.locator('[data-report-action="set-preset"][data-report-preset="full"]').click();
  for (const input of await page.locator('input[data-report-section]').all()) {
    if (await input.getAttribute('data-report-section') !== 'nutrition') await input.uncheck();
  }
  const popupPromise = page.waitForEvent('popup');
  await page.locator('[data-report-action="export"]').click();
  const popup = await popupPromise;
  await expect(popup.locator('.report-history-summary')).toHaveCount(1);
  await expect(popup.locator('body')).toContainText('350 kcal');
  await expect(popup.locator('body')).not.toContainText('Synthetic meal');
  await expect(popup.locator('body')).not.toContainText('Synthetic bedroom');
  await expect(popup.locator('body')).not.toContainText('Synced latest reading');
  await expect(popup.locator('.genetics-table')).toHaveCount(0);
  await expect(popup.locator('.report-overview')).toHaveCount(0);
  await expect(popup.locator('.report-meta')).not.toContainText('Weight');
  await popup.close();
});


test('dense recorded histories remain concise and optional appendices retain individual records', async ({ page }) => {
  await prepareReport(page);
  await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    state.importedData.nutritionMeals = [];
    state.importedData.sunSessions = [];
    state.importedData.lightMeasurements = [];
    state.importedData.biometrics = { weight: [] };
    for (let i = 0; i < 90; i++) {
      const date = new Date(Date.UTC(2026, 5, 1 + i, 12));
      const day = date.toISOString().slice(0, 10);
      for (let j = 0; j < 3; j++) state.importedData.nutritionMeals.push({ id: `meal-${i}-${j}`, localDate: day, name: `Individual meal ${i}-${j}`, reviewed: true, nutrients: { energyKcal: 600, proteinG: 30, carbohydrateG: 60, fatG: 25, fiberG: 8, sodiumMg: 500, calciumMg: 200, ironMg: 4, fluidMl: 300 }, source: { kind: 'manual' } });
      state.importedData.biometrics.weight.push({ date: day, value: 65 + i / 90, unit: 'kg' });
      state.importedData.sunSessions.push({ startedAt: date.getTime(), endedAt: date.getTime() + 900000, durationMin: 15, doses: { nir_solar: 10000 } });
      state.importedData.lightMeasurements.push({ id: `meter-${i}`, roomId: 'bedroom', tool: 'lux', value: 100 + i, capturedAt: date.getTime(), extra: { source: 'meter-entry' } });
    }
    const { openReportBuilder } = await import('/js/export-report-builder.js');
    openReportBuilder('full');
  });
  await page.locator('#report-purpose').fill('Synthetic 90-day review: discuss labs, nutrition and light exposure.');
  await page.locator('#report-genome-mode').selectOption('all');
  const summaryPopup = page.waitForEvent('popup');
  await page.locator('[data-report-action="export"]').click();
  const summary = await summaryPopup;
  await expect(summary.locator('.report-history-summary')).toHaveCount(4);
  await expect(summary.locator('#report-nutrition')).toContainText('1800 kcal');
  await expect(summary.locator('#report-nutrition')).toContainText('270 food/drink entries across 90 dated days');
  await expect(summary.locator('#report-light')).toContainText('90 completed / 90 logged days');
  await expect(summary.locator('#report-environment')).toContainText('90 recorded observations');
  await expect(summary.locator('body')).not.toContainText('Individual meal');
  await expect(summary.locator('#report-appendix')).toHaveCount(0);
  if (process.env.REPORT_DENSE_PDF) await summary.pdf({ path: process.env.REPORT_DENSE_PDF, format: 'A4', printBackground: true });
  await summary.close();
  await page.evaluate(async () => (await import('/js/export-report-builder.js')).openReportBuilder('full'));
  await page.locator('[name="report-detail"][value="appendix"]').check();
  const appendixPopup = page.waitForEvent('popup');
  await page.locator('[data-report-action="export"]').click();
  const appendix = await appendixPopup;
  await expect(appendix.locator('#report-appendix')).toContainText('Individual meal 89-2');
  await expect(appendix.locator('#report-appendix')).toContainText('Individual meal 0-0');
  await expect(appendix.locator('#report-appendix')).not.toContainText('Genetics');
  await appendix.close();
});


test('summary and appendix controls remain usable at phone width', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await prepareReport(page);
  await page.locator('[name="report-detail"][value="appendix"]').check();
  await page.locator('[data-report-section="light"]').uncheck();
  await expect(page.locator('[data-report-section="light"]')).not.toBeChecked();
  await page.locator('#report-purpose').fill('Discuss recorded intake.');
  await page.locator('[data-report-for="context"] summary').click();
  const context = page.locator('[data-report-context]').first();
  await context.uncheck();
  await expect(context).not.toBeChecked();
  await page.locator('[name="report-detail"][value="appendix"]').scrollIntoViewIfNeeded();
  if (process.env.REPORT_MOBILE_SCREENSHOT) await page.screenshot({ path: process.env.REPORT_MOBILE_SCREENSHOT });
  expect(await page.locator('.report-builder-modal').evaluate(modal => modal.getBoundingClientRect().width <= 390)).toBe(true);
});

test('report notes can be reviewed and a selected note deleted through its editor', async ({ page }) => {
  await prepareReport(page);
  await page.locator('[data-report-for="notes"] summary').click();
  await expect(page.locator('.report-note-review')).toContainText('Synthetic follow-up note for layout review.');
  await page.getByRole('button', { name: 'Edit or delete', exact: true }).click();
  await expect(page.locator('#note-textarea')).toHaveValue('Synthetic follow-up note for layout review.');
  await expect(page.locator('#report-builder-overlay')).toHaveCount(0);
  await page.locator('[data-note-action="delete"]').click();
  await page.locator('#confirm-ok').click();
  await expect.poll(() => page.evaluate(async () => (await import('/js/state.js')).state.importedData.notes.length)).toBe(0);
  expect(await page.evaluate(async () => (await import('/js/state.js')).state.importedData._deleted.notes.length)).toBe(1);
  await page.evaluate(async () => (await import('/js/export-report-builder.js')).openReportBuilder('full'));
  await expect(page.locator('[data-report-for="notes"] summary')).toContainText('0 stored');
});

test('environment spot checks print readable labels without missing-baseline placeholders', async ({ page }) => {
  await prepareReport(page);
  await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    state.importedData.lightMeasurements = [
      { id: 'one', roomId: 'room_opaque_secret_95CL', tool: 'lux', value: 120, capturedAt: '2026-04-01', extra: { source: 'meter-entry' } },
      { id: 'two', tool: 'darkness', value: 20, capturedAt: '2026-04-02', extra: { method: 'camera', cameraLevel: 20 } },
    ];
  });
  for (const input of await page.locator('input[data-report-section]').all()) {
    if (await input.getAttribute('data-report-section') !== 'environment') await input.uncheck();
  }
  const popupPromise = page.waitForEvent('popup');
  await page.locator('[data-report-action="export"]').click();
  const popup = await popupPromise;
  await expect(popup.locator('.report-history-summary')).toContainText('Unlinked location 1 · Light level');
  await expect(popup.locator('.report-history-summary')).toContainText('120 photopic lux');
  await expect(popup.locator('.report-history-summary')).toContainText('20%; not lux and not a hormone estimate');
  await expect(popup.locator('body')).not.toContainText('Synthetic bedroom · Sleep-light check');
  await expect(popup.locator('body')).not.toContainText('room_opaque_secret');
  await expect(popup.locator('body')).not.toContainText('Room not recorded');
  await expect(popup.locator('body')).not.toContainText('No earlier comparable record');
  if (process.env.ENVIRONMENT_REVIEW_PDF) await popup.pdf({ path: process.env.ENVIRONMENT_REVIEW_PDF, format: 'A4', printBackground: true });
  await popup.close();
});

 test('Genome defaults to risk associations and changes to traits without selecting individual SNPs', async ({ page }) => {
  await prepareReport(page);
  await expect(page.locator('#report-genome-mode')).toHaveValue('risks');
  for (const input of await page.locator('input[data-report-section]').all()) {
    if (await input.getAttribute('data-report-section') !== 'genetics') await input.uncheck();
  }
  const riskPopup = page.waitForEvent('popup');
  await page.locator('[data-report-action="export"]').click();
  const risks = await riskPopup;
  await expect(risks.locator('.genetics-table tbody tr')).toHaveCount(1);
  await expect(risks.locator('.genetics-table')).toContainText('risk association');
  await expect(risks.locator('.genetics-table')).not.toContainText('informational trait');
  await risks.close();
  await page.evaluate(async () => (await import('/js/export-report-builder.js')).openReportBuilder('full'));
  await page.locator('#report-genome-mode').selectOption('traits');
  await page.locator('[name="report-detail"][value="appendix"]').check();
  const traitPopup = page.waitForEvent('popup');
  await page.locator('[data-report-action="export"]').click();
  const traits = await traitPopup;
  await expect(traits.locator('.genetics-table tbody tr')).toHaveCount(1);
  await expect(traits.locator('.genetics-table')).toContainText('informational trait');
  await expect(traits.locator('#report-appendix .genetics-table')).toHaveCount(0);
  await traits.close();
});

async function stubReportAI(page, fail = false, delayed = false, provider = 'ollama') {
  await page.route('**/js/ai-feature-routing.js', async route => {
    const response = await route.fetch();
    const wait = delayed ? "await new Promise(resolve => document.addEventListener('synthetic-report-finish', resolve, { once: true }));" : "await new Promise(resolve => setTimeout(resolve, 100));";
    const result = fail ? "throw new Error('Synthetic unavailable provider');" : "return { text: 'Patient picture:\\nSynthetic AI overview for review.\\nDiscussion focus:\\n- Discuss the recorded questions.' };";
    const stub = `document.documentElement.dataset.reportTestCalls = String(Number(document.documentElement.dataset.reportTestCalls || 0) + 1); document.documentElement.dataset.reportTestPrompt = options.messages[0].content; ${wait} ${result}`;
    const source = (await response.text())
      .replace('export function hasAssistantFeatureProvider() {', 'export function hasAssistantFeatureProvider() { return true;')
      .replace('export function getAssistantFeatureIdentity() {', `export function getAssistantFeatureIdentity() { return { provider: '${provider}', modelId: 'fixture', modelDisplay: 'Synthetic provider' };`)
      .replace('export async function callAssistantFeatureAI(options, provider) {', `export async function callAssistantFeatureAI(options, provider) { ${stub}`);
    await route.fulfill({ response, body: source });
  });
}

test('background sync during delayed AI keeps the preview and overview on the same captured facts with progress', async ({ page }) => {
  await stubReportAI(page, false, true);
  await prepareReport(page);
  const popupPromise = page.waitForEvent('popup');
  await page.locator('[data-report-action="export"]').click();
  const popup = await popupPromise;
  await expect(popup.locator('.report-progress-head')).toContainText('AI is generating your overview');
  await expect(page.locator('.report-generation-progress')).toBeVisible();
  await expect(popup.getByRole('progressbar')).toBeVisible();
  await expect(popup.locator('.report-progress-time')).not.toHaveText('0s elapsed');
  if (process.env.REPORT_PROGRESS_SCREENSHOT) {
    await popup.screenshot({ path: process.env.REPORT_PROGRESS_SCREENSHOT });
    await page.screenshot({ path: process.env.REPORT_PROGRESS_SCREENSHOT.replace('.png', '-modal.png') });
  }
  await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const { refreshActiveProfileAfterPull } = await import('/js/sync-pull-active-refresh.js');
    refreshActiveProfileAfterPull({ profileId: state.currentProfile, merged: structuredClone(state.importedData), localDataChanged: false });
    // A later same-profile update must not leak into a report already sent to AI.
    state.importedData.nutritionMeals[0].nutrients.energyKcal = 999;
    state.importedData.wearableSummary.metrics.weight.latest = 99;
    state.importedData.notes[0].text = 'New note after report started';
    document.dispatchEvent(new Event('synthetic-report-finish'));
  });
  await expect(popup.locator('.report-ai-summary')).toContainText('Synthetic AI overview');
  await expect(popup.locator('body')).toContainText('350 kcal');
  await expect(popup.locator('body')).not.toContainText('999 kcal');
  await expect(popup.locator('body')).not.toContainText('99 kg');
  await expect(popup.locator('body')).not.toContainText('New note after report started');
  await expect(popup.locator('.report-generation-progress')).toHaveCount(0);
  await expect(page.locator('#report-builder-overlay')).toHaveCount(0);
  await expect(page.locator('html')).toHaveAttribute('data-report-test-calls', '1');
  expect(await page.locator('html').getAttribute('data-report-test-prompt')).toContain('350');
  await popup.close();
});

test('connected provider defaults to generate and preview with an editable AI overview', async ({ page }) => {
  await stubReportAI(page);
  await prepareReport(page);
  await expect(page.locator('#report-include-ai')).toBeChecked();
  await expect(page.locator('[data-report-action="export"]')).toHaveText('Generate AI overview & preview');
  expect(await page.locator('html').getAttribute('data-report-test-calls')).toBeNull();
  const popupPromise = page.waitForEvent('popup');
  await page.locator('[data-report-action="export"]').click();
  const popup = await popupPromise;
  const overview = popup.getByRole('textbox', { name: 'Edit AI-generated overview' });
  await expect(overview).toContainText('Synthetic AI overview');
  await expect(popup.locator('.report-header .report-origin-notice')).toBeVisible();
  await expect(popup.locator('.report-header .report-origin-notice')).toContainText('AI-assisted report');
  await expect(page.locator('html')).toHaveAttribute('data-report-test-calls', '1');
  await overview.fill('Reviewed wording for this consultation.');
  await expect(overview).toHaveText('Reviewed wording for this consultation.');
  await popup.emulateMedia({ media: 'print' });
  await expect(popup.locator('.report-ai-edit-hint')).toBeHidden();
  await expect(overview).toHaveCSS('outline-style', 'none');
  await expect(overview).toHaveText('Reviewed wording for this consultation.');
  await expect(popup.locator('.report-origin-notice')).toBeVisible();
  await expect(popup.locator('.report-ai-summary h2')).toHaveText('AI-generated overview');
  if (process.env.REPORT_AI_DISCLOSURE_PDF) await popup.pdf({ path: process.env.REPORT_AI_DISCLOSURE_PDF, format: 'A4' });
  await popup.close();
});

test('failed default overview allows preview without AI and retains the questions', async ({ page }) => {
  await stubReportAI(page, true);
  await prepareReport(page);
  await page.locator('#report-purpose').fill('My recorded consultation questions.');
  const waitingPopup = page.waitForEvent('popup');
  await page.locator('[data-report-action="export"]').click();
  const waiting = await waitingPopup;
  await expect(page.locator('[data-report-action="preview-without-ai"]')).toBeVisible();
  await expect.poll(() => waiting.isClosed()).toBe(true);
  const reportPopup = page.waitForEvent('popup');
  await page.locator('[data-report-action="preview-without-ai"]').click();
  const report = await reportPopup;
  await expect(report.locator('.report-purpose')).toContainText('My recorded consultation questions.');
  await expect(report.locator('.report-ai-summary')).toHaveCount(0);
  await expect(report.locator('.report-origin-notice')).toHaveCount(0);
  await expect(report.locator('.report-origin-note')).toContainText('No new AI overview');
  await expect(page.locator('html')).toHaveAttribute('data-report-test-calls', '1');
  await report.close();
});

test('templates produce distinct reports and clinician keeps normal tumor, bone and urine groups', async ({ page }) => {
  await prepareReport(page);
  await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const { invalidateActiveDataCache } = await import('/js/data.js');
    for (const [category, label, name] of [
      ['syntheticTumor', 'Tumor markers', 'Normal tumor fixture'],
      ['syntheticBone', 'Bone metabolism', 'Normal bone fixture'],
      ['syntheticUrine', 'Urinalysis', 'Normal urine fixture'],
    ]) {
      const id = `${category}.check`;
      state.importedData.customMarkers[id] = { name, categoryLabel: label, unit: 'u', refMin: 1, refMax: 10 };
      for (const entry of state.importedData.entries) entry.markers[id] = 2;
    }
    invalidateActiveDataCache();
  });
  for (const preset of ['clinician', 'lifestyle', 'personal', 'full']) {
    await page.evaluate(async preset => (await import('/js/export-report-builder.js')).openReportBuilder(preset), preset);
    await expect(page.locator('[data-report-template-customized]')).toBeHidden();
    if (preset === 'personal') await expect(page.getByRole('button', { name: /Lab results only/ })).toHaveAttribute('aria-pressed', 'true');
    const popupPromise = page.waitForEvent('popup');
    await page.locator('[data-report-action="export"]').click();
    const report = await popupPromise;
    if (preset === 'lifestyle') {
      await expect(report.locator('.report-lab-summary')).toHaveCount(0);
      await expect(report.locator('#report-nutrition')).toHaveCount(1);
      await expect(report.locator('#report-genetics')).toHaveCount(0);
      await expect(report.locator('#report-notes')).toHaveCount(0);
    } else {
      for (const name of ['Normal tumor fixture', 'Normal bone fixture', 'Normal urine fixture']) await expect(report.locator('.report-lab-summary')).toContainText(name);
    }
    if (preset === 'personal') {
      for (const id of ['context', 'therapy', 'genetics', 'nutrition', 'wearables', 'light', 'environment', 'notes']) await expect(report.locator(`#report-${id}`)).toHaveCount(0);
    }
    if (preset === 'clinician') {
      await expect(report.locator('#report-genetics')).toHaveCount(1);
      await expect(report.locator('#report-therapy')).toHaveCount(1);
      await expect(report.locator('#report-nutrition')).toHaveCount(0);
    }
    if (preset === 'full') {
      for (const id of ['genetics', 'nutrition', 'wearables', 'light', 'environment', 'notes']) await expect(report.locator(`#report-${id}`)).toHaveCount(1);
    }
    await report.close();
  }
});

for (const decision of ['decline', 'approve', 'change-selection']) {
  test(`report AI waits for destination approval: ${decision}`, async ({ page }) => {
    await stubReportAI(page, false, false, 'openrouter');
    await prepareReport(page);
    await page.evaluate(async () => {
      const consent = await import('/js/cloud-ai-consent.js');
      consent.withdrawAITransparencyAcknowledgement();
      consent.withdrawCloudAIConsent();
    });
    const waiting = page.waitForEvent('popup');
    await page.locator('[data-report-action="export"]').click();
    const popup = await waiting;
    const consent = page.locator('#cloud-ai-consent-overlay');
    await expect(consent).toBeVisible();
    await expect(popup.locator('.report-progress-head')).toContainText('Waiting for AI approval');
    expect(await page.locator('html').getAttribute('data-report-test-calls')).toBeNull();
    await expect(consent).toContainText('OpenRouter');
    await expect(consent.locator('a', { hasText: 'Privacy' }).first()).toHaveAttribute('href', 'https://openrouter.ai/privacy');
    await expect(consent.locator('[data-ai-processing-action="approve"]')).toBeDisabled();
    if (decision === 'decline') {
      await consent.locator('[data-ai-processing-action="cancel"]').click();
      await expect(page.locator('[data-report-ai-status]')).toContainText('No report data was sent');
    } else {
      if (decision === 'change-selection') await page.evaluate(() => {
        document.querySelector('#report-include-ai').click();
      });
      await consent.locator('input[type="checkbox"]').check();
      await consent.locator('[data-ai-processing-action="approve"]').click();
    }
    if (decision === 'approve') {
      await expect(popup.locator('.report-origin-notice')).toContainText('AI-generated overview');
      await expect(page.locator('html')).toHaveAttribute('data-report-test-calls', '1');
      await popup.close();
      // Existing approval is reused, rather than asking for every report.
      await page.evaluate(async () => (await import('/js/export-report-builder.js')).openReportBuilder('full'));
      const again = page.waitForEvent('popup');
      await page.locator('[data-report-action="export"]').click();
      const next = await again;
      await expect(next.locator('.report-ai-summary')).toBeVisible();
      await expect(page.locator('#cloud-ai-consent-overlay')).toHaveCount(0);
      await expect(page.locator('html')).toHaveAttribute('data-report-test-calls', '2');
      await next.close();
    } else {
      await expect.poll(() => popup.isClosed()).toBe(true);
      expect(await page.locator('html').getAttribute('data-report-test-calls')).toBeNull();
      await expect(page.locator('[data-report-action="preview-without-ai"]')).toBeVisible();
    }
  });
}
