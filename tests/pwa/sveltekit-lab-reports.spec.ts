import fs from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { startKitServer } from './kit-release-server.js';
import { activate, artifactInputs, cacheReceipt, profile } from './kit-native-receipts.js';
import { installDiscussionFixture } from '../helpers/chat-discussion-fixture.js';
import { installOfflineStartupDiagnostics } from '../helpers/offline-launch-diagnostics.js';
import { readyLightArtifact as ready } from '../helpers/light-artifact-navigation.js';
import type { AIToolCall } from '../../shared/ai-tool-protocol.js';
import { CHAT_NATIVE_UI_NOTICE } from '../../shared/chat-control-policy.js';

const owners = ['js/state.js', 'js/agent-data-bindings.js', 'js/agent-data-apply.js', 'js/agent-health-data-model.js',
  'js/lab-report-records.js', 'js/lab-report-proposals.js', 'js/lab-report-mutations.js', 'js/lab-report-samples.js', 'js/lab-report-store.js',
  'js/agent-draft-presentation.js', 'js/components/ChatAgentDraftCards.svelte'] as const;
async function openChat(page: Page) {
  if (!await page.locator('#chat-panel.open').isVisible()) await activate(page, page.locator('#chat-fab'));
  await expect(page.locator('#chat-input')).toBeVisible();
}

test('static report metadata is readable and refused removal retains every source through stopped-origin cold launch', async ({ page, context }, info) => {
  test.setTimeout(180000);
  const artifact = await artifactInputs(owners, []);
  const seeded = JSON.parse(await fs.readFile(new URL('../fixtures/marker-detail-complete/pwa-profile.json', import.meta.url), 'utf8')) as Record<string, unknown>;
  seeded.entries = [
    { panelId: 'morning', date: '2026-10-20', specimen: 'serum', context: { sampleTime: '08:00', fasting: true }, markers: { 'biochemistry.glucose': 5 }, updatedAt: 100 },
    { panelId: 'evening', date: '2026-10-20', specimen: 'plasma', context: { sampleTime: '16:00', fasting: false }, collectionContextSources: { sampleTime: 'evening-report', fasting: 'evening-report' }, markers: { 'biochemistry.glucose': 7 }, markerSources: { 'biochemistry.glucose': { file: '/private/synthetic-patient.pdf', snapshotId: 'evening-report', at: 200 } }, updatedAt: 200 },
  ];
  seeded.nutritionMeals = [];
  seeded.contextSourceSettings = { ...seeded.contextSourceSettings as object, 'lab-markers': true, 'lab-group-Biochemistry': true };
  seeded.importSnapshots = [
    { id: 'older-evening', panelId: 'evening', date: '2026-10-20', importedAt: 50, type: 'pdf', fileName: '/private/synthetic-older.pdf', sampleTime: '15:30', fasting: true, collectionContextApplied: ['sampleTime', 'fasting'], markers: [{ mappedKey: 'biochemistry.glucose', matched: true, value: 6, unit: 'mmol/l' }] },
    { id: 'evening-report', panelId: 'evening', date: '2026-10-20', importedAt: 200, type: 'pdf', fileName: '/private/synthetic-patient.pdf', rawText: 'raw-private-extraction-sentinel', sampleTime: '16:00', fasting: false, collectionContextApplied: ['sampleTime', 'fasting'], markers: [{ mappedKey: 'biochemistry.glucose', matched: true, value: 7, unit: 'mmol/l' }] },
  ];
  seeded.importBenchmarks = [{ id: 'retained-diagnostic', status: 'confirmed', fileName: '/private/synthetic-patient.pdf' }];
  const registry = JSON.parse(await fs.readFile(new URL('../fixtures/marker-detail-complete/pwa-registry.json', import.meta.url), 'utf8')) as Record<string, unknown>[];
  await installDiscussionFixture(context, { provider: 'openrouter', paused: false }); await installOfflineStartupDiagnostics(context);
  await context.addInitScript(({ seeded, registry }) => {
    if (!['http:', 'https:'].includes(location.protocol) || localStorage.getItem('report-fixture-seeded')) return;
    localStorage.setItem('report-fixture-seeded', '1'); localStorage.setItem('labcharts-profiles', JSON.stringify(registry)); localStorage.setItem('labcharts-active-profile', 'default'); localStorage.setItem('labcharts-default-imported', JSON.stringify(seeded));
    localStorage.setItem('labcharts-encryption-enabled', 'false'); localStorage.setItem('labcharts-analytics-disabled', 'true'); localStorage.setItem('labcharts-show-product-recs', 'false'); localStorage.setItem('labcharts-chat-backend', 'direct');
    localStorage.setItem('labcharts-openrouter-key', 'synthetic-report-key'); localStorage.setItem('labcharts-openrouter-model', 'openai/synthetic-report'); localStorage.setItem('labcharts-last-manual-backup', new Date().toISOString());
  }, { seeded, registry });
  let round = 0; const wire: unknown[] = [], errors: string[] = [];
  const evidence = 'Remove the latest report for my evening plasma sample collected on 20 October 2026. Keep the morning sample unchanged.';
  await context.route('https://openrouter.ai/api/v1/chat/completions', async route => {
    const body = route.request().postDataJSON();
    if (!body.tools) { await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content: '{}' }, finish_reason: 'stop' }] }) }); return; }
    expect(JSON.stringify(body)).not.toMatch(/\/private\/|synthetic-patient|raw-private-extraction/); wire.push({ round, roles: body.messages.map((message: { role: string }) => message.role) });
    let call: AIToolCall | undefined;
    if (round === 0) call = { id: 'read-report', type: 'function', function: { name: 'getbased_read_data', arguments: JSON.stringify({ resource: 'labReports', recordId: 'evening-report' }) } };
    if (round === 1) {
      const response = JSON.parse(body.messages.at(-1).content); expect(response.success).toBe(true); const current = JSON.parse(response.contentItems[0].text); expect(current.readOnly).toBe(true); expect(current.operations).toEqual([]);
      call = { id: 'draft-report', type: 'function', function: { name: 'getbased_draft_data', arguments: JSON.stringify({ resource: 'labReports', operation: 'remove', snapshotId: current.snapshotId, patch: '{}', evidence, reason: 'The user explicitly requested this saved report removal.' }) } };
    }
    if (round === 2) {
      const result = JSON.parse(body.messages.at(-1).content); expect(result.success).toBe(false); expect(result.contentItems[0].text).toBe(`Error: ${CHAT_NATIVE_UI_NOTICE}`);
    }
    round++; await route.fulfill({ contentType: 'text/event-stream', body: `data: ${JSON.stringify({ choices: [{ delta: call ? { tool_calls: [{ index: 0, ...call }] } : { content: 'Use the native report history to remove a report.' }, finish_reason: call ? 'tool_calls' : 'stop' }] })}\n\ndata: [DONE]\n\n` });
  });
  page.on('pageerror', error => errors.push(error.message)); context.on('page', target => target.on('pageerror', error => errors.push(error.message)));
  const server = await startKitServer(artifact.directory); let stopped = false;
  const receipts: Record<string, Awaited<ReturnType<typeof profile>>> = {};
  try {
    await ready(page, server.origin); server.state.offline = true; await openChat(page);
    receipts.before = await profile(page, artifact.state);
    await page.locator('#chat-input').fill(evidence); await activate(page, page.locator('#chat-send-btn'));
    const response = page.locator('#chat-messages').filter({ hasText: 'Use the native report history to remove a report.' });
    await expect(response.or(page.locator('#cloud-ai-consent-overlay.show'))).toBeVisible();
    const consent = page.locator('#cloud-ai-consent-overlay.show');
    if (await consent.isVisible()) { await consent.locator('input[type="checkbox"]').check(); await activate(page, consent.locator('[data-ai-processing-action="approve"]')); }
    const card = response; await expect(card).toBeVisible(); await expect(page.locator('.chat-agent-draft-pending, .chat-agent-draft-applied')).toHaveCount(0);
    receipts.proposed = await profile(page, artifact.state); expect(receipts.proposed).toEqual(receipts.before);
    await page.setViewportSize({ width: 390, height: 844 }); expect(await card.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
    const violations = await card.evaluate(async node => (await (window as unknown as { axe: typeof import('axe-core') }).axe.run(node, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.map(row => row.id)); expect(violations).toEqual([]);
    await page.screenshot({ path: info.outputPath('report-review-mobile.png'), fullPage: true });
    receipts.saved = await profile(page, artifact.state);
    const before = receipts.before.stored as typeof seeded, saved = receipts.saved.stored as typeof seeded;
    expect(receipts.saved).toEqual(receipts.before);
    expect(saved.entries).toEqual(before.entries); expect(saved.importSnapshots).toEqual(before.importSnapshots); expect(saved.importBenchmarks).toEqual(before.importBenchmarks);
    expect(wire).toHaveLength(3); await cacheReceipt(page, artifact);
    await server.close(); stopped = true; await expect(fetch(server.origin + '/app')).rejects.toThrow(); await page.close(); expect(context.pages()).toHaveLength(0);
    page = await context.newPage(); await ready(page, server.origin); receipts.cold = await profile(page, artifact.state); expect(receipts.cold).toEqual(receipts.saved);
    await openChat(page); await expect(page.locator('.chat-agent-draft-pending, .chat-agent-draft-applied')).toHaveCount(0); expect(errors).toEqual([]);
    expect(await artifactInputs(owners, [])).toEqual(artifact);
  } finally {
    await info.attach('static-report-receipt', { body: JSON.stringify({ artifact, receipts, wire, errors, stopped, boundary: 'Real static public chat, controlled native provider output, read-only metadata and exact refused removal, cached first use, mobile/axe, unchanged whole profile receipts, actual feature-source maps and stopped-origin zero-page cold launch. No runtime mutation calls or live provider inference.' }, null, 2), contentType: 'application/json' });
    if (!stopped) await server.close();
  }
});
