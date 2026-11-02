import { CHAT_TOOL_INSTRUCTIONS } from '../../shared/chat-tool-instructions.js';
import { expect, test } from './coverage-fixture.js';
import type { Page } from '@playwright/test';
import { routeJavaScript } from '../helpers/browser-static-routes.js';
import type { AIToolCall } from '../../shared/ai-tool-protocol.js';
async function seed(page: Page, provider?: 'custom' | 'venice') {
  await page.addInitScript(() => { for (const key of ['tour', 'emptyTour']) localStorage.setItem(`labcharts-default-${key}`, 'completed'); });
  await page.goto('/app');
  await page.locator('html[data-app-ready]').waitFor();
  await page.evaluate(async provider => {
    const profiles = await import('/js/profile.js'), id = await profiles.createProfile('Synthetic self-reported EMF context', { sex: 'male', skipInitialSync: true });
    for (const suffix of ['tour', 'emptyTour']) localStorage.setItem(profiles.profileStorageKey(id, suffix), 'completed'); localStorage.setItem(`labcharts-onboard-extras-done-${id}`, '1'); localStorage.setItem(`labcharts-onboard-context-cards-skipped-${id}`, '1'); await profiles.switchProfile(id);
    const api = await import('/js/api.js'); api.setAIPaused(true); const { state } = await import('/js/state.js'); state.importedData.nutritionMeals = []; state.importedData.contextNotes = 'Keep unrelated context';
    state.importedData.environment = { setting: 'urban', emf: ['WiFi router nearby', 'Legacy custom source'], emfMitigation: ['minimal Bluetooth'], note: 'Keep this note' };
    const scope = await import('/js/context-source-registry.js'); scope.setContextSourceEnabled(scope.CONTEXT_SOURCE_IDS.INSIGHT_CARDS, true);
    if (!await (await import('/js/data.js')).saveImportedDataForProfile(id, state.importedData, { forceProfileScope: true })) throw new Error('Synthetic Environment seed failed');
    if (!provider) return;
    if (provider === 'venice') { await api.saveVeniceKey('synthetic-key'); api.setVeniceModel('glm-5-fixture'); api.setVeniceE2EE(false); }
    else { await api.saveCustomApiConnection('https://synthetic-environment-provider.example/v1', 'synthetic-key'); api.setCustomApiModel('glm-5-fixture'); }
    api.setAIProvider(provider); api.setAIPaused(false); (await import('/js/agent-chat-settings.js')).setChatBackend('direct'); await (await import('/js/chat-loader.js')).openChatPanel();
  }, provider);
}
async function stored(page: Page) { return page.evaluate(async () => { const { state } = await import('/js/state.js'); return JSON.parse((await (await import('/js/crypto.js')).encryptedGetItem((await import('/js/profile.js')).profileStorageKey(state.currentProfile, 'imported')))!); }); }
for (const provider of ['custom', 'venice'] as const) for (const protocol of ['native', 'structured'] as const) for (const decision of ['apply', 'discard'] as const) {
  test(`${provider} ${protocol} self-reported EMF ${decision} reaches the ordinary Environment editor`, async ({ page }) => {
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await routeJavaScript(page, '**/js/cloud-ai-consent.js', `export * from '/js/cloud-ai-consent.js?environment-original'; export async function requestAIProcessingApproval(){return true;} export async function requireAIProcessingApproval(){}`);
    let round = 0, rejected = 0;
    const endpoint = provider === 'venice' ? 'https://api.venice.ai/api/v1/chat/completions' : 'https://synthetic-environment-provider.example/v1/chat/completions';
    await page.route(endpoint, async route => {
      const body = route.request().postDataJSON(); expect(body.model).toBe('glm-5-fixture');
      if (String(body.messages[0]?.content).startsWith('Based on this person')) { await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content: '{}' } }] }) }); return; }
      expect(body.messages[0].content).toContain(CHAT_TOOL_INSTRUCTIONS);
      if (protocol === 'structured' && body.tools) { rejected++; await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: { message: 'tools not supported' } }) }); return; }
      const result = () => protocol === 'native' ? JSON.parse(body.messages.at(-1).content) : JSON.parse(body.messages.at(-1).content.slice(body.messages.at(-1).content.indexOf('{"id":'))).output;
      let call: AIToolCall | undefined;
      if (round === 0) call = { id: 'read-environment', type: 'function', function: { name: 'getbased_read_context_card', arguments: '{"card":"environment"}' } };
      if (round === 1) {
        const response = result(); expect(response.success).toBe(true); const current = JSON.parse(response.contentItems[0].text); expect(current.emf.mode).toBe('selfReport');
        call = { id: 'draft-environment', type: 'function', function: { name: 'getbased_draft_context', arguments: JSON.stringify({ card: 'environment', snapshotId: current.snapshotId, changes: [{ field: 'emfMitigation', values: ['WiFi off at night', 'minimal Bluetooth'] }], evidence: 'I now turn my WiFi off at night.', reason: 'The user reported a new general habit.' }) } };
      }
      if (round === 2) { const response = result(); expect(response.success).toBe(true); expect(JSON.parse(response.contentItems[0].text).status).toBe('pending_user_approval'); }
      round++; const reply = 'Review the proposed Environment context change.';
      if (protocol === 'structured') await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content: JSON.stringify({ reply: call ? '' : reply, calls: call ? [{ id: call.id, name: call.function.name, arguments: call.function.arguments }] : [] }) } }] }) });
      else await route.fulfill({ contentType: 'text/event-stream', body: `data: ${JSON.stringify({ choices: [{ delta: call ? { tool_calls: [{ index: 0, ...call }] } : { content: reply }, finish_reason: call ? 'tool_calls' : 'stop' }] })}\n\ndata: [DONE]\n\n` });
    });
    await seed(page, provider); const before = await stored(page); await page.locator('#chat-input').fill('I now turn my WiFi off at night.'); await page.locator('#chat-send-btn').click();
    const pending = page.locator('.chat-agent-draft-pending'); await expect(pending).toContainText('Environment & Exposures'); await expect(pending).toContainText('Self-reported EMF context'); await expect(pending).toContainText('EMF mitigation'); expect(await stored(page)).toEqual(before);
    await pending.getByRole('button', { name: decision === 'apply' ? 'Apply' : 'Discard', exact: true }).click(); await expect(page.locator(`.chat-agent-draft-${decision === 'apply' ? 'applied' : 'discarded'}`)).toHaveCount(1);
    const saved = await stored(page); if (decision === 'discard') expect(saved).toEqual(before);
    else { expect(saved.environment).toEqual({ ...before.environment, emfMitigation: ['WiFi off at night', 'minimal Bluetooth'] }); expect(saved.emfAssessment).toBeNull(); const protect = (data: Record<string, unknown>) => Object.fromEntries(Object.entries(data).filter(([key]) => !['environment', 'changeHistory'].includes(key))); expect(protect(saved)).toEqual(protect(before)); }
    await page.reload(); await page.locator('html[data-app-ready]').waitFor(); expect(await stored(page)).toEqual(saved); await page.evaluate(async () => { (await import('/js/api.js')).setAIPaused(true); await (await import('/js/context-card-lifestyle-editors.js')).openEnvironmentEditor(); });
    const modal = page.locator('#detail-modal'); await modal.locator('details summary').filter({ hasText: 'EMF' }).click(); await expect(modal.locator('#env-emf').getByRole('button', { name: 'Legacy custom source', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(modal.locator('#env-emf-mit').getByRole('button', { name: 'WiFi off at night', exact: true })).toHaveAttribute('aria-pressed', decision === 'apply' ? 'true' : 'false'); await expect(modal.locator('#env-emf-mit').getByRole('button', { name: 'minimal Bluetooth', exact: true })).toHaveAttribute('aria-pressed', 'true'); expect(await stored(page)).toEqual(saved); expect(rejected).toBe(protocol === 'structured' ? 1 : 0); expect(errors).toEqual([]);
  });
}
for (const dirty of [false, true]) test(`chat preserves an open ${dirty ? 'dirty' : 'clean'} Environment form and its next native save`, async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message)); await seed(page); await page.evaluate(async () => { await (await import('/js/context-card-lifestyle-editors.js')).openEnvironmentEditor(); });
  const before = await stored(page), note = page.locator('#detail-modal').getByLabel('Notes', { exact: true }); if (dirty) await note.fill('Uncommitted native note'); else await note.focus();
  const result = await page.evaluate(async () => {
    const { state } = await import('/js/state.js'), tools = (await import('/js/agent-tool-runtime.js')).createAgentToolRuntime({ readContext: () => '', userMessage: 'I now turn WiFi off at night.', ...(await import('/js/agent-tool-bindings.js')).createBrowserAgentToolDependencies(state.currentProfile) });
    const read = await tools.execute({ tool: 'getbased_read_context_card', arguments: { card: 'environment' } }), card = JSON.parse(read.contentItems[0].text);
    const proposal = await tools.execute({ tool: 'getbased_draft_context', arguments: { card: 'environment', snapshotId: card.snapshotId, changes: [{ field: 'emfMitigation', values: ['WiFi off at night', 'minimal Bluetooth'] }], evidence: 'I now turn WiFi off at night.', reason: 'A reported general habit.' } }); if (!proposal.success) throw new Error(proposal.contentItems[0].text);
    try { return { saved: true, message: await (await import('/js/agent-drafts.js')).applyAgentDraft({ ...tools.getDrafts()[0]!, profileId: state.currentProfile }) }; } catch (error) { return { saved: false, message: String(error), noChangeApplied: (error as { noChangeApplied?: boolean }).noChangeApplied }; }
  });
  expect(result.saved).toBe(!dirty); if (dirty) { expect(result.noChangeApplied).toBe(true); expect(await stored(page)).toEqual(before); await expect(note).toHaveValue('Uncommitted native note'); }
  else { await expect(note).toBeFocused(); await expect(note).toHaveValue('Keep this note'); const draft = await page.evaluate(async () => (await import('/js/context-lifestyle-form-view.js')).hasLifestyleFormDraft('environment')); expect(draft).toBe(false); await note.fill('Native save after chat'); }
  await page.locator('#detail-modal').getByRole('button', { name: 'Save', exact: true }).click(); await expect(page.locator('#modal-overlay')).not.toHaveClass(/show/); const saved = await stored(page); expect(saved.environment.note).toBe(dirty ? 'Uncommitted native note' : 'Native save after chat'); expect(saved.environment.emfMitigation).toEqual(dirty ? ['minimal Bluetooth'] : ['WiFi off at night', 'minimal Bluetooth']); expect(errors).toEqual([]);
});


for (const protocol of ['native', 'structured'] as const) for (const decision of ['apply', 'discard'] as const) test(`Venice ${protocol} repairs an unbacked relocation claim with a real ${decision} review`, async ({ page, context }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await context.route('https://**/*', route => route.abort());
  await routeJavaScript(page, '**/js/cloud-ai-consent.js', `export * from '/js/cloud-ai-consent.js?relocation-original'; export async function requestAIProcessingApproval(){return true;} export async function requireAIProcessingApproval(){}`);
  const evidence = 'I just moved from Sweden to El Salvador.';
  let round = 0, repaired = false;
  await page.route('https://api.venice.ai/api/v1/chat/completions', async route => {
    const body = route.request().postDataJSON();
    if (protocol === 'structured' && body.tools) { await route.fulfill({ status: 400, contentType: 'application/json', body: '{"error":{"message":"tools not supported"}}' }); return; }
    const isChat = String(body.messages[0]?.content).includes(CHAT_TOOL_INSTRUCTIONS);
    if (!isChat) { await route.fulfill({ contentType: 'application/json', body: '{"choices":[{"message":{"content":"No additional insight."},"finish_reason":"stop"}]}' }); return; }
    let call: AIToolCall | undefined;
    if (round === 1) { repaired = body.messages.some((message: { role: string; content: string }) => message.role === 'system' && message.content.includes('Application verification')); call = { id: 'read-relocation', type: 'function', function: { name: 'getbased_read_context_card', arguments: '{"card":"environment"}' } }; }
    if (round === 2) {
      const last = body.messages.at(-1), output = JSON.parse(last.content.slice(last.content.indexOf('{"id":'))).output;
      expect(output.success).toBe(true); const snapshot = JSON.parse(output.contentItems[0].text);
      call = { id: 'draft-relocation', type: 'function', function: { name: 'getbased_draft_context', arguments: JSON.stringify({ card: 'environment', snapshotId: snapshot.snapshotId, changes: [{ field: 'note', value: 'Keep this note\nReported move from Sweden to El Salvador.' }], reason: 'Explicit relocation report.', evidence }) } };
    }
    const reply = round === 0 ? "What a change. I've prepared a draft update to your Environment & Exposures card; check the proposal in getbased and Apply." : 'Please review the relocation proposal below.';
    round++;
    if (protocol === 'structured' || body.response_format) await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content: JSON.stringify({ reply: call ? '' : reply, calls: call ? [{ id: call.id, name: call.function.name, arguments: call.function.arguments }] : [] }) }, finish_reason: 'stop' }] }) });
    else await route.fulfill({ contentType: 'text/event-stream', body: 'data: ' + JSON.stringify({ choices: [{ delta: call ? { tool_calls: [{ index: 0, ...call }] } : { content: reply }, finish_reason: call ? 'tool_calls' : 'stop' }] }) + '\n\ndata: [DONE]\n\n' });
  });
  await seed(page, 'venice'); const before = await stored(page);
  await page.locator('#chat-input').fill(evidence); await page.locator('#chat-send-btn').click();
  const proposal = page.locator('.chat-agent-draft-pending'); await expect(proposal).toHaveCount(1);
  await expect(page.locator('#chat-messages')).toContainText('Please review the relocation proposal below.');
  await expect(page.locator('#chat-messages')).not.toContainText('What a change.');
  expect(repaired).toBe(true); expect(round).toBe(4); expect(await stored(page)).toEqual(before);
  await expect(proposal).toContainText('Environment & Exposures'); await expect(proposal).toContainText('Sweden to El Salvador');
  await proposal.locator(`[data-chat-message-action="${decision}-agent-draft"]`).click();
  await expect(page.locator('.chat-agent-draft-' + (decision === 'apply' ? 'applied' : 'discarded'))).toHaveCount(1);
  const after = await stored(page);
  if (decision === 'discard') expect(after).toEqual(before);
  else {
    expect(after.environment).toEqual({ ...before.environment, note: 'Keep this note\nReported move from Sweden to El Salvador.' });
    const retained = (data: Record<string, unknown>) => Object.fromEntries(Object.entries(data).filter(([key]) => !['environment', 'changeHistory'].includes(key)));
    expect(retained(after)).toEqual(retained(before));
  }
  await page.reload(); await page.locator('html[data-app-ready]').waitFor(); expect(await stored(page)).toEqual(after); expect(errors).toEqual([]);
});

test('Venice cannot display or persist repeated phantom review claims without a card', async ({ page, context }) => {
  await context.route('https://**/*', route => route.abort());
  await routeJavaScript(page, '**/js/cloud-ai-consent.js', `export * from '/js/cloud-ai-consent.js?missing-card-original'; export async function requestAIProcessingApproval(){return true;} export async function requireAIProcessingApproval(){}`);
  let requests = 0;
  await page.route('https://api.venice.ai/api/v1/chat/completions', async route => {
    requests++;
    if (route.request().postDataJSON().response_format) { await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content: JSON.stringify({ reply: "I've prepared a draft update for your Environment card in getbased. Apply it.", calls: [] }) }, finish_reason: 'stop' }] }) }); return; }
    await route.fulfill({ contentType: 'text/event-stream', body: 'data: ' + JSON.stringify({ choices: [{ delta: { content: "I've prepared a draft update for your Environment card in getbased. Apply it." }, finish_reason: 'stop' }] }) + '\n\ndata: [DONE]\n\n' });
  });
  await seed(page, 'venice'); const before = await stored(page);
  await page.locator('#chat-input').fill('I just moved from Sweden to El Salvador.'); await page.locator('#chat-send-btn').click();
  await expect(page.locator('#chat-messages')).toContainText('No proposal card was created for this reply.');
  await expect(page.locator('#chat-messages')).not.toContainText("I've prepared"); await expect(page.locator('.chat-agent-draft')).toHaveCount(0);
  expect(requests).toBe(2); expect(await stored(page)).toEqual(before);
  await page.reload(); await page.locator('html[data-app-ready]').waitFor();
  await page.evaluate(async () => (await import('/js/chat-loader.js')).openChatPanel());
  await expect(page.locator('#chat-messages')).toContainText('No proposal card was created for this reply.');
  await expect(page.locator('#chat-messages')).not.toContainText("I've prepared"); expect(await stored(page)).toEqual(before);
});


const REPORTED_RELOCATION_REPLY = "Big move — that's genuinely one of the most sleep-relevant things you could tell me, so I've drafted it for your Environment card. It's waiting for review; tap **Apply** in getbased if it looks right.";

for (const viewport of [{ width: 1280, height: 720 }, { width: 390, height: 844 }]) test.describe(`Tool activity at ${viewport.width}px`, () => {
  test.use({ viewport, hasTouch: viewport.width < 500, isMobile: viewport.width < 500 });
test('Regenerate repairs a conversational draft claim and shows progress outside the answer', async ({ page, context }) => {
  await context.route('https://**/*', route => route.abort());
  await routeJavaScript(page, '**/js/cloud-ai-consent.js', `export * from '/js/cloud-ai-consent.js?activity-consent-original'; export async function requestAIProcessingApproval(){return true;} export async function requireAIProcessingApproval(){}`);
  await routeJavaScript(page, '**/js/agent-profile-record-store.js', `export * from '/js/agent-profile-record-store.js?activity-original'; import { readAgentProfileRecords as original } from '/js/agent-profile-record-store.js?activity-original'; export async function readAgentProfileRecords(profile){if(globalThis.__activityReadGate)await globalThis.__activityReadGate;return original(profile);}`);
  const evidence = 'I just moved from Sweden to El Salvador.';
  let regenerated = false, round = 0;
  await page.route('https://api.venice.ai/api/v1/chat/completions', async route => {
    const body = route.request().postDataJSON();
    const chat = String(body.messages[0]?.content).includes(CHAT_TOOL_INSTRUCTIONS);
    if (!chat) { await route.fulfill({ contentType: 'application/json', body: '{"choices":[{"message":{"content":"No additional insight."},"finish_reason":"stop"}]}' }); return; }
    let call: AIToolCall | undefined;
    if (regenerated && round === 1) { expect(body.tools).toBeUndefined(); expect(body.response_format).toBeDefined(); call = { id: 'read', type: 'function', function: { name: 'getbased_read_context_card', arguments: '{"card":"environment"}' } }; }
    if (regenerated && round === 2) {
      const last = body.messages.at(-1), output = JSON.parse(last.content.slice(last.content.indexOf('{"id":'))).output;
      expect(output.success).toBe(true); const snapshot = JSON.parse(output.contentItems[0].text);
      call = { id: 'draft', type: 'function', function: { name: 'getbased_draft_context', arguments: JSON.stringify({ card: 'environment', snapshotId: snapshot.snapshotId, changes: [{ field: 'note', value: 'Keep this note\nReported move from Sweden to El Salvador.' }], evidence, reason: 'Reported relocation.' }) } };
    }
    const reply = !regenerated ? 'Let us review the move.' : round === 0 ? REPORTED_RELOCATION_REPLY : 'Please review the proposal below.';
    if (regenerated) round++;
    if (body.response_format) await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content: JSON.stringify({ reply: call ? '' : reply, calls: call ? [{ id: call.id, name: call.function.name, arguments: call.function.arguments }] : [] }) }, finish_reason: 'stop' }] }) });
    else await route.fulfill({ contentType: 'text/event-stream', body: 'data: ' + JSON.stringify({ choices: [{ delta: { content: reply }, finish_reason: 'stop' }] }) + '\n\ndata: [DONE]\n\n' });
  });
  await seed(page, 'venice'); const before = await stored(page);
  await page.locator('#chat-input').fill(evidence); await page.locator('#chat-send-btn').click();
  await expect(page.locator('#chat-messages')).toContainText('Let us review the move.');
  await expect(page.locator('[data-chat-tool-activity]')).toHaveCount(0);
  await expect(page.locator('#chat-messages')).not.toContainText('No app tools used');
  regenerated = true;
  await page.evaluate(() => { const globals = globalThis as typeof globalThis & { __activityReadGate?: Promise<void>; __releaseActivityRead?: () => void }; globals.__activityReadGate = new Promise(resolve => { globals.__releaseActivityRead = resolve; }); });
  await page.locator('[data-chat-message-action="regenerate-last-message"]').click();
  const activity = page.locator('[data-chat-tool-activity]');
  await expect(activity.locator('summary')).toContainText('Reading Environment & Exposures');
  expect(await activity.evaluate(element => element.closest('.chat-msg'))).toBeNull();
  await expect(page.locator('.chat-ai[data-chat-streaming]')).toBeHidden();
  await page.evaluate(async () => { const chat = await import('/js/chat-loader.js'); await chat.closeChatPanel(); await chat.openChatPanel(); });
  await expect(activity.locator('summary')).toContainText('Reading Environment & Exposures');
  await expect(page.locator('.typing-indicator')).toHaveCount(0);
  await activity.locator('summary').click(); await expect(activity.locator('[data-tool-status="running"]')).toBeVisible();
  await expect(page.locator('.chat-agent-draft')).toHaveCount(0);
  await expect(page.locator('#chat-messages')).not.toContainText("so I've drafted");
  await expect.poll(() => activity.locator('svg').first().evaluate(icon => getComputedStyle(icon).width)).toBe('13px');
  await expect.poll(() => activity.evaluate(element => getComputedStyle(element).fontSize)).toBe('12px');
  expect((await activity.boundingBox())!.height).toBeLessThan(260);
  await page.screenshot({ path: test.info().outputPath('tool-activity-running.png') });
  await page.evaluate(() => (globalThis as typeof globalThis & { __releaseActivityRead?: () => void }).__releaseActivityRead?.());
  await expect(page.locator('.chat-agent-draft-pending')).toHaveCount(1); expect(round).toBe(4);
  await expect(activity.locator('[data-tool-status="completed"]')).toHaveCount(2);
  await expect(activity.locator('summary')).toContainText('2 actions completed');
  expect(await activity.evaluate(element => (element as HTMLDetailsElement).open)).toBe(false);
  await expect(page.locator('.chat-ai')).not.toContainText('Read Environment & Exposures');
  expect(await activity.textContent()).not.toMatch(/Sweden|Keep this note|synthetic-key|snapshotId/);
  expect(await stored(page)).toEqual(before);
  await page.locator('.chat-agent-draft-pending [data-chat-message-action="apply-agent-draft"]').click();
  await expect(page.locator('.chat-agent-draft-applied')).toHaveCount(1);
  await page.reload(); await page.locator('html[data-app-ready]').waitFor(); await page.evaluate(async () => (await import('/js/chat-loader.js')).openChatPanel());
  await expect(page.locator('[data-chat-tool-activity] [data-tool-status="completed"]')).toHaveCount(2);
  const after = await stored(page); expect(after.environment).toEqual({ ...before.environment, note: 'Keep this note\nReported move from Sweden to El Salvador.' });
  await page.locator('[data-chat-tool-activity] summary').click();
  await page.screenshot({ path: test.info().outputPath('tool-progress-expanded.png') });
  expect(await activity.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  const box = (await activity.boundingBox())!; expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  await activity.locator('summary').focus(); await page.keyboard.press('Enter');
  expect(await activity.evaluate(element => (element as HTMLDetailsElement).open)).toBe(false);
  const summaryBox = (await activity.locator('summary').boundingBox())!;
  expect(summaryBox.height).toBeGreaterThanOrEqual(viewport.width < 500 ? 44 : 32);
  await page.screenshot({ path: test.info().outputPath('tool-progress-completed.png') });
});

});
