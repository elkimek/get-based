import fs from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import type { ProfileData } from '../../types/app-state.js';
import type { AIToolCall } from '../../shared/ai-tool-protocol.js';
import { startKitServer } from './kit-release-server.js';
import { activate, artifactInputs, cacheReceipt, profile } from './kit-native-receipts.js';
import { installDiscussionFixture } from '../helpers/chat-discussion-fixture.js';
import { installOfflineStartupDiagnostics } from '../helpers/offline-launch-diagnostics.js';
import { readyLightArtifact as ready } from '../helpers/light-artifact-navigation.js';
const owners = ['js/state.js', 'js/agent-tool-bindings.js', 'js/agent-context-fields.js', 'js/agent-drafts.js', 'js/agent-draft-presentation.js', 'shared/chat-tool-instructions.js',
  'js/context-field-session.js', 'js/context-lifestyle-form-model.js', 'js/context-lifestyle-form-view.js', 'js/components/LifestyleContextForm.svelte', 'js/components/ChatAgentDraftCards.svelte'] as const;
async function openEnvironment(page: Page) {
  const close = page.getByRole('button', { name: 'Close chat', exact: true }); if (await close.isVisible()) await activate(page, close);
  const menu = page.getByRole('button', { name: 'Menu', exact: true }); if (await menu.isVisible() && !await page.locator('#sidebar-nav').evaluate(node => node.classList.contains('mobile-open'))) await activate(page, menu);
  await activate(page, page.locator('#sidebar-nav [data-nav-action="navigate"][data-nav-route="insight"]'));
  await activate(page, page.locator('[data-context-card-key="environment"] [data-context-card-action="open-editor"]'));
  await expect(page.locator('[data-context-form-view="environment"]')).toBeVisible(); await activate(page, page.locator('#detail-modal details summary').filter({ hasText: 'EMF' }));
}
test('self-reported Environment chat approval preserves other data and reaches the native editor after a stopped-origin cold launch', async ({ page, context }, info) => {
  test.setTimeout(180000); const artifact = await artifactInputs(owners, ['css/context-editor.css']);
  const seeded = JSON.parse(await fs.readFile(new URL('../fixtures/marker-detail-complete/pwa-profile.json', import.meta.url), 'utf8')) as ProfileData;
  seeded.entries = seeded.entries.map((entry, index) => ({ ...entry, panelId: `environment-chat-sample-${index}` })); seeded.nutritionMeals = []; seeded.emfAssessment = null;
  seeded.environment = { setting: 'urban', emf: ['WiFi router nearby', 'Legacy custom source'], emfMitigation: ['minimal Bluetooth'], note: 'Keep this note' };
  seeded.contextSourceSettings = { ...seeded.contextSourceSettings, 'insight-cards': true };
  const registry = JSON.parse(await fs.readFile(new URL('../fixtures/marker-detail-complete/pwa-registry.json', import.meta.url), 'utf8'));
  await installDiscussionFixture(context, { provider: 'openrouter', paused: true }); await installOfflineStartupDiagnostics(context);
  await context.addInitScript(({ seeded, registry }) => {
    if (!['http:', 'https:'].includes(location.protocol) || localStorage.getItem('environment-chat-seeded')) return;
    localStorage.setItem('environment-chat-seeded', '1'); localStorage.setItem('labcharts-profiles', JSON.stringify(registry)); localStorage.setItem('labcharts-active-profile', 'default'); localStorage.setItem('labcharts-default-imported', JSON.stringify(seeded));
    localStorage.setItem('labcharts-encryption-enabled', 'false'); localStorage.setItem('labcharts-analytics-disabled', 'true'); localStorage.setItem('labcharts-show-product-recs', 'false'); localStorage.setItem('labcharts-chat-backend', 'direct');
    localStorage.setItem('labcharts-openrouter-key', 'synthetic-environment-key'); localStorage.setItem('labcharts-openrouter-model', 'openai/synthetic-environment'); localStorage.setItem('labcharts-last-manual-backup', new Date().toISOString());
  }, { seeded, registry });
  const statement = 'I now turn my WiFi off at night.'; let round = 0;
  const wire: number[] = [], background: string[] = [], errors: string[] = [], receipts: Record<string, Awaited<ReturnType<typeof profile>>> = {};
  await context.route('https://openrouter.ai/api/v1/chat/completions', async route => {
    const body = route.request().postDataJSON(); expect(body.model).toBe('openai/synthetic-environment'); expect(JSON.stringify(body)).not.toMatch(/\/private\//);
    if (!body.tools) { expect(String(body.messages[0]?.content || '')).toMatch(/^Based on this person's lab data and profile context/); background.push('native context-card summary'); await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content: '{}' } }] }) }); return; }
    wire.push(round); let call: AIToolCall | undefined;
    if (round === 0) call = { id: 'read-environment', type: 'function', function: { name: 'getbased_read_context_card', arguments: '{"card":"environment"}' } };
    if (round === 1) { const response = JSON.parse(body.messages.at(-1).content); expect(response.success).toBe(true); const current = JSON.parse(response.contentItems[0].text); expect(current.emf.mode).toBe('selfReport');
      call = { id: 'draft-environment', type: 'function', function: { name: 'getbased_draft_context', arguments: JSON.stringify({ card: 'environment', snapshotId: current.snapshotId, changes: [{ field: 'emfMitigation', values: ['WiFi off at night', 'minimal Bluetooth'] }], evidence: statement, reason: 'The user reported a new general habit.' }) } }; }
    if (round === 2) { const response = JSON.parse(body.messages.at(-1).content); expect(response.success).toBe(true); expect(JSON.parse(response.contentItems[0].text).status).toBe('pending_user_approval'); }
    round++; await route.fulfill({ contentType: 'text/event-stream', body: `data: ${JSON.stringify({ choices: [{ delta: call ? { tool_calls: [{ index: 0, ...call }] } : { content: 'Review your proposed Environment context change.' }, finish_reason: call ? 'tool_calls' : 'stop' }] })}\n\ndata: [DONE]\n\n` });
  });
  page.on('pageerror', error => errors.push(error.message)); context.on('page', target => target.on('pageerror', error => errors.push(error.message))); const server = await startKitServer(artifact.directory); let stopped = false;
  try {
    await ready(page, server.origin); receipts.before = await profile(page, artifact.state); const baseline = receipts.before.stored as ProfileData;
    await activate(page, page.locator('#chat-fab')); await activate(page, page.locator('[data-chat-empty-action="resume-ai"]')); await page.locator('#chat-input').fill(statement); await activate(page, page.locator('#chat-send-btn'));
    await expect(page.locator('.chat-agent-draft-pending, #cloud-ai-consent-overlay.show')).toBeVisible(); const consent = page.locator('#cloud-ai-consent-overlay.show'); if (await consent.isVisible()) { await consent.locator('input[type="checkbox"]').check(); await activate(page, consent.locator('[data-ai-processing-action="approve"]')); }
    const card = page.locator('.chat-agent-draft-pending'); await expect(card).toContainText('Self-reported EMF context'); await expect(card).toContainText('EMF mitigation'); expect(await profile(page, artifact.state)).toEqual(receipts.before);
    await page.setViewportSize({ width: 390, height: 844 }); expect(await card.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
    const violations = await card.evaluate(async node => (await (window as unknown as { axe: typeof import('axe-core') }).axe.run(node, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.map(row => row.id)); expect(violations).toEqual([]);
    await page.screenshot({ path: info.outputPath('environment-review-mobile.png') }); await card.getByRole('button', { name: 'Apply', exact: true }).focus(); await page.keyboard.press('Enter'); await expect(page.locator('.chat-agent-draft-applied')).toHaveCount(1);
    receipts.applied = await profile(page, artifact.state); const saved = receipts.applied.stored as ProfileData; expect(saved.environment).toEqual({ ...baseline.environment, emfMitigation: ['WiFi off at night', 'minimal Bluetooth'] }); expect(saved.emfAssessment).toBeNull();
    const protect = (value: ProfileData) => Object.fromEntries(Object.entries(value).filter(([key]) => !['environment', 'changeHistory'].includes(key))); expect(protect(saved)).toEqual(protect(baseline)); expect(saved.changeHistory.filter(row => row.field === 'environment').at(-1)!.snapshot).toEqual(saved.environment); expect(wire).toEqual([0, 1, 2]); await cacheReceipt(page, artifact);
    await server.close(); stopped = true; await expect(fetch(server.origin + '/app')).rejects.toThrow(); await page.close(); expect(context.pages()).toHaveLength(0);
    page = await context.newPage(); await ready(page, server.origin); receipts.cold = await profile(page, artifact.state); expect(receipts.cold).toEqual(receipts.applied); await openEnvironment(page);
    const form = page.locator('[data-context-form-view="environment"]'); await expect(form.locator('#env-emf').getByRole('button', { name: 'Legacy custom source', exact: true })).toHaveAttribute('aria-pressed', 'true'); await expect(form.locator('#env-emf-mit').getByRole('button', { name: 'WiFi off at night', exact: true })).toHaveAttribute('aria-pressed', 'true'); await expect(form.locator('#env-emf-mit').getByRole('button', { name: 'minimal Bluetooth', exact: true })).toHaveAttribute('aria-pressed', 'true');
    expect(await profile(page, artifact.state)).toEqual(receipts.applied); expect(errors).toEqual([]); expect(await artifactInputs(owners, ['css/context-editor.css'])).toEqual(artifact);
  } finally { await info.attach('static-environment-context-receipt', { body: JSON.stringify({ artifact, receipts, wire, background, errors, stopped, boundary: 'Real shared chat sender and canonical save with controlled provider. Exact full-state/native custom-choice preservation, mobile/axe/keyboard Apply, source/cache ownership and stopped-origin cold launch. No live provider inference or remote sync.' }, null, 2), contentType: 'application/json' }); if (!stopped) await server.close(); }
});
