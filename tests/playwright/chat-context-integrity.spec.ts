import { expect, test } from './coverage-fixture.js';
import type { Page } from '@playwright/test';
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

for (const card of AGENT_CONTEXT_CARDS.filter(card => card !== 'healthGoals')) {
  test(`every declared ${card} scalar field survives review, Apply, clearing and reload without collateral edits`, async ({ page }, info) => {
    test.setTimeout(120_000);
    await page.addInitScript(() => { for (const suffix of ['tour', 'emptyTour']) localStorage.setItem(`labcharts-default-${suffix}`, 'completed'); });
    await page.goto('/app');
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
    const scalars = fields.filter(field => field.kind !== 'records');
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
      await expect(review).toContainText('Applied to getbased');
      await expect(review.locator('[data-chat-message-action="apply-agent-draft"]')).toHaveCount(0);
      const after = await saved(page);
      const protect = (data: Record<string, unknown>) => Object.fromEntries(Object.entries(data).filter(([key]) => ![card, 'changeHistory'].includes(key)));
      expect(protect(after), `${card}/${field.key} must preserve every other root`).toEqual(protect(before));
      if (card !== 'interpretiveLens') expect((after[card] as Record<string, unknown>).extension).toBe('Keep target-card metadata');
      await page.reload();
      expect(await currentField(page, card, field.key)).toEqual(field.kind === 'number' ? Number(value) : value);
      const clearBefore = await saved(page);
      await prepare(page, card, field.kind === 'multiple' ? { field: field.key, values: [] } : { field: field.key, value: '' });
      expect(await saved(page)).toEqual(clearBefore);
      await review.locator('[data-chat-message-action="apply-agent-draft"]').click();
      await expect(review).toContainText('Applied to getbased');
      expect(protect(await saved(page))).toEqual(protect(clearBefore));
      await page.reload();
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
    await info.attach('checked-fields.json', { body: JSON.stringify({ card, checked, recordsCoveredBy: fields.filter(field => field.kind === 'records').map(field => field.key) }), contentType: 'application/json' });
  });
}
