import { expect, test } from './coverage-fixture.js';
import { routeJavaScript } from '../helpers/browser-static-routes.js';
import type { Page } from '@playwright/test';

const facts = [
  { card: 'diet', evidence: 'I eat an omnivore diet, drink 2–3 litres daily, and have moderate bloating.', changes: [{ field: 'type', value: 'omnivore' }, { field: 'hydration', value: '2–3 L/day' }, { field: 'bloating', value: 'moderate' }] },
  { card: 'sleepRest', evidence: 'I sleep 6–7 hours, with poor sleep quality.', changes: [{ field: 'duration', value: '6-7h' }, { field: 'quality', value: 'poor' }] },
  { card: 'exercise', evidence: 'I exercise 3–4 times weekly, doing strength training and walking.', changes: [{ field: 'frequency', value: '3-4x/week' }, { field: 'types', values: ['strength', 'walking'] }] },
  { card: 'stress', evidence: 'My stress is moderate and related to work.', changes: [{ field: 'level', value: 'moderate' }, { field: 'sources', values: ['work'] }] },
  { card: 'loveLife', evidence: 'I just got married.', changes: [{ field: 'status', value: 'married' }] },
  { card: 'environment', evidence: 'My setting is rural, climate tropical, and drinking water carbon-filtered.', changes: [{ field: 'setting', value: 'rural' }, { field: 'climate', value: 'tropical' }, { field: 'water', value: 'filtered (carbon)' }] },
  { card: 'lightCircadian', evidence: 'I dim lights after sunset.', changes: [{ field: 'evening', values: ['dim lights after sunset'] }] },
  { card: 'diagnoses', evidence: 'I have controlled asthma since 2018. My father developed type 2 diabetes at age 62.', changes: [{ field: 'conditions', operation: 'add', record: { name: 'Asthma', status: 'controlled', since: '2018' } }, { field: 'familyHistory', operation: 'add', record: { relative: 'father', condition: 'Type 2 diabetes', onsetAge: 62 } }] },
  { card: 'healthGoals', evidence: 'Improve digestion is a low-priority goal.', changes: [{ field: 'goals', operation: 'add', record: { text: 'Improve digestion', severity: 'minor' } }] },
];
const request = 'Please use the following information about me to prepare updates to my current profile.\n\nRead existing values first, then create actual proposal cards for review. Preserve all unmentioned information; do not save automatically.\n' + facts.map(row => row.evidence).join('\n') + '\nMy reported period dates conflict with an older entry. Ask which observation should be corrected before replacing it.';
const narrated = 'Here are the proposal cards for your review. Nothing is saved — each card only applies if you accept it.\n\n' + facts.map((row, i) => `### 🟢 Card ${i + 1} — ${row.card} (update)\n- **Proposed:** A synthetic textual claim, not a native review.`).join('\n\n') + '\n\n### 🔴 Card 10 — Menstrual Cycle\nLet me know which cards to apply.';
async function saved(page: Page) {
  return page.evaluate(async () => { const { state } = await import('/js/state.js'); return JSON.parse((await (await import('/js/crypto.js')).encryptedGetItem((await import('/js/profile.js')).profileStorageKey(state.currentProfile, 'imported')))!); });
}
async function seed(page: Page, provider: 'venice' | 'custom') {
  await page.addInitScript(() => { for (const key of ['tour', 'emptyTour']) localStorage.setItem(`labcharts-default-${key}`, 'completed'); });
  await page.goto('/app');
  await page.locator('html[data-app-ready]').waitFor();
  await page.evaluate(async provider => {
    const profile = await import('/js/profile.js'), id = await profile.createProfile('Synthetic native review contract', { sex: 'female', skipInitialSync: true });
    for (const suffix of ['tour', 'emptyTour']) localStorage.setItem(profile.profileStorageKey(id, suffix), 'completed');
    localStorage.setItem(`labcharts-onboard-extras-done-${id}`, '1'); localStorage.setItem(`labcharts-onboard-context-cards-skipped-${id}`, '1'); await profile.switchProfile(id);
    const api = await import('/js/api.js'); api.setAIPaused(true); const { state } = await import('/js/state.js');
    state.importedData.contextNotes = 'Preserve unrelated notes'; state.importedData.diet = { type: 'vegetarian', bowelFrequency: 'irregular', stoolConsistency: 'hard / pellets', note: 'Preserve old diet note' };
    state.importedData.loveLife = { status: 'dating', relationship: 'mostly good', note: 'Preserve relationship context' };
    state.importedData.healthGoals = [{ text: 'Improve sleep', severity: 'major' }]; state.importedData.diagnoses = { conditions: [{ name: 'Eczema', status: 'controlled' }], note: 'Preserve prior history' };
    state.importedData.lightCircadian = { amLight: 'morning outdoor (after sunrise)' };
    state.importedData.menstrualCycle = (await import('/js/cycle-summary.js')).upgradeMenstrualCycleProfile({ cycleLength: 28, periods: [{ startDate: '2026-08-13', endDate: '2026-08-18', flow: 'heavy', notes: 'Existing observation' }] });
    (await import('/js/context-source-registry.js')).setContextSourceEnabled('insight-cards', true);
    if (!await (await import('/js/data.js')).saveImportedDataForProfile(id, state.importedData, { forceProfileScope: true })) throw new Error('Fixture seed failed');
    if (provider === 'venice') { await api.saveVeniceKey('synthetic-key'); api.setVeniceModel('glm-5-fixture'); api.setVeniceE2EE(false); }
    else { await api.saveCustomApiConnection('https://synthetic-review.example/v1', 'synthetic-key'); api.setCustomApiModel('synthetic-model'); }
    api.setAIProvider(provider); api.setAIPaused(false); (await import('/js/agent-chat-settings.js')).setChatBackend('direct'); await (await import('/js/chat-loader.js')).openChatPanel();
  }, provider);
}
for (const provider of ['venice', 'custom'] as const) for (const initial of ['prose', 'json'] as const) test(`${provider} explicit review recovers ${initial} imitation into real cards`, async ({ page, context }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message)); await context.route('https://**/*', route => route.abort());
  await routeJavaScript(page, '**/js/cloud-ai-consent.js', `export * from '/js/cloud-ai-consent.js?review-original'; export async function requestAIProcessingApproval(){return true;} export async function requireAIProcessingApproval(){}`);
  const endpoint = provider === 'venice' ? 'https://api.venice.ai/api/v1/chat/completions' : 'https://synthetic-review.example/v1/chat/completions';
  let round = 0;
  await page.route(endpoint, async route => {
    const body = route.request().postDataJSON(); expect(body.tools).toBeUndefined(); expect(body.response_format).toBeDefined(); expect(body.stream).toBeUndefined();
    expect(body.response_format.json_schema.schema.properties.calls.minItems).toBe(round < 2 ? 1 : undefined);
    let calls: { id: string; name: string; arguments: string }[] = [];
    if (round === 1) {
      expect(JSON.stringify(body.messages)).not.toContain('Here are the proposal cards for your review');
      calls = [...facts.map(row => row.card), 'menstrualCycle'].map(card => ({ id: `r-${card}`, name: 'getbased_read_context_card', arguments: JSON.stringify({ card }) }));
    }
    if (round === 2) {
      const reads = new Map<string, { snapshotId: string }>();
      for (const message of body.messages) if (typeof message.content === 'string' && message.content.startsWith('getbased tool result')) { const result = JSON.parse(message.content.slice(message.content.indexOf('{"id":'))); expect(result.output.success).toBe(true); reads.set(result.id, JSON.parse(result.output.contentItems[0].text)); }
      calls = facts.map(row => ({ id: `d-${row.card}`, name: 'getbased_draft_context', arguments: JSON.stringify({ card: row.card, snapshotId: reads.get(`r-${row.card}`)!.snapshotId, changes: row.changes, evidence: row.evidence, reason: 'Explicit reported update; unrelated values remain unchanged.' }) }));
    }
    const reply = round === 0 ? narrated : calls.length ? '' : 'Review the nine real proposals below. Which period observation should be corrected? Your existing cycle history is unchanged.';
    const content = round === 0 && initial === 'prose' ? reply : JSON.stringify({ reply, calls }); round++;
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content }, finish_reason: 'stop' }] }) });
  });
  await seed(page, provider); const before = await saved(page);
  await page.evaluate(() => { const globals = globalThis as typeof globalThis & { __fakeReviewShown?: boolean }; globals.__fakeReviewShown = false; new MutationObserver(() => { if ([...document.querySelectorAll('.chat-ai')].some(el => el.textContent?.includes('Here are the proposal cards for your review'))) globals.__fakeReviewShown = true; }).observe(document.getElementById('chat-messages')!, { childList: true, subtree: true, characterData: true }); });
  await page.locator('#chat-input').fill(request); await page.locator('#chat-send-btn').click();
  await expect(page.locator('.chat-agent-draft-pending')).toHaveCount(9); await expect(page.locator('#chat-messages')).toContainText('Which period observation should be corrected?');
  expect(round).toBe(4); expect(await saved(page)).toEqual(before); expect(await page.evaluate(() => (globalThis as typeof globalThis & { __fakeReviewShown?: boolean }).__fakeReviewShown)).toBe(false);
  const drafts = await page.evaluate(async () => (await import('/js/state.js')).state.chatHistory.flatMap(m => (m.agentDrafts || []).map(d => ({ card: d.kind === 'context' && 'card' in d.payload ? d.payload.card : null }))));
  expect(drafts.map(d => d.card)).toEqual(facts.map(row => row.card)); expect(drafts.some(d => d.card === 'menstrualCycle')).toBe(false);
  await page.evaluate(async () => (await import('/js/api.js')).setAIPaused(true));
  const decision = initial === 'json' ? 'apply' : 'discard';
  for (let i = 0; i < facts.length; i++) { await page.locator('.chat-agent-draft-pending').first().locator(`[data-chat-message-action="${decision}-agent-draft"]`).click(); await expect(page.locator(`.chat-agent-draft-${decision === 'apply' ? 'applied' : 'discarded'}`)).toHaveCount(i + 1); }
  await page.reload(); await page.locator('html[data-app-ready]').waitFor(); const after = await saved(page);
  expect(after.menstrualCycle).toEqual(before.menstrualCycle); expect(after.contextNotes).toBe(before.contextNotes);
  if (decision === 'discard') expect(after).toEqual(before);
  else {
    expect(after.diet).toEqual({ ...before.diet, type: 'omnivore', hydration: '2–3 L/day', bloating: 'moderate' }); expect(after.loveLife).toEqual({ ...before.loveLife, status: 'married' });
    expect(after.diagnoses.conditions.map((row: { name: string }) => row.name)).toEqual(['Eczema', 'Asthma']); expect(after.diagnoses.familyHistory[0]).toMatchObject({ relative: 'father', condition: 'Type 2 diabetes', onsetAge: 62 });
    expect(after.healthGoals.map((row: { text: string; severity: string }) => [row.text, row.severity])).toEqual([['Improve sleep', 'major'], ['Improve digestion', 'minor']]); expect(after.lightCircadian.amLight).toBe(before.lightCircadian.amLight);
  }
  expect(errors).toEqual([]);
});

test('a provider that repeatedly imitates cards cannot display or persist an actionable review', async ({ page, context }) => {
  await context.route('https://**/*', route => route.abort()); await routeJavaScript(page, '**/js/cloud-ai-consent.js', `export * from '/js/cloud-ai-consent.js?missing-original'; export async function requestAIProcessingApproval(){return true;} export async function requireAIProcessingApproval(){}`);
  let requests = 0;
  await page.route('https://api.venice.ai/api/v1/chat/completions', async route => { requests++; await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content: JSON.stringify({ reply: narrated, calls: [] }) }, finish_reason: 'stop' }] }) }); });
  await seed(page, 'venice'); const before = await saved(page); await page.locator('#chat-input').fill(request); await page.locator('#chat-send-btn').click();
  await expect(page.locator('#chat-messages')).toContainText('No proposal card was created for this reply.'); await expect(page.locator('.chat-agent-draft')).toHaveCount(0); expect(requests).toBe(2);
  await page.reload(); await page.locator('html[data-app-ready]').waitFor(); await page.evaluate(async () => (await import('/js/chat-loader.js')).openChatPanel());
  await expect(page.locator('#chat-messages')).not.toContainText('Here are the proposal cards for your review'); expect(await saved(page)).toEqual(before);
});
