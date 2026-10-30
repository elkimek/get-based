import fs from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import type { ProfileData } from '../../types/app-state.js';
import type { AIToolCall } from '../../shared/ai-tool-protocol.js';
import { startKitServer } from './kit-release-server.js';
import { activate, artifactInputs, cacheReceipt, profile } from './kit-native-receipts.js';
import { installSunWeatherFixture } from '../helpers/sun-weather-fixture.js';
import { installDiscussionFixture } from '../helpers/chat-discussion-fixture.js';
import { installOfflineStartupDiagnostics } from '../helpers/offline-launch-diagnostics.js';
import { readyLightArtifact as ready, openLightArtifact as openLight } from '../helpers/light-artifact-navigation.js';
const owners = ['js/state.js', 'js/agent-data-bindings.js', 'js/agent-data-model.js', 'js/agent-data-apply.js', 'js/agent-draft-presentation.js',
  'js/sun-session-proposals.js', 'js/sun-session-commands.js', 'js/sun-session-records.js', 'js/sun-session-record-store.js', 'js/sun-session-mutations.js', 'js/sun-body-regions.js', 'js/sun-session-lifecycle.js', 'js/sun-live-runtime-setup.js',
  'js/light-active-session-presentation.js', 'js/sun-session-model.js', 'js/sun-sessions-store.js', 'js/sun-active-session.js', 'js/sun.js', 'js/sun-session-ui.js', 'js/sun-setup-store.js',
  'js/sun-spectrum.js', 'js/sun-uvdata.js', 'js/sun-uvdata-atmosphere.js', 'js/light-session-presentation.js', 'js/light-session-detail-presentation.js',
  'js/components/LightActiveSession.svelte', 'js/components/LightLiveReadouts.svelte', 'js/components/ChatAgentDraftCards.svelte', 'js/components/LightSessionRow.svelte', 'js/components/LightSessionDetail.svelte'] as const;
async function openChat(page: Page) {
  if (!await page.locator('#chat-panel.open').isVisible()) await activate(page, page.locator('#chat-fab'));
  await expect(page.locator('#chat-input')).toBeVisible();
}
test('Chat starts preserve known and unknown Sun inputs through a cold offline timer continuation', async ({ page, context }, info) => {
  test.setTimeout(180000); const artifact = await artifactInputs(owners, []);
  const seeded = JSON.parse(await fs.readFile(new URL('../fixtures/marker-detail-complete/pwa-profile.json', import.meta.url), 'utf8')) as ProfileData;
  seeded.entries = seeded.entries.map((entry, index) => ({ ...entry, panelId: `sun-chat-sample-${index}` })); seeded.nutritionMeals = [];
  seeded.sunDefaults = { fitzpatrick: 'III', coords: { lat: 12.34567, lon: 45.12345 } }; seeded.sunSessions = [];
  // Native Light rendering materializes these empty containers. Include them in
  // the initial profile so full equality measures timer edits and cold recovery.
  seeded.lightEnvironment = { rooms: [], screens: [] }; seeded.lightDailyVerdicts = {};
  seeded.contextSourceSettings = { ...seeded.contextSourceSettings, 'light-sun': true, 'insight-cards': true };
  const registry = JSON.parse(await fs.readFile(new URL('../fixtures/marker-detail-complete/pwa-registry.json', import.meta.url), 'utf8')) as Record<string, unknown>[];
  await installDiscussionFixture(context, { provider: 'openrouter', paused: true }); await installOfflineStartupDiagnostics(context);
  await context.addInitScript(({ seeded, registry }) => {
    if (!['http:', 'https:'].includes(location.protocol) || localStorage.getItem('sun-start-chat-seeded')) return;
    localStorage.setItem('sun-start-chat-seeded', '1'); localStorage.setItem('labcharts-profiles', JSON.stringify(registry)); localStorage.setItem('labcharts-active-profile', 'default'); localStorage.setItem('labcharts-default-imported', JSON.stringify(seeded));
    localStorage.setItem('labcharts-encryption-enabled', 'false'); localStorage.setItem('labcharts-analytics-disabled', 'true'); localStorage.setItem('labcharts-show-product-recs', 'false'); localStorage.setItem('labcharts-chat-backend', 'direct');
    localStorage.setItem('labcharts-openrouter-key', 'synthetic-sun-session-key'); localStorage.setItem('labcharts-openrouter-model', 'openai/synthetic-sun-session'); localStorage.setItem('labcharts-last-manual-backup', new Date().toISOString());
  }, { seeded, registry });
  const stages = [
    { statement: 'Start a Sun timer using my saved location. Only my face is uncovered, no sunscreen or glass, eyes uncovered, standing on grass.', patch: { regions: ['face'], useSavedLocation: true, sunscreenSPF: 0, glassBetween: false, eyeMode: 'direct', posture: 'standing', surfaceAlbedo: 'grass' }, operation: 'start' },
    { statement: 'Stop my Sun timer now.', patch: {}, operation: 'stop' },
    { statement: 'Start another Sun timer using my saved location with only my face uncovered. Other exposure details are unreported.', patch: { regions: ['face'], useSavedLocation: true }, operation: 'start' },
  ];
  let createdId = '', fullId = '', weatherBeforePartial = 0;
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
    if (round === 0) call = { id: `read-sun-${stage}`, type: 'function', function: { name: 'getbased_read_data', arguments: JSON.stringify({ resource: 'sunSessions', ...(stage % 2 === 0 ? { create: true } : { recordId: createdId }) }) } };
    if (round === 1) { const response = JSON.parse(body.messages.at(-1).content); expect(response.success).toBe(true); const current = JSON.parse(response.contentItems[0].text); if (stage % 2 === 0) { createdId = current.recordId; if (!stage) fullId = createdId; expect(current.requirements.start).toEqual({ skinTypeConfigured: true, savedLocationSpecific: true, activeSessionId: null }); }
      call = { id: `draft-sun-${stage}`, type: 'function', function: { name: 'getbased_draft_data', arguments: JSON.stringify({ resource: 'sunSessions', operation: stages[stage]!.operation, snapshotId: current.snapshotId, patch: JSON.stringify(stages[stage]!.patch), evidence: stages[stage]!.statement, reason: 'The user reported changed Sun session facts.' }) } }; }
    if (round === 2) { const response = JSON.parse(body.messages.at(-1).content); expect(response.success).toBe(true); expect(JSON.parse(response.contentItems[0].text).review.applied).toBe(false); }
    round++; await route.fulfill({ contentType: 'text/event-stream', body: `data: ${JSON.stringify({ choices: [{ delta: call ? { tool_calls: [{ index: 0, ...call }] } : { content: 'Review the Sun session change before applying.' }, finish_reason: call ? 'tool_calls' : 'stop' }] })}\n\ndata: [DONE]\n\n` });
  });
  page.on('pageerror', error => errors.push(error.message)); const server = await startKitServer(process.env.GETBASED_KIT_ARTIFACT || '.local-notes/sveltekit-build'); let stopped = false;
  try {
    await ready(page, server.origin); receipts.before = await profile(page, artifact.state); const baseline = receipts.before.stored as ProfileData; server.state.offline = true;
    await openChat(page); await activate(page, page.locator('[data-chat-empty-action="resume-ai"]'));
    for (stage = 0; stage < stages.length; stage++) {
      round = 0; if (stage === 2) weatherBeforePartial = weatherCalls(); await page.locator('#chat-input').fill(stages[stage]!.statement); await activate(page, page.locator('#chat-send-btn'));
      await expect(page.locator('.chat-agent-draft-pending, #cloud-ai-consent-overlay.show')).toBeVisible(); const consent = page.locator('#cloud-ai-consent-overlay.show'); if (await consent.isVisible()) { await consent.locator('input[type="checkbox"]').check(); await activate(page, consent.locator('[data-ai-processing-action="approve"]')); }
      const card = page.locator('.chat-agent-draft-pending'); await expect(card).toContainText('Sun Sessions'); await expect(card).toContainText('Action timing'); await expect(card).toContainText('when you Apply'); expect((await profile(page, artifact.state)).stored).toEqual((stage ? receipts[`chat${stage - 1}`]! : receipts.before).stored);
      await page.setViewportSize({ width: 390, height: 844 }); expect(await card.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
      const violations = await card.evaluate(async node => (await (window as unknown as { axe: typeof import('axe-core') }).axe.run(node, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.map(row => row.id)); expect(violations).toEqual([]);
      await page.screenshot({ path: info.outputPath(`sun-start-${stage}-review-mobile.png`) }); await card.getByRole('button', { name: 'Apply', exact: true }).focus(); await page.keyboard.press('Enter'); await expect(page.locator('.chat-agent-draft-applied')).toHaveCount(stage + 1);
      receipts[`chat${stage}`] = await profile(page, artifact.state);
      const row = (receipts[`chat${stage}`]!.stored as ProfileData).sunSessions!.find(row => row.id === createdId)!; expect(row.reportedInputsVersion).toBe(1); expect(row.bodyExposure.regions).toEqual(['face']);
      if (stage % 2 === 0) { expect(row.endedAt).toBeNull(); expect(row.durationMin).toBeUndefined(); }
      if (stage === 1) { expect(row.calculationStatus).toBe('computed'); expect(row.durationMin).toBeGreaterThan(0); expect(Object.keys(row.doses)).toContain('vitamin_d'); expect(weatherCalls()).toBeGreaterThan(0); }
      if (stage === 2) { expect(row.calculationStatus).toBe('needs-inputs'); expect(row.doses).toBeNull(); expect(row.bodyExposure.sunscreenSPF ?? null).toBeNull(); expect(row.eyeExposure?.mode ?? null).toBeNull(); expect(row.posture ?? null).toBeNull(); expect(weatherCalls()).toBe(weatherBeforePartial); }
    }
    const saved = receipts.chat2!.stored as ProfileData; expect(saved.sunSessions).toHaveLength(2);
    const protectedFields = (value: ProfileData) => Object.fromEntries(Object.entries(value).filter(([key]) => !['sunSessions', '_deleted', '_deletedAt', '_deletedClearedAt'].includes(key)));
    expect(protectedFields(saved)).toEqual(protectedFields(baseline)); expect(wire).toHaveLength(9); expect(assessments.length).toBeGreaterThan(0); await cacheReceipt(page, artifact);
    await server.close(); stopped = true; await expect(fetch(server.origin + '/app')).rejects.toThrow(); await page.close(); expect(context.pages()).toHaveLength(0);
    page = await context.newPage(); await ready(page, server.origin); receipts.cold = await profile(page, artifact.state); expect(receipts.cold).toEqual(receipts.chat2); await openLight(page);
    const active = page.locator(`[data-light-active-presentation][data-id="${createdId}"]`).first(); await expect(active).toBeVisible(); await expect(active).toContainText('Exposure details needed for estimates'); await expect(active).not.toContainText('IU-eq');
    await page.screenshot({ path: info.outputPath('sun-start-partial-active-cold.png') }); await activate(page, active.locator('[data-sun-session-action="quick-log-sun"]'));
    await expect.poll(async () => ((await profile(page, artifact.state)).stored as ProfileData).sunSessions!.find(row => row.id === createdId)!.endedAt).toBeTruthy();
    receipts.stopped = await profile(page, artifact.state); const stoppedRow = (receipts.stopped.stored as ProfileData).sunSessions!.find(row => row.id === createdId)!;
    expect(stoppedRow.calculationStatus).toBe('needs-inputs'); expect(stoppedRow.doses).toBeNull(); expect(stoppedRow.exposureSegments[0].reportedInputsVersion).toBe(1);
    expect(protectedFields(receipts.stopped.stored as ProfileData)).toEqual(protectedFields(baseline)); expect((receipts.stopped.stored as ProfileData).sunSessions!.find(row => row.id === fullId)).toEqual(saved.sunSessions!.find(row => row.id === fullId));
    const row = page.locator(`[data-light-history-row][data-id="${createdId}"]`); await expect(row).toContainText('Exposure details needed'); await activate(page, row);
    await expect(page.getByRole('dialog').filter({ hasText: 'Sun session' })).toContainText('Unknown inputs have not been replaced');
    expect(errors).toEqual([]); expect(await artifactInputs(owners, [])).toEqual(artifact);
  } finally {
    await info.attach('static-sun-start-chat-receipt', { body: JSON.stringify({ artifact, receipts, wire, assessments, errors, stopped, boundary: 'Public chat/native tools, controlled provider and weather transport, native real spectrum math, three trusted chat keyboard approvals and native Stop after offline cold recovery, full protected storage/live receipts, mobile/axe/source/cache hashes and stopped-origin zero-page cold launch. No live provider inference.' }, null, 2), contentType: 'application/json' }); if (!stopped) await server.close();
  }
});
