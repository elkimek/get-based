import { expect, test } from './coverage-fixture.js';
import type { Page } from '@playwright/test';
import { routeJavaScript } from '../helpers/browser-static-routes.js';
import type { AIToolCall } from '../../shared/ai-tool-protocol.js';
async function seed(page: Page, provider?: 'custom' | 'venice') {
  await page.goto('/app'); await page.evaluate(async provider => {
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
      expect(body.messages[0].content).toContain('selfReport');
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
