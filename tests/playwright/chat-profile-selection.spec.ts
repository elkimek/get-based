import { expect, test } from './coverage-fixture.js';
import type { AIToolCall } from '../../shared/ai-tool-protocol.js';
import { routeJavaScript } from '../helpers/browser-static-routes.js';

for (const protocol of ['native', 'structured'] as const) for (const decision of ['apply', 'discard', 'reload', 'draft', 'unsaved', 'renamed', 'removed', 'bad-data', 'receipt-failed', 'late-draft', 'shell-failed', 'encrypted'] as const) {
  test(`profile selection: ${protocol} ${decision} preserves both profiles, chat ownership and verified receipts`, async ({ page }) => {
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    const message = 'Switch to Destination profile.'; let round = 0, destinationId = '', expectedTarget = '';
    const selected = decision === 'apply' || decision === 'receipt-failed' || decision === 'encrypted';
    if (decision === 'receipt-failed' || decision === 'late-draft') await routeJavaScript(page, '**/js/crypto.js', `
      export * from '/js/crypto.js?profile-control-original';
      import * as native from '/js/crypto.js?profile-control-original';
      export async function encryptedSetItem(key,...args) {
        if(globalThis.__failProfileReceipt && key.includes('-app-control-')) throw new Error('Synthetic receipt failure');
        return native.encryptedSetItem(key,...args);
      }
      export async function encryptedGetItem(key,...args) {
        const result=await native.encryptedGetItem(key,...args);
        if(globalThis.__holdProfileRead===key){delete globalThis.__holdProfileRead;globalThis.__profileReadStarted=true;await new Promise(resolve=>{globalThis.__releaseProfileRead=resolve;});}
        return result;
      }
    `);
    await page.route('https://profile-control-provider.example/v1/models', route => route.fulfill({ json: { data: [{ id: 'profile-model' }] } }));
    await page.route('https://profile-control-provider.example/v1/chat/completions', async route => {
      const body = route.request().postDataJSON();
      if (protocol === 'structured' && body.tools) { await route.fulfill({ status: 400, json: { error: { message: 'tools not supported by this model' } } }); return; }
      const content = JSON.stringify(body.messages);
      if (round < 4 || !selected) expect(content).not.toContain('PRIVATE_TARGET_HEALTH');
      else { expect(content).toContain('PRIVATE_TARGET_HEALTH'); expect(content).not.toMatch(/PRIVATE_ORIGIN_HEALTH|Switch to Destination profile/); }
      let call: AIToolCall | undefined;
      const feedback = () => { const text = body.messages.at(-1).content; return protocol === 'native' ? JSON.parse(text) : JSON.parse(text.slice(text.indexOf('{"id":'))).output; };
      if (round === 0) call = { id: 'directory', type: 'function', function: { name: 'getbased_read_app', arguments: '{"action":"profiles","query":"Destination"}' } };
      if (round === 1) {
        const result = feedback(); expect(result.success).toBe(true); const directory = JSON.parse(result.contentItems[0].text);
        expect(JSON.stringify(directory)).not.toMatch(/PRIVATE_|dob|location|zip|notes/); expect(directory.profiles).toEqual([{ id: destinationId, name: 'Destination profile', selected: false }]);
        call = { id: 'snapshot', type: 'function', function: { name: 'getbased_read_app', arguments: JSON.stringify({ action: 'profile.selection', profileId: destinationId }) } };
      }
      if (round === 2) {
        const result = feedback(); expect(result.success).toBe(true); const snapshot = JSON.parse(result.contentItems[0].text); expect(JSON.stringify(snapshot)).not.toMatch(/PRIVATE_|leaseId|dob|location/);
        call = { id: 'review', type: 'function', function: { name: 'getbased_request_app', arguments: JSON.stringify({ action: 'profile.selection', snapshotId: snapshot.snapshotId, parameters: JSON.stringify({ profileId: destinationId }), reason: 'Explicit profile request', evidence: message }) } };
      }
      const reply = round++ < 4 ? 'Review the profile change and choose Apply when ready.' : selected ? 'Destination context is ready.' : 'The origin profile is still active.';
      if (protocol === 'structured') await route.fulfill({ json: { choices: [{ message: { content: JSON.stringify({ reply: call ? '' : reply, calls: call ? [{ id: call.id, name: call.function.name, arguments: call.function.arguments }] : [] }) }, finish_reason: 'stop' }] } });
      else await route.fulfill({ contentType: 'text/event-stream', body: `data: ${JSON.stringify({ choices: [{ delta: call ? { tool_calls: [{ index: 0, ...call }] } : { content: reply }, finish_reason: call ? 'tool_calls' : 'stop' }] })}\n\ndata: [DONE]\n\n` });
    });
    await page.addInitScript(() => { if (localStorage.getItem('labcharts-ai-paused') === null) localStorage.setItem('labcharts-ai-paused', 'true'); for (const key of ['tour', 'emptyTour']) localStorage.setItem(`labcharts-default-${key}`, 'completed'); });
    await page.goto('/app');
    await page.locator('html[data-app-ready]').waitFor();
    if (decision === 'encrypted') await page.evaluate(async () => {
      (window as typeof window & { __WEARABLES_TEST?: boolean }).__WEARABLES_TEST = true;
      await (await import('/js/crypto.js'))._setTestSessionKey('synthetic encrypted profile selection');
      localStorage.setItem('labcharts-encryption-enabled', 'true');
    });
    const baseline = await page.evaluate(async () => {
      const profiles = await import('/js/profile.js'), ids: string[] = [];
      for (const [name, note] of [['Origin profile', 'PRIVATE_ORIGIN_HEALTH'], ['Destination profile', 'PRIVATE_TARGET_HEALTH']]) {
        const id = await profiles.createProfile(name!, { sex: 'female', notes: 'PRIVATE_REGISTRY_NOTE', dob: '1981-04-13', skipInitialSync: true }); ids.push(id);
        for (const key of ['tour', 'emptyTour']) localStorage.setItem(profiles.profileStorageKey(id, key), 'completed');
        for (const prefix of ['labcharts-onboard-extras-done-', 'labcharts-onboard-context-cards-skipped-']) localStorage.setItem(prefix + id, '1');
        await profiles.switchProfile(id); const { state } = await import('/js/state.js'); state.importedData.contextNotes = note!;
        if (!await (await import('/js/data.js')).saveImportedData()) throw new Error('Synthetic profile seed failed'); await (await import('/js/nutrition-store.js')).reconcileNutritionMealsFromProfileData(id);
      }
      const [origin, target] = ids as [string, string]; await profiles.switchProfile(origin);
      const api = await import('/js/api.js'); await api.saveCustomApiConnection('https://profile-control-provider.example/v1', 'SYNTHETIC_PROFILE_KEY'); api.setCustomApiModel('profile-model'); api.setAIProvider('custom');
      localStorage.setItem('labcharts-custom-models', JSON.stringify([{ id: 'profile-model', name: 'Profile model' }]));
      const consent = await import('/js/cloud-ai-consent.js'), scope = consent.cloudAIConsentDetails('custom').scope;
      localStorage.setItem(consent.AI_TRANSPARENCY_KEY, JSON.stringify({ version: consent.AI_TRANSPARENCY_VERSION, acknowledged: true })); localStorage.setItem(consent.CLOUD_AI_CONSENT_KEY, JSON.stringify({ version: consent.CLOUD_AI_CONSENT_VERSION, approvals: { [scope]: { accepted: true } } }));
      (await import('/js/agent-chat-settings.js')).setChatBackend('direct'); api.setAIPaused(false); await (await import('/js/chat-loader.js')).openChatPanel();
      const crypto = await import('/js/crypto.js'); return { origin, target, originRaw: await crypto.encryptedGetItem(profiles.profileStorageKey(origin, 'imported')), targetRaw: await crypto.encryptedGetItem(profiles.profileStorageKey(target, 'imported')) };
    });
    destinationId = baseline.target; expectedTarget = baseline.targetRaw!;
    await page.locator('#chat-input').fill(message); await page.locator('#chat-send-btn').click();
    const card = page.locator('.chat-app-control'); await expect(card).toContainText('Active profile'); await expect(card).toContainText('Origin profile → Destination profile'); await expect(card).toContainText(destinationId);
    expect(await page.evaluate(async () => (await import('/js/state.js')).state.currentProfile)).toBe(baseline.origin); expect(round).toBe(4);
    const originThread = await page.evaluate(async () => (await import('/js/state.js')).state.currentThreadId);
    if (decision === 'shell-failed') {
      const savedChats = await page.evaluate(async target => {
        const crypto = await import('/js/crypto.js'), profiles = await import('/js/profile.js');
        const index = JSON.stringify(['existing-one', 'existing-two'].map((id, i) => ({ id, name: `Existing destination ${i}`, createdAt: `2026-10-2${i}T12:00:00.000Z`, updatedAt: `2026-10-2${i}T12:00:00.000Z`, messageCount: 1, personality: 'default' })));
        const body = JSON.stringify([{ role: 'user', content: 'PRIVATE_SAVED_DESTINATION_CHAT' }]);
        await crypto.encryptedSetItem(`labcharts-${target}-chat-threads`, index);
        for (const id of ['existing-one', 'existing-two']) await crypto.encryptedSetItem(`labcharts-${target}-chat-t_${id}`, body);
        let once = true;
        const previous = profiles.configureProfileRuntimeDeps({ reloadProfileRuntimeShell: async id => { if (id === target && once) { once = false; throw new Error('Synthetic destination shell failure'); } await previous.reloadProfileRuntimeShell?.(id); } });
        return { index, body };
      }, destinationId);
      await card.getByRole('button', { name: 'Apply', exact: true }).click();
      await expect.poll(() => page.evaluate(async () => (await import('/js/state.js')).state.currentProfile)).toBe(destinationId);
      await expect(page.locator('#chat-input')).toBeDisabled(); await expect(page.locator('#chat-send-btn')).toBeDisabled();
      await expect(page.locator('#chat-messages')).not.toContainText(message);
      const blocked = await page.evaluate(async () => {
        const { state } = await import('/js/state.js'), threads = await import('/js/chat-threads.js');
        const thread = threads.createNewThread(), written = await threads.saveChatThreadIndex();
        (document.getElementById('chat-input') as HTMLTextAreaElement).value = 'Blocked attempted message';
        await (await import('/js/chat-send.js')).sendChatMessage();
        return { thread, written, history: state.chatHistory, currentThread: state.currentThreadId };
      });
      expect(blocked).toEqual({ thread: null, written: false, history: [], currentThread: null }); expect(round).toBe(4);
      const readSaved = () => page.evaluate(async ({ origin, target }) => { const crypto = await import('/js/crypto.js'); return { origin: await crypto.encryptedGetItem(`labcharts-${origin}-imported`), target: await crypto.encryptedGetItem(`labcharts-${target}-imported`), index: await crypto.encryptedGetItem(`labcharts-${target}-chat-threads`), first: await crypto.encryptedGetItem(`labcharts-${target}-chat-t_existing-one`), second: await crypto.encryptedGetItem(`labcharts-${target}-chat-t_existing-two`) }; }, baseline);
      const expected = { origin: baseline.originRaw, target: baseline.targetRaw, index: savedChats.index, first: savedChats.body, second: savedChats.body };
      expect(await readSaved()).toEqual(expected);
      await page.evaluate(async target => { await (await import('/js/profile.js')).switchProfile(target); }, destinationId);
      await expect(page.locator('#chat-input')).toBeEnabled(); await expect(page.locator('#chat-messages')).toContainText('PRIVATE_SAVED_DESTINATION_CHAT');
      expect(await page.evaluate(async () => (await import('/js/state.js')).state.chatThreads.map(thread => thread.id))).toEqual(['existing-one', 'existing-two']); expect(await readSaved()).toEqual(expected);
      await page.evaluate(async origin => { await (await import('/js/profile.js')).switchProfile(origin); }, baseline.origin);
      await expect(card).toContainText('Outcome unconfirmed'); await expect(card.getByRole('button', { name: 'Apply', exact: true })).toHaveCount(0); await expect(card.getByRole('button', { name: 'Undo', exact: true })).toHaveCount(0);
      expect(errors).toEqual([]); return;
    }
    if (decision === 'reload') { await page.reload(); await page.evaluate(async () => { await (await import('/js/chat-loader.js')).openChatPanel(); }); await expect(card).toContainText('Profile review expired'); await expect(card.getByRole('button', { name: 'Apply', exact: true })).toHaveCount(0); }
    else if (decision === 'discard') { await card.getByRole('button', { name: 'Discard', exact: true }).click(); await expect(card).toContainText('Discarded'); }
    else {
      if (decision === 'draft') await page.locator('#chat-input').fill('Keep this unsent draft');
      if (decision === 'unsaved') await page.evaluate(async () => { (await import('/js/state.js')).state.importedData.contextNotes = 'UNSAVED_ORIGIN_EDIT'; });
      if (decision === 'renamed' || decision === 'removed') await page.evaluate(async ({ id, remove }) => { const profiles = await import('/js/profile.js'), rows = profiles.getProfiles(); if (remove) await profiles.saveProfiles(rows.filter(row => row.id !== id)); else { rows.find(row => row.id === id)!.name = 'Changed destination'; await profiles.saveProfiles(rows); } }, { id: destinationId, remove: decision === 'removed' });
      if (decision === 'bad-data') { expectedTarget = '{broken'; await page.evaluate(async id => { await (await import('/js/crypto.js')).encryptedSetItem((await import('/js/profile.js')).profileStorageKey(id, 'imported'), '{broken'); }, destinationId); }
      if (decision === 'receipt-failed') await page.evaluate(() => { (globalThis as typeof globalThis & { __failProfileReceipt?: boolean }).__failProfileReceipt = true; });
      if (decision === 'late-draft') await page.evaluate(id => { (globalThis as typeof globalThis & { __holdProfileRead?: string }).__holdProfileRead = `labcharts-${id}-imported`; }, destinationId);
      await card.getByRole('button', { name: 'Apply', exact: true }).click();
      if (decision === 'late-draft') {
        await expect.poll(() => page.evaluate(() => (globalThis as typeof globalThis & { __profileReadStarted?: boolean }).__profileReadStarted)).toBe(true);
        await page.locator('#chat-input').fill('Keep the draft typed during the switch'); await page.evaluate(() => { (globalThis as typeof globalThis & { __releaseProfileRead?: () => void }).__releaseProfileRead!(); });
      }
      if (selected) {
        await expect.poll(() => page.evaluate(async ({ destinationId, originThread }) => { const { state } = await import('/js/state.js'); return state.currentProfile === destinationId && state.importedData.contextNotes === 'PRIVATE_TARGET_HEALTH' && state.currentThreadId !== originThread; }, { destinationId, originThread })).toBe(true);
        await expect(card).toHaveCount(0);
      }
      else await expect(card).toContainText('Nothing was applied');
      if (decision === 'draft' || decision === 'late-draft') { await expect(page.locator('#chat-input')).toHaveValue(decision === 'draft' ? 'Keep this unsent draft' : 'Keep the draft typed during the switch'); await page.locator('#chat-input').fill(''); }
      if (decision === 'unsaved') expect(await page.evaluate(async () => (await import('/js/state.js')).state.importedData.contextNotes)).toBe('UNSAVED_ORIGIN_EDIT');
    }
    expect(await page.evaluate(async () => (await import('/js/state.js')).state.currentProfile)).toBe(selected ? destinationId : baseline.origin);
    await expect.poll(() => page.evaluate(async () => (await import('/js/state.js')).state.currentProfile === (await import('/js/profile.js')).getActiveProfileId())).toBe(true);
    await page.locator('#chat-input').fill('Tell me whose profile is active.'); await page.locator('#chat-send-btn').click(); await expect(page.locator('#chat-messages')).toContainText(selected ? 'Destination context is ready.' : 'The origin profile is still active.');
    if (selected) {
      expect(await page.evaluate(async () => (await import('/js/state.js')).state.currentThreadId)).not.toBe(originThread);
      expect(await page.evaluate(async () => (await import('/js/state.js')).state.chatHistory.map(message => message.content))).not.toContain(message);
      await page.evaluate(async id => { await (await import('/js/profile.js')).switchProfile(id); }, baseline.origin); await expect(card).toContainText(decision === 'receipt-failed' ? 'Outcome unconfirmed' : 'Profile switch completed');
      await expect(card.getByRole('button', { name: 'Apply', exact: true })).toHaveCount(0); await expect(card.getByRole('button', { name: 'Undo', exact: true })).toHaveCount(0);
      await expect(page.locator('#chat-messages')).not.toContainText('Destination context is ready.');
    }
    const stored = await page.evaluate(async ({ origin, target }) => { const profiles = await import('/js/profile.js'), crypto = await import('/js/crypto.js'); return { origin: await crypto.encryptedGetItem(profiles.profileStorageKey(origin, 'imported')), target: await crypto.encryptedGetItem(profiles.profileStorageKey(target, 'imported')) }; }, baseline);
    expect(stored).toEqual({ origin: baseline.originRaw, target: expectedTarget });
    if (decision === 'encrypted') {
      const protection = await page.evaluate(async ({ origin, target }) => {
        const crypto = await import('/js/crypto.js'), { state } = await import('/js/state.js'), blob = await import('/js/blob-storage.js');
        const record = state.chatHistory.flatMap(message => message.appControls || []).find(record => record.action === 'profile.selection');
        if (!record) throw new Error('Missing native profile receipt');
        const raw = localStorage.getItem(`labcharts-${origin}-app-control-${record.id}`);
        return { receipt: crypto.isEncryptedValue(raw), noPlaintext: !raw?.includes('Origin profile'), source: crypto.isEncryptedValue(await blob.getBlob(`labcharts-${origin}-imported`)), target: crypto.isEncryptedValue(await blob.getBlob(`labcharts-${target}-imported`)) };
      }, baseline);
      expect(protection).toEqual({ receipt: true, noPlaintext: true, source: true, target: true });
    } else {
      await page.reload(); await page.evaluate(async () => { await (await import('/js/chat-loader.js')).openChatPanel(); });
      if (selected) await expect(card).toContainText(decision === 'receipt-failed' ? 'Outcome unconfirmed' : 'Profile switch completed');
    }
    expect(errors).toEqual([]);
  });
}
