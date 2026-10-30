import { expect, test } from './coverage-fixture.js';
import { routeJavaScript } from '../helpers/browser-static-routes.js';
import type { AIToolCall } from '../../shared/ai-tool-protocol.js';
const cases = [
  ...(['custom', 'venice'] as const).flatMap(provider => (['native', 'structured'] as const).flatMap(protocol => ['apply', 'discard', 'reload'].map(scenario => ({ provider, protocol, scenario })))),
  ...['stale', 'failed-save', 'failed-proof', 'source', 'stale-undo', 'native'].map(scenario => ({ provider: 'custom' as const, protocol: 'native' as const, scenario })),
];
for (const { provider, protocol, scenario } of cases) test(`chart layers: ${provider} ${protocol} ${scenario}`, async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await routeJavaScript(page, '**/js/cloud-ai-consent.js', `export * from '/js/cloud-ai-consent.js?overlay-consent-original';export async function requestAIProcessingApproval(){return true;}export async function requireAIProcessingApproval(){}`);
  if (scenario === 'failed-proof') await routeJavaScript(page, '**/js/crypto.js', `export * from '/js/crypto.js?overlay-original';import * as native from '/js/crypto.js?overlay-original';export async function encryptedSetItem(key,...args){if(globalThis.__overlayProofFault&&key.includes('-app-control-'))throw new Error('Synthetic proof failure');return native.encryptedSetItem(key,...args);}`);
  const message = 'Show note markers, supplement periods and cycle phase at blood draw on my charts from now on.';
  let round = 0, controlId = '', feedback = false;
  const endpoint = provider === 'venice' ? 'https://api.venice.ai/api/v1/chat/completions' : 'https://overlay-provider.example/v1/chat/completions';
  await page.route(endpoint, async route => {
    const body = route.request().postDataJSON(); if (protocol === 'structured' && body.tools) { await route.fulfill({ status: 400, json: { error: { message: 'tools not supported by this model' } } }); return; }
    const thanks = body.messages.some((row: { role: string; content: unknown }) => row.role === 'user' && row.content === 'Thanks.'), interactive = body.messages.some((row: { role: string; content: unknown }) => row.role === 'user' && row.content === message);
    if (thanks) feedback = scenario === 'source' ? !body.messages[0].content.includes(controlId) : body.messages[0].content.includes(controlId) && body.messages[0].content.includes(`"status":"${scenario === 'discard' ? 'discarded' : 'changed'}"`);
    const result = () => { const raw = body.messages.at(-1).content, value = protocol === 'native' ? JSON.parse(raw) : JSON.parse(raw.slice(raw.indexOf('{"id":'))).output; expect(value.success).toBe(true); expect(JSON.stringify(value)).not.toMatch(/PRIVATE_|hasNotes|hasSupps|hasCycle|sourceFile/); return JSON.parse(value.contentItems[0].text); };
    let call: AIToolCall | undefined;
    if (!thanks && interactive) {
      if (round === 0) call = { id: 'overlay-read', type: 'function', function: { name: 'getbased_read_app', arguments: '{"action":"labs.overlays"}' } };
      if (round === 1) { const read = result(); expect(read.values).toEqual({ notes: false, supplements: false, cycle: false }); expect(read.reviewCreated).toBe(false); call = { id: 'overlay-review', type: 'function', function: { name: 'getbased_request_app', arguments: JSON.stringify({ action: 'labs.overlays', snapshotId: read.snapshotId, parameters: JSON.stringify({ notes: true, supplements: true, cycle: true }), reason: 'Explicit chart-layer preference', evidence: message }) } }; }
      if (round === 2) { const review = result(); expect(review.status).toBe('pending_user_approval'); expect(review.saved).toBe(false); controlId = review.controlId; } round++;
    }
    const reply = thanks ? 'You’re welcome.' : interactive ? 'Your chart-layer review is ready. Choose Apply to save it.' : 'Synthetic auxiliary reply.';
    if (protocol === 'structured') await route.fulfill({ json: { choices: [{ message: { content: JSON.stringify({ reply: call ? '' : reply, calls: call ? [{ id: call.id, name: call.function.name, arguments: call.function.arguments }] : [] }) }, finish_reason: 'stop' }] } });
    else await route.fulfill({ contentType: 'text/event-stream', body: `data: ${JSON.stringify({ choices: [{ delta: call ? { tool_calls: [{ index: 0, ...call }] } : { content: reply }, finish_reason: call ? 'tool_calls' : 'stop' }] })}\n\ndata: [DONE]\n\n` });
  });
  await page.addInitScript(() => { localStorage.setItem('labcharts-ai-paused', 'true'); localStorage.setItem('labcharts-analytics-disabled', 'true'); localStorage.setItem('labcharts-show-product-recs', 'false'); for (const suffix of ['tour', 'emptyTour']) localStorage.setItem(`labcharts-default-${suffix}`, 'completed'); });
  await page.goto('/app'); await page.locator('html[data-app-ready]').waitFor();
  const baseline = await page.evaluate(async provider => {
    const profile = await import('/js/profile.js'), { state } = await import('/js/state.js'), data = await import('/js/data.js'); const id = await profile.createProfile('Synthetic chat overlays', { sex: 'female', skipInitialSync: true });
    for (const suffix of ['tour', 'emptyTour']) localStorage.setItem(profile.profileStorageKey(id, suffix), 'completed'); for (const prefix of ['labcharts-onboard-extras-done-', 'labcharts-onboard-context-cards-skipped-']) localStorage.setItem(prefix + id, '1'); await profile.switchProfile(id);
    Object.assign(state.importedData, { contextNotes: 'PRIVATE_HEALTH', entries: [{ date: '2026-10-20', markers: { 'biochemistry.glucose': 5 }, context: { cyclePhase: 'luteal' }, sourceFile: 'PRIVATE_REPORT.pdf' }], notes: [{ date: '2026-10-20', text: 'PRIVATE_NOTE' }], supplements: [{ id: 'synthetic-supp', name: 'PRIVATE_THERAPY', startDate: '2026-10-01', type: 'supplement' }] });
    const source = await import('/js/context-source-registry.js'); for (const name of ['lab-markers', 'insight-cards', 'supplements-meds']) source.setContextSourceEnabled(name, true); if (!await data.saveImportedData()) throw new Error('Overlay fixture save failed'); await (await import('/js/nutrition-store.js')).reconcileNutritionMealsFromProfileData(id);
    await (await import('/js/lab-view-controls.js')).openLabView({ view: 'category', category: 'biochemistry', marker: '' }, () => true);
    const api = await import('/js/api.js'); if (provider === 'venice') { await api.saveVeniceKey('synthetic-key'); api.setVeniceModel('synthetic-overlay-model'); api.setVeniceE2EE(false); } else { await api.saveCustomApiConnection('https://overlay-provider.example/v1', 'synthetic-key'); api.setCustomApiModel('synthetic-overlay-model'); }
    api.setAIProvider(provider); api.setAIPaused(false); (await import('/js/agent-chat-settings.js')).setChatBackend('direct'); await (await import('/js/chat-loader.js')).openChatPanel();
    const key = profile.profileStorageKey(id, 'imported'); return { key, raw: (await (await import('/js/crypto.js')).encryptedGetItem(key))! };
  }, provider);
  const modes = () => page.evaluate(async () => (await import('/js/lab-overlay-preferences.js')).readLabOverlayPreferences()), health = () => page.evaluate(async key => (await import('/js/crypto.js')).encryptedGetItem(key), baseline.key);
  await page.locator('#chat-input').fill(message); await page.locator('#chat-send-btn').click(); const card = page.locator('.chat-app-control'); await expect(card).toContainText('Chart layers'); expect(round).toBe(3); expect(await modes()).toEqual({ notes: false, supplements: false, cycle: false }); expect(await health()).toBe(baseline.raw);
  if (scenario === 'reload') { await page.reload(); await page.locator('html[data-app-ready]').waitFor(); await page.evaluate(async () => { await (await import('/js/chat-loader.js')).openChatPanel(); }); await expect(card).toContainText('Chart-layer review expired'); await expect(card.getByRole('button', { name: 'Apply', exact: true })).toHaveCount(0); expect(await modes()).toEqual({ notes: false, supplements: false, cycle: false }); return; }
  if (scenario === 'discard') { await card.getByRole('button', { name: 'Discard', exact: true }).click(); await expect(card).toContainText('Discarded'); }
  else if (scenario === 'source') { await page.evaluate(async () => { (await import('/js/context-source-registry.js')).setContextSourceEnabled('insight-cards', false); (await import('/js/chat-render.js')).renderChatMessages(); }); await expect(card).toHaveCount(0); }
  else {
    if (scenario === 'stale' || scenario === 'native') await page.evaluate(async () => { (await import('/js/data-view-controls.js')).setNoteOverlay('on'); });
    if (scenario === 'stale' || scenario === 'native') await expect.poll(modes).toMatchObject({ notes: true });
    if (scenario === 'failed-save') await page.evaluate(() => { const write = Storage.prototype.setItem; Storage.prototype.setItem = function (key, value) { if (key.endsWith('-suppOverlay')) throw new Error('Synthetic overlay storage failure'); return write.call(this, key, value); }; });
    if (scenario === 'failed-proof') await page.evaluate(() => { (globalThis as typeof globalThis & { __overlayProofFault?: boolean }).__overlayProofFault = true; });
    await card.getByRole('button', { name: 'Apply', exact: true }).click();
    if (['stale', 'native', 'failed-save'].includes(scenario)) { await expect(card).toContainText('Nothing was applied'); expect(await modes()).toEqual({ notes: scenario !== 'failed-save', supplements: false, cycle: false }); expect(await health()).toBe(baseline.raw); return; }
    await expect(card).toContainText('Chart layers saved'); expect(await modes()).toEqual({ notes: true, supplements: true, cycle: true }); expect(await health()).toBe(baseline.raw);
    for (const action of ['set-note-overlay', 'set-supp-overlay', 'set-phase-overlay']) await expect(page.locator(`[data-lab-data-change="${action}"]`)).toBeChecked();
    if (scenario === 'failed-proof') { await expect(card.getByRole('button', { name: 'Undo', exact: true })).toHaveCount(0); return; }
    if (scenario === 'stale-undo') { await page.evaluate(async () => { await (await import('/js/lab-overlay-preferences.js')).commitLabOverlayPreferences({ notes: false }); }); await card.getByRole('button', { name: 'Undo', exact: true }).click(); await expect(card).toContainText('Chart layers saved'); await expect(card.getByRole('button', { name: 'Undo', exact: true })).toHaveCount(0); expect(await modes()).toEqual({ notes: false, supplements: true, cycle: true }); return; }
  }
  await page.locator('#chat-input').fill('Thanks.'); await page.locator('#chat-send-btn').click(); await expect(page.locator('#chat-messages')).toContainText('You’re welcome.'); expect(feedback).toBe(true); expect(await health()).toBe(baseline.raw);
  if (scenario === 'discard' || scenario === 'source') return;
  await page.reload(); await page.locator('html[data-app-ready]').waitFor(); await page.evaluate(async () => { await (await import('/js/chat-loader.js')).openChatPanel(); }); await expect(card).toContainText('Chart layers saved'); await card.getByRole('button', { name: 'Undo', exact: true }).click(); await expect(card).toContainText('Previous chart layers restored'); expect(await modes()).toEqual({ notes: false, supplements: false, cycle: false }); expect(await health()).toBe(baseline.raw);
  await page.reload(); await page.locator('html[data-app-ready]').waitFor(); await page.evaluate(async () => { await (await import('/js/chat-loader.js')).openChatPanel(); }); await expect(card).toContainText('Previous chart layers restored'); expect(errors).toEqual([]);
});
