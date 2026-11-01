import fs from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import type { ProfileData } from '../../types/app-state.js';
import type { AIToolCall } from '../../shared/ai-tool-protocol.js';
import { startKitServer } from './kit-release-server.js';
import { activate, artifactInputs, cacheReceipt, profile } from './kit-native-receipts.js';
import { installDiscussionFixture } from '../helpers/chat-discussion-fixture.js';
import { installOfflineStartupDiagnostics } from '../helpers/offline-launch-diagnostics.js';
import { readyLightArtifact as ready } from '../helpers/light-artifact-navigation.js';
const owners = ['js/state.js', 'js/agent-data-bindings.js', 'js/agent-health-data-model.js', 'js/agent-data-apply.js', 'js/agent-draft-presentation.js',
  'js/emf-record-fields.js', 'js/emf-record-commands.js', 'js/emf-record-proposals.js', 'js/emf-record-store.js', 'js/emf-records.js', 'js/emf-native-records.js', 'js/emf-editor-inputs.js',
  'js/emf.js', 'js/emf-editor.js', 'js/emf-interpretation.js', 'js/components/EMFEditor.svelte', 'js/components/EMFRoomContent.svelte', 'js/components/ChatAgentDraftCards.svelte'] as const;
async function openEditor(page: Page) {
  const close = page.getByRole('button', { name: 'Close chat', exact: true }); if (await close.isVisible()) await activate(page, close);
  const menu = page.getByRole('button', { name: 'Menu', exact: true }); if (await menu.isVisible() && !await page.locator('#sidebar-nav').evaluate(node => node.classList.contains('mobile-open'))) await activate(page, menu);
  await activate(page, page.locator('#sidebar-nav [data-nav-action="open-emf-assessment"]'));
  await activate(page, page.locator('[data-emf-action="toggle-assessment"][data-emf-assessment-id="emf-synthetic"]'));
}
test('EMF chat correction preserves private evidence and survives a stopped-origin cold launch into the ordinary editor', async ({ page, context }, info) => {
  test.setTimeout(180000); const artifact = await artifactInputs(owners, ['css/emf.css']);
  const seeded = JSON.parse(await fs.readFile(new URL('../fixtures/marker-detail-complete/pwa-profile.json', import.meta.url), 'utf8')) as ProfileData;
  seeded.entries = seeded.entries.map((entry, index) => ({ ...entry, panelId: `emf-chat-sample-${index}` })); seeded.nutritionMeals = [];
  seeded.emfAssessment = { assessments: [{ id: 'emf-synthetic', date: '2026-10-20', label: 'Bedroom report', privateSource: '/private/emf-source', rooms: [{ name: 'Bedroom', sleeping: true, measurements: { acElectric: { value: 8, unit: 'V/m', meter: 'Meter', source: 'emf-private-sentinel' } }, sources: ['WiFi router'], mitigations: ['custom mitigation'] }] }] };
  seeded.contextSourceSettings = { ...seeded.contextSourceSettings, 'insight-cards': true };
  const registry = JSON.parse(await fs.readFile(new URL('../fixtures/marker-detail-complete/pwa-registry.json', import.meta.url), 'utf8'));
  await installDiscussionFixture(context, { provider: 'openrouter', paused: true }); await installOfflineStartupDiagnostics(context);
  await context.addInitScript(({ seeded, registry }) => {
    if (!['http:', 'https:'].includes(location.protocol) || localStorage.getItem('emf-chat-seeded')) return;
    localStorage.setItem('emf-chat-seeded', '1'); localStorage.setItem('labcharts-profiles', JSON.stringify(registry)); localStorage.setItem('labcharts-active-profile', 'default'); localStorage.setItem('labcharts-default-imported', JSON.stringify(seeded));
    localStorage.setItem('labcharts-encryption-enabled', 'false'); localStorage.setItem('labcharts-analytics-disabled', 'true'); localStorage.setItem('labcharts-show-product-recs', 'false'); localStorage.setItem('labcharts-chat-backend', 'direct');
    localStorage.setItem('labcharts-openrouter-key', 'synthetic-emf-key'); localStorage.setItem('labcharts-openrouter-model', 'openai/synthetic-emf'); localStorage.setItem('labcharts-last-manual-backup', new Date().toISOString());
  }, { seeded, registry });
  const statement = 'My bedroom AC electric reading is now 2 V/m.';
  let round = 0; const wire: number[] = [], background: string[] = [], errors: string[] = [], receipts: Record<string, Awaited<ReturnType<typeof profile>>> = {};
  await context.route('https://openrouter.ai/api/v1/chat/completions', async route => {
    const body = route.request().postDataJSON(); expect(body.model).toBe('openai/synthetic-emf'); expect(JSON.stringify(body)).not.toMatch(/emf-private-sentinel|\/private\//);
    if (!body.tools) { const system = String(body.messages[0]?.content || ''); expect(system).toMatch(/^Based on this person's lab data and profile context/); background.push('native context-card summary'); await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content: '{}' } }] }) }); return; }
    wire.push(round);
    let call: AIToolCall | undefined;
    if (round === 0) call = { id: 'list-emf', type: 'function', function: { name: 'getbased_read_data', arguments: '{"resource":"emfMeasurements"}' } };
    if (round === 1) { const response = JSON.parse(body.messages.at(-1).content); expect(response.success).toBe(true); const rows = JSON.parse(response.contentItems[0].text); expect(rows.records).toHaveLength(1);
      call = { id: 'read-emf', type: 'function', function: { name: 'getbased_read_data', arguments: JSON.stringify({ resource: 'emfMeasurements', recordId: rows.records[0].recordId }) } };
    }
    if (round === 2) { const response = JSON.parse(body.messages.at(-1).content); expect(response.success).toBe(true); const read = JSON.parse(response.contentItems[0].text);
      call = { id: 'draft-emf', type: 'function', function: { name: 'getbased_draft_data', arguments: JSON.stringify({ resource: 'emfMeasurements', operation: 'update', snapshotId: read.snapshotId, patch: '{"value":2,"unit":"V/m"}', evidence: statement, reason: 'The user reported a corrected room reading.' }) } };
    }
    if (round === 3) { const response = JSON.parse(body.messages.at(-1).content); expect(response.success).toBe(true); expect(JSON.parse(response.contentItems[0].text).review.applied).toBe(false); }
    round++; await route.fulfill({ contentType: 'text/event-stream', body: `data: ${JSON.stringify({ choices: [{ delta: call ? { tool_calls: [{ index: 0, ...call }] } : { content: 'Review the EMF reading correction before applying.' }, finish_reason: call ? 'tool_calls' : 'stop' }] })}\n\ndata: [DONE]\n\n` });
  });
  page.on('pageerror', error => errors.push(error.message)); context.on('page', opened => opened.on('pageerror', error => errors.push(error.message))); const server = await startKitServer(artifact.directory); let stopped = false;
  try {
    await ready(page, server.origin); receipts.initial = await profile(page, artifact.state); const original = receipts.initial.stored as ProfileData;
    await openEditor(page); await page.locator('[data-emf-room-field="location"]').fill('Pillow'); await activate(page, page.locator('[data-emf-action="save"]'));
    await expect.poll(async () => ((await profile(page, artifact.state)).stored as ProfileData).emfAssessment!.assessments[0].rooms[0].location).toBe('Pillow');
    receipts.before = await profile(page, artifact.state); const baseline = receipts.before.stored as ProfileData;
    expect(baseline.emfAssessment!.assessments[0].editHistory[0].snapshot).toEqual(original.emfAssessment!.assessments[0]);
    expect(Object.fromEntries(Object.entries(baseline).filter(([key]) => key !== 'emfAssessment'))).toEqual(Object.fromEntries(Object.entries(original).filter(([key]) => key !== 'emfAssessment')));
    await activate(page, page.locator('[data-emf-action="close-editor"]'));
    await activate(page, page.locator('#chat-fab')); await activate(page, page.locator('[data-chat-empty-action="resume-ai"]'));
    await page.locator('#chat-input').fill(statement); await activate(page, page.locator('#chat-send-btn'));
    await expect(page.locator('.chat-agent-draft-pending, #cloud-ai-consent-overlay.show')).toBeVisible(); const consent = page.locator('#cloud-ai-consent-overlay.show'); if (await consent.isVisible()) { await consent.locator('input[type="checkbox"]').check(); await activate(page, consent.locator('[data-ai-processing-action="approve"]')); }
    const card = page.locator('.chat-agent-draft-pending'); await expect(card).toContainText('Source history'); await expect(card).toContainText('2 V/m'); expect(await profile(page, artifact.state)).toEqual(receipts.before);
    await page.setViewportSize({ width: 390, height: 844 }); expect(await card.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
    const violations = await card.evaluate(async node => (await (window as unknown as { axe: typeof import('axe-core') }).axe.run(node, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.map(row => row.id)); expect(violations).toEqual([]);
    await page.screenshot({ path: info.outputPath('emf-review-mobile.png') }); await card.getByRole('button', { name: 'Apply', exact: true }).focus(); await page.keyboard.press('Enter'); await expect(page.locator('.chat-agent-draft-applied')).toHaveCount(1);
    receipts.applied = await profile(page, artifact.state); const saved = receipts.applied.stored as ProfileData, assessment = saved.emfAssessment!.assessments[0];
    expect(assessment.rooms[0].measurements.acElectric).toMatchObject({ value: 2, unit: 'V/m', source: 'emf-private-sentinel' }); expect(assessment.editHistory).toHaveLength(2); expect(assessment.editHistory[0].snapshot).toEqual(original.emfAssessment!.assessments[0]); const { editHistory: prior, ...previous } = baseline.emfAssessment!.assessments[0]; expect(prior).toHaveLength(1); expect(assessment.editHistory[1].snapshot).toEqual(previous);
    const protectedFields = (value: ProfileData) => Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'emfAssessment')); expect(protectedFields(saved)).toEqual(protectedFields(baseline)); expect(wire).toEqual([0, 1, 2, 3]); await cacheReceipt(page, artifact);
    await server.close(); stopped = true; await expect(fetch(server.origin + '/app')).rejects.toThrow(); await page.close(); expect(context.pages()).toHaveLength(0);
    page = await context.newPage(); await ready(page, server.origin); receipts.cold = await profile(page, artifact.state); expect(receipts.cold).toEqual(receipts.applied); await openEditor(page);
    await expect(page.locator('[data-emf-measurement-type="acElectric"]')).toHaveValue('2'); await expect(page.locator('.ctx-tag.active').filter({ hasText: 'custom mitigation' })).toBeVisible();
    expect(await profile(page, artifact.state)).toEqual(receipts.applied); expect(errors).toEqual([]); expect(await artifactInputs(owners, ['css/emf.css'])).toEqual(artifact);
  } finally {
    await info.attach('static-emf-chat-receipt', { body: JSON.stringify({ artifact, receipts, wire, background, errors, stopped, boundary: 'Real shared chat sender and canonical save, controlled provider, trusted keyboard Apply, full private storage/live equality, mobile/axe/source/cache checks, stopped-origin zero-page cold launch and ordinary EMF editor. No live provider inference or remote sync.' }, null, 2), contentType: 'application/json' }); if (!stopped) await server.close();
  }
});
