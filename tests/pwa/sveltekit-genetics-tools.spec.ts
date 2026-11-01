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
  'js/genetics-records.js', 'js/genetics-proposals.js', 'js/genetics-mutations.js', 'js/genetics-record-store.js', 'js/dna-haplogroup-catalog.js', 'js/genetics-snp-lifecycle.js', 'js/genetics-summary.js', 'js/genetics-lifecycle.js',
  'js/agent-draft-presentation.js', 'js/components/ChatAgentDraftCards.svelte'] as const;
async function openChat(page: Page) {
  if (!await page.locator('#chat-panel.open').isVisible()) await activate(page, page.locator('#chat-fab'));
  await expect(page.locator('#chat-input')).toBeVisible();
}

test('static genetics corrections survive offline Apply and whole-genome administration is refused through a stopped-origin cold launch', async ({ page, context }, info) => {
  test.setTimeout(180000);
  const artifact = await artifactInputs(owners, []);
  const seeded = JSON.parse(await fs.readFile(new URL('../fixtures/marker-detail-complete/pwa-profile.json', import.meta.url), 'utf8')) as Record<string, unknown>;
  seeded.entries = (seeded.entries as Record<string, unknown>[]).map((entry, index) => ({ ...entry, panelId: `genetics-fixture-sample-${index}` }));
  seeded.nutritionMeals = [];
  seeded.contextSourceSettings = { ...seeded.contextSourceSettings as object, 'genetics-inventory': true, 'genetics-summary': true };
  seeded.genetics = { source: 'Synthetic report', importDate: '2026-10-20', coverage: { found: 2, total: 60 }, effects: {}, apoe: 'ε3/ε3',
    snps: { rs429358: { genotype: 'TT', normalizedGenotype: 'TT', gene: 'APOE', source: { type: 'report', label: 'Synthetic report', fileName: '/private/synthetic-patient.pdf', rawText: 'raw-private-DNA-sentinel' } },
      rs7412: { genotype: 'CC', normalizedGenotype: 'CC', gene: 'APOE' } },
    mtdna: { haplogroup: 'H', confidence: 0.8, mutations: ['private-mutation-sentinel'], source: '/private/maternal.txt' } };
  const registry = JSON.parse(await fs.readFile(new URL('../fixtures/marker-detail-complete/pwa-registry.json', import.meta.url), 'utf8')) as Record<string, unknown>[];
  await installDiscussionFixture(context, { provider: 'openrouter', paused: false }); await installOfflineStartupDiagnostics(context);
  await context.addInitScript(({ seeded, registry }) => {
    if (!['http:', 'https:'].includes(location.protocol) || localStorage.getItem('genetics-fixture-seeded')) return;
    localStorage.setItem('genetics-fixture-seeded', '1'); localStorage.setItem('labcharts-profiles', JSON.stringify(registry)); localStorage.setItem('labcharts-active-profile', 'default'); localStorage.setItem('labcharts-default-imported', JSON.stringify(seeded));
    localStorage.setItem('labcharts-encryption-enabled', 'false'); localStorage.setItem('labcharts-analytics-disabled', 'true'); localStorage.setItem('labcharts-show-product-recs', 'false'); localStorage.setItem('labcharts-chat-backend', 'direct');
    localStorage.setItem('labcharts-openrouter-key', 'synthetic-genetics-key'); localStorage.setItem('labcharts-openrouter-model', 'openai/synthetic-genetics'); localStorage.setItem('labcharts-last-manual-backup', new Date().toISOString());
  }, { seeded, registry });
  let round = 0, stage: 'correction' | 'removal' | 'restore' | 'genomeRemoval' = 'correction'; const wire: unknown[] = [], errors: string[] = [];
  const statements = { correction: 'My lab report says my rs429358 genotype is CT.', removal: 'Remove my rs429358 call and its saved call history. Keep all other SNPs and maternal data.', restore: 'My new report says my rs429358 genotype is CT.', genomeRemoval: 'Remove ALL my saved genome data, including every SNP, maternal data and saved genetic report history.' };
  const evidence = statements.correction;
  await context.route('https://openrouter.ai/api/v1/chat/completions', async route => {
    const body = route.request().postDataJSON();
    if (!body.tools) { await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content: '{}' }, finish_reason: 'stop' }] }) }); return; }
    expect(JSON.stringify(body)).not.toMatch(/\/private\/|synthetic-patient|raw-private-DNA-sentinel|private-mutation-sentinel/); wire.push({ stage, round, roles: body.messages.map((message: { role: string }) => message.role) });
    let call: AIToolCall | undefined;
    const resource = stage === 'genomeRemoval' ? 'genome' : 'geneticVariants';
    if (round === 0) call = { id: 'read-genetics', type: 'function', function: { name: 'getbased_read_data', arguments: JSON.stringify({ resource, recordId: stage === 'genomeRemoval' ? 'genome' : 'rs429358' }) } };
    if (round === 1) {
      const response = JSON.parse(body.messages.at(-1).content);
      if (stage === 'genomeRemoval') { expect(response.success).toBe(false); expect(response.contentItems[0].text).toBe(`Error: ${CHAT_NATIVE_UI_NOTICE}`); }
      else { expect(response.success).toBe(true); const current = JSON.parse(response.contentItems[0].text);
      const remove = stage === 'removal';
      call = { id: 'draft-genetics', type: 'function', function: { name: 'getbased_draft_data', arguments: JSON.stringify({ resource, operation: remove ? 'remove' : 'update', snapshotId: current.snapshotId, patch: remove ? '{}' : '{"genotype":"CT"}', evidence: statements[stage], reason: 'The user explicitly reported this genotype correction.' }) } };
      }
    }
    if (round === 2) {
      const result = JSON.parse(body.messages.at(-1).content), response = JSON.parse(result.contentItems[0].text); expect(result.success).toBe(true); expect(response.review.applied).toBe(false);
      expect(response.review.effects.apoe).toEqual(stage === 'correction' ? { before: 'ε3/ε3', after: 'ε3/ε4' } : stage === 'restore' ? { before: null, after: 'ε3/ε4' } : { before: 'ε3/ε4', after: null });
    }
    round++; await route.fulfill({ contentType: 'text/event-stream', body: `data: ${JSON.stringify({ choices: [{ delta: call ? { tool_calls: [{ index: 0, ...call }] } : { content: stage === 'genomeRemoval' ? 'Use the native genome editor for whole-genome removal.' : 'Review the reported genotype and dependent APOE change before applying.' }, finish_reason: call ? 'tool_calls' : 'stop' }] })}\n\ndata: [DONE]\n\n` });
  });
  page.on('pageerror', error => errors.push(error.message)); context.on('page', target => target.on('pageerror', error => errors.push(error.message)));
  const server = await startKitServer(artifact.directory); let stopped = false;
  const receipts: Record<string, Awaited<ReturnType<typeof profile>>> = {};
  try {
    await ready(page, server.origin); server.state.offline = true; await openChat(page);
    receipts.before = await profile(page, artifact.state);
    await page.locator('#chat-input').fill(evidence); await activate(page, page.locator('#chat-send-btn'));
    await expect(page.locator('.chat-agent-draft-pending, #cloud-ai-consent-overlay.show')).toBeVisible();
    const consent = page.locator('#cloud-ai-consent-overlay.show');
    if (await consent.isVisible()) { await consent.locator('input[type="checkbox"]').check(); await activate(page, consent.locator('[data-ai-processing-action="approve"]')); }
    const card = page.locator('.chat-agent-draft-pending'); await expect(card).toContainText('Genetic Variants'); await expect(card).toContainText('Derived APOE'); await expect(card).toContainText('ε3/ε3 → ε3/ε4'); await expect(card).toContainText('previous call');
    receipts.proposed = await profile(page, artifact.state); expect(receipts.proposed.stored).toEqual(receipts.before.stored);
    await page.setViewportSize({ width: 390, height: 844 }); expect(await card.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
    const violations = await card.evaluate(async node => (await (window as unknown as { axe: typeof import('axe-core') }).axe.run(node, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.map(row => row.id)); expect(violations).toEqual([]);
    await page.screenshot({ path: info.outputPath('genetics-review-mobile.png'), fullPage: true });
    await card.getByRole('button', { name: 'Apply', exact: true }).focus(); await page.keyboard.press('Enter'); await expect(page.locator('.chat-agent-draft-applied')).toHaveCount(1);
    receipts.saved = await profile(page, artifact.state);
    const before = receipts.before.stored as typeof seeded, saved = receipts.saved.stored as typeof seeded;
    const genetics = saved.genetics as { apoe: string; snps: Record<string, { genotype: string; priorCalls?: Array<{ call: { source: { rawText: string } } }> }>; mtdna: unknown };
    expect(genetics.snps.rs429358!.genotype).toBe('CT'); expect(genetics.apoe).toBe('ε3/ε4');
    expect(genetics.snps.rs429358!.priorCalls![0]!.call.source.rawText).toBe('raw-private-DNA-sentinel');
    expect(genetics.mtdna).toEqual((before.genetics as typeof genetics).mtdna); expect(genetics.snps.rs7412).toEqual((before.genetics as typeof genetics).snps.rs7412);
    const allowed = new Set(['genetics']);
    expect(Object.fromEntries(Object.entries(saved).filter(([key]) => !allowed.has(key)))).toEqual(Object.fromEntries(Object.entries(before).filter(([key]) => !allowed.has(key))));
    receipts.corrected = receipts.saved;
    for (const nextStage of ['removal', 'restore'] as const) {
      await expect(page.locator('#chat-send-btn.streaming')).toHaveCount(0); stage = nextStage; round = 0;
      await page.locator('#chat-input').fill(statements[nextStage]); await activate(page, page.locator('#chat-send-btn'));
      const pending = page.locator('.chat-agent-draft-pending'); await expect(pending).toContainText(nextStage === 'removal' ? 'Removed SNP evidence' : 'Explicit SNP restoration');
      expect((await profile(page, artifact.state)).stored).toEqual(receipts.saved.stored);
      await pending.getByRole('button', { name: 'Apply', exact: true }).focus(); await page.keyboard.press('Enter');
      await expect(page.locator('.chat-agent-draft-applied')).toHaveCount(nextStage === 'removal' ? 2 : 3);
      receipts[nextStage] = await profile(page, artifact.state);
      const result = receipts[nextStage].stored as typeof seeded;
      const genome = result.genetics as typeof genetics;
      expect(genome.snps.rs7412).toEqual(genetics.snps.rs7412); expect(genome.mtdna).toEqual(genetics.mtdna);
      if (nextStage === 'removal') { expect(genome.snps.rs429358).toBeUndefined(); expect(genome.apoe).toBeUndefined(); expect(JSON.stringify(genome)).not.toContain('raw-private-DNA-sentinel'); }
      else { expect(genome.snps.rs429358!.genotype).toBe('CT'); expect(genome.snps.rs429358!.priorCalls).toBeUndefined(); expect(genome.apoe).toBe('ε3/ε4'); }
      const protectedFields = (value: Record<string, unknown>) => Object.fromEntries(Object.entries(value).filter(([key]) => !['genetics', 'geneticsSnpTombstones'].includes(key)));
      expect(protectedFields(result)).toEqual(protectedFields(before)); receipts.saved = receipts[nextStage];
    }
    await expect(page.locator('#chat-send-btn.streaming')).toHaveCount(0); stage = 'genomeRemoval'; round = 0;
    await page.locator('#chat-input').fill(statements.genomeRemoval); await activate(page, page.locator('#chat-send-btn'));
    const removal = page.locator('#chat-messages').filter({ hasText: 'Use the native genome editor for whole-genome removal.' }); await expect(removal).toBeVisible();
    await expect(page.locator('.chat-agent-draft-pending')).toHaveCount(0); expect(round).toBe(2);
    expect(await removal.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
    expect(await removal.evaluate(async node => (await (window as unknown as { axe: typeof import('axe-core') }).axe.run(node, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.map(row => row.id))).toEqual([]);
    await page.screenshot({ path: info.outputPath('whole-genome-native-only-mobile.png'), fullPage: true });
    receipts.genomeRemoval = await profile(page, artifact.state);
    // Refused administration retains all source evidence, including the restored genome,
    // its lifecycle and private reports; no field is filtered out of this comparison.
    expect(receipts.genomeRemoval).toEqual(receipts.saved);
    expect((receipts.genomeRemoval.stored as typeof seeded).genetics).toEqual((receipts.restore!.stored as typeof seeded).genetics);
    expect(wire).toHaveLength(11); await cacheReceipt(page, artifact);
    await server.close(); stopped = true; await expect(fetch(server.origin + '/app')).rejects.toThrow(); await page.close(); expect(context.pages()).toHaveLength(0);
    page = await context.newPage(); await ready(page, server.origin); receipts.cold = await profile(page, artifact.state); expect(receipts.cold).toEqual(receipts.saved);
    await openChat(page); await expect(page.locator('.chat-agent-draft-applied')).toHaveCount(3); expect(errors).toEqual([]);
    await page.setViewportSize({ width: 1280, height: 900 }); await activate(page, page.getByRole('button', { name: /^Genome/ }));
    await expect(page.locator('#main-content [data-widget-id="genome"]')).not.toContainText('No DNA data imported yet');
    expect(await artifactInputs(owners, [])).toEqual(artifact);
  } finally {
    await info.attach('static-genetics-receipt', { body: JSON.stringify({ artifact, receipts, wire, errors, stopped, boundary: 'Real static public chat/approval, controlled native provider output, cached first use, mobile/axe/keyboard Apply, complete profile receipts, actual feature-source maps and stopped-origin zero-page cold launch. No runtime mutation calls or live provider inference.' }, null, 2), contentType: 'application/json' });
    if (!stopped) await server.close();
  }
});
