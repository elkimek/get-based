import fs from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { startKitServer } from './kit-release-server.js';
import { activate, artifactInputs, cacheReceipt, profile } from './kit-native-receipts.js';
import { installDiscussionFixture } from '../helpers/chat-discussion-fixture.js';
import { installOfflineStartupDiagnostics } from '../helpers/offline-launch-diagnostics.js';
import { readyLightArtifact as ready, openLightArtifact as openLight } from '../helpers/light-artifact-navigation.js';
import type { AIToolCall } from '../../shared/ai-tool-protocol.js';

const owners = ['js/state.js', 'js/agent-data-bindings.js', 'js/agent-data-apply.js', 'js/agent-health-data-model.js',
  'js/light-env-mutations.js', 'js/light-env-record-store.js', 'js/light-env-records.js', 'js/light-env-proposals.js',
  'js/light-env-store.js', 'js/light-env-editor.js', 'js/light-env-model.js', 'js/light-env-ai-analysis.js',
  'js/light-screen-ai-analysis.js', 'js/light-tools-ai-analysis.js', 'js/sun-context-environment.js',
  'js/agent-draft-presentation.js', 'js/components/ChatAgentDraftCards.svelte'] as const;
async function openChat(page: Page) {
  if (!await page.locator('#chat-panel.open').isVisible()) await activate(page, page.locator('#chat-fab'));
  await expect(page.locator('#chat-input')).toBeVisible();
}
test('static Light chat reviews cascade effects and saves offline through a stopped-origin cold launch', async ({ page, context }, info) => {
  test.setTimeout(180000); const artifact = await artifactInputs(owners, []);
  const seeded = JSON.parse(await fs.readFile(new URL('../fixtures/marker-detail-complete/pwa-profile.json', import.meta.url), 'utf8')) as Record<string, unknown>;
  seeded.entries = (seeded.entries as Record<string, unknown>[]).map((entry, index) => ({ ...entry, panelId: `light-chat-sample-${index}` })); seeded.nutritionMeals = [];
  seeded.contextSourceSettings = { ...seeded.contextSourceSettings as object, 'light-sun': true };
  seeded.lightEnvironment = { rooms: [{ id: 'room-office', name: 'Office', primarySource: 'led-cool', hoursOccupiedPerDay: 8, eveningHoursAfterSunset: null, daylightLevel: 'some', annotation: '/private/light-sentinel' }], screens: [{ id: 'screen-laptop', device: 'laptop', roomId: 'room-office', blueBlockerEnabled: false }], settings: { retained: true } };
  seeded.lightMeasurements = [{ id: 'measure-office', tool: 'lux', value: 100, capturedAt: 100, roomId: 'room-office', extra: { source: '/private/measurement-sentinel' } }];
  const registry = JSON.parse(await fs.readFile(new URL('../fixtures/marker-detail-complete/pwa-registry.json', import.meta.url), 'utf8')) as Record<string, unknown>[];
  await installDiscussionFixture(context, { provider: 'openrouter', paused: false }); await installOfflineStartupDiagnostics(context);
  await context.addInitScript(({ seeded, registry }) => {
    if (!['http:', 'https:'].includes(location.protocol) || localStorage.getItem('light-chat-seeded')) return;
    localStorage.setItem('light-chat-seeded', '1'); localStorage.setItem('labcharts-profiles', JSON.stringify(registry)); localStorage.setItem('labcharts-active-profile', 'default'); localStorage.setItem('labcharts-default-imported', JSON.stringify(seeded));
    localStorage.setItem('labcharts-encryption-enabled', 'false'); localStorage.setItem('labcharts-analytics-disabled', 'true'); localStorage.setItem('labcharts-show-product-recs', 'false'); localStorage.setItem('labcharts-chat-backend', 'direct');
    localStorage.setItem('labcharts-openrouter-key', 'synthetic-light-key'); localStorage.setItem('labcharts-openrouter-model', 'openai/synthetic-light'); localStorage.setItem('labcharts-last-manual-backup', new Date().toISOString());
  }, { seeded, registry });
  const statements = { update: 'My office now uses warm LEDs and I spend two hours there after sunset.', remove: 'Remove my office room from my indoor Light Environment assessment.' };
  let stage: 'update' | 'remove' = 'update', round = 0; const wire: unknown[] = [], errors: string[] = [];
  await context.route('https://openrouter.ai/api/v1/chat/completions', async route => {
    const body = route.request().postDataJSON(); expect(JSON.stringify(body)).not.toMatch(/\/private\/|light-sentinel|measurement-sentinel/);
    if (!body.tools) { await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content: '{"dot":"gray","tip":"Controlled Light verdict","detail":"Unknown measurements remain unknown."}' }, finish_reason: 'stop' }] }) }); return; }
    wire.push({ stage, round }); let call: AIToolCall | undefined;
    if (round === 0) call = { id: `read-${stage}`, type: 'function', function: { name: 'getbased_read_data', arguments: '{"resource":"lightRooms","recordId":"room-office"}' } };
    if (round === 1) {
      const response = JSON.parse(body.messages.at(-1).content); expect(response.success).toBe(true); const current = JSON.parse(response.contentItems[0].text);
      call = { id: `draft-${stage}`, type: 'function', function: { name: 'getbased_draft_data', arguments: JSON.stringify({ resource: 'lightRooms', operation: stage, snapshotId: current.snapshotId, patch: stage === 'remove' ? '{}' : '{"primarySource":"led-warm","eveningHoursAfterSunset":2}', evidence: statements[stage], reason: 'The user reported their Light Environment change.' }) } };
    }
    if (round === 2) {
      const result = JSON.parse(body.messages.at(-1).content); expect(result.success).toBe(true); const review = JSON.parse(result.contentItems[0].text).review; expect(review.applied).toBe(false);
      if (stage === 'remove') expect(review.effects).toEqual({ unlinkedScreens: [{ id: 'screen-laptop', device: 'laptop' }], preservedMeasurementCount: 1 });
    }
    round++; await route.fulfill({ contentType: 'text/event-stream', body: `data: ${JSON.stringify({ choices: [{ delta: call ? { tool_calls: [{ index: 0, ...call }] } : { content: 'Review the changed room and any screen/history effects before applying.' }, finish_reason: call ? 'tool_calls' : 'stop' }] })}\n\ndata: [DONE]\n\n` });
  });
  page.on('pageerror', error => errors.push(error.message)); context.on('page', target => target.on('pageerror', error => errors.push(error.message)));
  const server = await startKitServer(artifact.directory); let stopped = false; const receipts: Record<string, Awaited<ReturnType<typeof profile>>> = {};
  try {
    await ready(page, server.origin); server.state.offline = true; await openChat(page); receipts.before = await profile(page, artifact.state);
    for (const next of ['update', 'remove'] as const) {
      stage = next; round = 0; await expect(page.locator('#chat-send-btn.streaming')).toHaveCount(0);
      await page.locator('#chat-input').fill(statements[stage]); await activate(page, page.locator('#chat-send-btn'));
      await expect(page.locator('.chat-agent-draft-pending, #cloud-ai-consent-overlay.show')).toBeVisible();
      const consent = page.locator('#cloud-ai-consent-overlay.show'); if (await consent.isVisible()) { await consent.locator('input[type="checkbox"]').check(); await activate(page, consent.locator('[data-ai-processing-action="approve"]')); }
      const card = page.locator('.chat-agent-draft-pending'); await expect(card).toContainText('Light Rooms');
      if (stage === 'remove') { await expect(card).toContainText('Unlinked screens'); await expect(card).toContainText('Preserved measurements'); }
      expect((await profile(page, artifact.state)).stored).toEqual((receipts.update || receipts.before).stored);
      await page.setViewportSize({ width: 390, height: 844 }); expect(await card.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
      const violations = await card.evaluate(async node => (await (window as unknown as { axe: typeof import('axe-core') }).axe.run(node, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.map(row => row.id)); expect(violations).toEqual([]);
      await page.screenshot({ path: info.outputPath(`light-${stage}-review-mobile.png`), fullPage: true });
      await card.getByRole('button', { name: 'Apply', exact: true }).focus(); await page.keyboard.press('Enter'); await expect(page.locator('.chat-agent-draft-applied')).toHaveCount(stage === 'update' ? 1 : 2); receipts[stage] = await profile(page, artifact.state);
    }
    if (!receipts.remove) throw new Error('The removal approval receipt is missing.');
    const before = receipts.before.stored as typeof seeded, saved = receipts.remove.stored as typeof seeded;
    const environment = saved.lightEnvironment as { rooms: unknown[]; screens: Record<string, unknown>[]; settings: unknown };
    expect(environment.rooms).toEqual([]); expect(environment.screens).toEqual([{ ...(before.lightEnvironment as typeof environment).screens[0], roomId: null, updatedAt: expect.any(Number) }]); expect(environment.settings).toEqual((before.lightEnvironment as typeof environment).settings);
    expect(saved.lightMeasurements).toEqual([{ ...(before.lightMeasurements as object[])[0], roomSnapshot: { id: 'room-office', name: 'Office' }, updatedAt: expect.any(Number) }]);
    const protectedFields = (value: Record<string, unknown>) => Object.fromEntries(Object.entries(value).filter(([key]) => !['lightEnvironment', 'lightMeasurements', '_deleted', '_deletedAt', '_deletedClearedAt'].includes(key)));
    expect(protectedFields(saved)).toEqual(protectedFields(before)); expect(wire).toHaveLength(6); await cacheReceipt(page, artifact);
    await server.close(); stopped = true; await expect(fetch(server.origin + '/app')).rejects.toThrow(); await page.close(); expect(context.pages()).toHaveLength(0);
    page = await context.newPage(); await ready(page, server.origin); receipts.cold = await profile(page, artifact.state); expect(receipts.cold).toEqual(receipts.remove);
    await openChat(page); await expect(page.locator('.chat-agent-draft-applied')).toHaveCount(2); await page.setViewportSize({ width: 1280, height: 900 }); await openLight(page);
    await activate(page, page.locator('[data-light-env-action="open-assessment"]')); const dialog = page.getByRole('dialog', { name: 'Indoor Light Assessment', exact: true }); await expect(dialog).toBeVisible(); await expect(dialog.locator('[data-light-environment-room]')).toHaveCount(0); await expect(dialog.locator('[data-light-environment-screen]')).toHaveCount(1);
    expect(errors).toEqual([]); expect(await artifactInputs(owners, [])).toEqual(artifact);
  } finally {
    await info.attach('static-light-chat-receipt', { body: JSON.stringify({ artifact, receipts, wire, errors, stopped, boundary: 'Real static chat/native tools and keyboard approvals, controlled OpenRouter output, offline first use, complete protected receipts, mobile/axe, cached source bodies and stopped-origin zero-page cold launch. No runtime mutation calls or live inference.' }, null, 2), contentType: 'application/json' });
    if (!stopped) await server.close();
  }
});
