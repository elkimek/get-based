import { expect, test } from './coverage-fixture.js';
import { routeJavaScript } from '../helpers/browser-static-routes.js';
import { seedDashboardControlProfile } from '../helpers/dashboard-control-fixture.js';
const thumbnail = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZcL8AAAAASUVORK5CYII=';

for (const changeTime of [false, true]) test(`an exact saved-meal handoff preserves untouched evidence with an explicit time edit ${changeTime}`,  async ({ page, context }) => {
  await context.route('https://**/*', route => route.abort()); await seedDashboardControlProfile(page);
  const before = await page.evaluate(async thumbnail => {
    const store = await import('/js/nutrition-store.js');
    await store.saveActiveProfileMeal({ id: 'media-target', name: 'Saved meal with evidence', mealType: 'lunch', eatenAt: '2026-10-20T12:01:22.123Z', createdAt: '2026-10-20T12:30:00.000Z', nutrients: { energyKcal: 350, proteinG: 20 }, note: 'Original note', source: { kind: 'manual', recordedAt: '2026-10-20T12:30:00.000Z', opaqueSource: { keep: 'Preserve source evidence' } }, images: [{ thumbnailUrl: thumbnail, mediaType: 'image/png', fileName: 'existing-evidence.png' }], opaquePortableMetadata: { retained: 'Preserve unseen portable metadata' } });
    await store.saveActiveProfileMeal({ id: 'media-sibling', name: 'Unrelated saved meal', mealType: 'dinner', eatenAt: '2026-10-20T18:00:00.000Z', note: 'Keep this row exactly', nutrients: { energyKcal: 200 }, source: { kind: 'manual' }, opaquePortableMetadata: { sibling: true } });
    const { state } = await import('/js/state.js'); return { meals: await store.listNutritionMeals(state.currentProfile), context: state.importedData.contextNotes, entries: structuredClone(state.importedData.entries) };
  }, thumbnail);
  const target = before.meals.find(row => row.id === 'media-target')!;
  expect(target).toMatchObject({ opaquePortableMetadata: { retained: 'Preserve unseen portable metadata' } });
  const opened = await page.evaluate(async () => {
    const { state } = await import('/js/state.js'), bindings = await import('/js/agent-tool-bindings.js'), { createAgentToolRuntime } = await import('/js/agent-tool-runtime.js');
    const tools = createAgentToolRuntime({ readContext: () => '', userMessage: 'Open my saved meal so I can review its photos.', ...bindings.createBrowserAgentToolDependencies(state.currentProfile) });
    const read = await tools.execute({ tool: 'getbased_read_data', arguments: { resource: 'meals', recordId: 'media-target' } });
    if (!read.success) throw new Error('The exact native meal read failed: ' + JSON.stringify(read));
    return tools.execute({ tool: 'getbased_navigate', arguments: { view: 'nutritionEditor', recordId: 'media-target' } });
  });
  expect(opened.success).toBe(true); expect(JSON.parse(opened.contentItems[0]!.text)).toMatchObject({ opened: 'nutritionEditor', dataSaved: false });
  await expect(page.locator('#nutrition-meal-name')).toHaveValue('Saved meal with evidence');
  await page.locator('#nutrition-note').fill('Human reviewed note');
  let expectedTime = target.eatenAt;
  if (changeTime) {
    const chosen = '2026-10-21T07:45'; await page.locator('#nutrition-eaten-at').fill(chosen);
    expectedTime = await page.evaluate(chosen => new Date(chosen).toISOString(), chosen);
  }
  await page.locator('#nutrition-save-btn').click();
  const readAfter = () => page.evaluate(async () => { const { state } = await import('/js/state.js'); return { meals: await (await import('/js/nutrition-store.js')).listNutritionMeals(state.currentProfile), context: state.importedData.contextNotes, entries: structuredClone(state.importedData.entries) }; });
  await expect.poll(async () => (await readAfter()).meals.find(row => row.id === 'media-target')?.note).toBe('Human reviewed note');
  const after = await readAfter(), saved = after.meals.find(row => row.id === 'media-target')!;
  expect(saved.opaquePortableMetadata).toEqual(target.opaquePortableMetadata);
  expect(saved.eatenAt).toBe(expectedTime); expect(saved.createdAt).toBe(target.createdAt); expect(saved.images).toEqual(target.images); expect(saved.source).toMatchObject({ opaqueSource: { keep: 'Preserve source evidence' } });
  expect(after.meals).toHaveLength(2); expect(after.meals.find(row => row.id === 'media-sibling')).toEqual(before.meals.find(row => row.id === 'media-sibling')); expect(after.context).toBe(before.context); expect(after.entries).toEqual(before.entries);
});

test('a native meal edit cannot overwrite a newer canonical meal or change its cache on refusal', async ({ page, context }) => {
  await context.route('https://**/*', route => route.abort()); await seedDashboardControlProfile(page);
  await page.evaluate(async () => { await (await import('/js/nutrition-store.js')).saveActiveProfileMeal({ id: 'conflict-target', name: 'Concurrent saved meal', mealType: 'lunch', eatenAt: '2026-10-20T12:00:00.000Z', note: 'Original note', nutrients: { energyKcal: 350 }, source: { kind: 'manual' }, opaquePortableMetadata: { revision: 1 } }); await (await import('/js/agent-tool-bindings.js')).navigateFromAgent({ view: 'nutritionEditor', recordId: 'conflict-target', marker: '' }); });
  const peer = await page.evaluate(async () => {
    const { state } = await import('/js/state.js'), { encryptedGetItem } = await import('/js/crypto.js'), { profileStorageKey } = await import('/js/profile.js');
    const next = structuredClone(state.importedData), row = next.nutritionMeals!.find(row => row.id === 'conflict-target')!;
    row.note = 'Newer peer note'; row.opaquePortableMetadata = { revision: 2 }; row.updatedAt = new Date().toISOString(); next.contextNotes = 'Newer unrelated context';
    if (!await (await import('/js/data.js')).saveImportedDataForProfile(state.currentProfile, next, { forceProfileScope: true })) throw new Error('Peer fixture write failed');
    return { canonical: await encryptedGetItem(profileStorageKey(state.currentProfile, 'imported')), cache: await (await import('/js/nutrition-store.js')).getNutritionMeal(state.currentProfile, 'conflict-target') };
  });
  await page.locator('#nutrition-note').fill('Stale native draft'); await page.locator('#nutrition-save-btn').click();
  await expect(page.locator('.notification-toast').filter({ hasText: /Meal changes saved|saved meal changed|Meal could not|editing authorization changed/i }).first()).toBeVisible();
  const after = await page.evaluate(async () => { const { state } = await import('/js/state.js'); return { canonical: await (await import('/js/crypto.js')).encryptedGetItem((await import('/js/profile.js')).profileStorageKey(state.currentProfile, 'imported')), cache: await (await import('/js/nutrition-store.js')).getNutritionMeal(state.currentProfile, 'conflict-target') }; });
  expect(after).toEqual(peer); await expect(page.locator('#nutrition-note')).toHaveValue('Stale native draft');
});

for (const create of [false, true]) test(`native saved/cache-pending feedback prevents a second commit for creation ${create}`, async ({ page, context }) => {
  await context.route('https://**/*', route => route.abort());
  await routeJavaScript(page, '**/js/nutrition-store.js', `export * from '/js/nutrition-store.js?native-cache-original'; import {refreshNutritionMealsFromSnapshot as refresh} from '/js/nutrition-store.js?native-cache-original'; export async function refreshNutritionMealsFromSnapshot(...args){if(globalThis.failNativeMealCache)throw new Error('Synthetic cache refresh failure');return refresh(...args);}`);
  await seedDashboardControlProfile(page);
  const cache = await page.evaluate(async create => {
    const { state } = await import('/js/state.js'), store = await import('/js/nutrition-store.js');
    if (!create) await store.saveActiveProfileMeal({ id: 'cache-target', name: 'Cache receipt meal', mealType: 'lunch', eatenAt: '2026-10-20T12:00:00.000Z', note: 'Original cache note', nutrients: { energyKcal: 350 }, source: { kind: 'manual' } });
    await (await import('/js/agent-tool-bindings.js')).navigateFromAgent({ view: 'nutritionEditor', marker: '', ...(!create ? { recordId: 'cache-target' } : {}) });
    Reflect.set(window, 'failNativeMealCache', true); return store.listNutritionMeals(state.currentProfile);
  }, create);
  if (create) { await page.locator('#nutrition-meal-name').fill('Cache receipt meal'); await page.locator('#nutrition-meal-type').selectOption('lunch'); await page.locator('#nutrition-energyKcal').fill('350'); }
  await page.locator('#nutrition-note').fill('Durably saved native draft'); await page.locator('#nutrition-save-btn').click();
  await expect(page.locator('#nutrition-save-btn')).toHaveText('Saved; reload Nutrition'); await expect(page.locator('#nutrition-save-btn')).toBeDisabled();
  await expect(page.locator('.notification-toast').filter({ hasText: 'Meal saved. Reload Nutrition' }).first()).toBeVisible();
  const read = () => page.evaluate(async () => { const { state } = await import('/js/state.js'), key = (await import('/js/profile.js')).profileStorageKey(state.currentProfile, 'imported'); return { canonical: JSON.parse((await (await import('/js/crypto.js')).encryptedGetItem(key))!).nutritionMeals, cache: await (await import('/js/nutrition-store.js')).listNutritionMeals(state.currentProfile) }; });
  const saved = await read(); expect(saved.canonical).toHaveLength(1); expect(saved.canonical[0]).toMatchObject({ name: 'Cache receipt meal', note: 'Durably saved native draft' }); expect(saved.cache).toEqual(cache);
  // A previously queued duplicate event also cannot replay the accepted Save.
  await page.locator('#nutrition-save-btn').evaluate(button => button.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  expect(await read()).toEqual(saved); await expect(page.locator('#nutrition-note')).toHaveValue('Durably saved native draft');
});

for (const kind of ['manual', 'ai-photo-estimate']) test(`reference photos append to an exact ${kind} meal without inference or loss`, async ({ page, context }) => {
  await context.route('https://**/*', route => route.abort()); await seedDashboardControlProfile(page);
  const inferences: string[] = []; page.on('request', request => { if (request.method() === 'POST' && /chat\/completions|\/v1\/chat|\/api\/generate/.test(request.url())) inferences.push(request.url()); });
  const first = await page.evaluate(async ({ thumbnail, kind }) => {
    const store = await import('/js/nutrition-store.js'); await store.saveActiveProfileMeal({ id: 'reference-target', name: 'Preserved reference meal', mealType: 'lunch', eatenAt: '2026-10-20T12:01:22.123Z', note: 'Preserve the saved estimate', nutrients: { energyKcal: 350, proteinG: 20 }, images: [{ thumbnailUrl: thumbnail, fileName: 'original.png', mediaType: 'image/png' }], source: { kind, model: 'original-estimate', opaque: 'Preserve source evidence', aiNutritionEstimate: { nutrientKeys: ['energyKcal', 'proteinG'] } }, opaquePortableMetadata: { keep: true } });
    const { state } = await import('/js/state.js'), canonical = await (await import('/js/crypto.js')).encryptedGetItem((await import('/js/profile.js')).profileStorageKey(state.currentProfile, 'imported'));
    await (await import('/js/agent-tool-bindings.js')).navigateFromAgent({ view: 'nutritionEditor', recordId: 'reference-target', marker: '' });
    return { meal: await store.getNutritionMeal(state.currentProfile, 'reference-target'), canonical };
  }, { thumbnail, kind });
  await page.getByRole('tab', { name: 'Photo', exact: true }).click();
  const choice = page.waitForEvent('filechooser'); await page.getByRole('button', { name: 'Add reference photos', exact: true }).click(); const chooser = await choice;
  await chooser.setFiles({ name: 'reference-evidence.png', mimeType: 'image/png', buffer: Buffer.from(thumbnail.split(',')[1]!, 'base64') });
  await expect(page.locator('.notification-toast').filter({ hasText: 'Reference photos ready' }).first()).toBeVisible();
  await expect(page.locator('#nutrition-photo-preview img')).toHaveCount(2); await expect(page.locator('#nutrition-energyKcal')).toHaveValue('350'); await expect(page.locator('#nutrition-proteinG')).toHaveValue('20'); await expect(page.locator('#nutrition-meal-name')).toHaveValue('Preserved reference meal');
  // Cancelling either picker does not clear the retained draft or its images.
  await page.locator('#nutrition-reference-photo-input').setInputFiles([]); await page.locator('#nutrition-photo-input').setInputFiles([]);
  await expect(page.locator('#nutrition-photo-preview img')).toHaveCount(2);
  const raw = () => page.evaluate(async () => { const { state } = await import('/js/state.js'); return (await import('/js/crypto.js')).encryptedGetItem((await import('/js/profile.js')).profileStorageKey(state.currentProfile, 'imported')); });
  expect(await raw()).toBe(first.canonical); expect(inferences).toEqual([]);
  await page.locator('#nutrition-save-btn').click();
  await expect.poll(async () => JSON.parse((await raw())!).nutritionMeals[0].images.length).toBe(2);
  const saved = JSON.parse((await raw())!).nutritionMeals[0];
  const priorImages = first.meal!.images; if (!Array.isArray(priorImages)) throw new Error('Missing original photo fixture');
  expect(saved.id).toBe('reference-target'); expect(saved.images[0]).toEqual(priorImages[0]); expect(saved.images[1]).toMatchObject({ purpose: 'attachment', fileName: 'reference-evidence.png', thumbnailUrl: expect.stringMatching(/^data:image\//) });
  expect(saved.images[1]).not.toHaveProperty('dataUrl'); expect(saved.images[1]).not.toHaveProperty('analysisImage'); expect(saved.images[1]).not.toHaveProperty('base64');
  expect(saved.nutrients).toEqual(first.meal!.nutrients); expect(saved.eatenAt).toBe(first.meal!.eatenAt); expect(saved.source).toMatchObject({ kind, model: 'original-estimate', opaque: 'Preserve source evidence' }); expect(saved.opaquePortableMetadata).toEqual({ keep: true }); expect(inferences).toEqual([]);
});

test('reference photo limits keep every existing photo and leave canonical data unchanged', async ({ page, context }) => {
  await context.route('https://**/*', route => route.abort()); await seedDashboardControlProfile(page);
  const before = await page.evaluate(async thumbnail => {
    const store = await import('/js/nutrition-store.js'), { state } = await import('/js/state.js'); await store.saveActiveProfileMeal({ id: 'full-photos', name: 'Four saved photos', mealType: 'lunch', eatenAt: '2026-10-20T12:00:00Z', nutrients: { energyKcal: 350 }, images: Array.from({ length: 4 }, (_, index) => ({ thumbnailUrl: thumbnail, fileName: 'original-' + index + '.png' })), source: { kind: 'manual' } });
    await (await import('/js/agent-tool-bindings.js')).navigateFromAgent({ view: 'nutritionEditor', recordId: 'full-photos', marker: '' });
    return (await import('/js/crypto.js')).encryptedGetItem((await import('/js/profile.js')).profileStorageKey(state.currentProfile, 'imported'));
  }, thumbnail);
  await page.getByRole('tab', { name: 'Photo', exact: true }).click(); await page.locator('#nutrition-reference-photo-input').setInputFiles({ name: 'fifth.png', mimeType: 'image/png', buffer: Buffer.from(thumbnail.split(',')[1]!, 'base64') });
  await expect(page.locator('.notification-toast').filter({ hasText: 'Existing photos were kept' }).first()).toBeVisible(); await expect(page.locator('#nutrition-photo-preview img')).toHaveCount(4);
  expect(await page.evaluate(async () => { const { state } = await import('/js/state.js'); return (await import('/js/crypto.js')).encryptedGetItem((await import('/js/profile.js')).profileStorageKey(state.currentProfile, 'imported')); })).toBe(before);
});

test('delayed reference photo preparation cannot attach into a retired native meal owner', async ({ page, context }) => {
  await context.route('https://**/*', route => route.abort());
  await routeJavaScript(page, '**/js/image-utils.js', `export * from '/js/image-utils.js?reference-owner-original'; import {resizeImageVariants as resize} from '/js/image-utils.js?reference-owner-original'; export async function resizeImageVariants(...args){if(globalThis.holdReferencePreparation){globalThis.referencePreparationStarted=true;await new Promise(resolve=>{globalThis.releaseReferencePreparation=resolve;});}try{return await resize(...args);}finally{globalThis.referencePreparationFinished=true;}}`);
  await seedDashboardControlProfile(page);
  const before = await page.evaluate(async thumbnail => {
    const store = await import('/js/nutrition-store.js'), { state } = await import('/js/state.js'); await store.saveActiveProfileMeal({ id: 'retired-photos', name: 'Original photo owner', mealType: 'lunch', eatenAt: '2026-10-20T12:00:00Z', nutrients: { energyKcal: 350 }, images: [{ thumbnailUrl: thumbnail, fileName: 'original.png' }], source: { kind: 'manual' } });
    await (await import('/js/agent-tool-bindings.js')).navigateFromAgent({ view: 'nutritionEditor', recordId: 'retired-photos', marker: '' }); Reflect.set(window, 'holdReferencePreparation', true);
    return { canonical: await (await import('/js/crypto.js')).encryptedGetItem((await import('/js/profile.js')).profileStorageKey(state.currentProfile, 'imported')), cache: await store.getNutritionMeal(state.currentProfile, 'retired-photos') };
  }, thumbnail);
  await page.getByRole('tab', { name: 'Photo', exact: true }).click(); await page.locator('#nutrition-reference-photo-input').setInputFiles({ name: 'retired-new.png', mimeType: 'image/png', buffer: Buffer.from(thumbnail.split(',')[1]!, 'base64') });
  await expect.poll(() => page.evaluate(() => Reflect.get(window, 'referencePreparationStarted'))).toBe(true);
  await page.evaluate(async () => { const { state } = await import('/js/state.js'); state.importedData = structuredClone(state.importedData); (Reflect.get(window, 'releaseReferencePreparation') as () => void)(); });
  await expect.poll(() => page.evaluate(() => Reflect.get(window, 'referencePreparationFinished'))).toBe(true);
  await expect(page.locator('.notification-toast').filter({ hasText: 'Existing photos were kept' }).first()).toBeVisible(); await expect(page.locator('#nutrition-photo-preview img')).toHaveCount(1);
  expect(await page.evaluate(async () => { const { state } = await import('/js/state.js'); return { canonical: await (await import('/js/crypto.js')).encryptedGetItem((await import('/js/profile.js')).profileStorageKey(state.currentProfile, 'imported')), cache: await (await import('/js/nutrition-store.js')).getNutritionMeal(state.currentProfile, 'retired-photos') }; })).toEqual(before);
});

test('an exact native EMF room file choice appends evidence without inference or replacing older sources', async ({ page, context }) => {
  await context.route('https://**/*', route => route.abort()); await seedDashboardControlProfile(page);
  const inferences: string[] = []; page.on('request', request => { if (request.method() === 'POST' && /chat\/completions|\/v1\/chat|\/api\/generate/.test(request.url())) inferences.push(request.url()); });
  const before = await page.evaluate(async thumbnail => {
    const { state } = await import('/js/state.js'); state.importedData.emfAssessment = { assessments: [{ id: 'reference-assessment', date: '2026-10-20', label: 'Exact reference report', opaqueAssessmentMetadata: { keep: true }, rooms: [{ id: 'reference-bedroom', name: 'Bedroom', sleeping: true, note: 'Keep this room', photos: [{ name: 'original.png', mediaType: 'image/png', base64: thumbnail.split(',')[1], opaquePhotoMetadata: 'Preserve original evidence' }], measurements: { acElectric: { value: 8, unit: 'V/m', meter: 'Original instrument', source: 'Original reading provenance' } }, sources: ['WiFi router'], mitigations: [] }, { id: 'unrelated-room', name: 'Living room', sleeping: false, note: 'Retain sibling room', measurements: {}, photos: [], sources: [], mitigations: [] }] }] };
    if (!await (await import('/js/data.js')).saveImportedData()) throw new Error('EMF photo fixture save failed');
    const key = (await import('/js/profile.js')).profileStorageKey(state.currentProfile, 'imported'), original = JSON.parse((await (await import('/js/crypto.js')).encryptedGetItem(key))!);
    const runtime = (await import('/js/agent-tool-runtime.js')).createAgentToolRuntime({ readContext: () => '', userMessage: 'Open this exact EMF assessment so I can attach room photos.', ...(await import('/js/agent-tool-bindings.js')).createBrowserAgentToolDependencies(state.currentProfile) });
    const read = await runtime.execute({ tool: 'getbased_read_data', arguments: { resource: 'emfAssessments', recordId: 'reference-assessment' } }); if (!read.success) throw new Error('Exact EMF read unavailable');
    const opened = await runtime.execute({ tool: 'getbased_navigate', arguments: { view: 'emfAssessment', recordId: 'reference-assessment' } }); if (!opened.success) throw new Error('Exact EMF handoff unavailable');
    return original;
  }, thumbnail);
  const input = page.locator('[data-emf-change-action="photos"][data-emf-assessment-id="reference-assessment"][data-emf-room-idx="0"]');
  await input.setInputFiles({ name: 'new-room-reference.png', mimeType: 'image/png', buffer: Buffer.from(thumbnail.split(',')[1]!, 'base64') });
  const read = () => page.evaluate(async () => { const { state } = await import('/js/state.js'); return JSON.parse((await (await import('/js/crypto.js')).encryptedGetItem((await import('/js/profile.js')).profileStorageKey(state.currentProfile, 'imported')))!); });
  await expect.poll(async () => (await read()).emfAssessment.assessments[0].rooms[0].photos.length).toBe(2);
  const after = await read(), assessment = after.emfAssessment.assessments[0], prior = before.emfAssessment.assessments[0];
  expect(assessment.rooms[0].photos[0]).toEqual(prior.rooms[0].photos[0]); expect(assessment.rooms[0].photos[1]).toMatchObject({ name: 'new-room-reference.png', base64: expect.any(String) });
  expect(assessment.rooms[0].measurements).toEqual(prior.rooms[0].measurements); expect(assessment.rooms[1]).toEqual(prior.rooms[1]); expect(assessment.opaqueAssessmentMetadata).toEqual(prior.opaqueAssessmentMetadata);
  expect(after.contextNotes).toBe(before.contextNotes); expect(after.entries).toEqual(before.entries); expect(after.nutritionMeals).toEqual(before.nutritionMeals); expect(inferences).toEqual([]);
});
