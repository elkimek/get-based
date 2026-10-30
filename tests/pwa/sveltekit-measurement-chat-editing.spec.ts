import fs from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import type { ProfileData } from '../../types/app-state.js';
import type { AIToolCall } from '../../shared/ai-tool-protocol.js';
import { startKitServer } from './kit-release-server.js';
import { activate, artifactInputs, cacheReceipt, profile } from './kit-native-receipts.js';
import { installDiscussionFixture } from '../helpers/chat-discussion-fixture.js';
import { installOfflineStartupDiagnostics } from '../helpers/offline-launch-diagnostics.js';
import { readyLightArtifact as ready } from '../helpers/light-artifact-navigation.js';
const owners = ['js/state.js', 'js/agent-data-bindings.js', 'js/agent-data-model.js', 'js/agent-data-apply.js', 'js/agent-draft-presentation.js',
  'js/light-measurement-fields.js', 'js/light-measurement-mutations.js', 'js/light-measurement-proposals.js', 'js/light-measurement-store.js', 'js/light-measurement-records.js',
  'js/light-env-mutations.js', 'js/light-env-proposals.js', 'js/light-env-records.js', 'js/light-env-store.js', 'js/light-env-record-store.js', 'js/light-tools.js', 'js/light-env-audits.js', 'js/light-env.js', 'js/light-tools-ai-analysis.js', 'js/light-audit-ai-analysis.js', 'js/components/ChatAgentDraftCards.svelte'] as const;
async function openAssessment(page: Page) {
  const close = page.getByRole('button', { name: 'Close chat', exact: true }); if (await close.isVisible()) await activate(page, close);
  const menu = page.getByRole('button', { name: 'Menu', exact: true }); if (await menu.isVisible()) await activate(page, menu);
  await activate(page, page.locator('#sidebar-nav').getByRole('button', { name: /^Light assessment/ }));
  await expect(page.getByRole('dialog', { name: 'Indoor Light Assessment', exact: true })).toBeVisible();
}
async function openChat(page: Page) { const assessment = page.getByRole('dialog', { name: 'Indoor Light Assessment', exact: true }); if (await assessment.isVisible()) await activate(page, assessment.getByRole('button', { name: 'Close', exact: true })); if (!await page.locator('#chat-panel.open').isVisible()) await activate(page, page.locator('#chat-fab')); await expect(page.locator('#chat-input')).toBeVisible(); }
test('static measurement correction, checkpoint and removal preserve frozen source evidence offline across stopped-origin cold launch', async ({ page, context }, info) => {
  test.setTimeout(180000); const artifact = await artifactInputs(owners, []);
  const seeded = JSON.parse(await fs.readFile(new URL('../fixtures/marker-detail-complete/pwa-profile.json', import.meta.url), 'utf8')) as ProfileData;
  seeded.entries = seeded.entries.map((entry, index) => ({ ...entry, panelId: `measurement-chat-sample-${index}` })); seeded.nutritionMeals = [];
  seeded.contextSourceSettings = { ...seeded.contextSourceSettings, 'light-sun': true };
  seeded.lightEnvironment = { rooms: [{ id: 'room-office', name: 'Office', primarySource: 'led-warm', hoursOccupiedPerDay: 8, eveningHoursAfterSunset: null, annotation: '/private/room-source' }], screens: [] };
  seeded.lightMeasurements = [{ id: 'measure-office', tool: 'lux', value: 100, capturedAt: Date.now() - 3600000, roomId: 'room-office', confidence: 0.85, extra: { source: 'manual-entry', context: 'daytime', annotation: 'measurement-private-sentinel' } }]; seeded.lightAudits = [];
  const registry = JSON.parse(await fs.readFile(new URL('../fixtures/marker-detail-complete/pwa-registry.json', import.meta.url), 'utf8')) as Record<string, unknown>[];
  await installDiscussionFixture(context, { provider: 'openrouter', paused: true }); await installOfflineStartupDiagnostics(context);
  await context.addInitScript(({ seeded, registry }) => {
    if (!['http:', 'https:'].includes(location.protocol) || localStorage.getItem('measurement-chat-seeded')) return;
    localStorage.setItem('measurement-chat-seeded', '1'); localStorage.setItem('labcharts-profiles', JSON.stringify(registry)); localStorage.setItem('labcharts-active-profile', 'default'); localStorage.setItem('labcharts-default-imported', JSON.stringify(seeded));
    localStorage.setItem('labcharts-encryption-enabled', 'false'); localStorage.setItem('labcharts-analytics-disabled', 'true'); localStorage.setItem('labcharts-show-product-recs', 'false'); localStorage.setItem('labcharts-chat-backend', 'direct');
    localStorage.setItem('labcharts-openrouter-key', 'synthetic-measurement-key'); localStorage.setItem('labcharts-openrouter-model', 'openai/synthetic-measurement'); localStorage.setItem('labcharts-last-manual-backup', new Date().toISOString());
  }, { seeded, registry });
  const statements = { value: 'My office meter reading was actually 250 lux.', checkpoint: 'Save a checkpoint of my current light environment called After correction.', remove: 'Remove my current office lux reading, keeping my saved audit checkpoints.', removeRoom: 'Remove my office room, keeping my saved audit checkpoints.' };
  let stage: keyof typeof statements = 'value', round = 0, checkpointId = ''; const wire: unknown[] = [], errors: string[] = [];
  await context.route('https://openrouter.ai/api/v1/chat/completions', async route => {
    const body = route.request().postDataJSON(); expect(JSON.stringify(body)).not.toMatch(/measurement-private-sentinel|\/private\//);
    if (/^You (?:evaluate|interpret|summarize)/.test(String(body.messages[0]?.content || ''))) { await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content: '{"dot":"gray","tip":"Controlled light interpretation","detail":"Reported facts and frozen source evidence."}' }, finish_reason: 'stop' }] }) }); return; }
    wire.push({ stage, round }); const resource = stage === 'checkpoint' ? 'lightAudits' : stage === 'removeRoom' ? 'lightRooms' : 'lightMeasurements'; let call: AIToolCall | undefined;
    if (round === 0) call = { id: `read-${stage}`, type: 'function', function: { name: 'getbased_read_data', arguments: JSON.stringify({ resource, ...(stage === 'checkpoint' ? { create: true } : { recordId: stage === 'removeRoom' ? 'room-office' : 'measure-office' }) }) } };
    if (round === 1) {
      const response = JSON.parse(body.messages.at(-1).content); expect(response.success).toBe(true); const current = JSON.parse(response.contentItems[0].text); if (stage === 'checkpoint') checkpointId = current.recordId;
      call = { id: `draft-${stage}`, type: 'function', function: { name: 'getbased_draft_data', arguments: JSON.stringify({ resource, operation: stage === 'checkpoint' ? 'add' : stage === 'remove' || stage === 'removeRoom' ? 'remove' : 'update', snapshotId: current.snapshotId, patch: stage === 'value' ? '{"value":250,"unit":"lux"}' : stage === 'checkpoint' ? '{"label":"After correction"}' : '{}', evidence: statements[stage], reason: 'The user explicitly reported this correction or checkpoint operation.' }) } };
    }
    if (round === 2) { const response = JSON.parse(body.messages.at(-1).content); expect(response.success).toBe(true); const review = JSON.parse(response.contentItems[0].text).review; expect(review.applied).toBe(false); if (stage === 'checkpoint') expect(review.effects.capturedCounts).toEqual({ rooms: 1, screens: 0, measurements: 1 }); }
    round++; await route.fulfill({ contentType: 'text/event-stream', body: `data: ${JSON.stringify({ choices: [{ delta: call ? { tool_calls: [{ index: 0, ...call }] } : { content: 'Review the reading or frozen checkpoint before applying.' }, finish_reason: call ? 'tool_calls' : 'stop' }] })}\n\ndata: [DONE]\n\n` });
  });
  page.on('pageerror', error => errors.push(error.message)); context.on('page', target => target.on('pageerror', error => errors.push(error.message)));
  const server = await startKitServer(artifact.directory); let stopped = false; const receipts: Record<string, Awaited<ReturnType<typeof profile>>> = {};
  try {
    await ready(page, server.origin); server.state.offline = true; await openAssessment(page);
    // The baseline checkpoint is made through the real native form while offline.
    await activate(page, page.locator('[data-light-env-action="save-audit"]'));
    const dialog = page.getByRole('dialog').filter({ has: page.getByRole('button', { name: 'Save audit', exact: true }) });
    await expect(dialog).toBeVisible(); await dialog.getByRole('textbox').fill('Original'); await activate(page, dialog.getByRole('button', { name: 'Save audit', exact: true })); await expect(dialog).not.toBeVisible();
    await expect(page.locator('.light-audit-card')).toContainText('Original');
    await activate(page, page.getByRole('dialog', { name: 'Indoor Light Assessment', exact: true }).getByRole('button', { name: 'Close', exact: true }));
    await activate(page, page.locator('[data-nav-action="navigate"][data-nav-route="body"]')); await expect(page.locator('.lens-page-header h2')).toHaveText('Biometrics');
    receipts.before = await profile(page, artifact.state); const initial = receipts.before.stored as ProfileData;
    await openChat(page); await activate(page, page.locator('[data-chat-empty-action="resume-ai"]'));
    for (const [index, next] of (['value', 'checkpoint', 'remove', 'removeRoom'] as const).entries()) {
      stage = next; round = 0; await expect(page.locator('#chat-send-btn.streaming')).toHaveCount(0); await page.locator('#chat-input').fill(statements[stage]); await activate(page, page.locator('#chat-send-btn'));
      await expect(page.locator('.chat-agent-draft-pending, #cloud-ai-consent-overlay.show')).toBeVisible(); const consent = page.locator('#cloud-ai-consent-overlay.show'); if (await consent.isVisible()) { await consent.locator('input[type="checkbox"]').check(); await activate(page, consent.locator('[data-ai-processing-action="approve"]')); }
      const card = page.locator('.chat-agent-draft-pending'); await expect(card).toContainText(stage === 'checkpoint' ? 'Frozen checkpoint' : stage === 'removeRoom' ? 'Light Rooms' : 'Preserved checkpoints');
      expect((await profile(page, artifact.state)).stored).toEqual((receipts.remove || receipts.checkpoint || receipts.value || receipts.before).stored);
      await page.setViewportSize({ width: 390, height: 844 }); expect(await card.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
      const violations = await card.evaluate(async node => (await (window as unknown as { axe: typeof import('axe-core') }).axe.run(node, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.map(row => row.id)); expect(violations).toEqual([]);
      await page.screenshot({ path: info.outputPath(`measurement-${stage}-review-mobile.png`), fullPage: true }); await card.getByRole('button', { name: 'Apply', exact: true }).focus(); await page.keyboard.press('Enter'); await expect(page.locator('.chat-agent-draft-applied')).toHaveCount(index + 1);
      if (stage === 'checkpoint') await expect.poll(async () => ((await profile(page, artifact.state)).stored as ProfileData).lightAudits?.find(row => row.id === checkpointId)?.aiAnalysis?.status).toBe('ok');
      receipts[stage] = await profile(page, artifact.state);
    }
    if (!receipts.removeRoom) throw new Error('Missing accepted room removal.'); const saved = receipts.removeRoom.stored as ProfileData;
    expect(saved.lightMeasurements).toEqual([]); expect(saved.lightEnvironment?.rooms).toEqual([]); expect(saved.lightAudits).toHaveLength(2); expect(saved.lightAudits![0]).toEqual(initial.lightAudits![0]);
    const checkpoint = saved.lightAudits!.find(row => row.id === checkpointId); expect(checkpoint.label).toBe('After correction'); expect(checkpoint.measurements[0].value).toBe(250); expect(checkpoint.measurements[0].readingHistory[0].record.value).toBe(100);
    const protectedFields = (value: ProfileData) => Object.fromEntries(Object.entries(value).filter(([key]) => !['lightMeasurements', 'lightAudits', 'lightEnvironment', '_deleted', '_deletedAt', '_deletedClearedAt'].includes(key)));
    expect(saved.lightEnvironment).toEqual({ ...initial.lightEnvironment, rooms: [] }); expect(protectedFields(saved)).toEqual(protectedFields(initial)); expect(wire).toHaveLength(12); await cacheReceipt(page, artifact);
    await server.close(); stopped = true; await expect(fetch(server.origin + '/app')).rejects.toThrow(); await page.close(); expect(context.pages()).toHaveLength(0);
    page = await context.newPage(); await ready(page, server.origin); await openAssessment(page); receipts.cold = await profile(page, artifact.state); expect(receipts.cold).toEqual(receipts.removeRoom);
    const block = page.locator('[data-light-env-action="toggle-audits-block"]'); if (await block.getAttribute('aria-expanded') !== 'true') await activate(page, block);
    await expect(page.locator('.light-audit-card').filter({ hasText: 'After correction' })).toBeVisible(); await openChat(page); await expect(page.locator('.chat-agent-draft-applied')).toHaveCount(4);
    expect(errors).toEqual([]); expect(await artifactInputs(owners, [])).toEqual(artifact);
  } finally {
    await info.attach('static-measurement-chat-receipt', { body: JSON.stringify({ artifact, receipts, wire, errors, stopped, boundary: 'Real offline native checkpoint form, public chat/native tools, controlled provider output, four trusted keyboard approvals, optional interpretation, complete protected receipts, mobile/axe/cache/source hashes and stopped-origin zero-page cold launch. No runtime mutation calls or live provider inference.' }, null, 2), contentType: 'application/json' }); if (!stopped) await server.close();
  }
});
