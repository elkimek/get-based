import { expect, test } from './coverage-fixture.js';
import { seedDashboardControlProfile, dashboardHealth } from '../helpers/dashboard-control-fixture.js';
import { routeJavaScript } from '../helpers/browser-static-routes.js';

test('chat controls persist, preserve conversation, expire old proposals and allow fresh approved changes', async ({ page, context }) => {
  test.setTimeout(120_000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await context.route('https://**/*', route => route.abort());
  await routeJavaScript(page, '**/js/cloud-ai-consent.js', `export * from '/js/cloud-ai-consent.js?controls-original'; export async function requestAIProcessingApproval(){return true;} export async function requireAIProcessingApproval(){}`);
  let off = false, round = 0, ordinary = false;
  const evidence = 'I want to improve my sleep.';
  await page.route('https://toggle-fixture.example/v1/chat/completions', async route => {
    const body = route.request().postDataJSON();
    const system = String(body.messages[0]?.content || '');
    if (!body.tools && !system.includes('Chat controls are disabled') && !system.includes('You are the AI assistant inside getbased')) {
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content: 'No additional insight.' }, finish_reason: 'stop' }] }) }); return;
    }
    let call: { id: string; type: string; function: { name: string; arguments: string } } | undefined;
    if (off) {
      expect(body.tools).toBeUndefined(); expect(body.response_format).toBeUndefined();
      expect(body.messages[0].content).toContain('Chat controls are disabled'); ordinary = true;
    } else {
      expect(body.tools).toHaveLength(19);
      if (round === 0) call = { id: 'read', type: 'function', function: { name: 'getbased_read_context_card', arguments: '{"card":"healthGoals"}' } };
      if (round === 1) {
        const result = JSON.parse(body.messages.at(-1).content); expect(result.success).toBe(true);
        const snapshot = JSON.parse(result.contentItems[0].text);
        call = { id: 'draft', type: 'function', function: { name: 'getbased_draft_context', arguments: JSON.stringify({ card: 'healthGoals', snapshotId: snapshot.snapshotId, changes: [{ field: 'goals', operation: 'add', record: { text: 'Improve sleep' } }], evidence, reason: 'Explicit goal.' }) } };
      }
      round++;
    }
    await route.fulfill({ contentType: 'text/event-stream', body: 'data: ' + JSON.stringify({ choices: [{ delta: call ? { tool_calls: [{ index: 0, ...call }] } : { content: off ? 'Ordinary answer without app actions.' : 'Review this fresh proposal.' }, finish_reason: call ? 'tool_calls' : 'stop' }] }) + '\n\ndata: [DONE]\n\n' });
  });
  await seedDashboardControlProfile(page);
  await page.evaluate(async () => {
    const api = await import('/js/api.js'); await api.saveCustomApiConnection('https://toggle-fixture.example/v1', 'synthetic-key'); api.setCustomApiModel('fixture'); api.setAIProvider('custom'); api.setAIPaused(false);
    (await import('/js/agent-chat-settings.js')).setChatBackend('direct'); await (await import('/js/chat-loader.js')).openChatPanel();
  });
  const send = async (text: string) => { await page.locator('#chat-input').fill(text); await page.locator('#chat-send-btn').click(); };
  await send(evidence);
  const apply = page.locator('[data-chat-message-action="apply-agent-draft"]'); await expect(apply).toHaveCount(1);
  const oldId = await apply.getAttribute('data-chat-message-draft-id');
  const before = await dashboardHealth(page);
  const toggle = async (enabled: boolean) => {
    await page.evaluate(async () => (await import('/js/settings-loader.js')).openSettingsModal('ai'));
    await expect(page.locator('#chat-controls-toggle')).toBeChecked({ checked: !enabled });
    await page.locator('#chat-controls-toggle').click();
    await expect(page.locator('#chat-controls-toggle')).toBeChecked({ checked: enabled });
    await expect.poll(() => page.evaluate(() => localStorage.getItem('getbased-chat-controls'))).toMatch(enabled ? /^1:/ : /^0:/);
    await page.locator('#settings-modal [data-settings-action="close"]').click();
  };
  await toggle(false); off = true;
  // Persisted setting and existing proposals survive reload, without restoring authority.
  await page.reload(); await page.locator('html[data-app-ready]').waitFor();
  await page.evaluate(async () => { (await import('/js/api.js')).setAIPaused(false); await (await import('/js/chat-loader.js')).openChatPanel(); });
  await send('Explain healthy sleep.'); await expect.poll(() => ordinary).toBe(true);
  await expect(page.locator('#chat-messages')).toContainText('Ordinary answer without app actions.');
  expect(await dashboardHealth(page)).toBe(before);
  await toggle(true); off = false; round = 0;
  await page.locator(`[data-chat-message-action="apply-agent-draft"][data-chat-message-draft-id="${oldId}"]`).click();
  await expect(page.locator('body')).toContainText('review has expired'); expect(await dashboardHealth(page)).toBe(before);
  await send(evidence); await expect(apply).toHaveCount(1);
  await expect(apply).not.toHaveAttribute('data-chat-message-draft-id', oldId!);
  await expect(page.locator('#chat-messages')).toContainText('Replaced by a newer proposal');
  await apply.last().click(); await expect(page.locator('#chat-messages')).toContainText('Applied to getbased');
  await expect.poll(() => page.evaluate(async () => ((await import('/js/state.js')).state.importedData.healthGoals || []).map((goal: { text: string }) => goal.text))).toEqual(['Improve sleep']);
  expect(errors).toEqual([]);
});
