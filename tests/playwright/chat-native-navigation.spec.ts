import { expect, test } from './coverage-fixture.js';
import { AGENT_CONTEXT_CARDS, AGENT_CONTEXT_CARD_LABELS } from '../../shared/agent-tool-contract.js';
import type { AppNavigationRequest } from '../../shared/app-navigation-contract.js';
import type { AIToolCall } from '../../shared/ai-tool-protocol.js';

const destinations: Array<{ request: Omit<AppNavigationRequest, 'marker'>; selector: string; text?: string }> = [
  ...['ai', 'display', 'voice', 'privacy', 'data', 'wearables', 'agent'].map(tab => ({ request: { view: `${tab}Settings` }, selector: `#settings-modal-overlay.show #settings-tab-${tab}.active` })),
  ...AGENT_CONTEXT_CARDS.map(card => ({ request: { view: 'contextEditor', card }, selector: '#modal-overlay.show #detail-modal', text: AGENT_CONTEXT_CARD_LABELS[card] })),
  { request: { view: 'category', category: 'biochemistry' }, selector: '#main-content', text: 'Biochemistry' },
  { request: { view: 'knowledgeBase' }, selector: '#kb-modal-overlay.show #kb-modal', text: 'Knowledge Base' },
  { request: { view: 'nutritionHistory' }, selector: '#modal-overlay.show [data-nutrition-history-view]', text: 'Meals & Nutrition' },
  { request: { view: 'nutritionHistory', subview: 'meals' }, selector: '#modal-overlay.show [data-nutrition-history-view]', text: 'Meals & Nutrition' },
  { request: { view: 'nutritionHistory', subview: 'trends' }, selector: '#modal-overlay.show [data-nutrition-history-view]', text: 'Meals & Nutrition' },
  { request: { view: 'nutritionEditor' }, selector: '#modal-overlay.show #nutrition-meal-name' },
  { request: { view: 'nutritionEditor', recordId: 'meal-fixture' }, selector: '#modal-overlay.show #nutrition-meal-name' },
  { request: { view: 'nutritionTargets' }, selector: '#modal-overlay.show .nutrition-targets-modal' },
  { request: { view: 'fluidLog' }, selector: '#modal-overlay.show .nutrition-fluid-modal' },
  { request: { view: 'lightDevices' }, selector: '.modal-overlay.show #add-device-custom' },
  { request: { view: 'lightDevice', recordId: 'device-fixture' }, selector: '.modal-overlay.show #dev-session-save' },
  { request: { view: 'sunSession', recordId: 'sun-fixture' }, selector: '.modal-overlay.show [data-light-detail-presentation][data-session-kind="sun"]', text: 'Sun session' },
  { request: { view: 'deviceSession', recordId: 'session-fixture' }, selector: '.modal-overlay.show [data-light-detail-presentation][data-session-kind="device"]', text: 'Synthetic Panel' },
  { request: { view: 'lightAssessment' }, selector: '#light-env-assessment-overlay.show' },
  { request: { view: 'emfAssessment', recordId: 'emf-fixture' }, selector: '#modal-overlay.show #detail-modal', text: 'Bedroom fixture' },
];

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('labcharts-ai-paused', 'true'); for (const suffix of ['tour', 'emptyTour']) localStorage.setItem(`labcharts-default-${suffix}`, 'completed'); });
  await page.goto('/app'); await page.locator('html[data-app-ready]').waitFor();
  await page.evaluate(async () => {
    const profiles = await import('/js/profile.js'), id = await profiles.createProfile('Synthetic native navigation', { sex: 'female', skipInitialSync: true });
    for (const suffix of ['tour', 'emptyTour']) localStorage.setItem(profiles.profileStorageKey(id, suffix), 'completed');
    for (const prefix of ['labcharts-onboard-extras-done-', 'labcharts-onboard-context-cards-skipped-']) localStorage.setItem(prefix + id, '1');
    await profiles.switchProfile(id); const { state } = await import('/js/state.js'), now = Date.now();
    state.importedData.contextNotes = 'PRIVATE_UNRELATED_NAVIGATION_NOTE'; state.importedData.healthGoals = [{ text: 'Keep the existing goal', severity: 'low' }];
    state.importedData.sunDefaults = { fitzpatrick: 'III' }; state.importedData.lightDevices = [{ id: 'device-fixture', brand: 'Synthetic', model: 'Panel', type: 'combined', peakWavelengths: [660, 850], peakShares: [0.5, 0.5], peakShareBasis: 'reported', mwPerCm2At15cm: 20, recommendedDistanceCm: 15, distanceModel: 'reference-only', irradianceBasis: 'user-entered' }];
    state.importedData.sunSessions = [{ id: 'sun-fixture', startedAt: now - 3600000, endedAt: now - 3000000, durationMin: 10, location: { lat: 12, lon: 45 }, bodyExposure: { fraction: 0.05, glassBetween: false, sunscreenSPF: 0, rotatedSides: false }, eyeExposure: { mode: 'direct', durationSec: 120 }, posture: 'standing', surfaceAlbedo: 'grass', doses: { vitamin_d: 2 }, safety: { sed: 1 }, calculationStatus: 'computed', engineVersion: 9 }];
    state.importedData.deviceSessions = [];
    state.importedData.emfAssessment = { assessments: [{ id: 'emf-fixture', date: '2026-10-20', label: 'Bedroom fixture', rooms: [{ name: 'Bedroom', sleeping: true, measurements: {}, sources: [], mitigations: [] }] }] };
    state.importedData.nutritionMeals = [{ id: 'meal-fixture', name: 'Stored meal fixture', eatenAt: new Date(now - 3600000).toISOString(), createdAt: new Date(now - 3600000).toISOString(), nutrients: { energyKcal: 250, proteinG: 20 }, note: 'Preserve this meal' }];
    if (!await (await import('/js/data.js')).saveImportedData()) throw new Error('Synthetic navigation seed failed');
    await (await import('/js/nutrition-store.js')).reconcileNutritionMealsFromProfileData(id);
    const session = await (await import('/js/light-devices-store.js')).logDeviceSession({ deviceId: 'device-fixture', durationMin: 10, distanceCm: 15, bodyArea: 'torso', eyesProtected: true });
    if (!session) throw new Error('Synthetic session seed failed'); session.id = 'session-fixture';
    if (!await (await import('/js/data.js')).saveImportedData()) throw new Error('Synthetic session seed failed');
  });
  // Qualify opening against a fully loaded native profile, after its normal
  // migration boundary. No migration differences are excluded from assertions.
  await page.reload();
  await page.locator('html[data-app-ready]').waitFor();
});

for (const { request, selector, text } of destinations) test(`chat navigation scope for ${JSON.stringify(request)} preserves saved data`, async ({ page }) => {
  const nativeOnly = !!request.subview || ['aiSettings', 'displaySettings', 'voiceSettings', 'privacySettings', 'dataSettings', 'wearablesSettings', 'agentSettings', 'knowledgeBase', 'lightDevices'].includes(request.view);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const before = await page.evaluate(async () => { const { state } = await import('/js/state.js'); return { root: structuredClone(state.importedData), saved: await (await import('/js/crypto.js')).encryptedGetItem((await import('/js/profile.js')).profileStorageKey(state.currentProfile, 'imported')) }; });
  const result = await page.evaluate(async request => {
    const { state } = await import('/js/state.js'), runtime = (await import('/js/agent-tool-runtime.js')).createAgentToolRuntime({ readContext: () => '', ...(await import('/js/agent-tool-bindings.js')).createBrowserAgentToolDependencies(state.currentProfile) });
    return runtime.execute({ tool: 'getbased_navigate', arguments: request });
  }, request);
  expect(result.success).toBe(!nativeOnly);
  expect(JSON.stringify(result)).not.toContain('PRIVATE_UNRELATED');
  if (nativeOnly) await expect(page.locator(selector)).toHaveCount(0);
  else {
    expect(JSON.parse(result.contentItems[0]!.text)).toMatchObject({ changed: true, opened: request.view, dataSaved: false, settingsSaved: false });
    await expect(page.locator(selector)).toBeVisible();
    if (text) await expect(page.locator(selector)).toContainText(text);
    if (request.view === 'nutritionEditor' && request.recordId) await expect(page.locator(selector)).toHaveValue('Stored meal fixture');
    if (request.view === 'emfAssessment') await expect(page.locator('.emf-assessment-card.expanded [data-emf-action="toggle-assessment"][data-emf-assessment-id="emf-fixture"]')).toBeVisible();
  }
  expect(await page.evaluate(async () => structuredClone((await import('/js/state.js')).state.importedData))).toEqual(before.root);
  await page.reload(); await page.locator('html[data-app-ready]').waitFor();
  expect(await page.evaluate(async () => { const { state } = await import('/js/state.js'); return await (await import('/js/crypto.js')).encryptedGetItem((await import('/js/profile.js')).profileStorageKey(state.currentProfile, 'imported')); })).toBe(before.saved);
  expect(errors).toEqual([]);
});

test('navigation preserves an existing native goal draft and refuses main-route and editor replacement', async ({ page }) => {
  await page.evaluate(async () => { await (await import('/js/agent-tool-bindings.js')).navigateFromAgent({ view: 'contextEditor', card: 'healthGoals', marker: '' }); });
  await page.locator('#goal-text-input').fill('Unsaved native goal');
  for (const view of ['aiSettings', 'knowledgeBase', 'nutritionEditor', 'dashboard']) {
    const result = await page.evaluate(async view => {
      const {state} = await import('/js/state.js');
      const runtime = (await import('/js/agent-tool-runtime.js')).createAgentToolRuntime({readContext: () => '', ...(await import('/js/agent-tool-bindings.js')).createBrowserAgentToolDependencies(state.currentProfile)});
      return runtime.execute({tool: 'getbased_navigate', arguments: {view}});
    }, view);
    if (view === 'nutritionEditor') { expect(result.success).toBe(true); expect(JSON.parse(result.contentItems[0].text).changed).toBe(false); }
    else expect(result.success).toBe(false);
    await expect(page.locator('#goal-text-input')).toHaveValue('Unsaved native goal');
  }
});

for (const boundary of ['thread', 'root', 'history', 'route', 'dialog'] as const) test(`a delayed navigation cannot publish after ${boundary} changes`, async ({ page }) => {
  let release!: () => void, reached!: () => void; const blocked = new Promise<void>(resolve => { release = resolve; }), started = new Promise<void>(resolve => { reached = resolve; });
  await page.route('**/js/app-native-navigation.js', async route => { reached(); await blocked; await route.continue(); });
  await page.evaluate(() => { void import('/js/agent-tool-bindings.js').then(async tools => { const result = await tools.navigateFromAgent({ view: 'contextEditor', card: 'healthGoals', marker: '' }); (globalThis as typeof globalThis & { navigationResult?: unknown }).navigationResult = result; }); });
  await started;
  await page.evaluate(async boundary => {
    const { state } = await import('/js/state.js');
    if (boundary === 'thread') state.currentThreadId = 'different-native-thread'; if (boundary === 'root') state.importedData = structuredClone(state.importedData); if (boundary === 'history') state.chatHistory = [...state.chatHistory];
    if (boundary === 'route') (await import('/js/route-lifecycle.js')).recordRouteChange();
    if (boundary === 'dialog') { const overlay = document.createElement('div'); overlay.id = 'held-native-dialog'; overlay.className = 'modal-overlay show'; overlay.innerHTML = '<textarea>Preserve native input</textarea>'; document.body.append(overlay); }
  }, boundary);
  release();
  await expect.poll(() => page.evaluate(() => (globalThis as typeof globalThis & { navigationResult?: unknown }).navigationResult)).toMatchObject({ changed: false });
  await expect(page.locator('#goal-text-input')).toHaveCount(0);
  if (boundary === 'dialog') await expect(page.locator('#held-native-dialog textarea')).toHaveValue('Preserve native input');
});

for (const view of ['nutritionEditor', 'lightDevice', 'sunSession', 'deviceSession', 'emfAssessment']) test(`an unknown exact ${view} record cannot open a create form or change data`, async ({ page }) => {
  const before = await page.evaluate(async () => structuredClone((await import('/js/state.js')).state.importedData));
  const result = await page.evaluate(async view => (await import('/js/agent-tool-bindings.js')).navigateFromAgent({ view, marker: '', recordId: 'missing-record' }), view);
  expect(result.changed).toBe(false); await expect(page.locator('.modal-overlay.show')).toHaveCount(0);
  expect(await page.evaluate(async () => structuredClone((await import('/js/state.js')).state.importedData))).toEqual(before);
});

for (const protocol of ['native', 'structured'] as const) for (const request of [{ view: 'contextEditor', card: 'healthGoals' }, { view: 'voiceSettings' }]) test(`${protocol} chat handles ${request.view} through the real tool loop without saving data`, async ({ page }) => {
  const nativeOnly = request.view === 'voiceSettings', reply = nativeOnly ? 'Use the native Voice settings. No data was saved.' : 'Opened the requested view. No data was saved.';
  let round = 0; const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.route('https://navigation-provider.example/v1/models', route => route.fulfill({ json: { data: [{ id: 'navigation-model' }] } }));
  await page.route('https://navigation-provider.example/v1/chat/completions', async route => {
    const body = route.request().postDataJSON();
    if (protocol === 'structured' && body.tools) { await route.fulfill({ status: 400, json: { error: { message: 'tools not supported by this model' } } }); return; }
    let call: AIToolCall | undefined;
    if (round === 0) call = { id: 'open-requested-view', type: 'function', function: { name: 'getbased_navigate', arguments: JSON.stringify(request) } };
    else {
      const text = body.messages.at(-1).content, feedback = protocol === 'native' ? JSON.parse(text) : JSON.parse(text.slice(text.indexOf('{"id":'))).output;
      expect(feedback.success).toBe(!nativeOnly);
      if (!nativeOnly) expect(JSON.parse(feedback.contentItems[0].text)).toMatchObject({ changed: true, opened: request.view, dataSaved: false, settingsSaved: false });
    }
    round++;
    if (protocol === 'structured') await route.fulfill({ json: { choices: [{ message: { content: JSON.stringify({ reply: call ? '' : reply, calls: call ? [{ id: call.id, name: call.function.name, arguments: call.function.arguments }] : [] }) }, finish_reason: 'stop' }] } });
    else await route.fulfill({ contentType: 'text/event-stream', body: `data: ${JSON.stringify({ choices: [{ delta: call ? { tool_calls: [{ index: 0, ...call }] } : { content: reply }, finish_reason: call ? 'tool_calls' : 'stop' }] })}\n\ndata: [DONE]\n\n` });
  });
  const baseline = await page.evaluate(async () => {
    const api = await import('/js/api.js'); await api.saveCustomApiConnection('https://navigation-provider.example/v1', 'SYNTHETIC_NAVIGATION_KEY'); api.setCustomApiModel('navigation-model'); api.setAIProvider('custom'); api.setAIPaused(false);
    localStorage.setItem('labcharts-custom-models', JSON.stringify([{ id: 'navigation-model', name: 'Navigation model' }]));
    const consent = await import('/js/cloud-ai-consent.js'), scope = consent.cloudAIConsentDetails('custom').scope;
    localStorage.setItem(consent.AI_TRANSPARENCY_KEY, JSON.stringify({ version: consent.AI_TRANSPARENCY_VERSION, acknowledged: true }));
    localStorage.setItem(consent.CLOUD_AI_CONSENT_KEY, JSON.stringify({ version: consent.CLOUD_AI_CONSENT_VERSION, approvals: { [scope]: { accepted: true } } }));
    (await import('/js/agent-chat-settings.js')).setChatBackend('direct'); await (await import('/js/chat-loader.js')).openChatPanel();
    const { state } = await import('/js/state.js'); return await (await import('/js/crypto.js')).encryptedGetItem((await import('/js/profile.js')).profileStorageKey(state.currentProfile, 'imported'));
  });
  await page.locator('#chat-input').fill(request.view === 'voiceSettings' ? 'Open Voice settings.' : 'Open my Health Goals editor.'); await page.locator('#chat-send-btn').click();
  await expect(page.locator('#chat-messages')).toContainText(reply);
  if (nativeOnly) await expect(page.locator('#settings-modal-overlay.show')).toHaveCount(0);
  else await expect(page.locator('#modal-overlay.show #goal-text-input')).toBeVisible();
  await expect(page.locator('.chat-app-control,.chat-proposal')).toHaveCount(0);
  await page.reload(); await page.locator('html[data-app-ready]').waitFor(); expect(await page.evaluate(async () => { const { state } = await import('/js/state.js'); return await (await import('/js/crypto.js')).encryptedGetItem((await import('/js/profile.js')).profileStorageKey(state.currentProfile, 'imported')); })).toBe(baseline);
  expect(round).toBe(2); expect(errors).toEqual([]);
});

for (const target of [
  { request: { view: 'contextEditor', card: 'diet' }, asset: '**/js/context-card-lifestyle-editors-impl.js' },
  { request: { view: 'knowledgeBase' }, asset: '**/js/lens-knowledge-base-ui.js' },
  { request: { view: 'nutritionEditor' }, asset: '**/js/nutrition.js' },
  { request: { view: 'wearablesSettings' }, asset: '**/css/wearables.css' },
]) test(`a late native ${target.request.view} load cannot open in a different conversation`, async ({ page }) => {
  if (['knowledgeBase', 'wearablesSettings'].includes(target.request.view)) {
    let loads = 0; await page.route(target.asset, route => {loads++; return route.continue();});
    const before = await page.evaluate(async () => JSON.stringify((await import('/js/state.js')).state.importedData));
    const result = await page.evaluate(async request => {
      const {state} = await import('/js/state.js');
      const runtime = (await import('/js/agent-tool-runtime.js')).createAgentToolRuntime({readContext: () => '', ...(await import('/js/agent-tool-bindings.js')).createBrowserAgentToolDependencies(state.currentProfile)});
      return runtime.execute({tool: 'getbased_navigate', arguments: request});
    }, target.request);
    expect(result.success).toBe(false); expect(loads).toBe(0);
    await expect(page.locator('.modal-overlay.show')).toHaveCount(0);
    expect(await page.evaluate(async () => JSON.stringify((await import('/js/state.js')).state.importedData))).toBe(before);
    return;
  }
  let release!: () => void, reached!: () => void; const blocked = new Promise<void>(resolve => { release = resolve; }), started = new Promise<void>(resolve => { reached = resolve; });
  await page.route(target.asset, async route => { reached(); await blocked; await route.continue(); });
  await page.evaluate(request => { void import('/js/agent-tool-bindings.js').then(async tools => { const result = await tools.navigateFromAgent({ ...request, marker: '' }); (globalThis as typeof globalThis & { lateNativeOpen?: unknown }).lateNativeOpen = result; }); }, target.request);
  await started; await page.evaluate(async () => { (await import('/js/state.js')).state.currentThreadId = 'different-thread-during-native-load'; }); release();
  await expect.poll(() => page.evaluate(() => (globalThis as typeof globalThis & { lateNativeOpen?: unknown }).lateNativeOpen)).toMatchObject({ changed: false });
  await expect(page.locator('.modal-overlay.show')).toHaveCount(0);
});
