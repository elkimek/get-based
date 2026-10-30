import { expect, test } from './coverage-fixture.js';
import { routeJavaScript } from '../helpers/browser-static-routes.js';
import type { Page } from '@playwright/test';
import type { AIToolCall } from '../../shared/ai-tool-protocol.js';
import type { AppNavigationRequest } from '../../shared/app-navigation-contract.js';
const dates = ['2026-01-01', '2026-05-01', '2026-10-20'] as const;
test.beforeEach(async ({ page }) => {
  await routeJavaScript(page, '**/js/cloud-ai-consent.js', `export * from '/js/cloud-ai-consent.js?comparison-original';export async function requestAIProcessingApproval(){return true;}export async function requireAIProcessingApproval(){}`);
  await page.addInitScript(() => { localStorage.setItem('labcharts-ai-paused', 'true'); localStorage.setItem('labcharts-analytics-disabled', 'true'); for (const suffix of ['tour', 'emptyTour']) localStorage.setItem(`labcharts-default-${suffix}`, 'completed'); });
  await page.goto('/app'); await page.locator('html[data-app-ready]').waitFor();
  await page.evaluate(async dates => {
    const profile = await import('/js/profile.js'), id = await profile.createProfile('Synthetic comparison dates', { sex: 'female', skipInitialSync: true });
    for (const suffix of ['tour', 'emptyTour']) localStorage.setItem(profile.profileStorageKey(id, suffix), 'completed'); for (const prefix of ['labcharts-onboard-extras-done-', 'labcharts-onboard-context-cards-skipped-']) localStorage.setItem(prefix + id, '1'); await profile.switchProfile(id);
    const { state } = await import('/js/state.js'); state.compareDate1 = state.compareDate2 = null; state.currentThreadId = 'synthetic-comparison-thread'; state.chatHistory = [];
    state.importedData.entries = dates.map((date, i) => ({ date, markers: { 'biochemistry.glucose': 4 + i }, sourceFile: 'PRIVATE_REPORT.pdf' }));
    state.importedData.entries.push({ date: '2026-10-27', markers: { 'privateOnly.fixture': 42 }, sourceFile: 'PRIVATE_REPORT.pdf' });
    state.importedData.customMarkers = { 'privateOnly.fixture': { markerId: 'custom:comparison-private', name: 'PRIVATE_MARKER', unit: '', categoryLabel: 'PRIVATE_GROUP', contextGroup: 'PRIVATE_GROUP', group: 'PRIVATE_GROUP' } }; state.importedData.contextNotes = 'PRIVATE_NOTE';
    (await import('/js/context-source-registry.js')).setContextSourceEnabled('lab-markers', true); const groups = await import('/js/lab-context-settings.js'); groups.setGroupInAIContext('Biochemistry', true); groups.setGroupInAIContext('PRIVATE_GROUP', false);
    if (!await (await import('/js/data.js')).saveImportedData()) throw new Error('Synthetic comparison seed failed'); await (await import('/js/nutrition-store.js')).reconcileNutritionMealsFromProfileData(id);
  }, dates);
});
const health = (page: Page) => page.evaluate(async () => { const { state } = await import('/js/state.js'); return (await import('/js/crypto.js')).encryptedGetItem((await import('/js/profile.js')).profileStorageKey(state.currentProfile, 'imported')); });
const snapshot = (page: Page) => page.evaluate(async () => (await import('/js/comparison-view-controls.js')).readLabComparison((await import('/js/state.js')).state.currentProfile));
const navigate = async (page: Page, request: Omit<AppNavigationRequest, 'marker'>) => { const result = await page.evaluate(async request => {
  const { state } = await import('/js/state.js'), tools = (await import('/js/agent-tool-runtime.js')).createAgentToolRuntime({ readContext: () => '', ...(await import('/js/agent-tool-bindings.js')).createBrowserAgentToolDependencies(state.currentProfile) });
  return tools.execute({ tool: 'getbased_navigate', arguments: request });
}, request); expect(result.success).toBe(true); return JSON.parse(result.contentItems[0]!.text); };
async function pair(page: Page, first: string, second: string) { await expect(page.locator('#compare-select-1')).toHaveValue(first); await expect(page.locator('#compare-select-2')).toHaveValue(second); await expect(page.locator('#compare-results .compare-table-wrapper table')).toBeVisible(); }

for (const provider of ['custom', 'venice'] as const) for (const protocol of ['native', 'structured'] as const) test(`comparison chat: ${provider} ${protocol} selects either side, swaps and preserves records`, async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message)); const before = await health(page);
  const messages = ['Compare my latest labs with the previous collection date.', 'Use January 1, 2026 on the first side.', 'Use May 1, 2026 on the second side.', 'Swap the two comparison dates.', 'I am taking a short break.']; let round = 0, completed = 0;
  await page.route(provider === 'venice' ? 'https://api.venice.ai/api/v1/chat/completions' : 'https://comparison-provider.example/v1/chat/completions', async route => {
    const body = route.request().postDataJSON(); if (protocol === 'structured' && body.tools) { await route.fulfill({ status: 400, json: { error: { message: 'tools not supported by this model' } } }); return; }
    const message = body.messages.filter((row: { role: string; content: unknown }) => row.role === 'user' && messages.includes(row.content as string)).at(-1)?.content, turn = messages.indexOf(message); let call: AIToolCall | undefined;
    const output = () => { const raw = body.messages.at(-1).content, result = protocol === 'native' ? JSON.parse(raw) : JSON.parse(raw.slice(raw.indexOf('{"id":'))).output; expect(result.success).toBe(true); return JSON.parse(result.contentItems[0].text); };
    if (turn >= 0 && turn < 4) {
      if (round === 0) call = { id: 'comparison-read-' + turn, type: 'function', function: { name: 'getbased_read_app', arguments: '{"action":"labs.comparison"}' } };
      if (round === 1) { const read = output(); expect(read.dates).toEqual(dates); expect(JSON.stringify(read)).not.toMatch(/PRIVATE_|2026-10-27|glucose|sourceFile/); call = { id: 'comparison-open-' + turn, type: 'function', function: { name: 'getbased_navigate', arguments: JSON.stringify({ view: 'compare', snapshotId: read.snapshotId, ...(turn === 0 ? read.latestPair : turn === 1 ? { firstDate: dates[0] } : turn === 2 ? { secondDate: dates[1] } : { swapDates: true }) }) } }; }
      if (round === 2) { expect(output()).toMatchObject({ opened: 'compare', dataSaved: false, settingsSaved: false }); completed++; }
      round = call ? round + 1 : 0;
    }
    const reply = turn === 4 ? 'Enjoy your break.' : turn >= 0 ? 'The requested comparison is open.' : 'Synthetic auxiliary reply.';
    if (protocol === 'structured') await route.fulfill({ json: { choices: [{ message: { content: JSON.stringify({ reply: call ? '' : reply, calls: call ? [{ id: call.id, name: call.function.name, arguments: call.function.arguments }] : [] }) }, finish_reason: 'stop' }] } });
    else await route.fulfill({ contentType: 'text/event-stream', body: `data: ${JSON.stringify({ choices: [{ delta: call ? { tool_calls: [{ index: 0, ...call }] } : { content: reply }, finish_reason: call ? 'tool_calls' : 'stop' }] })}\n\ndata: [DONE]\n\n` });
  });
  await page.evaluate(async provider => { const api = await import('/js/api.js'); if (provider === 'venice') { await api.saveVeniceKey('synthetic-key'); api.setVeniceModel('synthetic-comparison-model'); api.setVeniceE2EE(false); } else { await api.saveCustomApiConnection('https://comparison-provider.example/v1', 'synthetic-key'); api.setCustomApiModel('synthetic-comparison-model'); } api.setAIProvider(provider); api.setAIPaused(false); (await import('/js/agent-chat-settings.js')).setChatBackend('direct'); await (await import('/js/chat-loader.js')).openChatPanel(); }, provider);
  const pairs = [[dates[1], dates[2]], [dates[0], dates[2]], [dates[0], dates[1]], [dates[1], dates[0]]] as const;
  for (let i = 0; i < 4; i++) { await page.locator('#chat-input').fill(messages[i]!); await page.locator('#chat-send-btn').click(); await expect.poll(() => completed).toBe(i + 1); await expect(page.locator('#chat-send-btn')).not.toHaveClass(/(?:^|\s)streaming(?:\s|$)/); await pair(page, pairs[i]![0], pairs[i]![1]); expect(await health(page)).toBe(before); }
  await page.locator('#chat-input').fill(messages[4]!); await page.locator('#chat-send-btn').click(); await expect(page.locator('#chat-messages')).toContainText('Enjoy your break.'); expect(completed).toBe(4); await pair(page, dates[1], dates[0]); await expect(page.locator('.chat-app-control,.chat-agent-draft-pending')).toHaveCount(0); expect(await health(page)).toBe(before); expect(errors).toEqual([]);
  await page.reload(); await page.locator('html[data-app-ready]').waitFor(); expect(await health(page)).toBe(before);
});

for (const cause of ['source', 'selection', 'inventory', 'editor', 'thread'] as const) test(`comparison rejects a retired ${cause} snapshot through the actual native port`, async ({ page }) => {
  const read = await snapshot(page); expect(typeof read.snapshotId).toBe('string');
  await page.evaluate(async cause => { const { state } = await import('/js/state.js');
    if (cause === 'source') (await import('/js/context-source-registry.js')).setContextSourceEnabled('lab-markers', false);
    if (cause === 'selection') state.compareDate1 = '2026-01-01';
    if (cause === 'inventory') { state.importedData.entries.push({ date: '2026-10-25', markers: { 'biochemistry.glucose': 8 } }); (await import('/js/data.js')).invalidateActiveDataCache(); }
    if (cause === 'editor') { const modal = document.createElement('div'); modal.className = 'modal-overlay show'; document.body.append(modal); }
    if (cause === 'thread') state.currentThreadId = 'synthetic-replacement-thread';
  }, cause);
  const before = await health(page), selection = await page.evaluate(async () => { const { state } = await import('/js/state.js'); return [state.compareDate1, state.compareDate2]; });
  expect(await navigate(page, { view: 'compare', snapshotId: read.snapshotId!, firstDate: dates[1], secondDate: dates[2] })).toMatchObject({ changed: false });
  expect(await page.evaluate(async () => { const { state } = await import('/js/state.js'); return [state.compareDate1, state.compareDate2]; })).toEqual(selection); expect(await health(page)).toBe(before); await expect(page.locator('#compare-select-1')).toHaveCount(0);
});
test('native selectors and swap invalidate old snapshots and retain the same deterministic table', async ({ page }) => {
  const before = await health(page), read = await snapshot(page); expect(await navigate(page, { view: 'compare', snapshotId: read.snapshotId!, firstDate: dates[0], secondDate: dates[2] })).toMatchObject({ opened: 'compare', dataSaved: false });
  const stale = await snapshot(page); await page.locator('#compare-select-1').selectOption(dates[1]); await pair(page, dates[1], dates[2]);
  expect(await navigate(page, { view: 'compare', snapshotId: stale.snapshotId!, swapDates: true })).toMatchObject({ changed: false }); await pair(page, dates[1], dates[2]);
  await page.getByRole('button', { name: 'Swap dates', exact: true }).click(); await pair(page, dates[2], dates[1]); expect(await health(page)).toBe(before);
});
for (const cause of ['thread', 'source', 'editor'] as const) test(`comparison loading cannot commit after ${cause} ownership retires`, async ({ page }) => {
  const read = await snapshot(page), before = await health(page); let reached!: () => void, release!: () => void;
  const started = new Promise<void>(resolve => { reached = resolve; }), blocked = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/js/compare-correlations.js', async route => { reached(); await blocked; await route.continue(); });
  await page.evaluate(snapshotId => { void import('/js/agent-tool-bindings.js').then(async tools => { const result = await tools.navigateFromAgent({ view: 'compare', marker: '', snapshotId, firstDate: '2026-05-01', secondDate: '2026-10-20' }); (globalThis as typeof globalThis & { comparisonRaceReceipt?: unknown }).comparisonRaceReceipt = result; }); }, read.snapshotId!);
  await started; await page.evaluate(async cause => { if (cause === 'thread') (await import('/js/state.js')).state.currentThreadId = 'replacement-comparison-thread'; else if (cause === 'source') (await import('/js/context-source-registry.js')).setContextSourceEnabled('lab-markers', false); else { const modal = document.createElement('div'); modal.className = 'modal-overlay show'; document.body.append(modal); } }, cause); release();
  await expect.poll(() => page.evaluate(() => (globalThis as typeof globalThis & { comparisonRaceReceipt?: unknown }).comparisonRaceReceipt)).toMatchObject({ changed: false });
  expect(await page.evaluate(async () => { const { state } = await import('/js/state.js'); return [state.compareDate1, state.compareDate2]; })).toEqual([null, null]); await expect(page.locator('#compare-select-1')).toHaveCount(0); expect(await health(page)).toBe(before);
});
