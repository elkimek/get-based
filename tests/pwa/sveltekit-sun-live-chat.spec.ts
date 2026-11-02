import fs from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import type { ProfileData } from '../../types/app-state.js';
import { CHAT_NATIVE_UI_NOTICE } from '../../shared/chat-control-policy.js';
import type { AIToolCall } from '../../shared/ai-tool-protocol.js';
import { startKitServer } from './kit-release-server.js';
import { activate, artifactInputs, cacheReceipt, profile } from './kit-native-receipts.js';
import { installSunWeatherFixture } from '../helpers/sun-weather-fixture.js';
import { installDiscussionFixture } from '../helpers/chat-discussion-fixture.js';
import { installOfflineStartupDiagnostics } from '../helpers/offline-launch-diagnostics.js';
import { readyLightArtifact as ready, openLightArtifact as openLight } from '../helpers/light-artifact-navigation.js';
const owners = ['js/state.js', 'js/agent-data-bindings.js', 'js/agent-health-data-model.js', 'js/agent-data-apply.js', 'js/agent-draft-presentation.js',
  'js/sun-session-proposals.js', 'js/sun-session-commands.js', 'js/sun-session-records.js', 'js/sun-session-record-store.js', 'js/sun-session-mutations.js', 'js/sun-body-regions.js', 'js/sun-session-lifecycle.js', 'js/sun-live-runtime-setup.js',
  'js/sun-session-model.js', 'js/sun-sessions-store.js', 'js/sun-active-session.js', 'js/sun.js', 'js/sun-session-ui.js', 'js/sun-setup-store.js',
  'js/sun-spectrum.js', 'js/sun-uvdata.js', 'js/sun-uvdata-atmosphere.js', 'js/light-session-presentation.js', 'js/light-session-detail-presentation.js',
  'js/components/ChatAgentDraftCards.svelte', 'js/components/LightSessionRow.svelte', 'js/components/LightSessionDetail.svelte'] as const;
async function openChat(page: Page) {
  if (!await page.locator('#chat-panel.open').isVisible()) await activate(page, page.locator('#chat-fab'));
  await expect(page.locator('#chat-input')).toBeVisible();
}
test('Chat refuses live Sun timer actions and preserves timed inputs through stopped-origin cold launch', async ({ page, context }, info) => {
  test.setTimeout(180000); const artifact = await artifactInputs(owners, []);
  const seeded = JSON.parse(await fs.readFile(new URL('../fixtures/marker-detail-complete/pwa-profile.json', import.meta.url), 'utf8')) as ProfileData;
  seeded.entries = seeded.entries.map((entry, index) => ({ ...entry, panelId: `sun-chat-sample-${index}` })); seeded.nutritionMeals = [];
  const now = Date.now(); seeded.sunDefaults = { fitzpatrick: 'III' };
  seeded.sunSessions = [{ id: 'sun-active', startedAt: now - 120000, endedAt: null,
    location: { lat: 12.34567, lon: 45.12345, source: '/private/location' }, bodyExposure: { preset: 'face_hands', fraction: 0.05, glassBetween: false, sunscreenSPF: 0, rotatedSides: false },
    eyeExposure: { mode: 'direct', durationSec: null }, posture: 'standing', surfaceAlbedo: 'grass', notes: 'Original note',
    exposureSegments: [], accumulatedPausedMs: 0, aiAnalysis: { detail: 'sun-session-private-sentinel' }, calculationStatus: 'pending' }];
  seeded.contextSourceSettings = { ...seeded.contextSourceSettings, 'light-sun': true, 'insight-cards': true };
  const registry = JSON.parse(await fs.readFile(new URL('../fixtures/marker-detail-complete/pwa-registry.json', import.meta.url), 'utf8')) as Record<string, unknown>[];
  await installDiscussionFixture(context, { provider: 'openrouter', paused: true }); await installOfflineStartupDiagnostics(context);
  await context.addInitScript(({ seeded, registry }) => {
    if (!['http:', 'https:'].includes(location.protocol) || localStorage.getItem('sun-live-chat-seeded')) return;
    localStorage.setItem('sun-live-chat-seeded', '1'); localStorage.setItem('labcharts-profiles', JSON.stringify(registry)); localStorage.setItem('labcharts-active-profile', 'default'); localStorage.setItem('labcharts-default-imported', JSON.stringify(seeded));
    localStorage.setItem('labcharts-encryption-enabled', 'false'); localStorage.setItem('labcharts-analytics-disabled', 'true'); localStorage.setItem('labcharts-show-product-recs', 'false'); localStorage.setItem('labcharts-chat-backend', 'direct');
    localStorage.setItem('labcharts-openrouter-key', 'synthetic-sun-session-key'); localStorage.setItem('labcharts-openrouter-model', 'openai/synthetic-sun-session'); localStorage.setItem('labcharts-last-manual-backup', new Date().toISOString());
  }, { seeded, registry });
  const stages = [
    { statement: 'Pause my active Sun timer now.', patch: {}, operation: 'pause' },
    { statement: 'Resume my Sun timer now.', patch: {}, operation: 'resume' },
    { statement: 'I just applied SPF 30 during my active Sun timer. Record it when I Apply.', patch: { sunscreenSPF: 30 }, operation: 'setSunscreen' },
    { statement: 'Only my face is uncovered now. Record this coverage change when I Apply.', patch: { regions: ['face'] }, operation: 'setCoverage' },
    { statement: 'I changed sides. Record that boundary when I Apply, without changing my body regions.', patch: {}, operation: 'rotateSides' },
    { statement: 'Stop my active Sun timer now.', patch: {}, operation: 'stop' },
  ];
  const weatherCalls = await installSunWeatherFixture(context);
  const assessments: Array<{ keys: string[] }> = [];
  let stage = 0, round = 0; const wire: Array<{ stage: number; round: number }> = [], errors: string[] = [], receipts: Record<string, Awaited<ReturnType<typeof profile>>> = {};
  await context.route('https://openrouter.ai/api/v1/chat/completions', async route => {
    const body = route.request().postDataJSON(); expect(JSON.stringify(body)).not.toMatch(/sun-session-private-sentinel|\/private\/|12\.34567|45\.12345/); expect(body.model).toBe('openai/synthetic-sun-session');
    const prompt = String(body.messages[0]?.content || '');
    if (prompt.startsWith("Based on this person's lab data and profile context")) {
      const example = prompt.split('\n')[1]; if (!example) throw new Error('Missing native assessment shape'); const keys = Object.keys(JSON.parse(example)); assessments.push({ keys });
      const assessment = Object.fromEntries(keys.map(key => [key, { summary: '', dot: 'gray', tip: '' }]));
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content: JSON.stringify(assessment) }, finish_reason: 'stop' }] }) }); return;
    }
    if (/^You (?:evaluate|interpret|summarize)/.test(String(body.messages[0]?.content || ''))) {
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content: '{"dot":"gray","tip":"Controlled setup interpretation","detail":"Only reported setup facts."}' }, finish_reason: 'stop' }] }) }); return;
    }
    wire.push({ stage, round }); let call: AIToolCall | undefined;
    if (round === 0) call = { id: `read-sun-${stage}`, type: 'function', function: { name: 'getbased_read_data', arguments: JSON.stringify({ resource: 'sunSessions', recordId: 'sun-active' }) } };
    if (round === 1) { const response = JSON.parse(body.messages.at(-1).content); expect(response.success).toBe(true); const current = JSON.parse(response.contentItems[0].text);
      call = { id: `draft-sun-${stage}`, type: 'function', function: { name: 'getbased_draft_data', arguments: JSON.stringify({ resource: 'sunSessions', operation: stages[stage]!.operation, snapshotId: current.snapshotId, patch: JSON.stringify(stages[stage]!.patch), evidence: stages[stage]!.statement, reason: 'The user reported changed Sun session facts.' }) } }; }
    if (round === 2) { const response = JSON.parse(body.messages.at(-1).content); expect(response.success).toBe(false); expect(response.contentItems[0].text).toBe(`Error: ${CHAT_NATIVE_UI_NOTICE}`); }
    round++; await route.fulfill({ contentType: 'text/event-stream', body: `data: ${JSON.stringify({ choices: [{ delta: call ? { tool_calls: [{ index: 0, ...call }] } : { content: `Use the native Sun controls (${stage}).` }, finish_reason: call ? 'tool_calls' : 'stop' }] })}\n\ndata: [DONE]\n\n` });
  });
  page.on('pageerror', error => errors.push(error.message)); const server = await startKitServer(process.env.GETBASED_KIT_ARTIFACT || '.local-notes/sveltekit-build'); let stopped = false;
  try {
    await ready(page, server.origin); receipts.before = await profile(page, artifact.state); const baseline = receipts.before.stored as ProfileData; server.state.offline = true;
    await openChat(page); await activate(page, page.locator('[data-chat-empty-action="resume-ai"]'));
    const weatherBefore = weatherCalls();
    for (stage = 0; stage < stages.length; stage++) {
      round = 0; await page.locator('#chat-input').fill(stages[stage]!.statement); await activate(page, page.locator('#chat-send-btn'));
      const response = page.locator('#chat-messages').filter({ hasText: `Use the native Sun controls (${stage}).` }), consent = page.locator('#cloud-ai-consent-overlay.show');
      await expect(response.or(consent)).toBeVisible(); if (await consent.isVisible()) { await consent.locator('input[type="checkbox"]').check(); await activate(page, consent.locator('[data-ai-processing-action="approve"]')); }
      await expect(response).toBeVisible(); expect(round).toBe(3);
      await expect(page.locator('.chat-agent-draft-pending, .chat-agent-draft-applied')).toHaveCount(0);
      receipts[`chat${stage}`] = await profile(page, artifact.state); expect(receipts[`chat${stage}`]).toEqual(receipts.before);
      expect(weatherCalls()).toBe(weatherBefore);
      await page.setViewportSize({ width: 390, height: 844 }); expect(await response.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
      expect(await response.evaluate(async node => (await (window as unknown as { axe: typeof import('axe-core') }).axe.run(node, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.map(row => row.id))).toEqual([]);
      await page.screenshot({ path: info.outputPath(`sun-live-${stage}-native-only-mobile.png`) });
    }
    expect(wire).toHaveLength(18); await cacheReceipt(page, artifact);
    await server.close(); stopped = true; await expect(fetch(server.origin + '/app')).rejects.toThrow(); await page.close(); expect(context.pages()).toHaveLength(0);
    page = await context.newPage(); await ready(page, server.origin); receipts.cold = await profile(page, artifact.state); expect(receipts.cold).toEqual(receipts.before); await openLight(page);
    await expect(page.locator('[data-light-active-presentation][data-id="sun-active"]').first()).toBeVisible();
    expect((await profile(page, artifact.state)).stored).toEqual(baseline);
    expect(errors).toEqual([]); expect(await artifactInputs(owners, [])).toEqual(artifact);
  } finally {
    await info.attach('static-sun-live-chat-receipt', { body: JSON.stringify({ artifact, receipts, wire, assessments, errors, stopped, boundary: 'Public chat/native tools, controlled provider/weather, exact timer refusals, whole unchanged storage/live receipts, mobile/axe/source/cache hashes and stopped-origin zero-page cold launch. Native timer positives remain in light-active and sun-entry. No live provider inference.' }, null, 2), contentType: 'application/json' }); if (!stopped) await server.close();
  }
});
