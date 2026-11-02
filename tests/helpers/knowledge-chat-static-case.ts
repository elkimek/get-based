import fs from 'node:fs/promises';
import { expect, type Page, type BrowserContext, type TestInfo } from '@playwright/test';
import type { ProfileData } from '../../types/app-state.js';
import { startKitServer } from '../pwa/kit-release-server.js';
import { activate, artifactInputs, cacheReceipt, profile } from '../pwa/kit-native-receipts.js';
import { installDiscussionFixture } from './chat-discussion-fixture.js';
import { installOfflineStartupDiagnostics } from './offline-launch-diagnostics.js';
import { readyLightArtifact as ready } from './light-artifact-navigation.js';
import { seedLocalKnowledgeCorpus, knowledgeCorpusReceipt } from './knowledge-browser-fixture.js';
const owners = ['js/state.js', 'js/agent-tool-runtime.js', 'js/agent-tool-bindings.js', 'js/agent-data-bindings.js', 'js/agent-data-apply.js', 'js/agent-drafts.js', 'js/agent-draft-presentation.js', 'js/agent-chat-context.js', 'js/lens.js', 'js/lens-knowledge-base-ui.js', 'shared/agent-tool-contract.js', 'shared/chat-control-policy.js', 'shared/chat-tool-instructions.js', 'js/components/ChatAgentDraftCards.svelte'] as const;
const configKey = 'labcharts-lens-config';
export type RetiredKnowledgeTarget = 'inventory' | 'settings' | 'libraries' | 'documents' | 'pasted text' | 'chosen files';
export async function sendKnowledgeChat(page: Page, statement: string, inventory = false) {
  if (!await page.locator('#chat-panel.open').isVisible()) await activate(page, page.locator('#chat-fab'));
  await expect(page.locator('#chat-panel.open')).toBeVisible();
  const input = page.locator('#chat-input'), resume = page.locator('[data-chat-empty-action="resume-ai"]');
  await expect.poll(async () => await input.isVisible() || await resume.isVisible()).toBe(true);
  if (await resume.isVisible()) await activate(page, resume);
  await expect(input).toBeVisible(); await expect(input).toBeEnabled();
  const replies = page.locator('.chat-ai[id^="chat-msg-"]'), users = page.locator('.chat-user[id^="chat-msg-"]');
  const count = await replies.count(), userCount = await users.count();
  await page.locator('#chat-input').fill(statement); await activate(page, page.locator('#chat-send-btn'));
  const consent = page.locator('#cloud-ai-consent-overlay');
  await expect.poll(async () => await consent.isVisible() || await users.count() > userCount).toBe(true);
  if (await consent.isVisible()) {
    await consent.locator('input[type="checkbox"]').check();
    await activate(page, consent.getByRole('button', {name: 'Approve & send', exact: true}));
  }
  await expect(users).toHaveCount(userCount + 1);
  await expect(users.last()).toContainText(statement);
  await expect(replies).toHaveCount(count + 1);
  await expect(replies.nth(count)).toContainText(inventory ? "I couldn't complete this response. Check your provider connection and try again." : 'Use the native Knowledge Base UI');
  await expect(page.locator('.chat-agent-draft-pending,.chat-app-control')).toHaveCount(0);
}
export async function runKnowledgeChatStaticCase(inventory: boolean, fixtures: { page: Page; context: BrowserContext }, info: TestInfo) {
  await runRetiredKnowledgeStaticCase(inventory ? 'inventory' : 'settings', fixtures, info);
}
export async function runRetiredKnowledgeStaticCase(target: RetiredKnowledgeTarget, { page, context }: { page: Page; context: BrowserContext }, info: TestInfo) {
  info.setTimeout(180000); const artifact = await artifactInputs(owners, []);
  const seeded = JSON.parse(await fs.readFile(new URL('../fixtures/marker-detail-complete/pwa-profile.json', import.meta.url), 'utf8')) as ProfileData;
  seeded.nutritionMeals = []; seeded.entries = seeded.entries.map((entry, index) => ({ ...entry, panelId: `native-only-knowledge-${index}` }));
  const registry = JSON.parse(await fs.readFile(new URL('../fixtures/marker-detail-complete/pwa-registry.json', import.meta.url), 'utf8'));
  await installDiscussionFixture(context, { provider: 'openrouter', paused: false }); await installOfflineStartupDiagnostics(context);
  await context.addInitScript(() => { const Native = window.Worker; window.Worker = class extends Native { constructor(url: string | URL, options?: WorkerOptions) { const target = new URL(url, location.href); if (target.pathname.endsWith('/lens-local-worker.js')) target.searchParams.set('mock', '1'); super(target, options); } }; });
  await context.addInitScript(({ seeded, registry }) => {
    if (!['http:', 'https:'].includes(location.protocol) || localStorage.getItem('chat-knowledge-seeded')) return;
    localStorage.setItem('chat-knowledge-seeded', '1'); localStorage.setItem('labcharts-ai-paused', 'true'); localStorage.setItem('labcharts-profiles', JSON.stringify(registry)); localStorage.setItem('labcharts-active-profile', 'default'); localStorage.setItem('labcharts-default-imported', JSON.stringify(seeded));
    localStorage.setItem('labcharts-lens-config', JSON.stringify({name: 'My Library', url: '', enabled: true, topK: 5, testProbe: 'vitamin D deficiency supplementation', backend: 'in-browser', multiQuery: false}));
    localStorage.setItem('labcharts-encryption-enabled', 'false'); localStorage.setItem('labcharts-analytics-disabled', 'true'); localStorage.setItem('labcharts-show-product-recs', 'false'); localStorage.setItem('labcharts-chat-backend', 'direct');
    localStorage.setItem('labcharts-openrouter-key', 'synthetic-knowledge-key'); localStorage.setItem('labcharts-openrouter-model', 'openai/synthetic-knowledge'); localStorage.setItem('labcharts-last-manual-backup', new Date().toISOString());
    for (const key of ['tour', 'emptyTour']) localStorage.setItem('labcharts-default-' + key, 'completed');
  }, { seeded, registry });
  let round = 0, stopped = false; const errors: string[] = [], external: string[] = [], wire: string[] = [];
  await context.route('https://openrouter.ai/api/v1/chat/completions', async route => {
    const body = route.request().postDataJSON();
    if (!body.tools) { await route.fulfill({ json: { choices: [{ message: { content: '{}' } }] } }); return; }
    expect(JSON.stringify(body.tools)).not.toContain('getbased_read_knowledge');
    for (const tool of body.tools) if (['getbased_read_data', 'getbased_draft_data'].includes(tool.function.name)) for (const resource of ['knowledgeSettings','knowledgeLibraries','knowledgeDocuments','knowledgeImports']) expect(tool.function.parameters.properties.resource.enum).not.toContain(resource);
    const step = target === 'inventory' ? (round++, 0) : round++ % 2;
    if (step) { const result = JSON.parse(body.messages.at(-1).content); expect(result.success).toBe(false); expect(JSON.stringify(result)).not.toMatch(/synthetic-notes|synthetic-report|private-corpus/); }
    const resource = target === 'settings' ? 'knowledgeSettings' : target === 'libraries' ? 'knowledgeLibraries' : target === 'documents' ? 'knowledgeDocuments' : 'knowledgeImports';
    const call = step === 0 ? { id: `retired-knowledge-${round}`, type: 'function', function: target === 'inventory' ? { name: 'getbased_read_knowledge', arguments: '{}' } : { name: target === 'pasted text' || target === 'chosen files' ? 'getbased_draft_data' : 'getbased_read_data', arguments: JSON.stringify(target === 'pasted text' || target === 'chosen files' ? { resource, operation: 'start', snapshotId: 'stale', patch: JSON.stringify(target === 'chosen files' ? { input: 'chooseFiles' } : { source: 'new.md', text: 'Synthetic pasted text.' }), reason: 'Requested', evidence: 'Manage my Knowledge Base.' } : { resource }) } } : null;
    if (call) wire.push(call.function.name);
    await route.fulfill({ contentType: 'text/event-stream', body: `data: ${JSON.stringify({ choices: [{ delta: call ? { tool_calls: [{ index: 0, ...call }] } : { content: 'Use the native Knowledge Base UI to manage sources.' }, finish_reason: call ? 'tool_calls' : 'stop' }] })}\n\ndata: [DONE]\n\n` });
  });
  context.on('request', request => { if (/^https?:/.test(request.url()) && !/https?:\/\/127\.0\.0\.1:/.test(request.url()) && !request.url().startsWith('https://openrouter.ai/api/v1/chat/completions')) external.push(request.url()); });
  page.on('pageerror', error => errors.push(error.message)); context.on('page', target => target.on('pageerror', error => errors.push(error.message)));
  const server = await startKitServer(artifact.directory), receipts: Record<string, unknown> = {};
  try {
    await ready(page, server.origin); const libraryId = await seedLocalKnowledgeCorpus(page, {configure: false});
    const baseline = await profile(page, artifact.state), beforeConfig = await page.evaluate(key => localStorage.getItem(key), configKey), corpus = await knowledgeCorpusReceipt(page, libraryId);
    receipts.before = { profile: baseline, config: beforeConfig, corpus };
    await sendKnowledgeChat(page, 'Manage my Knowledge Base.', target === 'inventory');
    expect(round).toBe(target === 'inventory' ? 1 : 2); expect(await knowledgeCorpusReceipt(page, libraryId)).toEqual(corpus); expect(await profile(page, artifact.state)).toEqual(baseline); expect(await page.evaluate(key => localStorage.getItem(key), configKey)).toBe(beforeConfig);
    await cacheReceipt(page, artifact); await server.close(); stopped = true; await expect(fetch(server.origin + '/app')).rejects.toThrow(); for (const client of context.pages()) await client.close(); expect(context.pages()).toHaveLength(0);
    page = await context.newPage(); await ready(page, server.origin); await sendKnowledgeChat(page, 'Manage my Knowledge Base.', target === 'inventory');
    expect(round).toBe(target === 'inventory' ? 2 : 4); expect(await knowledgeCorpusReceipt(page, libraryId)).toEqual(corpus); expect(await profile(page, artifact.state)).toEqual(baseline); expect(await page.evaluate(key => localStorage.getItem(key), configKey)).toBe(beforeConfig);
    const close = page.getByRole('button', { name: 'Close chat', exact: true }); if (await close.isVisible()) await activate(page, close);
    const menu = page.getByRole('button', { name: 'Menu', exact: true }); if (await menu.isVisible()) await activate(page, menu); await activate(page, page.locator('[data-nav-action="open-knowledge-base"]'));
    await expect(page.locator('#kb-modal-overlay.show')).toBeVisible(); await expect(page.locator('#lens-local-filepick')).toBeAttached(); await expect(page.locator('#lens-local-doc-list')).toContainText('synthetic-notes.md'); await expect(page.locator('#lens-local-doc-list')).toContainText('synthetic-report.txt');
    expect(await knowledgeCorpusReceipt(page, libraryId)).toEqual(corpus); expect(await profile(page, artifact.state)).toEqual(baseline); expect(errors).toEqual([]); expect(external).toEqual([]); expect(await artifactInputs(owners, [])).toEqual(artifact); receipts.cold = { unchanged: true };
  } finally { await info.attach('knowledge-native-only-static-receipt', { body: JSON.stringify({ artifact, target, receipts, wire, errors, external, stopped, boundary: 'Retired management calls reject in the real shared sender before and after a physically stopped-origin cold launch. Existing OPFS bytes, native file input and health data remain. Controlled model; no live inference or model download claim.' }, null, 2), contentType: 'application/json' }); if (!stopped) await server.close(); }
}
