import fs from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { startKitServer } from './kit-release-server.js';
import { activate, artifactInputs, cacheReceipt, profile } from './kit-native-receipts.js';
import { installDiscussionFixture } from '../helpers/chat-discussion-fixture.js';
import { installOfflineStartupDiagnostics } from '../helpers/offline-launch-diagnostics.js';
import { readyLightArtifact as ready, openLightArtifact as openLight } from '../helpers/light-artifact-navigation.js';
import type { AIToolCall } from '../../shared/ai-tool-protocol.js';

const owners = ['js/state.js', 'js/agent-data-bindings.js', 'js/agent-data-apply.js', 'js/agent-data-model.js',
  'js/light-device-fields.js', 'js/light-device-mutations.js', 'js/light-device-proposals.js', 'js/light-device-records.js',
  'js/light-devices-store.js', 'js/light-devices.js', 'js/light-device-session-engine.js', 'js/light-env-record-store.js',
  'js/agent-draft-presentation.js', 'js/components/ChatAgentDraftCards.svelte'] as const;
async function openChat(page: Page) {
  if (!await page.locator('#chat-panel.open').isVisible()) await activate(page, page.locator('#chat-fab'));
  await expect(page.locator('#chat-input')).toBeVisible();
}
test('static device chat corrections and removal retain source history offline through stopped-origin cold launch', async ({ page, context }, info) => {
  test.setTimeout(180000); const artifact = await artifactInputs(owners, []);
  const seeded = JSON.parse(await fs.readFile(new URL('../fixtures/marker-detail-complete/pwa-profile.json', import.meta.url), 'utf8')) as Record<string, unknown>;
  seeded.entries = (seeded.entries as Record<string, unknown>[]).map((entry, index) => ({ ...entry, panelId: `device-chat-sample-${index}` })); seeded.nutritionMeals = [];
  seeded.sunDefaults = { fitzpatrick: 'II', completedAt: 1 }; seeded.deviceSessions = [];
  seeded.contextSourceSettings = { ...seeded.contextSourceSettings as object, 'light-sun': true };
  seeded.lightDevices = [{ id: 'dev-panel', brand: 'Synthetic', model: 'Panel', type: 'combined', peakWavelengths: [660, 850], peakShares: [0.5, 0.5], peakShareBasis: 'reported', mwPerCm2At15cm: 20, recommendedDistanceCm: 15, distanceModel: 'reference-only', irradianceBasis: 'user-entered', annotation: 'device-private-sentinel', specSourceUrl: '/private/device-spec.pdf' }];
  const registry = JSON.parse(await fs.readFile(new URL('../fixtures/marker-detail-complete/pwa-registry.json', import.meta.url), 'utf8')) as Record<string, unknown>[];
  await installDiscussionFixture(context, { provider: 'openrouter', paused: true }); await installOfflineStartupDiagnostics(context);
  await context.addInitScript(({ seeded, registry }) => {
    if (!['http:', 'https:'].includes(location.protocol) || localStorage.getItem('device-chat-seeded')) return;
    localStorage.setItem('device-chat-seeded', '1'); localStorage.setItem('labcharts-profiles', JSON.stringify(registry)); localStorage.setItem('labcharts-active-profile', 'default'); localStorage.setItem('labcharts-default-imported', JSON.stringify(seeded));
    localStorage.setItem('labcharts-encryption-enabled', 'false'); localStorage.setItem('labcharts-analytics-disabled', 'true'); localStorage.setItem('labcharts-show-product-recs', 'false'); localStorage.setItem('labcharts-chat-backend', 'direct');
    localStorage.setItem('labcharts-openrouter-key', 'synthetic-device-key'); localStorage.setItem('labcharts-openrouter-model', 'openai/synthetic-device'); localStorage.setItem('labcharts-last-manual-backup', new Date().toISOString());
  }, { seeded, registry });
  const statements = { duration: 'My recorded panel session actually started at 2026-10-23T10:00:00Z and lasted 20 minutes.', specification: 'My panel reference irradiance is actually 40 mW per square centimetre at its recorded 15 cm reference distance.', removeDevice: 'Remove my panel from my saved Light devices, keeping its recorded sessions.' };
  let stage: keyof typeof statements = 'duration', round = 0, sessionId = ''; const wire: unknown[] = [], errors: string[] = [];
  await context.route('https://openrouter.ai/api/v1/chat/completions', async route => {
    const body = route.request().postDataJSON(); expect(JSON.stringify(body)).not.toMatch(/\/private\/|device-private-sentinel/);
    if (!body.tools) { await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content: '{"dot":"gray","tip":"Controlled device verdict","detail":"Synthetic recorded-session fixture."}' }, finish_reason: 'stop' }] }) }); return; }
    wire.push({ stage, round }); const resource = stage === 'duration' ? 'lightDeviceSessions' : 'lightDevices'; let call: AIToolCall | undefined;
    if (round === 0) call = { id: `read-${stage}`, type: 'function', function: { name: 'getbased_read_data', arguments: JSON.stringify({ resource, recordId: stage === 'duration' ? sessionId : 'dev-panel' }) } };
    if (round === 1) {
      const response = JSON.parse(body.messages.at(-1).content); expect(response.success).toBe(true); const current = JSON.parse(response.contentItems[0].text);
      call = { id: `draft-${stage}`, type: 'function', function: { name: 'getbased_draft_data', arguments: JSON.stringify({ resource, operation: stage === 'removeDevice' ? 'remove' : 'update', snapshotId: current.snapshotId, patch: stage === 'duration' ? '{"durationMin":20,"startedAt":"2026-10-23T10:00:00Z"}' : stage === 'specification' ? '{"mwPerCm2At15cm":40}' : '{}', evidence: statements[stage], reason: 'The user explicitly reported this correction or removal.' }) } };
    }
    if (round === 2) {
      const result = JSON.parse(body.messages.at(-1).content); expect(result.success).toBe(true); const review = JSON.parse(result.contentItems[0].text).review; expect(review.applied).toBe(false);
      if (stage === 'removeDevice') expect(review.effects.retainedSessionCount).toBe(1);
      else { expect(review.effects.recalculatedSessions).toHaveLength(1); expect(review.effects.recalculatedSessions[0].afterDoses.pbm_red).toBeCloseTo(review.effects.recalculatedSessions[0].beforeDoses.pbm_red * 2, 8); }
    }
    round++; await route.fulfill({ contentType: 'text/event-stream', body: `data: ${JSON.stringify({ choices: [{ delta: call ? { tool_calls: [{ index: 0, ...call }] } : { content: 'Review the device/session correction and retained history before applying.' }, finish_reason: call ? 'tool_calls' : 'stop' }] })}\n\ndata: [DONE]\n\n` });
  });
  page.on('pageerror', error => errors.push(error.message)); context.on('page', target => target.on('pageerror', error => errors.push(error.message)));
  const server = await startKitServer(artifact.directory); let stopped = false; const receipts: Record<string, Awaited<ReturnType<typeof profile>>> = {};
  try {
    await ready(page, server.origin); server.state.offline = true; await openLight(page);
    // Create the baseline through the real offline native form, without runtime mutation calls.
    await activate(page, page.locator('[data-light-devices-action="log-device-session"][data-light-device-id="dev-panel"]'));
    const dialog = page.getByRole('dialog', { name: 'Log device session', exact: true }); await expect(dialog).toBeVisible();
    await dialog.locator('#dev-session-duration').fill('10'); await dialog.locator('#dev-session-distance').fill('15');
    await expect(dialog.locator('#dev-session-eyes')).toBeChecked(); await activate(page, dialog.getByRole('button', { name: 'Save session', exact: true })); await expect(dialog).not.toBeVisible();
    receipts.before = await profile(page, artifact.state); const initial = receipts.before.stored as typeof seeded;
    const session = (initial.deviceSessions as Array<{ id: string; doses: { pbm_red: number } }>)[0]; if (!session) throw new Error('The native session receipt is missing.'); sessionId = session.id;
    // Leave Light with automatic insights paused before resuming Chat. A separate
    // weekly analysis must not race this proposal's complete-profile receipt.
    await activate(page, page.locator('[data-nav-action="navigate"][data-nav-route="body"]'));
    await expect(page.locator('.lens-page-header h2')).toHaveText('Biometrics');
    await openChat(page); await activate(page, page.locator('[data-chat-empty-action="resume-ai"]'));
    for (const [index, next] of (['duration', 'specification', 'removeDevice'] as const).entries()) {
      stage = next; round = 0; await expect(page.locator('#chat-send-btn.streaming')).toHaveCount(0);
      await page.locator('#chat-input').fill(statements[stage]); await activate(page, page.locator('#chat-send-btn'));
      await expect(page.locator('.chat-agent-draft-pending, #cloud-ai-consent-overlay.show')).toBeVisible();
      const consent = page.locator('#cloud-ai-consent-overlay.show'); if (await consent.isVisible()) { await consent.locator('input[type="checkbox"]').check(); await activate(page, consent.locator('[data-ai-processing-action="approve"]')); }
      const card = page.locator('.chat-agent-draft-pending'); await expect(card).toContainText(stage === 'removeDevice' ? 'Preserved sessions' : 'Recalculated sessions');
      expect((await profile(page, artifact.state)).stored).toEqual((receipts.specification || receipts.duration || receipts.before).stored);
      await page.setViewportSize({ width: 390, height: 844 }); expect(await card.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
      const violations = await card.evaluate(async node => (await (window as unknown as { axe: typeof import('axe-core') }).axe.run(node, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.map(row => row.id)); expect(violations).toEqual([]);
      await page.screenshot({ path: info.outputPath(`device-${stage}-review-mobile.png`), fullPage: true }); await card.getByRole('button', { name: 'Apply', exact: true }).focus(); await page.keyboard.press('Enter');
      await expect(page.locator('.chat-agent-draft-applied')).toHaveCount(index + 1); receipts[stage] = await profile(page, artifact.state);
    }
    if (!receipts.removeDevice) throw new Error('The removal receipt is missing.');
    const saved = receipts.removeDevice.stored as typeof seeded, sessions = saved.deviceSessions as Array<{ durationMin: number; startedAt: number; endedAt: number; doses: { pbm_red: number }; deviceSnapshot: { mwPerCm2At15cm: number }; editHistory: unknown[] }>;
    expect(saved.lightDevices).toEqual([]); expect(sessions).toHaveLength(1); expect(sessions[0]!.durationMin).toBe(20); expect(sessions[0]!.startedAt).toBe(Date.parse('2026-10-23T10:00:00Z')); expect(sessions[0]!.endedAt).toBe(sessions[0]!.startedAt + 20 * 60000); expect(sessions[0]!.doses.pbm_red).toBeCloseTo(session.doses.pbm_red * 4, 8); expect(sessions[0]!.deviceSnapshot.mwPerCm2At15cm).toBe(40); expect(sessions[0]!.editHistory).toHaveLength(2);
    const protectedFields = (value: Record<string, unknown>) => Object.fromEntries(Object.entries(value).filter(([key]) => !['lightDevices', 'deviceSessions', '_deleted', '_deletedAt', '_deletedClearedAt'].includes(key)));
    expect(protectedFields(saved)).toEqual(protectedFields(initial)); expect(wire).toHaveLength(9); await cacheReceipt(page, artifact);
    await server.close(); stopped = true; await expect(fetch(server.origin + '/app')).rejects.toThrow(); await page.close(); expect(context.pages()).toHaveLength(0);
    page = await context.newPage(); await ready(page, server.origin); await openLight(page);
    receipts.cold = await profile(page, artifact.state); expect(receipts.cold).toEqual(receipts.removeDevice);
    await openChat(page); await expect(page.locator('.chat-agent-draft-applied')).toHaveCount(3); await page.setViewportSize({ width: 1280, height: 900 }); await openLight(page);
    await expect(page.locator(`[data-light-history-row][data-id="${sessionId}"]`)).toContainText('20 min'); await expect(page.locator('.light-device-card')).toHaveCount(0);
    expect(errors).toEqual([]); expect(await artifactInputs(owners, [])).toEqual(artifact);
  } finally {
    await info.attach('static-device-chat-receipt', { body: JSON.stringify({ artifact, receipts, wire, errors, stopped, boundary: 'Actual native baseline form, static public chat/native tool loop/three trusted keyboard approvals, controlled provider output, offline first use, complete receipts, mobile/axe, runtime source/cache hashes and stopped-origin zero-page cold launch. No runtime mutation calls or live provider inference.' }, null, 2), contentType: 'application/json' });
    if (!stopped) await server.close();
  }
});
