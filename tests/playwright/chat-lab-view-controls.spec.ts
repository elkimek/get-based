import { expect, test } from './coverage-fixture.js';
import type { AIToolCall } from '../../shared/ai-tool-protocol.js';
import type { AppNavigationRequest } from '../../shared/app-navigation-contract.js';
const ranges = [{ range: 'all', count: 4, label: 'All' }, { range: '3m', count: 1, label: '3M' }, { range: '6m', count: 2, label: '6M' }, { range: '1y', count: 2, label: '1Y' }];
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('labcharts-ai-paused', 'true'); for (const key of ['tour', 'emptyTour']) localStorage.setItem(`labcharts-default-${key}`, 'completed'); });
  await page.goto('/app');
  await page.evaluate(async () => {
    const profiles = await import('/js/profile.js'), id = await profiles.createProfile('Synthetic lab views', { sex: 'female', skipInitialSync: true });
    for (const key of ['tour', 'emptyTour']) localStorage.setItem(profiles.profileStorageKey(id, key), 'completed');
    for (const prefix of ['labcharts-onboard-extras-done-', 'labcharts-onboard-context-cards-skipped-']) localStorage.setItem(prefix + id, '1'); await profiles.switchProfile(id);
    const { state } = await import('/js/state.js'), today = Date.now(), dates = [500, 150, 30, -30].map(days => new Date(today - days * 86400000).toISOString().slice(0, 10));
    state.importedData.entries = dates.map((date, index) => ({ date, markers: { 'biochemistry.glucose': [4.1, 5.2, 6.3, 7.4][index]!, ...(index === 0 ? { 'olderFixture.marker': 123 } : {}) } }));
    state.importedData.customMarkers = { 'olderFixture.marker': { name: 'Older marker fixture', categoryLabel: 'Older fixture', unit: 'unit', refMin: 0, refMax: 200 } };
    state.importedData.contextNotes = 'PRIVATE_PRESERVED_LAB_CONTEXT'; state.dateRangeFilter = 'all'; state.categoryView = 'charts';
    if (!await (await import('/js/data.js')).saveImportedData()) throw new Error('Synthetic lab view seed failed');
    await (await import('/js/nutrition-store.js')).reconcileNutritionMealsFromProfileData(id);
    (await import('/js/data.js')).invalidateActiveDataCache();
  });
});
const current = async (page: import('@playwright/test').Page) => page.evaluate(async () => {
  const { state } = await import('/js/state.js'); return { profile: structuredClone(state.importedData), range: state.dateRangeFilter, layout: state.categoryView,
    saved: await (await import('/js/crypto.js')).encryptedGetItem((await import('/js/profile.js')).profileStorageKey(state.currentProfile, 'imported')) };
});
const navigate = async (page: import('@playwright/test').Page, request: Omit<AppNavigationRequest, 'marker'>) => page.evaluate(async request => {
  const {range,...healthRequest}=request;
  if(range) (await import('/js/data-view-controls.js')).setDateRange(range,{navigate:false});
  const { state } = await import('/js/state.js'); return (await import('/js/agent-tool-runtime.js')).createAgentToolRuntime({ readContext: () => '', ...(await import('/js/agent-tool-bindings.js')).createBrowserAgentToolDependencies(state.currentProfile) }).execute({ tool: 'getbased_navigate', arguments: healthRequest });
}, request);

for (const { range, count, label } of ranges) for (const layout of ['charts', 'table', 'heatmap']) test(`native category ${layout} ${range} matches native tabs and history without altering records`, async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message)); const before = await current(page);
  const result = await navigate(page, { view: 'category', category: 'biochemistry', range });
  expect(result.success).toBe(true); expect(JSON.parse(result.contentItems[0]!.text)).toMatchObject({ changed: true, opened: 'category', labRange: range, dataSaved: false, settingsSaved: false });
  await page.getByRole('tab', { name: layout[0]!.toUpperCase() + layout.slice(1), exact: true }).click();
  await expect(page.getByRole('tab', { name: layout[0]!.toUpperCase() + layout.slice(1), exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('group', { name: 'Lab date range', exact: true }).getByRole('button', { name: label, exact: true })).toHaveAttribute('aria-pressed', 'true');
  const history = await page.evaluate(async () => (await import('/js/agent-tool-bindings.js')).readAgentMarkerHistory({ marker: 'biochemistry.glucose', limit: 100 }));
  expect(history).toMatchObject({ available: true, historyScope: range, totalValuesInRange: count, marker: { latestValue: range === 'all' ? 7.4 : 6.3 } });
  if (layout === 'charts') await expect(page.locator('#view-content .charts-grid canvas').first()).toBeVisible();
  else await expect(page.locator(`#view-content .${layout === 'table' ? 'data-table-wrapper' : 'heatmap-wrapper'}`)).toBeVisible();
  const after = await current(page); expect(after.profile).toEqual(before.profile); expect(after.saved).toBe(before.saved);
  await page.reload(); expect((await current(page)).saved).toBe(before.saved); expect(errors).toEqual([]);
});

for (const { range, count } of ranges) test(`native Labs selects ${range} and permits explicit older-history reads`, async ({ page }) => {
  const before = await current(page), result = await navigate(page, { view: 'labs', range });
  expect(result.success).toBe(true); expect(JSON.parse(result.contentItems[0]!.text)).toMatchObject({ opened: 'labs' });
  const history = await page.evaluate(async () => {
    const api = await import('/js/agent-tool-bindings.js'); return { visible: api.readAgentMarkerHistory({ marker: 'biochemistry.glucose', limit: 100 }), explicit: api.readAgentMarkerHistory({ marker: 'biochemistry.glucose', from: '2000-01-01', to: '2100-01-01', limit: 100 }) };
  });
  expect((await current(page)).range).toBe(range); expect(history.visible).toMatchObject({ totalValuesInRange: count }); expect(history.explicit).toMatchObject({ totalValuesInRange: 4, historyScope: 'explicit dates' }); expect((await current(page)).saved).toBe(before.saved);
});

test('a category with only older results stays empty in a recent range and All recovers them', async ({ page }) => {
  const before = await current(page); expect((await navigate(page, { view: 'category', category: 'olderFixture', range: '3m' })).success).toBe(true);
  await expect(page.locator('#view-content')).toContainText('No results');
  expect(await page.evaluate(async () => (await import('/js/agent-tool-bindings.js')).readAgentMarkerHistory({ marker: 'olderFixture.marker', limit: 100 }))).toMatchObject({ totalValuesInRange: 0, values: [], marker: { latestValue: null } });
  await navigate(page, { view: 'category', category: 'olderFixture', range: 'all' }); await expect(page.locator('#view-content')).toContainText('123'); expect((await current(page)).saved).toBe(before.saved);
});

test('unknown categories and retired lazy opens cannot publish session filters', async ({ page }) => {
  const before = await current(page), result = await navigate(page, { view: 'category', category: 'missing' });
  expect(JSON.parse(result.contentItems[0]!.text)).toMatchObject({ changed: false }); expect(await current(page)).toEqual(before);
  let reached!: () => void, release!: () => void; const started = new Promise<void>(resolve => { reached = resolve; }), blocked = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/js/category-page-view.js', async route => { reached(); await blocked; await route.continue(); });
  await page.evaluate(() => { void import('/js/agent-tool-bindings.js').then(async tools => { const result = await tools.navigateFromAgent({ view: 'category', marker: '', category: 'biochemistry' }); (globalThis as typeof globalThis & { heldLabView?: unknown }).heldLabView = result; }); });
  await started; await page.evaluate(async () => { (await import('/js/state.js')).state.currentThreadId = 'different-lab-thread'; }); release();
  await expect.poll(() => page.evaluate(() => (globalThis as typeof globalThis & { heldLabView?: unknown }).heldLabView)).toMatchObject({ changed: false });
  const after = await current(page); expect(after.range).toBe(before.range); expect(after.layout).toBe(before.layout); expect(after.saved).toBe(before.saved);
});

for (const protocol of ['native', 'structured'] as const) test(`${protocol} real chat opens the health view with a manually selected native range and reads matching history`, async ({ page }) => {
  await page.evaluate(async () => (await import('/js/data-view-controls.js')).setDateRange('6m', {navigate:false}));
  let round = 0; const before = await current(page);
  await page.route('https://lab-view-provider.example/v1/chat/completions', async route => {
    const body = route.request().postDataJSON(); if (protocol === 'structured' && body.tools) { await route.fulfill({ status: 400, json: { error: { message: 'tools not supported by this model' } } }); return; }
    let call: AIToolCall | undefined;
    if (round === 0) call = { id: 'view', type: 'function', function: { name: 'getbased_navigate', arguments: '{"view":"category","category":"biochemistry"}' } };
    if (round === 1) call = { id: 'history', type: 'function', function: { name: 'getbased_marker_history', arguments: '{"marker":"biochemistry.glucose"}' } };
    if (round === 2) { const text = body.messages.at(-1).content, feedback = protocol === 'native' ? JSON.parse(text) : JSON.parse(text.slice(text.indexOf('{"id":'))).output; expect(feedback.success).toBe(true); expect(JSON.parse(feedback.contentItems[0].text)).toMatchObject({ historyScope: '6m', totalValuesInRange: 2, marker: { latestValue: 6.3 } }); }
    round++;
    if (protocol === 'structured') await route.fulfill({ json: { choices: [{ message: { content: JSON.stringify({ reply: call ? '' : 'The six month lab view is open.', calls: call ? [{ id: call.id, name: call.function.name, arguments: call.function.arguments }] : [] }) }, finish_reason: 'stop' }] } });
    else await route.fulfill({ contentType: 'text/event-stream', body: `data: ${JSON.stringify({ choices: [{ delta: call ? { tool_calls: [{ index: 0, ...call }] } : { content: 'The six month lab view is open.' }, finish_reason: call ? 'tool_calls' : 'stop' }] })}\n\ndata: [DONE]\n\n` });
  });
  await page.evaluate(async () => {
    const api = await import('/js/api.js'); await api.saveCustomApiConnection('https://lab-view-provider.example/v1', 'SYNTHETIC_KEY'); api.setCustomApiModel('view-model'); api.setAIProvider('custom'); api.setAIPaused(false);
    localStorage.setItem('labcharts-custom-models', JSON.stringify([{ id: 'view-model', name: 'View model' }]));
    const consent = await import('/js/cloud-ai-consent.js'), scope = consent.cloudAIConsentDetails('custom').scope;
    localStorage.setItem(consent.AI_TRANSPARENCY_KEY, JSON.stringify({ version: consent.AI_TRANSPARENCY_VERSION, acknowledged: true })); localStorage.setItem(consent.CLOUD_AI_CONSENT_KEY, JSON.stringify({ version: consent.CLOUD_AI_CONSENT_VERSION, approvals: { [scope]: { accepted: true } } }));
    (await import('/js/agent-chat-settings.js')).setChatBackend('direct'); await (await import('/js/chat-loader.js')).openChatPanel();
  });
  await page.locator('#chat-input').fill('Open Biochemistry and read my glucose using the range I selected.'); await page.locator('#chat-send-btn').click();
  await expect(page.locator('#chat-messages')).toContainText('The six month lab view is open.'); await expect(page.getByRole('tab', { name: 'Charts', exact: true })).toHaveAttribute('aria-selected', 'true');
  expect((await current(page)).saved).toBe(before.saved); expect(round).toBe(3);
});
