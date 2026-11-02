import { expect, test } from './coverage-fixture.js';
import type { Page } from '@playwright/test';
import { routeJavaScript } from '../helpers/browser-static-routes.js';
import { AGENT_CONTEXT_CARDS, type AgentContextCard, type AgentContextChange } from '../../shared/agent-tool-contract.js';
import type { AgentContextField } from '../../js/agent-context-records.js';

async function saved(page: Page) {
  return page.evaluate(async () => {
    const [{ state }, crypto, profile] = await Promise.all([import('/js/state.js'), import('/js/crypto.js'), import('/js/profile.js')]);
    return JSON.parse((await crypto.encryptedGetItem(profile.profileStorageKey(state.currentProfile, 'imported'), { throwOnDecryptError: true }))!) as Record<string, unknown>;
  });
}
async function prepare(page: Page, card: AgentContextCard, change: AgentContextChange) {
  return page.evaluate(async ({ card, change }) => {
    // Bind the native composition before installing the isolated review renderer.
    const composition = await (await import('/js/chat-loader.js')).loadChatModule();
    const [{ state }, { createBrowserAgentToolDependencies }, { createAgentToolRuntime }, chat, drafts] = await Promise.all([
      import('/js/state.js'), import('/js/agent-tool-bindings.js'), import('/js/agent-tool-runtime.js'), import('/js/chat-actions.js'), import('/js/agent-drafts.js'),
    ]);
    const evidence = `Use this explicitly supplied synthetic test value: ${JSON.stringify(change)}`;
    const runtime = createAgentToolRuntime({ readContext: () => '', userMessage: evidence, ...createBrowserAgentToolDependencies(state.currentProfile) });
    const read = await runtime.execute({ tool: 'getbased_read_context_card', arguments: { card } });
    if (!read.success) throw new Error(read.contentItems[0].text);
    const snapshot = JSON.parse(read.contentItems[0].text) as { snapshotId: string };
    const result = await runtime.execute({ tool: 'getbased_draft_context', arguments: { card, snapshotId: snapshot.snapshotId, changes: [change], reason: 'Review an explicitly supplied test value.', evidence } });
    if (!result.success) throw new Error(`${card}/${change.field}: ${result.contentItems[0].text}`);
    // Cancel Welcome's optional open before claiming this isolated review.
    // Retire an opening already awaiting native styles/history on each reload.
    composition.closeChatPanel();
    state.currentThreadId = 'context-integrity';
    state.chatThreads = [{ id: state.currentThreadId, name: 'Synthetic field review', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), messageCount: 2 }];
    state.chatHistory = [{ role: 'user', content: evidence }, { role: 'assistant', content: 'Review the supplied change.', agentDrafts: runtime.getDrafts().map(draft => ({ ...draft, profileId: state.currentProfile })) }];
    let fixture = document.getElementById('context-integrity-review');
    if (!fixture) { fixture = document.createElement('div'); fixture.id = 'context-integrity-review'; fixture.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:white;color:black;overflow:auto'; document.body.append(fixture); }
    const target = fixture;
    const render = () => { target.innerHTML = drafts.renderAgentDraftCards(state.chatHistory[1], 1); };
    chat.configureChatMessageActionDeps({ renderChatMessages: render }); render();
    return runtime.getDrafts();
  }, { card, change });
}
async function currentField(page: Page, card: AgentContextCard, key: string) {
  return page.evaluate(async ({ card, key }) => {
    const [{ state }, { contextFieldValue }] = await Promise.all([import('/js/state.js'), import('/js/agent-context-fields.js')]);
    return contextFieldValue(card, state.importedData[card] ?? null, key);
  }, { card, key });
}

// Each field retains both cold reloads. Independent Diet cases keep its
// larger catalog within the same per-case timeout and CI resource limits.
const contextFieldCases = AGENT_CONTEXT_CARDS.filter(card => card !== 'healthGoals').flatMap(card => {
  const partitions = card === 'diet' ? 3 : 1;
  return Array.from({length: partitions}, (_value, partition) => ({card, partition, partitions}));
});
for (const {card, partition, partitions} of contextFieldCases) {
  test(`every declared ${card} scalar field survives review, Apply, clearing and reload without collateral edits${partitions > 1 ? ` (part ${partition + 1}/${partitions})` : ''}`, async ({ page }, info) => {
    test.setTimeout(120_000);
    await page.addInitScript(() => { for (const suffix of ['tour', 'emptyTour']) localStorage.setItem(`labcharts-default-${suffix}`, 'completed'); });
    await page.goto('/app'); await page.locator('html[data-app-ready]').waitFor();
    const fields = await page.evaluate(async card => {
      const [{ state }, profile, data, { agentContextCardModel }] = await Promise.all([import('/js/state.js'), import('/js/profile.js'), import('/js/data.js'), import('/js/agent-context-fields.js')]);
      const id = await profile.createProfile('Synthetic context integrity', { sex: 'female', skipInitialSync: true });
      for (const suffix of ['tour', 'emptyTour']) localStorage.setItem(profile.profileStorageKey(id, suffix), 'completed');
      await profile.switchProfile(id);
      state.importedData.contextNotes = 'Keep unrelated context';
      state.importedData.notes = [{ date: '2026-01-01', text: 'Keep dated note', extension: 'Keep source metadata' }];
      state.importedData.supplements = [{ id: 'integrity-peer', name: 'Keep therapy', type: 'supplement', startDate: '2026-01-01' }];
      state.importedData.healthGoals = [{ text: 'Keep existing goal', severity: 'minor', extension: 'Keep goal metadata' }];
      if (!['healthGoals', 'interpretiveLens'].includes(card)) Object.assign(state.importedData, { [card]: { extension: 'Keep target-card metadata' } });
      if (!await data.saveImportedData({ skipSync: true })) throw new Error('Could not save synthetic profile');
      return agentContextCardModel(card, state.importedData).fields;
    }, card);
    const catalog = fields.filter(field => field.kind !== 'records');
    const scalars = catalog.filter((_field, index) => index % partitions === partition);
    expect(scalars.length).toBeGreaterThan(0);
    const checked: string[] = [];
    for (const field of scalars) {
      const before = await saved(page);
      const value = field.kind === 'multiple' ? [field.options[0]!.value]
        : field.kind === 'single' ? field.options[0]!.value
          : field.kind === 'number' ? String(field.min)
            : field.kind === 'time' ? '08:15' : `Explicit ${field.key} test value`;
      const change: AgentContextChange = Array.isArray(value) ? { field: field.key, values: value } : { field: field.key, value };
      await prepare(page, card, change);
      expect(await saved(page), `${card}/${field.key} draft must not save`).toEqual(before);
      const review = page.locator('#context-integrity-review');
      await review.locator('[data-chat-message-action="apply-agent-draft"]').click();
      try { await expect(review).toContainText('Applied to getbased'); }
      catch (error) {
        console.error('Context integrity Apply diagnostics:', await page.evaluate(async card => {
          const {state} = await import('/js/state.js');
          return {ready: document.documentElement.hasAttribute('data-app-ready'), profile: state.currentProfile,
            thread: state.currentThreadId, threads: state.chatThreads.map(thread => thread.id),
            drafts: state.chatHistory.flatMap(message => (message.agentDrafts || []).map(draft => ({id: draft.id, status: draft.status}))),
            live: state.importedData[card], saved: JSON.parse((await (await import('/js/crypto.js')).encryptedGetItem((await import('/js/profile.js')).profileStorageKey(state.currentProfile, 'imported')))!)[card]};
        }, card).catch(error => ({diagnosticError: String(error)})));
        throw error;
      }
      await expect(review.locator('[data-chat-message-action="apply-agent-draft"]')).toHaveCount(0);
      const after = await saved(page);
      const protect = (data: Record<string, unknown>) => Object.fromEntries(Object.entries(data).filter(([key]) => ![card, 'changeHistory'].includes(key)));
      expect(protect(after), `${card}/${field.key} must preserve every other root`).toEqual(protect(before));
      if (card !== 'interpretiveLens') expect((after[card] as Record<string, unknown>).extension).toBe('Keep target-card metadata');
      await page.reload(); await page.locator('html[data-app-ready]').waitFor();
      expect(await currentField(page, card, field.key)).toEqual(field.kind === 'number' ? Number(value) : value);
      const clearBefore = await saved(page);
      await prepare(page, card, field.kind === 'multiple' ? { field: field.key, values: [] } : { field: field.key, value: '' });
      expect(await saved(page)).toEqual(clearBefore);
      await review.locator('[data-chat-message-action="apply-agent-draft"]').click();
      await expect(review).toContainText('Applied to getbased');
      expect(protect(await saved(page))).toEqual(protect(clearBefore));
      await page.reload(); await page.locator('html[data-app-ready]').waitFor();
      expect(await currentField(page, card, field.key)).toEqual(field.kind === 'multiple' ? [] : ['single', 'number'].includes(field.kind) ? null : '');
      const rejectedBefore = await saved(page);
      const rejection = await page.evaluate(async ({ card, field }) => {
        const [{ state }, { createBrowserAgentToolDependencies }, { createAgentToolRuntime }] = await Promise.all([import('/js/state.js'), import('/js/agent-tool-bindings.js'), import('/js/agent-tool-runtime.js')]);
        const evidence = 'Reject this unsupported synthetic field value.';
        const runtime = createAgentToolRuntime({ readContext: () => '', userMessage: evidence, ...createBrowserAgentToolDependencies(state.currentProfile) });
        const read = await runtime.execute({ tool: 'getbased_read_context_card', arguments: { card } });
        if (!read.success) throw new Error(read.contentItems[0].text);
        const invalid = field.kind === 'multiple' ? { field: field.key, values: ['__unsupported__'] }
          : { field: field.key, value: field.kind === 'text' ? 'x'.repeat(2001) : field.kind === 'time' ? '25:99' : field.kind === 'number' ? '-1' : '__unsupported__' };
        const result = await runtime.execute({ tool: 'getbased_draft_context', arguments: { card, snapshotId: JSON.parse(read.contentItems[0].text).snapshotId, changes: [invalid], reason: 'Reject unsupported input.', evidence } });
        return { success: result.success, drafts: runtime.getDrafts() };
      }, { card, field });
      expect(rejection, `${card}/${field.key} invalid input must create no proposal`).toEqual({ success: false, drafts: [] });
      expect(await saved(page)).toEqual(rejectedBefore);
      checked.push(field.key);
    }
    expect(checked).toEqual(scalars.map((field: AgentContextField) => field.key));
    await info.attach('checked-fields.json', { body: JSON.stringify({ card, partition, partitions, catalog: catalog.map(field => field.key), checked, recordsCoveredBy: fields.filter(field => field.kind === 'records').map(field => field.key) }), contentType: 'application/json' });
  });
}


test('a delayed native history read cannot replace a newer pending review before Apply', async ({page}) => {
  await page.addInitScript(() => {
    for (const suffix of ['tour', 'emptyTour']) localStorage.setItem(`labcharts-default-${suffix}`, 'completed');
    localStorage.setItem('labcharts-ai-paused', 'true');
  });
  await routeJavaScript(page, '**/js/crypto.js', `export * from '/js/crypto.js?history-read-original'; import {encryptedGetItem as read} from '/js/crypto.js?history-read-original'; export async function encryptedGetItem(key,...args){const value=await read(key,...args);if(globalThis.__holdReviewRead&&String(key).endsWith('-chat-t_context-integrity')){globalThis.__holdReviewRead=false;globalThis.__reviewReadEntered=true;await globalThis.__reviewReadGate;}return value;}`);
  await page.goto('/app'); await page.locator('html[data-app-ready]').waitFor();
  await seedHistoryReview(page);
  await prepare(page, 'diet', {field: 'bloating', value: 'moderate'});
  const review = page.locator('#context-integrity-review');
  await review.locator('[data-chat-message-action="apply-agent-draft"]').click();
  await expect(review).toContainText('Applied to getbased');
  const before = await saved(page);
  await page.evaluate(async () => {
    const target = window as unknown as {__holdReviewRead: boolean; __reviewReadEntered: boolean; __reviewReadGate: Promise<void>; __releaseReviewRead(): void; __reviewLoading: Promise<boolean>};
    target.__reviewReadEntered = false; target.__holdReviewRead = true;
    target.__reviewReadGate = new Promise<void>(resolve => {target.__releaseReviewRead = resolve;});
    target.__reviewLoading = (await import('/js/chat-history.js')).loadChatHistory();
  });
  await page.waitForFunction(() => (window as unknown as {__reviewReadEntered?: boolean}).__reviewReadEntered === true);
  const pending = await prepare(page, 'diet', {field: 'bloating', value: 'severe'});
  expect(await saved(page)).toEqual(before);
  const loaded = await page.evaluate(async () => {
    const target = window as unknown as {__releaseReviewRead(): void; __reviewLoading: Promise<boolean>};
    target.__releaseReviewRead(); return target.__reviewLoading;
  });
  expect(loaded).toBe(false);
  expect(await page.evaluate(async () => (await import('/js/state.js')).state.chatHistory.flatMap(message => (message.agentDrafts || []).map(draft => ({id: draft.id, status: draft.status}))))).toEqual([{id: pending[0]!.id, status: 'pending'}]);
  expect(await saved(page)).toEqual(before);
  await review.locator('[data-chat-message-action="apply-agent-draft"]').click();
  await expect(review).toContainText('Applied to getbased');
  const after = await saved(page);
  expect(after.diet).toEqual({bloating: 'severe', note: 'Retain dietary source evidence', extension: 'Keep card metadata'});
  const protectedRoots = (data: Record<string, unknown>) => Object.fromEntries(Object.entries(data).filter(([key]) => !['diet', 'changeHistory'].includes(key)));
  expect(protectedRoots(after)).toEqual(protectedRoots(before));
  await page.reload(); await page.locator('html[data-app-ready]').waitFor();
  expect(await saved(page)).toEqual(after);
});

async function seedHistoryReview(page: Page) {
  await page.evaluate(async () => {
    const [{state}, profile, data, meals] = await Promise.all([import('/js/state.js'), import('/js/profile.js'), import('/js/data.js'), import('/js/nutrition-store.js')]);
    const id = await profile.createProfile('Synthetic delayed review', {skipInitialSync: true});
    for (const suffix of ['tour', 'emptyTour']) localStorage.setItem(profile.profileStorageKey(id, suffix), 'completed');
    await profile.switchProfile(id);
    await meals.hydrateNutritionSummary(id);
    state.importedData.diet = {bloating: 'none', note: 'Retain dietary source evidence', extension: 'Keep card metadata'};
    state.importedData.contextNotes = 'Protected unrelated context';
    if (!await data.saveImportedData({skipSync: true})) throw new Error('Synthetic history-read seed failed');
    await meals.saveActiveProfileMeal({id: 'retained-meal', name: 'Retain saved lunch', eatenAt: '2026-10-20T12:00:00Z', mealType: 'lunch', nutrients: {energyKcal: 400, proteinG: 15}, note: 'Retain every unrelated record through delayed profile restoration'});
  });
}

for (const claim of ['unchanged', 'new-review'] as const) {
  test(`delayed profile restoration preserves ${claim === 'unchanged' ? 'normal stored history' : 'a newly claimed pending review'}`, async ({page}) => {
    await page.addInitScript(() => {
      for (const suffix of ['tour', 'emptyTour']) localStorage.setItem(`labcharts-default-${suffix}`, 'completed');
      localStorage.setItem('labcharts-ai-paused', 'true');
    });
    await routeJavaScript(page, '**/js/nutrition-store.js', `export * from '/js/nutrition-store.js?restore-original'; import {hydrateNutritionSummary as hydrate} from '/js/nutrition-store.js?restore-original'; export async function hydrateNutritionSummary(...args){const value=await hydrate(...args);if(globalThis.__holdProfileRestore){globalThis.__holdProfileRestore=false;globalThis.__profileRestoreEntered=true;await globalThis.__profileRestoreGate;}return value;}`);
    await page.goto('/app'); await page.locator('html[data-app-ready]').waitFor();
    await seedHistoryReview(page);
    const original = await prepare(page, 'diet', {field: 'bloating', value: 'moderate'});
    const review = page.locator('#context-integrity-review');
    await review.locator('[data-chat-message-action="apply-agent-draft"]').click();
    await expect(review).toContainText('Applied to getbased');
    const before = await saved(page);
    await page.evaluate(async () => {
      const {state} = await import('/js/state.js');
      state.currentThreadId = null; state.chatHistory = [];
      const target = window as unknown as {__holdProfileRestore: boolean; __profileRestoreEntered: boolean; __profileRestoreGate: Promise<void>; __releaseProfileRestore(): void; __profileRestoreLoading: Promise<void>};
      target.__profileRestoreEntered = false; target.__holdProfileRestore = true;
      target.__profileRestoreGate = new Promise<void>(resolve => {target.__releaseProfileRestore = resolve;});
      target.__profileRestoreLoading = (await import('/js/profile-runtime.js')).reloadProfileRuntimeShell(state.currentProfile);
    });
    await page.waitForFunction(() => (window as unknown as {__profileRestoreEntered?: boolean}).__profileRestoreEntered === true);
    const pending = claim === 'new-review' ? await prepare(page, 'diet', {field: 'bloating', value: 'severe'}) : original;
    expect(await saved(page)).toEqual(before);
    await page.evaluate(async () => {
      const target = window as unknown as {__releaseProfileRestore(): void; __profileRestoreLoading: Promise<void>};
      target.__releaseProfileRestore(); await target.__profileRestoreLoading;
    });
    expect(await page.evaluate(async () => {
      const {state} = await import('/js/state.js');
      return {thread: state.currentThreadId, drafts: state.chatHistory.flatMap(message => (message.agentDrafts || []).map(draft => ({id: draft.id, status: draft.status})))};
    })).toEqual({thread: 'context-integrity', drafts: [{id: pending[0]!.id, status: claim === 'new-review' ? 'pending' : 'applied'}]});
    expect(await saved(page)).toEqual(before);
    if (claim === 'new-review') {
      await review.locator('[data-chat-message-action="apply-agent-draft"]').click();
      await expect(review).toContainText('Applied to getbased');
    }
    const after = await saved(page);
    expect(after.diet).toEqual({bloating: claim === 'new-review' ? 'severe' : 'moderate', note: 'Retain dietary source evidence', extension: 'Keep card metadata'});
    const protectedRoots = (data: Record<string, unknown>) => Object.fromEntries(Object.entries(data).filter(([key]) => !['diet', 'changeHistory'].includes(key)));
    expect(protectedRoots(after)).toEqual(protectedRoots(before));
    await page.reload(); await page.locator('html[data-app-ready]').waitFor();
    expect(await saved(page)).toEqual(after);
  });
}
