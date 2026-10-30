import { expect, test } from './coverage-fixture.js';
import { seedDashboardControlProfile, dashboardHealth } from '../helpers/dashboard-control-fixture.js';
import { routeJavaScript } from '../helpers/browser-static-routes.js';
const targets = [
  { view: 'healthImport', selector: '#chat-context-menu[open] [data-chat-action="import-health-file"]', text: 'Open the health import file choice.' },
  { view: 'reportBuilder', subview: 'personal', range: '3m', selector: '#report-builder-overlay.show', text: 'Prepare a lab report for the last three months.' },
  { view: 'profileShare', selector: '#profile-share-overlay.show', text: 'Open sharing review for this profile.' },
  { view: 'lightTools', selector: '#main-content [data-light-tool-view]', text: 'Open the light measurement tools.' },
  { view: 'dataSettings', selector: '#settings-tab-data.active', text: 'Open native data export and backup options.' },
] as const;
for (const provider of ['custom', 'venice'] as const) for (const protocol of ['native', 'structured'] as const) for (const target of targets) test(`${provider} ${protocol} opens ${target.view} as a human handoff`, async ({ page, context }) => {
  await context.route('https://**/*', route => route.abort());
  await routeJavaScript(page, '**/js/cloud-ai-consent.js', `export * from '/js/cloud-ai-consent.js?native-handoff-original'; export async function requestAIProcessingApproval(){return true;} export async function requireAIProcessingApproval(){}`);
  await page.addInitScript(() => {
    Reflect.set(window, 'nativeHandoffCameraRequests', 0);
    if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = async () => { Reflect.set(window, 'nativeHandoffCameraRequests', Number(Reflect.get(window, 'nativeHandoffCameraRequests')) + 1); throw new Error('A launcher must not request camera access'); };
  });
  const errors: string[] = [], downloads: string[] = [], choosers: string[] = [], shares: string[] = [];
  page.on('pageerror', error => errors.push(error.message)); page.on('download', download => downloads.push(download.suggestedFilename())); page.on('filechooser', () => choosers.push('opened'));
  page.on('request', request => { if (/\/api\/share(?:\?|$|\/)/.test(request.url())) shares.push(request.method()); });
  await seedDashboardControlProfile(page);
  await page.evaluate(async provider => {
    const api = await import('/js/api.js');
    if (provider === 'venice') { await api.saveVeniceKey('synthetic-handoff-key'); api.setVeniceModel('glm-fixture'); api.setVeniceE2EE(false); }
    else { await api.saveCustomApiConnection('https://native-handoff.example/v1', 'synthetic-handoff-key'); api.setCustomApiModel('fixture'); }
    api.setAIProvider(provider); api.setAIPaused(false); (await import('/js/agent-chat-settings.js')).setChatBackend('direct'); await (await import('/js/chat-loader.js')).openChatPanel();
  }, provider);
  const health = await dashboardHealth(page), before = await page.evaluate(async () => ({ root: structuredClone((await import('/js/state.js')).state.importedData), shares: localStorage.getItem('getbased-profile-shares-v1') }));
  let round = 0, receipt: Record<string, unknown> | undefined;
  const endpoint = provider === 'venice' ? 'https://api.venice.ai/api/v1/chat/completions' : 'https://native-handoff.example/v1/chat/completions';
  await page.route(endpoint, async route => {
    const body = route.request().postDataJSON();
    if (protocol === 'structured' && body.tools) { await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: { message: 'tools not supported by this model' } }) }); return; }
    if (round > 0) {
      const last = body.messages.at(-1), output = protocol === 'native' ? JSON.parse(last.content) : JSON.parse(last.content.slice(last.content.indexOf('{"id":'))).output;
      expect(output.success).toBe(true); receipt = JSON.parse(output.contentItems[0].text);
      expect(receipt).toMatchObject({ changed: true, opened: target.view, dataSaved: false, settingsSaved: false });
      if (target.view !== 'dataSettings') expect(receipt).toMatchObject({ requiresUserAction: true, nextAction: expect.any(String) });
      expect(JSON.stringify(output)).not.toMatch(/PRIVATE_RETAINED_CONTEXT|PRIVATE_READING_NOTE|synthetic-handoff-key/);
    }
    expect(round).toBeLessThan(2);
    const { selector: _selector, text: _text, ...args } = target;
    const call = round++ === 0 ? { id: 'native-handoff', type: 'function', function: { name: 'getbased_navigate', arguments: JSON.stringify(args) } } : null;
    const reply = 'The native handoff is open. Review and complete the action there.';
    if (protocol === 'structured') await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content: JSON.stringify({ reply: call ? '' : reply, calls: call ? [{ id: call.id, name: call.function.name, arguments: call.function.arguments }] : [] }) }, finish_reason: call ? 'tool_calls' : 'stop' }] }) });
    else await route.fulfill({ contentType: 'text/event-stream', body: 'data: ' + JSON.stringify({ choices: [{ delta: call ? { tool_calls: [{ index: 0, ...call }] } : { content: reply }, finish_reason: call ? 'tool_calls' : 'stop' }] }) + '\n\ndata: [DONE]\n\n' });
  });
  await page.locator('#chat-input').fill(target.text); await page.locator('#chat-send-btn').click();
  await expect(page.locator('#chat-messages')).toContainText('The native handoff is open.'); await expect(page.locator(target.selector)).toBeVisible(); expect(round).toBe(2);
  if (target.view === 'reportBuilder') { await expect(page.locator('[data-report-action="set-preset"][data-report-preset="personal"]')).toHaveAttribute('aria-pressed', 'true'); await expect(page.locator('#report-date-range')).toHaveValue('3m'); await expect(page.locator('input[data-report-section="context"]')).not.toBeChecked(); }
  if (target.view === 'profileShare') { const secret = await page.locator('#profile-share-password').inputValue(); expect(secret.length).toBeGreaterThan(10); expect(JSON.stringify(receipt)).not.toContain(secret); }
  if (target.view === 'dataSettings') { await expect(page.locator('[data-settings-action="export-client"]')).toBeVisible(); await expect(page.locator('[data-crypto-action="export-backup"]')).toBeVisible(); }
  expect(await dashboardHealth(page)).toBe(health);
  expect(await page.evaluate(async () => ({ root: structuredClone((await import('/js/state.js')).state.importedData), shares: localStorage.getItem('getbased-profile-shares-v1') }))).toEqual(before);
  expect(await page.evaluate(() => Reflect.get(window, 'nativeHandoffCameraRequests'))).toBe(0);
  expect(downloads).toEqual([]); expect(choosers).toEqual([]); expect(shares).toEqual([]); expect(errors).toEqual([]);
  if (target.view === 'healthImport' && provider === 'custom' && protocol === 'native') {
    const accept = await page.locator('#pdf-input').getAttribute('accept');
    for (const format of ['.pdf', '.csv', '.txt', '.xml', '.zip', '.cluedata']) expect(accept).toContain(format);
    const choice = page.waitForEvent('filechooser');
    await page.locator('[data-chat-action="import-health-file"]').click(); const chooser = await choice;
    await chooser.setFiles([]); // Human cancels; no parser or inference starts.
    expect(choosers).toEqual(['opened']); expect(round).toBe(2); expect(await dashboardHealth(page)).toBe(health);
  }
});

test('native handoffs preserve an existing unsaved health form and reject a different share target', async ({ page }) => {
  await seedDashboardControlProfile(page);
  const health = await dashboardHealth(page);
  const wrong = await page.evaluate(async () => (await import('/js/agent-tool-bindings.js')).navigateFromAgent({ view: 'profileShare', recordId: 'different-profile', marker: '' }));
  expect(wrong.changed).toBe(false); await expect(page.locator('#profile-share-overlay')).toHaveCount(0);
  await page.evaluate(async () => (await import('/js/agent-tool-bindings.js')).navigateFromAgent({ view: 'contextEditor', card: 'healthGoals', marker: '' }));
  await page.locator('#goal-text-input').fill('Keep my unsaved goal');
  for (const view of targets.map(target => target.view)) {
    const result = await page.evaluate(async view => (await import('/js/agent-tool-bindings.js')).navigateFromAgent({ view, marker: '' }), view);
    expect(result.changed).toBe(false); await expect(page.locator('#goal-text-input')).toHaveValue('Keep my unsaved goal');
  }
  expect(await dashboardHealth(page)).toBe(health);
});

for (const boundary of ['thread', 'root', 'history', 'route', 'dialog'] as const) test(`delayed report handoff refuses a changed ${boundary} owner`, async ({ page }) => {
  await seedDashboardControlProfile(page); const health = await dashboardHealth(page);
  let release!: () => void, reached = false; const blocked = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/js/export-report-builder.js', async route => { reached = true; await blocked; await route.continue(); });
  await page.evaluate(() => { void import('/js/agent-tool-bindings.js').then(async tools => { Reflect.set(window, 'delayedNativeReport', await tools.navigateFromAgent({ view: 'reportBuilder', marker: '' })); }); });
  try {
    await expect.poll(() => reached).toBe(true);
    await page.evaluate(async boundary => {
      const { state } = await import('/js/state.js');
      if (boundary === 'thread') state.currentThreadId = 'different-handoff-thread';
      if (boundary === 'root') state.importedData = structuredClone(state.importedData);
      if (boundary === 'history') state.chatHistory = [...state.chatHistory];
      if (boundary === 'route') (await import('/js/route-lifecycle.js')).recordRouteChange();
      if (boundary === 'dialog') { const overlay = document.createElement('div'); overlay.id = 'retained-native-form'; overlay.className = 'modal-overlay show'; const input = document.createElement('textarea'); input.value = 'Retain this unsaved input'; overlay.append(input); document.body.append(overlay); }
    }, boundary);
  } finally { release(); }
  await expect.poll(() => page.evaluate(() => Reflect.get(window, 'delayedNativeReport'))).toMatchObject({ changed: false });
  await expect(page.locator('#report-builder-overlay')).toHaveCount(0); expect(await dashboardHealth(page)).toBe(health);
  if (boundary === 'dialog') await expect(page.locator('#retained-native-form textarea')).toHaveValue('Retain this unsaved input');
});

test('Data settings leaves provider initialization cold until the human selects AI', async ({ page, context }) => {
  await context.route('https://**/*', route => route.abort()); await seedDashboardControlProfile(page);
  await page.evaluate(async () => { const api = await import('/js/api.js'); await api.saveCustomApiConnection('https://native-handoff.example/v1', 'synthetic-handoff-key'); api.setAIProvider('custom'); (await import('/js/agent-chat-settings.js')).setChatBackend('direct'); });
  let providerLoads = 0;
  await page.route('**/js/provider-panels.js', async route => { providerLoads++; await route.continue(); });
  const result = await page.evaluate(async () => (await import('/js/agent-tool-bindings.js')).navigateFromAgent({ view: 'dataSettings', marker: '' }));
  expect(result).toMatchObject({ changed: true, opened: 'dataSettings', dataSaved: false });
  await expect(page.locator('#settings-tab-data.active')).toBeVisible(); expect(providerLoads).toBe(0);
  await page.locator('#settings-nav-ai').click();
  await expect(page.locator('#settings-tab-ai.active [data-custom-settings-host]')).toBeVisible(); expect(providerLoads).toBe(1);
});
