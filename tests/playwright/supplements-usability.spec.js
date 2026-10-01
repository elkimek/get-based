import { routeHtml } from '../helpers/browser-static-routes.js';
import { expect, test } from './coverage-fixture.js';

async function editor(page, records = null) {
  await routeHtml(page, '**/supplement-usability-fixture', `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Supplement editor</title><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/css/context-profile.css"><link rel="stylesheet" href="/css/modal-shared.css"><link rel="stylesheet" href="/css/import.css"></head><body><main></main><div id="modal-overlay" class="modal-overlay"><div id="detail-modal" class="modal"></div></div></body></html>`);
  await page.goto('/supplement-usability-fixture');
  return page.evaluate(async records => {
    const { state } = await import('/js/state.js');
    const { localDateKey } = await import('/js/supplement-medication-domain.js');
    const { configureSupplementsRuntimeDeps } = await import('/js/supplements-runtime.js');
    configureSupplementsRuntimeDeps({ closeModal: () => document.getElementById('modal-overlay').classList.remove('show') });
    state.currentProfile = `supplement-fixture-${crypto.randomUUID()}`;
    state.importedData = { entries: [], notes: [], supplements: records || [{ id: 'ux-dose', name: 'Example supplement', type: 'supplement', timesPerDay: 1, schedule: { mode: 'daily', timesPerDay: 1 }, ingredients: [{ name: 'Example ingredient', amount: '500 mg' }], periods: [{ start: '2026-08-01', end: null, dose: '500 mg/day' }], currentDose: '500 mg/day', brand: 'Keep brand', note: 'Keep note', qualityTests: [{ analyte: 'Lead', resultText: 'ND', category: 'contaminant' }] }] };
    await (await import('/js/data.js')).saveImportedData();
    (await import('/js/supplements.js')).openSupplementsEditor(state.importedData.supplements.length ? 0 : undefined);
    return localDateKey();
  }, records);
}
const record = async page => {
  await expect(page.locator('#supp-form-panel button:disabled')).toHaveCount(0);
  return page.evaluate(async () => (await import('/js/state.js')).state.importedData.supplements[0]);
};

for (const width of [390, 1200]) {
  test(`supplement editor supports correction, new dose, undo and preserved optional data at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const today = await editor(page);
    await page.locator('.supp-period-dose').fill('750 mg/day');
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();
    expect((await record(page)).periods).toEqual([{ start: '2026-08-01', end: null, dose: '750 mg/day' }]);
    await page.locator('.supp-period-dose').fill('1000 mg/day');
    await page.getByRole('button', { name: 'New dose from today' }).click();
    await expect(page.locator('.supp-period-dose').first()).toHaveValue('750 mg/day');
    await expect(page.locator('.supp-period-dose').last()).toHaveValue('1000 mg/day');
    await page.getByRole('button', { name: 'Remove period', exact: true }).last().click();
    await expect(page.locator('.supp-period-end')).toHaveValue('');
    await page.getByRole('button', { name: 'New dose from today' }).click();
    await page.locator('.supp-period-dose').last().fill('1000 mg/day');
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();
    const saved = await record(page);
    expect(saved.periods).toHaveLength(2);
    expect(saved.periods[0]).toMatchObject({ dose: '750 mg/day', start: '2026-08-01' });
    expect(saved.periods[1]).toMatchObject({ dose: '1000 mg/day', start: today, end: null });
    expect(saved).toMatchObject({ brand: 'Keep brand', note: 'Keep note', qualityTests: [{ analyte: 'Lead', resultText: 'ND' }] });
    await expect(page.locator('.supp-list-dose')).toHaveText('Recorded dose: 1000 mg/day');
    await page.locator('.supp-period-dose').last().scrollIntoViewIfNeeded();
    await page.screenshot({ path: `/tmp/supplement-editor-${width}.png` });
    await expect.poll(() => page.evaluate(() => {
      const modal = document.getElementById('detail-modal');
      return modal.scrollWidth <= modal.clientWidth + 1;
    })).toBe(true);
  });
}

test('adding a simple supplement, incomplete dates and future restart do not damage history', async ({ page }) => {
  await editor(page, []);
  await page.getByRole('button', { name: '+ Add New', exact: true }).click();
  await expect(page.locator('#supp-url')).toBeVisible();
  await page.getByRole('button', { name: 'Add supplement', exact: true }).click();
  await expect(page.locator('#supp-name')).toBeFocused();
  await page.getByLabel('Name *', { exact: true }).fill('Simple supplement');
  await expect(page.locator('#supp-form-panel [required]')).toHaveCount(2);
  await page.getByRole('button', { name: 'Add supplement', exact: true }).click();
  expect((await record(page)).periods).toHaveLength(1);
  await page.getByRole('button', { name: 'Add past / planned period' }).click();
  await page.getByRole('button', { name: 'Save changes' }).click();
  expect((await record(page)).periods).toHaveLength(1);
  await expect(page.locator('.supp-period-start').last()).toBeFocused();
  await editor(page, [{ id: 'planned', name: 'Future course', periods: [{ start: '2099-01-01', end: null, dose: '500 mg/day' }] }]);
  await expect(page.getByRole('button', { name: 'Restart', exact: true })).toHaveCount(0);
  await page.evaluate(async () => (await import('/js/supplements.js')).restartSupplement(0));
  expect((await record(page)).periods).toHaveLength(1);
});

test('weekday names validate, finite courses pause, and unsaved edits can be kept', async ({ page }) => {
  await editor(page);
  await page.getByLabel('Schedule', { exact: true }).selectOption('selected-days');
  await page.getByRole('button', { name: 'Save changes' }).click();
  expect((await record(page)).schedule.mode).toBe('daily');
  await page.getByLabel('Schedule details', { exact: true }).fill('Tuesday, Wednesday, Thursday, Saturday');
  await page.getByRole('button', { name: 'Save changes' }).click();
  expect((await record(page)).schedule.daysOfWeek).toEqual([2, 3, 4, 6]);
  await page.getByLabel('Name *', { exact: true }).fill('Unsaved name');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('alertdialog', { name: 'Unsaved supplement changes' })).toBeVisible();
  await page.locator('#confirm-cancel').click();
  await expect(page.getByLabel('Name *', { exact: true })).toHaveValue('Unsaved name');
  const today = await editor(page, [{ id: 'course', name: 'Finite course', periods: [{ start: '2026-08-01', end: '2099-01-01', dose: '500 mg/day' }] }]);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  expect(await record(page)).toMatchObject({ lifecycle: { state: 'paused' }, periods: [{ end: today }] });
  await page.getByRole('button', { name: 'Restart', exact: true }).click();
  expect((await record(page)).periods[0].end).toBeNull();
  await page.getByRole('button', { name: 'Stop taking', exact: true }).click();
  expect((await record(page)).lifecycle.state).toBe('ended');
  await page.getByRole('button', { name: 'Delete record', exact: true }).click();
  await page.locator('#confirm-cancel').click();
  expect(await record(page)).toBeTruthy();
  await page.getByRole('button', { name: 'Delete record', exact: true }).click();
  await page.getByRole('button', { name: 'Delete permanently', exact: true }).click();
  expect(await record(page)).toBeUndefined();
});

test('finite dose changes preserve the planned end and restarting older records retains their dose', async ({ page }) => {
  await editor(page, [{ id: 'finite', name: 'Finite course', periods: [{ start: '2026-08-01', end: '2099-01-01', dose: '500 mg/day' }] }]);
  await page.getByRole('button', { name: 'New dose from today' }).click();
  await expect(page.locator('.supp-period-end').last()).toHaveValue('2099-01-01');
  await page.getByRole('button', { name: 'Remove period', exact: true }).last().click();
  await expect(page.locator('.supp-period-end')).toHaveValue('2099-01-01');
  await editor(page, [{ id: 'old', name: 'Previous course', periods: [{ start: '2026-08-01', end: '2026-08-31', dose: '750 mg/day' }] }]);
  await page.getByRole('button', { name: 'Restart', exact: true }).click();
  expect((await record(page)).periods[1].dose).toBe('750 mg/day');
});

test('saved dose correction survives storage reload', async ({ page }) => {
  await editor(page);
  await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    state.currentProfile = 'supplement-usability-storage';
    state.importedData = structuredClone(state.importedData);
    await (await import('/js/data.js')).saveImportedData();
    (await import('/js/supplements.js')).openSupplementsEditor(0);
  });
  await page.locator('.supp-period-dose').fill('1000 mg/day');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect.poll(() => page.evaluate(async () => {
    const { encryptedGetItem } = await import('/js/crypto.js');
    const { profileStorageKey } = await import('/js/profile.js');
    const saved = JSON.parse(await encryptedGetItem(profileStorageKey('supplement-usability-storage', 'imported')));
    return saved?.supplements[0]?.periods[0]?.dose;
  })).toBe('1000 mg/day');
  // Repeated edits after the asynchronous save must not look like a remote conflict.
  await page.locator('.supp-period-dose').fill('1250 mg/day');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect.poll(() => page.evaluate(async () => {
    const { encryptedGetItem } = await import('/js/crypto.js');
    const { profileStorageKey } = await import('/js/profile.js');
    return JSON.parse(await encryptedGetItem(profileStorageKey('supplement-usability-storage', 'imported')))?.supplements[0]?.periods[0]?.dose;
  })).toBe('1250 mg/day');
  await page.reload();
  const stored = await page.evaluate(async () => {
    const { encryptedGetItem } = await import('/js/crypto.js');
    const { profileStorageKey } = await import('/js/profile.js');
    return JSON.parse(await encryptedGetItem(profileStorageKey('supplement-usability-storage', 'imported'))).supplements[0];
  });
  expect(stored.periods).toEqual([{ start: '2026-08-01', end: null, dose: '1250 mg/day' }]);
});

test('open mobile editor has labelled controls and stays inside the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await editor(page);
  await expect(page.locator('#supp-form-panel details')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => {
    const modal = document.getElementById('detail-modal');
    return modal.scrollWidth <= modal.clientWidth + 1;
  })).toBe(true);
  const { createRequire } = await import('node:module');
  const require = createRequire(import.meta.url);
  await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
  const violations = await page.evaluate(async () => (await window.axe.run(document.getElementById('supp-form-panel'), {
    runOnly: { type: 'rule', values: ['label', 'select-name', 'button-name', 'color-contrast'] },
  })).violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) })));
  expect(violations).toEqual([]);
});


test('sync preserves a dirty draft and prevents overwriting a changed record', async ({ page }) => {
  await editor(page);
  await page.locator('.supp-period-dose').fill('1000 mg/day');
  await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    state.importedData.supplements[0].periods[0].dose = '600 mg/day';
    window.dispatchEvent(new Event('labcharts-sync-applied'));
  });
  await expect(page.locator('.supp-period-dose')).toHaveValue('1000 mg/day');
  await page.getByRole('button', { name: 'Save changes' }).click();
  expect((await record(page)).periods[0].dose).toBe('600 mg/day');
});

test('full app backdrop and Escape keep unsaved supplement edits until discarded', async ({ page }) => {
  await page.addInitScript(() => {
    const id = localStorage.getItem('labcharts-active-profile') || 'default';
    localStorage.setItem(`labcharts-${id}-emptyTour`, 'completed');
    localStorage.setItem(`labcharts-${id}-tour`, 'completed');
  });
  await page.goto('/app');
  await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    state.importedData.supplements = [{ id: 'backdrop', name: 'Backdrop example', periods: [{ start: '2026-08-01', end: null, dose: '500 mg/day' }] }];
    (await import('/js/supplements.js')).openSupplementsEditor(0);
  });
  await page.locator('.supp-period-dose').fill('1000 mg/day');
  await page.locator('#modal-overlay').click({ position: { x: 2, y: 2 } });
  await expect(page.getByRole('alertdialog', { name: 'Unsaved supplement changes' })).toBeVisible();
  await page.locator('#confirm-cancel').click();
  await expect(page.locator('.supp-period-dose')).toHaveValue('1000 mg/day');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('alertdialog', { name: 'Unsaved supplement changes' })).toBeVisible();
  await page.getByRole('button', { name: 'Discard changes', exact: true }).click();
  await expect(page.locator('#modal-overlay')).not.toHaveClass(/show/);
});

const legacyRecords = [
  { name: 'Legacy flat record', type: 'supplement', dosage: '500 mg with dinner', startDate: '2024-01-01', endDate: null,
    currentDose: { text: '500 mg', custom: 'retain' }, customField: { retain: ['all', 'values'] } },
  { id: 'legacy-structured', name: 'Structured old record', schemaVersion: 2, type: 'medication', route: 'custom-route',
    schedule: { mode: 'selected-days', daysOfWeek: [1, 3, 5], timesPerDay: 2, extension: 'keep' },
    periods: [{ start: '2024-01-01', end: null, dose: { value: 500, unit: 'mg', basis: 'day', provenance: { source: 'manual' } }, customPeriod: 'keep' }],
    ingredients: [{ name: 'Example', amount: '200 mystery-units', vendorField: { retain: true } }],
    servingSize: { value: 1, unit: 'capsule', vendorField: 'keep' }, inactiveIngredients: ['Rice flour', 'Rice flour'],
    qualityTests: [{ category: 'potency', analyte: 'Example', value: 98, unit: '%', status: 'pass', includeInAIContext: false, method: 'HPLC' }],
    qualityEvidenceScope: 'legacy-scope', importProvenance: { source: 'old import', retain: true }, lifecycle: { state: 'active', custom: 'keep' } },
  { id: 'legacy-interval', name: 'Old interval', schemaVersion: 1, schedule: { mode: 'interval', intervalDays: 3 },
    periods: [{ start: '2024-01-01', end: '2025-01-01', dose: '500 mg', schedule: { mode: 'interval', intervalDays: 3 } }], lifecycle: { state: 'ended', reason: 'completed' } },
];

for (const legacy of legacyRecords) test(`old data survives opening, note editing, saving and reload: ${legacy.name}`, async ({ page }) => {
  await editor(page, [legacy]);
  const before = await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const { encryptedSetItem, encryptedGetItem } = await import('/js/crypto.js');
    const { profileStorageKey } = await import('/js/profile.js');
    const { migrateProfileData } = await import('/js/profile-data-migrations.js');
    state.currentProfile = 'legacy-compatibility';
    const key = profileStorageKey(state.currentProfile, 'imported');
    const raw = JSON.stringify(state.importedData);
    await encryptedSetItem(key, raw);
    state.importedData = JSON.parse(await encryptedGetItem(key));
    migrateProfileData(state.importedData);
    const migrated = structuredClone(state.importedData.supplements[0]);
    migrateProfileData(state.importedData);
    if (JSON.stringify(migrated) !== JSON.stringify(state.importedData.supplements[0])) throw new Error('Migration was not idempotent');
    (await import('/js/supplements.js')).openSupplementsEditor(0);
    return { original: raw, stored: await encryptedGetItem(key), migrated };
  });
  expect(before.stored).toBe(before.original);
  expect(before.migrated).toMatchObject(legacy);
  await page.evaluate(() => { document.getElementById('supp-note').value = 'Only this note changed'; });
  expect(await page.evaluate(async () => (await import('/js/supplements.js')).saveSupplement(0))).toBe(true);
  const expected = { ...before.migrated, note: 'Only this note changed' };
  const actual = await record(page);
  delete actual.updatedAt;
  delete expected.updatedAt;
  expect(actual).toEqual(expected);
  await page.reload();
  const stored = await page.evaluate(async () => JSON.parse(await (await import('/js/crypto.js')).encryptedGetItem('labcharts-legacy-compatibility-imported')).supplements[0]);
  delete stored.updatedAt;
  expect(stored).toEqual(expected);
});

test('an aborted supplement write retains saved history and the draft, and retry commits once', async ({ page }) => {
  await editor(page);
  await page.evaluate(async () => {
    await (await import('/js/data.js')).saveImportedData();
    (await import('/js/supplements.js')).openSupplementsEditor(0);
  });
  const before = await record(page);
  await page.locator('.supp-period-dose').fill('1000 mg/day');
  const failed = await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const { encryptedGetItem } = await import('/js/crypto.js');
    const key = (await import('/js/profile.js')).profileStorageKey(state.currentProfile, 'imported');
    const put = IDBObjectStore.prototype.put;
    let aborts = 0;
    IDBObjectStore.prototype.put = function (...args) {
      const request = put.apply(this, args);
      request.addEventListener('success', () => { aborts++; this.transaction.abort(); }, { once: true });
      return request;
    };
    let saved;
    try { saved = await (await import('/js/supplements.js')).saveSupplement(0); }
    finally { IDBObjectStore.prototype.put = put; }
    return { saved, aborts, stored: JSON.parse(await encryptedGetItem(key)).supplements[0], live: state.importedData.supplements[0], dirty: (await import('/js/supplement-form-ui.js')).supplementFormHasChanges() };
  });
  expect(failed.aborts).toBeGreaterThan(0);
  expect(failed.saved).toBe(false);
  expect(failed.stored).toEqual(before);
  expect(failed.live).toEqual(before);
  expect(failed.dirty).toBe(true);
  await expect(page.locator('.supp-period-dose')).toHaveValue('1000 mg/day');
  expect(await page.evaluate(async () => (await import('/js/supplements.js')).saveSupplement(0))).toBe(true);
  expect((await record(page)).periods).toEqual([{ start: '2026-08-01', end: null, dose: '1000 mg/day' }]);
});

test('supplement save merges an unrelated peer edit and rejects a conflicting dose edit', async ({ page }) => {
  await editor(page);
  await page.evaluate(async () => {
    await (await import('/js/data.js')).saveImportedData();
    (await import('/js/supplements.js')).openSupplementsEditor(0);
  });
  await page.locator('.supp-period-dose').fill('750 mg/day');
  const merged = await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const crypto = await import('/js/crypto.js');
    const key = (await import('/js/profile.js')).profileStorageKey(state.currentProfile, 'imported');
    const peer = JSON.parse(await crypto.encryptedGetItem(key));
    peer.notes.push({ date: '2026-09-29', text: 'Other device note' });
    await crypto.encryptedSetItem(key, JSON.stringify(peer));
    const saved = await (await import('/js/supplements.js')).saveSupplement(0);
    return { saved, stored: JSON.parse(await crypto.encryptedGetItem(key)) };
  });
  expect(merged.saved).toBe(true);
  expect(merged.stored.notes).toContainEqual({ date: '2026-09-29', text: 'Other device note' });
  await page.locator('.supp-period-dose').fill('1000 mg/day');
  const conflict = await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const crypto = await import('/js/crypto.js');
    const key = (await import('/js/profile.js')).profileStorageKey(state.currentProfile, 'imported');
    const peer = JSON.parse(await crypto.encryptedGetItem(key));
    peer.supplements[0].periods[0].dose = '900 mg/day';
    peer.supplements[0].updatedAt = Date.now() + 100;
    await crypto.encryptedSetItem(key, JSON.stringify(peer));
    const saved = await (await import('/js/supplements.js')).saveSupplement(0);
    return { saved, stored: JSON.parse(await crypto.encryptedGetItem(key)) };
  });
  expect(conflict.saved).toBe(false);
  expect(conflict.stored.supplements[0].periods[0].dose).toBe('900 mg/day');
  await expect(page.locator('.supp-period-dose')).toHaveValue('1000 mg/day');
});

test('live BrainMarket import keeps the source link through save and reload', async ({ page }) => {
  test.skip(!process.env.SUPPLEMENT_LIVE_IMPORT, 'Opt-in public website check');
  test.setTimeout(90000);
  await editor(page, []);
  await page.getByRole('button', { name: '+ Add New', exact: true }).click();
  const url = 'https://www.brainmarket.cz/brainmax-activated-b-complex--90-rostlinnych-kapsli/';
  await page.getByLabel('Product URL', { exact: true }).fill(url);
  await page.getByRole('button', { name: 'Review link', exact: true }).click();
  await expect(page.locator('[data-supp-action="apply-import"]')).toBeVisible({ timeout: 60000 });
  await page.locator('[data-supp-action="apply-import"]').click();
  await expect(page.locator('#supp-name')).toHaveValue(/BrainMax.*B-Complex/);
  await expect(page.locator('#supp-serving-value')).toHaveValue('2');
  expect(await page.locator('.supp-ingredient-row').count()).toBeGreaterThan(10);
  await page.locator('#supp-times').fill('1');
  await page.getByRole('button', { name: 'Add supplement', exact: true }).click();
  const saved = await record(page);
  expect(saved.sourceUrl).toBe(url);
  expect(saved.importProvenance.url).toBe(url);
  expect(saved.servingSize.value).toBe(2);
  await expect(page.locator('.supp-list-source')).toHaveAttribute('href', url);
  const profile = await page.evaluate(async () => (await import('/js/state.js')).state.currentProfile);
  console.log(JSON.stringify({ liveImport: url, name: saved.name, servingSize: saved.servingSize, ingredients: saved.ingredients.map(i => ({ name: i.name, amount: i.amount })), qualityResults: saved.qualityTests?.length, sourceUrl: saved.sourceUrl }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#supp-url').scrollIntoViewIfNeeded();
  await page.screenshot({ path: '/tmp/supplement-brainmarket-mobile.png' });
  await page.reload();
  await page.evaluate(async profile => {
    const { state } = await import('/js/state.js');
    state.currentProfile = profile;
    state.importedData = JSON.parse(await (await import('/js/crypto.js')).encryptedGetItem((await import('/js/profile.js')).profileStorageKey(profile, 'imported')));
    (await import('/js/supplements.js')).openSupplementsEditor(0);
  }, profile);
  await expect(page.locator('#supp-url')).toHaveValue(url);
  expect((await record(page)).ingredients).toEqual(saved.ingredients);
  const context = await page.evaluate(async () => (await import('/js/chat-prompt-context.js')).buildChatLabContext('Show my B-Complex ingredients, dose and source link', { ignoreContextToggles: true }));
  expect(context).toContain(url);
  expect(context).toContain(saved.name);
  for (const ingredient of saved.ingredients) expect(context).toContain(ingredient.name);
  expect(context).toContain('2 capsule');
  await page.locator('#supp-serving-value').evaluate(el => el.closest('.supp-form-row').scrollIntoView({ block: 'start' }));
  await page.screenshot({ path: '/tmp/supplement-brainmarket-portions-mobile.png' });
});

test('label portion metadata stays separate from personal servings and explicit doses', async ({ page }) => {
  await editor(page, [{ id: 'serving-semantics', name: 'Two-capsule label', servingSize: { value: 2, unit: 'capsule', source: 'label' },
    timesPerDay: 1, schedule: { mode: 'daily', timesPerDay: 1 }, ingredients: [{ name: 'Example', amount: '100 mg' }],
    periods: [{ start: '2026-01-01', end: null }] }]);
  await expect(page.locator('.supp-ing-total')).toHaveText('100 mg/day');
  await page.getByLabel('Label serving size', { exact: true }).fill('4');
  await expect(page.locator('.supp-ing-total')).toHaveText('100 mg/day');
  await page.getByLabel('Servings/day', { exact: true }).fill('0.5');
  await expect(page.locator('.supp-ing-total')).toHaveText('50 mg/day');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  let saved = await record(page);
  expect(saved.servingSize).toEqual({ value: 4, unit: 'capsule', source: 'label' });
  expect(saved.periods.at(-1).ingredientDoses[0].value).toBe(50);
  await page.locator('.supp-period-dose').last().fill('75 mg/day');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await record(page);
  await page.getByLabel('Servings/day', { exact: true }).fill('2');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  saved = await record(page);
  expect(saved.periods.at(-1).dose).toMatchObject({ text: '75 mg/day' });
  expect(saved.schedule.timesPerDay).toBe(2);
  // Clearing one label field must not resurrect its old value from preserved metadata.
  await page.getByLabel('Label serving size', { exact: true }).fill('');
  expect(await page.evaluate(async () => (await import('/js/supplements.js')).saveSupplement(0))).toBe(true);
  expect((await record(page)).servingSize).toEqual({ unit: 'capsule', source: 'label' });
});

test('a saved dose increase reaches fresh chat prompts with old and new period dates', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-09-29T12:00:00Z'));
  await editor(page);
  const prompts = async () => page.evaluate(async () => {
    const { buildChatLabContext, buildChatSystemPrompt } = await import('/js/chat-prompt-context.js');
    const compact = buildChatLabContext('How am I doing?', { ignoreContextToggles: true });
    const detail = buildChatLabContext('What is my current dosage?', { ignoreContextToggles: true });
    return { compact, detail, system: buildChatSystemPrompt({ basePrompt: 'Test assistant', labContext: detail }) };
  });
  // Past doses are included in routine context when they overlap the lab dates.
  await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    state.importedData.entries = [{ date: '2026-08-15', markers: { 'lipids.ldl': 2.5 } }];
    const data = await import('/js/data.js');
    data.invalidateActiveDataCache();
    await data.saveImportedData();
  });
  // Warm the same cache used by subsequent chat sends before changing the form.
  expect((await prompts()).system).toContain('500 mg/day');
  await page.locator('.supp-period-dose').fill('1000 mg/day');
  await page.getByRole('button', { name: 'New dose from today', exact: true }).click();
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await record(page);
  const after = await prompts();
  for (const context of Object.values(after)) {
    expect(context).toContain('current recorded dose as of 2026-09-29: 1000 mg/day');
    expect(context).toContain('2026-08-01→2026-09-28 [past]: 500 mg/day');
    expect(context).toContain('2026-09-29→ongoing [current]: 1000 mg/day');
    expect(context).toContain('Example ingredient 500 mg per label serving');
    expect(context).not.toContain('= 500 mg/day');
  }
  // A history correction must change the next prompt without a reload as well.
  await page.locator('.supp-period-dose').first().fill('600 mg/day');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await record(page);
  expect((await prompts()).system).toContain('2026-08-01→2026-09-28 [past]: 600 mg/day');
  await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const profile = state.currentProfile;
    state.importedData = JSON.parse(await (await import('/js/crypto.js')).encryptedGetItem((await import('/js/profile.js')).profileStorageKey(profile, 'imported')));
  });
  expect((await prompts()).system).toContain('current recorded dose as of 2026-09-29: 1000 mg/day');
});

test('routine chat context includes current supplements that started after the latest lab', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-09-29T12:00:00Z'));
  await editor(page, [{ id: 'after-lab', name: 'After-lab supplement', periods: [{ start: '2026-09-29', end: null, dose: '1000 mg/day' }] }]);
  const context = await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    state.importedData.entries = [{ date: '2026-08-01', markers: { 'lipids.ldl': 2.5 } }];
    (await import('/js/data.js')).invalidateActiveDataCache();
    return (await import('/js/chat-prompt-context.js')).buildChatLabContext('How am I doing?', { ignoreContextToggles: true });
  });
  expect(context).toContain('After-lab supplement');
  expect(context).toContain('current recorded dose as of 2026-09-29: 1000 mg/day');
});

test('saved medication facts reach the appropriate context tier, respecting exclusions and the context switch', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-09-29T12:00:00Z'));
  await editor(page, [{ id: 'context-medication', name: 'Context medicine', type: 'medication',
    genericName: 'Example generic', brand: 'Example brand', dosageForm: 'tablet', route: 'oral',
    reason: 'Original indication', prescriber: 'Example clinician', note: 'Personal note',
    servingSize: { value: 2, unit: 'tablet' }, labelDirections: 'Source directions', labelWarnings: ['Source warning'],
    importProvenance: { kind: 'url', url: 'https://example.org/medicine' },
    schedule: { mode: 'prn', maxPerDay: 3, details: 'Only when needed' },
    periods: [{ start: '2026-09-29', end: null, dose: { value: 10, unit: 'mg', basis: 'dose' } }],
    ingredients: [{ name: 'Example active', amount: '10 mg' }], inactiveIngredients: ['Tablet coating'],
    qualityEvidenceScope: 'different-lot', qualityTests: [
      { category: 'contaminant', analyte: 'Lead', resultText: 'ND', unit: 'mcg', basis: 'per tablet', status: 'not-detected' },
      { category: 'contaminant', analyte: 'SecretAnalyte', resultText: 'SecretResult', includeInAIContext: false },
    ],
  }]);
  await page.locator('#supp-reason').fill('Corrected indication');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await record(page);
  const result = await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    // Read back the persisted value, not merely the editor's draft or live object.
    state.importedData = JSON.parse(await (await import('/js/crypto.js')).encryptedGetItem((await import('/js/profile.js')).profileStorageKey(state.currentProfile, 'imported')));
    state.importedData.entries = [{ date: '2026-08-01', markers: { 'lipids.ldl': 2.5 } }];
    const dataModule = await import('/js/data.js');
    dataModule.invalidateActiveDataCache();
    const { buildChatLabContext, buildChatSystemPrompt } = await import('/js/chat-prompt-context.js');
    const { setSupplementsMedsContextEnabled } = await import('/js/lab-context-settings.js');
    const biology = await import('/js/biology-score-context-ai.js');
    let biologyPrompt = '';
    biology.configureBiologyScoreContextAIDeps({ hasAIProvider: () => true, isAIPaused: () => false,
      callClaudeAPI: async request => { biologyPrompt = JSON.stringify(request.messages); return { text: '{"summary":"Fixture review","suggestions":[]}' }; },
    });
    setSupplementsMedsContextEnabled(true);
    const compact = buildChatLabContext('How am I doing?');
    const detail = buildChatSystemPrompt({ basePrompt: 'Test assistant', labContext: buildChatLabContext('Tell me about Context medicine') });
    const source = buildChatLabContext('What is the source of my therapy?');
    const unrelatedSource = buildChatLabContext('What is the source of my fatigue while on therapy?');
    const prescriber = buildChatLabContext('Who prescribed Context medicine?');
    await biology.generateBiologyScoreContextReview(dataModule.getActiveData());
    const biologyIncluded = biologyPrompt;
    setSupplementsMedsContextEnabled(false);
    const disabled = buildChatLabContext('Tell me about Context medicine');
    await biology.generateBiologyScoreContextReview(dataModule.getActiveData());
    const biologyDisabled = biologyPrompt;
    setSupplementsMedsContextEnabled(true);
    return { compact, detail, source, unrelatedSource, prescriber, biologyIncluded, disabled, biologyDisabled, restored: buildChatLabContext('How am I doing?') };
  });
  for (const context of [result.compact, result.detail, result.source, result.unrelatedSource, result.prescriber, result.biologyIncluded, result.restored]) {
    for (const fact of ['Context medicine', 'Example generic', '2 tablet', 'maximum 3/day', 'Only when needed', '10 mg/dose']) expect(context).toContain(fact);
    expect(context).not.toContain('SecretAnalyte');
    expect(context).not.toContain('SecretResult');
    expect(context).not.toContain('Original indication');
  }
  for (const fact of ['Corrected indication', 'Source directions', 'Source warning', 'Tablet coating', 'different lot', 'ND']) {
    expect(result.detail).toContain(fact);
    for (const context of [result.compact, result.unrelatedSource, result.biologyIncluded, result.restored]) expect(context).not.toContain(fact);
  }
  expect(result.source).toContain('https://example.org/medicine');
  expect(result.source).not.toContain('Example clinician');
  expect(result.prescriber).toContain('Example clinician');
  expect(result.prescriber).not.toContain('https://example.org/medicine');
  for (const context of [result.compact, result.detail, result.unrelatedSource, result.biologyIncluded, result.restored]) {
    expect(context).not.toContain('Example clinician');
    expect(context).not.toContain('https://example.org/medicine');
  }
  for (const context of [result.disabled, result.biologyDisabled]) {
    expect(context).not.toContain('Context medicine');
    expect(context).not.toContain('Corrected indication');
    expect(context).not.toContain('Source warning');
  }
});

test('a named historical medicine survives inventory limits and query changes refresh the prompt cache', async ({ page }) => {
  const records = Array.from({ length: 30 }, (_, i) => ({ id: `historical-${i}`, name: `Historical item ${i}`, type: 'medication',
    periods: [{ start: '2025-01-01', end: '2025-02-01', dose: `${i + 1} mg/day` }], note: 'Historical note '.repeat(20),
  }));
  records[28].name = 'Zebra medicine'; records[29].name = 'Omega medicine';
  await editor(page, records);
  const contexts = await page.evaluate(async () => {
    const { buildChatLabContext } = await import('/js/chat-prompt-context.js');
    return ['Zebra medicine', 'Omega medicine'].map(name => buildChatLabContext(`Tell me about ${name}`, { ignoreContextToggles: true }));
  });
  expect(contexts[0]).toContain('Zebra medicine');
  expect(contexts[0]).toContain('2025-01-01→2025-02-01 [past]: 29 mg/day');
  expect(contexts[1]).toContain('Omega medicine');
  expect(contexts[1]).toContain('2025-01-01→2025-02-01 [past]: 30 mg/day');
});
