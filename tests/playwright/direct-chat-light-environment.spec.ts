import { expect, test } from './coverage-fixture.js';
import { routeJavaScript } from '../helpers/browser-static-routes.js';
import type { AIToolCall } from '../../shared/ai-tool-protocol.js';

for (const provider of ['custom', 'venice'] as const) for (const protocol of ['native', 'structured'] as const) for (const decision of ['apply', 'discard'] as const) {
  test(`${provider} ${protocol} Light room ${decision} preserves room-removal effects and ordinary UI`, async ({ page }) => {
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await routeJavaScript(page, '**/js/cloud-ai-consent.js', `export * from '/js/cloud-ai-consent.js?light-consent-original'; export async function requestAIProcessingApproval(){return true;} export async function requireAIProcessingApproval(){}`);
    const statements = { update: 'My office now uses warm LEDs and I spend two hours there after sunset.', remove: 'Remove my office room from my indoor Light Environment assessment.' };
    let phase: 'update' | 'remove' = 'update', round = 0;
    const endpoint = provider === 'venice' ? 'https://api.venice.ai/api/v1/chat/completions' : 'https://synthetic-light-provider.example/v1/chat/completions';
    await page.route(endpoint, async route => {
      const body = route.request().postDataJSON(); expect(body.model).toBe('glm-5-fixture');
      expect(JSON.stringify(body)).not.toMatch(/private-light-sentinel|private-measurement-sentinel|\/private\//);
      const system = String(body.messages[0]?.content || '');
      if (system.includes('You evaluate a single room') || system.includes('You evaluate a single SCREEN')) {
        await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content: JSON.stringify({ dot: 'gray', tip: 'Controlled Light verdict', detail: 'Synthetic analysis fixture preserves unknown measurements.' }) }, finish_reason: 'stop' }] }) }); return;
      }
      if (protocol === 'structured' && body.tools) { await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: { message: 'tools not supported' } }) }); return; }
      const result = () => protocol === 'native' ? JSON.parse(body.messages.at(-1).content) : JSON.parse(body.messages.at(-1).content.slice(body.messages.at(-1).content.indexOf('{"id":'))).output;
      let call: AIToolCall | undefined;
      if (round === 0) call = { id: `read-${phase}`, type: 'function', function: { name: 'getbased_read_data', arguments: '{"resource":"lightRooms","recordId":"room-office"}' } };
      else if (round === 1) {
        const response = result(); expect(response.success).toBe(true); const snapshot = JSON.parse(response.contentItems[0].text);
        expect(snapshot.current.name).toBe('Office');
        call = { id: `draft-${phase}`, type: 'function', function: { name: 'getbased_draft_data', arguments: JSON.stringify({ resource: 'lightRooms', operation: phase, snapshotId: snapshot.snapshotId, patch: phase === 'remove' ? '{}' : '{"primarySource":"led-warm","eveningHoursAfterSunset":2}', evidence: statements[phase], reason: 'The user reported a changed light environment.' }) } };
      } else if (round === 2) {
        const response = result(); expect(response.success).toBe(true); const review = JSON.parse(response.contentItems[0].text).review;
        expect(review.applied).toBe(false);
        if (phase === 'remove') expect(review.effects).toEqual({ unlinkedScreens: [{ id: 'screen-laptop', device: 'laptop' }], preservedMeasurementCount: 1 });
        else expect(review.proposed).toMatchObject({ primarySource: 'led-warm', eveningHoursAfterSunset: 2 });
      }
      round++; const reply = phase === 'remove' ? 'Review the room removal. Screens remain unassigned and historical readings remain.' : 'Review the reported room lighting change before applying.';
      if (protocol === 'structured') await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content: JSON.stringify({ reply: call ? '' : reply, calls: call ? [{ id: call.id, name: call.function.name, arguments: call.function.arguments }] : [] }) }, finish_reason: 'stop' }] }) });
      else await route.fulfill({ contentType: 'text/event-stream', body: `data: ${JSON.stringify({ choices: [{ delta: call ? { tool_calls: [{ index: 0, ...call }] } : { content: reply }, finish_reason: call ? 'tool_calls' : 'stop' }] })}\n\ndata: [DONE]\n\n` });
    });
    await page.goto('/app');
    await page.evaluate(async provider => {
      const profiles = await import('/js/profile.js'), id = await profiles.createProfile('Synthetic Light proposal', { sex: 'female', skipInitialSync: true });
      for (const suffix of ['tour', 'emptyTour']) localStorage.setItem(profiles.profileStorageKey(id, suffix), 'completed');
      localStorage.setItem(`labcharts-onboard-extras-done-${id}`, '1'); localStorage.setItem(`labcharts-onboard-context-cards-skipped-${id}`, '1'); await profiles.switchProfile(id);
      const { state } = await import('/js/state.js');
      state.importedData.lightEnvironment = { rooms: [{ id: 'room-office', name: 'Office', primarySource: 'led-cool', hoursOccupiedPerDay: 8, daylightLevel: 'some', eveningHoursAfterSunset: null, annotation: '/private/private-light-sentinel' }],
        screens: [{ id: 'screen-laptop', device: 'laptop', roomId: 'room-office', hoursPerDay: null, blueBlockerEnabled: false }], settings: { retained: true } };
      state.importedData.lightMeasurements = [{ id: 'measure-office', roomId: 'room-office', tool: 'lux', value: 100, capturedAt: 100, extra: { source: '/private/private-measurement-sentinel' } }];
      state.importedData.contextNotes = 'Keep this unrelated profile note';
      const scopes = await import('/js/context-source-registry.js'); scopes.setContextSourceEnabled(scopes.CONTEXT_SOURCE_IDS.LIGHT_SUN, true);
      if (!await (await import('/js/data.js')).saveImportedData()) throw new Error('Synthetic Light seed failed');
      await (await import('/js/nutrition-store.js')).hydrateNutritionSummary(id);
      const api = await import('/js/api.js');
      if (provider === 'venice') { await api.saveVeniceKey('synthetic-key'); api.setVeniceModel('glm-5-fixture'); api.setVeniceE2EE(false); }
      else { await api.saveCustomApiConnection('https://synthetic-light-provider.example/v1', 'synthetic-key'); api.setCustomApiModel('glm-5-fixture'); }
      api.setAIProvider(provider); api.setAIPaused(false); (await import('/js/agent-chat-settings.js')).setChatBackend('direct'); await (await import('/js/chat-loader.js')).openChatPanel();
    }, provider);
    const receipt = () => page.evaluate(async () => { const { state } = await import('/js/state.js'); return JSON.parse((await (await import('/js/crypto.js')).encryptedGetItem((await import('/js/profile.js')).profileStorageKey(state.currentProfile, 'imported')))!); });
    const before = await receipt();
    for (const next of ['update', 'remove'] as const) {
      phase = next; round = 0; const previous = await receipt();
      await page.locator('#chat-input').fill(statements[phase]); await page.locator('#chat-send-btn').click();
      const pending = page.locator('.chat-agent-draft-pending'); await expect(pending).toContainText('Light Rooms');
      if (phase === 'remove') { await expect(pending).toContainText('Unlinked screens'); await expect(pending).toContainText('Preserved measurements'); }
      else { await expect(pending).toContainText('led-warm'); await expect(pending).toContainText('eveningHoursAfterSunset'); }
      expect(await receipt()).toEqual(previous); await pending.getByRole('button', { name: decision === 'apply' ? 'Apply' : 'Discard', exact: true }).click();
      await expect(page.locator(`.chat-agent-draft-${decision === 'apply' ? 'applied' : 'discarded'}`)).toHaveCount(next === 'update' ? 1 : 2);
    }
    const saved = await receipt();
    if (decision === 'discard') expect(saved).toEqual(before);
    else {
      expect(saved.lightEnvironment.rooms).toEqual([]); expect(saved.lightEnvironment.screens).toEqual(before.lightEnvironment.screens.map((row: object) => ({ ...row, roomId: null, updatedAt: expect.any(Number) })));
      expect(saved.lightMeasurements).toEqual(before.lightMeasurements.map((row: object) => ({ ...row, roomSnapshot: { id: 'room-office', name: 'Office' }, updatedAt: expect.any(Number) })));
      const protectedFields = (value: Record<string, unknown>) => Object.fromEntries(Object.entries(value).filter(([key]) => !['lightEnvironment', 'lightMeasurements', '_deleted', '_deletedAt', '_deletedClearedAt'].includes(key)));
      expect(protectedFields(saved)).toEqual(protectedFields(before)); expect(saved.lightEnvironment.settings).toEqual(before.lightEnvironment.settings);
    }
    await page.reload(); await page.waitForFunction(async () => !!(await import('/js/state.js')).state.currentProfile); expect(await receipt()).toEqual(saved);
    await page.evaluate(async () => { await (await import('/js/light-sun-loader.js')).loadLightSunUI(); (await import('/js/light-env.js')).openLightEnvironmentAssessment(); });
    const dialog = page.getByRole('dialog', { name: 'Indoor Light Assessment', exact: true }); await expect(dialog).toBeVisible();
    await expect(dialog.locator('[data-light-environment-room]')).toHaveCount(decision === 'apply' ? 0 : 1);
    await expect(dialog.locator('[data-light-environment-screen]')).toHaveCount(1); expect(errors).toEqual([]);
  });
}
