import fs from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import type { ProfileData } from '../../types/app-state.js';
import type { AIToolCall } from '../../shared/ai-tool-protocol.js';
import { startKitServer } from './kit-release-server.js';
import { activate, artifactInputs, cacheReceipt, profile } from './kit-native-receipts.js';
import { installDiscussionFixture } from '../helpers/chat-discussion-fixture.js';
import { installOfflineStartupDiagnostics } from '../helpers/offline-launch-diagnostics.js';
import { readyLightArtifact as ready, openLightArtifact as openLight } from '../helpers/light-artifact-navigation.js';
const owners = ['js/state.js', 'js/agent-data-bindings.js', 'js/agent-data-model.js', 'js/agent-data-apply.js', 'js/agent-draft-presentation.js',
  'js/sun-setup-proposals.js', 'js/sun-setup-mutations.js', 'js/sun-setup-store.js', 'js/sun-setup-records.js',
  'js/sun-defaults.js', 'js/sun-defaults-session.js', 'js/sun-defaults-model.js', 'js/sun-defaults-setup-ui.js', 'js/sun-defaults-setup-renderer.js',
  'js/components/ChatAgentDraftCards.svelte', 'js/components/LightSetupPresentation.svelte'] as const;
async function openChat(page: Page) {
  if (!await page.locator('#chat-panel.open').isVisible()) await activate(page, page.locator('#chat-fab'));
  await expect(page.locator('#chat-input')).toBeVisible();
}
test('native setup and chat corrections share durable owners through offline stopped-origin cold launch', async ({ page, context }, info) => {
  test.setTimeout(180000); const artifact = await artifactInputs(owners, []);
  const seeded = JSON.parse(await fs.readFile(new URL('../fixtures/marker-detail-complete/pwa-profile.json', import.meta.url), 'utf8')) as ProfileData;
  seeded.entries = seeded.entries.map((entry, index) => ({ ...entry, panelId: `sun-chat-sample-${index}` })); seeded.nutritionMeals = [];
  seeded.sunDefaults = null; seeded.contextSourceSettings = { ...seeded.contextSourceSettings, 'light-sun': true, 'insight-cards': true };
  const registry = JSON.parse(await fs.readFile(new URL('../fixtures/marker-detail-complete/pwa-registry.json', import.meta.url), 'utf8')) as Record<string, unknown>[];
  await installDiscussionFixture(context, { provider: 'openrouter', paused: true }); await installOfflineStartupDiagnostics(context);
  await context.addInitScript(({ seeded, registry }) => {
    if (!['http:', 'https:'].includes(location.protocol) || localStorage.getItem('sun-chat-seeded')) return;
    localStorage.setItem('sun-chat-seeded', '1'); localStorage.setItem('labcharts-profiles', JSON.stringify(registry)); localStorage.setItem('labcharts-active-profile', 'default'); localStorage.setItem('labcharts-default-imported', JSON.stringify(seeded));
    localStorage.setItem('labcharts-encryption-enabled', 'false'); localStorage.setItem('labcharts-analytics-disabled', 'true'); localStorage.setItem('labcharts-show-product-recs', 'false'); localStorage.setItem('labcharts-chat-backend', 'direct');
    localStorage.setItem('labcharts-openrouter-key', 'synthetic-sun-key'); localStorage.setItem('labcharts-openrouter-model', 'openai/synthetic-sun'); localStorage.setItem('labcharts-last-manual-backup', new Date().toISOString());
  }, { seeded, registry });
  const stages = [
    { statement: 'I now use cool LED lighting at home.', patch: { homeLight: 'led-cool' } },
    { statement: 'My Fitzpatrick skin type is V.', patch: { fitzpatrick: 'V' } },
    { statement: 'Clear my answer about a dim workspace; I am not sure.', patch: { habits: { dimWorkspace: null } } },
  ];
  let stage = 0, round = 0; const wire: Array<{ stage: number; round: number }> = [], errors: string[] = [], receipts: Record<string, Awaited<ReturnType<typeof profile>>> = {};
  await context.route('https://openrouter.ai/api/v1/chat/completions', async route => {
    const body = route.request().postDataJSON(); expect(body.model).toBe('openai/synthetic-sun');
    if (/^You (?:evaluate|interpret|summarize)/.test(String(body.messages[0]?.content || ''))) {
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content: '{"dot":"gray","tip":"Controlled setup interpretation","detail":"Only reported setup facts."}' }, finish_reason: 'stop' }] }) }); return;
    }
    wire.push({ stage, round }); let call: AIToolCall | undefined;
    if (round === 0) call = { id: `read-sun-${stage}`, type: 'function', function: { name: 'getbased_read_data', arguments: '{"resource":"sunSetup"}' } };
    if (round === 1) { const response = JSON.parse(body.messages.at(-1).content); expect(response.success).toBe(true); const current = JSON.parse(response.contentItems[0].text);
      call = { id: `draft-sun-${stage}`, type: 'function', function: { name: 'getbased_draft_data', arguments: JSON.stringify({ resource: 'sunSetup', operation: 'update', snapshotId: current.snapshotId, patch: JSON.stringify(stages[stage]!.patch), evidence: stages[stage]!.statement, reason: 'The user reported changed setup facts.' }) } }; }
    if (round === 2) { const response = JSON.parse(body.messages.at(-1).content); expect(response.success).toBe(true); expect(JSON.parse(response.contentItems[0].text).review.applied).toBe(false); }
    round++; await route.fulfill({ contentType: 'text/event-stream', body: `data: ${JSON.stringify({ choices: [{ delta: call ? { tool_calls: [{ index: 0, ...call }] } : { content: 'Review the setup change before applying.' }, finish_reason: call ? 'tool_calls' : 'stop' }] })}\n\ndata: [DONE]\n\n` });
  });
  page.on('pageerror', error => errors.push(error.message)); const server = await startKitServer(process.env.GETBASED_KIT_ARTIFACT || '.local-notes/sveltekit-build'); let stopped = false;
  try {
    await ready(page, server.origin); receipts.initial = await profile(page, artifact.state); server.state.offline = true; await openLight(page);
    await activate(page, page.getByRole('button', { name: 'Personalize Light', exact: true })); const modal = page.getByRole('dialog', { name: 'Personalize Light', exact: true });
    await modal.getByRole('radio').nth(3).focus(); await page.keyboard.press('Enter');
    await activate(page, modal.locator('[data-choice-group="setup-homelight"][data-value="led-warm"]')); await activate(page, modal.locator('[data-choice-group="setup-eyewear"][data-value="sunglasses"]'));
    await activate(page, modal.getByRole('button', { name: 'Next: Light patterns', exact: true })); await activate(page, modal.getByRole('button', { name: 'Save setup', exact: true })); await expect(modal).toHaveCount(0);
    receipts.native = await profile(page, artifact.state); const baseline = receipts.native.stored as ProfileData; expect(baseline.sunDefaults?.fitzpatrick).toBe('IV');
    await openChat(page); await activate(page, page.locator('[data-chat-empty-action="resume-ai"]'));
    for (stage = 0; stage < stages.length; stage++) {
      round = 0; await page.locator('#chat-input').fill(stages[stage]!.statement); await activate(page, page.locator('#chat-send-btn'));
      await expect(page.locator('.chat-agent-draft-pending, #cloud-ai-consent-overlay.show')).toBeVisible(); const consent = page.locator('#cloud-ai-consent-overlay.show'); if (await consent.isVisible()) { await consent.locator('input[type="checkbox"]').check(); await activate(page, consent.locator('[data-ai-processing-action="approve"]')); }
      const card = page.locator('.chat-agent-draft-pending'); await expect(card).toContainText('Light & Sun Setup'); expect((await profile(page, artifact.state)).stored).toEqual((stage ? receipts[`chat${stage - 1}`]! : receipts.native).stored);
      await page.setViewportSize({ width: 390, height: 844 }); expect(await card.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
      const violations = await card.evaluate(async node => (await (window as unknown as { axe: typeof import('axe-core') }).axe.run(node, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.map(row => row.id)); expect(violations).toEqual([]);
      await page.screenshot({ path: info.outputPath(`sun-setup-${stage}-review-mobile.png`) }); await card.getByRole('button', { name: 'Apply', exact: true }).focus(); await page.keyboard.press('Enter'); await expect(page.locator('.chat-agent-draft-applied')).toHaveCount(stage + 1);
      receipts[`chat${stage}`] = await profile(page, artifact.state);
    }
    const saved = receipts.chat2!.stored as ProfileData; expect(saved.sunDefaults?.homeLight).toBe('led-cool'); expect(saved.sunDefaults?.fitzpatrick).toBe('V'); expect(saved.sunDefaults?.ott?.['dim-workspace']).toBeUndefined(); expect(saved.sunDefaults?.ottScore).toBeNull();
    expect(saved.sunDefaults?.setupHistory).toHaveLength(4); expect(saved.sunDefaults?.completedAt).toBe(baseline.sunDefaults?.completedAt); expect(saved.lightCircadian).toEqual({ ...baseline.lightCircadian, skinType: 'V — brown' });
    const protectedFields = (value: ProfileData) => Object.fromEntries(Object.entries(value).filter(([key]) => !['sunDefaults', 'lightCircadian'].includes(key))); expect(protectedFields(saved)).toEqual(protectedFields(baseline)); expect(wire).toHaveLength(9); await cacheReceipt(page, artifact);
    await server.close(); stopped = true; await expect(fetch(server.origin + '/app')).rejects.toThrow(); await page.close(); expect(context.pages()).toHaveLength(0);
    page = await context.newPage(); await ready(page, server.origin); receipts.cold = await profile(page, artifact.state); expect(receipts.cold).toEqual(receipts.chat2); await openLight(page);
    await expect(page.locator('.light-setup-summary')).toContainText('V — brown'); await activate(page, page.locator('[data-light-setup-action="reopen"]'));
    const editor = page.getByRole('dialog', { name: 'Personalize Light', exact: true }); await expect(editor.locator('#setup-homelight')).toHaveValue('led-cool'); await expect(editor.locator('#setup-skin-range')).toHaveValue('4');
    expect(errors).toEqual([]); expect(await artifactInputs(owners, [])).toEqual(artifact);
  } finally {
    await info.attach('static-sun-setup-chat-receipt', { body: JSON.stringify({ artifact, receipts, wire, errors, stopped, boundary: 'Real native setup form, public chat/native tools, controlled provider, three trusted keyboard approvals, full protected storage/live receipts, mobile/axe/source/cache hashes and stopped-origin zero-page cold launch. No live provider inference.' }, null, 2), contentType: 'application/json' }); if (!stopped) await server.close();
  }
});
