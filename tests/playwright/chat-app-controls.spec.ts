import { expect, test } from './coverage-fixture.js';
import { routeJavaScript } from '../helpers/browser-static-routes.js';
import type { AIToolCall } from '../../shared/ai-tool-protocol.js';

for (const provider of ['custom', 'venice'] as const) for (const protocol of ['native', 'structured'] as const) for (const decision of ['apply', 'discard'] as const) {
  test(`app controls: ${provider} ${protocol} ${decision}, native Display and guarded Undo after reload`, async ({ page }) => {
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await routeJavaScript(page, '**/js/cloud-ai-consent.js', `export * from '/js/cloud-ai-consent.js?app-control-original';
      export async function requestAIProcessingApproval() { return true; }
      export async function requireAIProcessingApproval() {}`);
    const message = 'Use US units from now on, show alternate units, show both ranges.';
    const parameters = { unitSystem: 'US', showAltUnits: true, rangeMode: 'both' };
    let round = 0, feedback = false;
    const endpoint = provider === 'venice' ? 'https://api.venice.ai/api/v1/chat/completions' : 'https://app-control-provider.example/v1/chat/completions';
    await page.route(endpoint, async route => {
      const body = route.request().postDataJSON();
      expect(route.request().headers().authorization).toBe('Bearer synthetic-key');
      if (protocol === 'structured' && body.tools) {
        await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: { message: 'tools not supported by this model' } }) }); return;
      }
      let call: AIToolCall | undefined;
      const last = body.messages.at(-1);
      if (round === 0) call = { id: 'read-display', type: 'function', function: { name: 'getbased_read_app', arguments: '{"action":"display.preferences"}' } };
      if (round === 1) {
        const result = protocol === 'native' ? JSON.parse(last.content) : JSON.parse(last.content.slice(last.content.indexOf('{"id":'))).output;
        expect(result.success).toBe(true); const snapshot = JSON.parse(result.contentItems[0].text);
        call = { id: 'request-display', type: 'function', function: { name: 'getbased_request_app', arguments: JSON.stringify({ action: 'display.preferences', snapshotId: snapshot.snapshotId, parameters: JSON.stringify(parameters), reason: 'Explicit saved display preferences', evidence: message }) } };
      }
      if (round === 3) feedback = body.messages[0].content.includes(`"status":"${decision === 'apply' ? 'changed' : 'discarded'}"`);
      round++;
      const reply = round > 3 ? 'Understood.' : 'Your display preference review is ready. Choose Apply to save it.';
      if (protocol === 'structured') {
        const content = JSON.stringify({ reply: call ? '' : reply, calls: call ? [{ id: call.id, name: call.function.name, arguments: call.function.arguments }] : [] });
        await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content }, finish_reason: 'stop' }] }) });
      } else {
        const response = { choices: [{ delta: call ? { tool_calls: [{ index: 0, ...call }] } : { content: reply }, finish_reason: call ? 'tool_calls' : 'stop' }] };
        await route.fulfill({ contentType: 'text/event-stream', body: `data: ${JSON.stringify(response)}\n\ndata: [DONE]\n\n` });
      }
    });
    await page.addInitScript(() => { for (const suffix of ['tour', 'emptyTour']) localStorage.setItem(`labcharts-default-${suffix}`, 'completed'); });
    await page.goto('/app');
    const baseline = await page.evaluate(async provider => {
      const profile = await import('/js/profile.js');
      const id = await profile.createProfile('App control synthetic fixture', { sex: 'male', skipInitialSync: true });
      for (const suffix of ['tour', 'emptyTour']) localStorage.setItem(profile.profileStorageKey(id, suffix), 'completed');
      localStorage.setItem(`labcharts-onboard-extras-done-${id}`, '1'); localStorage.setItem(`labcharts-onboard-context-cards-skipped-${id}`, '1');
      await profile.switchProfile(id);
      const api = await import('/js/api.js');
      if (provider === 'venice') { await api.saveVeniceKey('synthetic-key'); api.setVeniceModel('glm-5-fixture'); api.setVeniceE2EE(false); }
      else { await api.saveCustomApiConnection('https://app-control-provider.example/v1', 'synthetic-key'); api.setCustomApiModel('synthetic-tool-model'); }
      api.setAIProvider(provider); api.setAIPaused(false); (await import('/js/agent-chat-settings.js')).setChatBackend('direct');
      await (await import('/js/display-preferences.js')).commitDisplayPreferences({ unitSystem: 'EU', showAltUnits: false, rangeMode: 'optimal', timeFormat: '24h' });
      const { state } = await import('/js/state.js');
      state.importedData.notes = [{ date: '2026-10-27', text: 'Synthetic evidence that must survive display changes', extension: 'retain' }];
      if (!await (await import('/js/data.js')).saveImportedData()) throw new Error('Synthetic profile save failed');
      await (await import('/js/nutrition-store.js')).reconcileNutritionMealsFromProfileData(id);
      await (await import('/js/chat-loader.js')).openChatPanel();
      return await (await import('/js/crypto.js')).encryptedGetItem(profile.profileStorageKey(id, 'imported'));
    }, provider);
    await page.locator('#chat-input').fill(message); await page.locator('#chat-send-btn').click();
    const card = page.locator('.chat-app-control'); await expect(card).toContainText('International (SI) → US');
    await expect(card).toContainText('Applies to this profile');
    expect(await page.evaluate(async () => (await import('/js/display-preferences.js')).readDisplayPreferences())).toEqual({ unitSystem: 'EU', showAltUnits: false, rangeMode: 'optimal', timeFormat: '24h' });
    await card.locator(`[data-chat-message-action="${decision}-app-control"]`).click();
    await expect(card).toContainText(decision === 'apply' ? 'Display preference saved' : 'Discarded');
    await page.locator('#chat-input').fill('Thanks.'); await page.locator('#chat-send-btn').click();
    await expect(page.locator('#chat-messages')).toContainText('Understood.'); expect(feedback).toBe(true);
    await page.reload(); await page.evaluate(async () => { await (await import('/js/chat-loader.js')).openChatPanel(); await (await import('/js/settings.js')).openSettingsModal('display'); });
    const display = page.locator('#settings-tab-display');
    await expect(display.locator(`[data-unit="${decision === 'apply' ? 'US' : 'EU'}"]`)).toHaveAttribute('aria-pressed', 'true');
    await expect(display.locator(`[data-alt-units="${decision === 'apply' ? 'on' : 'off'}"]`)).toHaveAttribute('aria-pressed', 'true');
    await expect(display.locator(`[data-timefmt="24h"]`)).toHaveAttribute('aria-pressed', 'true');
    await page.evaluate(async () => { (await import('/js/settings.js')).closeSettingsModal(); });
    if (decision === 'apply') {
      await page.locator('[data-chat-message-action="undo-app-control"]').click();
      await expect(card).toContainText('Previous display preference restored');
      expect(await page.evaluate(async () => (await import('/js/display-preferences.js')).readDisplayPreferences())).toEqual({ unitSystem: 'EU', showAltUnits: false, rangeMode: 'optimal', timeFormat: '24h' });
      await page.reload(); await page.evaluate(async () => { await (await import('/js/chat-loader.js')).openChatPanel(); });
      await expect(page.locator('.chat-app-control')).toContainText('Previous display preference restored');
    }
    expect(await page.evaluate(async () => { const { state } = await import('/js/state.js'); return await (await import('/js/crypto.js')).encryptedGetItem((await import('/js/profile.js')).profileStorageKey(state.currentProfile, 'imported')); })).toBe(baseline);
    expect(await page.evaluate(async () => (await import('/js/state.js')).state.importedData.notes)).toEqual([{ date: '2026-10-27', text: 'Synthetic evidence that must survive display changes', extension: 'retain' }]);
    expect(errors).toEqual([]);
  });
}
