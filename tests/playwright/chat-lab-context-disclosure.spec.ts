import { CHAT_TOOL_INSTRUCTIONS } from '../../shared/chat-tool-instructions.js';
import { expect, test } from './coverage-fixture.js';
import { routeJavaScript } from '../helpers/browser-static-routes.js';

for (const protocol of ['native', 'structured'] as const) test(`${protocol} chat sends independent samples and honors revoked lab groups`, async ({ page }) => {
  await routeJavaScript(page, '**/js/cloud-ai-consent.js', `export * from '/js/cloud-ai-consent.js?disclosure-consent-original'; export async function requestAIProcessingApproval(){return true;} export async function requireAIProcessingApproval(){}`);
  let stage = 0, deniedRead = false, reviewedEnabled = false, reviewedDisabled = false;
  await page.route('https://synthetic-disclosure-provider.example/v1/chat/completions', async route => {
    const body = route.request().postDataJSON();
    if (protocol === 'structured' && body.tools) { await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: { message: 'tools not supported' } }) }); return; }
    const system = body.messages[0].content;
    if (!system.includes(CHAT_TOOL_INSTRUCTIONS)) {
      // The ordinary dashboard can request an independent automatic insight.
      // Its context must honor the same source policy, without chat tool rounds.
      if (stage) expect(JSON.stringify(body.messages)).not.toMatch(/SYNTHETIC_PRIVATE_GLUCOSE|SYNTHETIC_SERUM|SYNTHETIC_PLASMA|01:13|02:27|PRIVATE_MARKER_NOTE|PRIVATE_DATED_NOTE/);
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content: 'Synthetic dashboard insight.' }, finish_reason: 'stop' }] }) }); return;
    }
    if (!stage) {
      expect(system).toContain('2026-10-20: collection time 01:13; fasting; specimen SYNTHETIC_SERUM [sample morning]');
      expect(system).toContain('2026-10-20: collection time 02:27; not fasting; specimen SYNTHETIC_PLASMA [sample evening]');
      expect(system).toContain('[sample morning]: SYNTHETIC_PRIVATE_GLUCOSE (biochemistry.glucose): 5 mmol/l');
      expect(system).toContain('[sample evening]: SYNTHETIC_PRIVATE_GLUCOSE (biochemistry.glucose): 7 mmol/l');
      expect(system).toContain('PRIVATE_MARKER_NOTE'); expect(system).toContain('PRIVATE_DATED_NOTE'); reviewedEnabled = true;
    } else {
      expect(system).not.toMatch(/SYNTHETIC_PRIVATE_GLUCOSE|SYNTHETIC_SERUM|SYNTHETIC_PLASMA|01:13|02:27|PRIVATE_MARKER_NOTE|PRIVATE_DATED_NOTE|2026-10-20/);
      expect(system).toContain('PUBLIC_INSULIN_NOTE'); expect(system).toContain('09:43'); reviewedDisabled = true;
    }
    const last = body.messages.at(-1);
    if (stage && (last.role === 'tool' || String(last.content).startsWith('getbased tool result'))) {
      const result = protocol === 'native' ? JSON.parse(last.content) : JSON.parse(last.content.slice(last.content.indexOf('{"id":'))).output;
      expect(result.success).toBe(false); expect(JSON.stringify(result)).not.toMatch(/SYNTHETIC_SERUM|PRIVATE_MARKER_NOTE/); deniedRead = true;
    }
    const call = stage && !deniedRead ? { id: 'read-private-sample', type: 'function', function: { name: 'getbased_read_data', arguments: JSON.stringify({ resource: 'labSamples', recordId: 'morning' }) } } : undefined;
    const reply = stage ? 'Only the enabled sample context is available.' : 'The separate sample context is available.';
    if (protocol === 'structured') await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content: JSON.stringify({ reply: call ? '' : reply, calls: call ? [{ id: call.id, name: call.function.name, arguments: call.function.arguments }] : [] }) }, finish_reason: 'stop' }] }) });
    else await route.fulfill({ contentType: 'text/event-stream', body: `data: ${JSON.stringify({ choices: [{ delta: call ? { tool_calls: [{ index: 0, ...call }] } : { content: reply }, finish_reason: call ? 'tool_calls' : 'stop' }] })}\n\ndata: [DONE]\n\n` });
  });
  await page.goto('/app');
  await page.evaluate(async () => {
    const profile = await import('/js/profile.js'), id = await profile.createProfile('Synthetic outgoing context test', { sex: 'male', skipInitialSync: true });
    for (const key of ['tour', 'emptyTour']) localStorage.setItem(profile.profileStorageKey(id, key), 'completed');
    localStorage.setItem(`labcharts-onboard-extras-done-${id}`, '1'); localStorage.setItem(`labcharts-onboard-context-cards-skipped-${id}`, '1'); await profile.switchProfile(id);
    const { state } = await import('/js/state.js');
    state.importedData.entries = [
      { panelId: 'morning', date: '2026-10-20', markers: { 'biochemistry.glucose': 5 }, context: { sampleTime: '01:13', fasting: true }, specimen: 'SYNTHETIC_SERUM' },
      { panelId: 'evening', date: '2026-10-20', markers: { 'biochemistry.glucose': 7 }, context: { sampleTime: '02:27', fasting: false }, specimen: 'SYNTHETIC_PLASMA' },
      { panelId: 'public', date: '2026-10-21', markers: { 'diabetes.insulin': 17.3 }, context: { sampleTime: '09:43' } },
    ];
    state.importedData.markerLabels = { 'biochemistry.glucose': 'SYNTHETIC_PRIVATE_GLUCOSE' };
    state.importedData.markerNotes = { 'biochemistry.glucose': 'PRIVATE_MARKER_NOTE', 'diabetes.insulin': 'PUBLIC_INSULIN_NOTE' };
    state.importedData.markerValueNotes = { 'biochemistry.glucose:2026-10-20': 'PRIVATE_DATED_NOTE' };
    if (!await (await import('/js/data.js')).saveImportedData()) throw new Error('Synthetic data save failed');
    const api = await import('/js/api.js'); await api.saveCustomApiConnection('https://synthetic-disclosure-provider.example/v1', 'synthetic-key'); api.setCustomApiModel('synthetic'); api.setAIProvider('custom'); api.setAIPaused(false);
    (await import('/js/agent-chat-settings.js')).setChatBackend('direct'); await (await import('/js/chat-loader.js')).openChatPanel();
  });
  await page.locator('#chat-input').fill('Explain my samples.'); await page.locator('#chat-send-btn').click();
  await expect(page.locator('#chat-messages')).toContainText('The separate sample context is available.'); expect(reviewedEnabled).toBe(true);
  await page.evaluate(async () => { (await import('/js/lab-context-settings.js')).setGroupInAIContext('Biochemistry', false); if (!await (await import('/js/data.js')).saveImportedData()) throw new Error('Synthetic context preference save failed'); });
  stage = 1;
  await page.locator('#chat-input').fill('And now?'); await page.locator('#chat-send-btn').click();
  await expect(page.locator('#chat-messages')).toContainText('Only the enabled sample context is available.'); expect(reviewedDisabled).toBe(true); expect(deniedRead).toBe(true);
  const receipt = await page.evaluate(async () => (await import('/js/state.js')).state.chatHistory.filter(message => message.role === 'assistant').at(-1)?.context);
  expect(JSON.stringify(receipt)).not.toContain('separate samples');
  await page.reload();
  const restored = await page.evaluate(async () => {
    const settings = await import('/js/lab-context-settings.js'), { buildChatLabContext } = await import('/js/chat-prompt-context.js');
    return { enabled: settings.isGroupInAIContext('Biochemistry'), context: buildChatLabContext('Explain my samples.') };
  });
  expect(restored.enabled).toBe(false); expect(restored.context).not.toMatch(/PRIVATE_MARKER_NOTE|PRIVATE_DATED_NOTE|SYNTHETIC_PRIVATE_GLUCOSE|01:13|02:27/); expect(restored.context).toContain('PUBLIC_INSULIN_NOTE');
});
