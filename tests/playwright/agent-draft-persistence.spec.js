import { expect, test } from './coverage-fixture.js';

for (const kind of ['profile-note', 'marker-note', 'supplement']) {
  test(`agent ${kind} rejects an aborted commit and saves successfully on retry`, async ({ page }) => {
    await page.goto('/app');
    const result = await page.evaluate(async kind => {
      const { state } = await import('/js/state.js');
      const { saveImportedData } = await import('/js/data.js');
      const { applyAgentDraft } = await import('/js/agent-drafts.js');
      const { encryptedGetItem } = await import('/js/crypto.js');
      state.importedData.entries = [{ date: '2026-09-01', markers: { 'biochemistry.glucose': 5.8 } }];
      state.importedData.contextNotes = 'Original context';
      state.importedData.markerNotes = {};
      state.importedData.supplements = [];
      if (!await saveImportedData()) throw new Error('Fixture save failed');
      const key = (await import('/js/profile.js')).profileStorageKey(state.currentProfile, 'imported');
      const draft = { profileId: state.currentProfile, status: 'pending',
        kind: kind === 'supplement' ? 'supplement' : 'note',
        payload: kind === 'supplement'
          ? { name: 'Synthetic supplement', type: 'supplement', startDate: '2026-09-01' }
          : { scope: kind === 'marker-note' ? 'marker' : 'profile', marker: 'biochemistry.glucose', mode: 'append', text: 'Proposed context' },
      };
      const before = JSON.parse(await encryptedGetItem(key));
      const put = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (...args) {
        const request = put.apply(this, args);
        if (args[1] === key) request.addEventListener('success', () => this.transaction.abort(), { once: true });
        return request;
      };
      let failed = '';
      try { await applyAgentDraft(draft); } catch (error) { failed = error.message; }
      finally { IDBObjectStore.prototype.put = put; }
      const diskUnchanged = JSON.stringify(JSON.parse(await encryptedGetItem(key))) === JSON.stringify(before);
      const memoryUnchanged = state.importedData.contextNotes === 'Original context'
        && state.importedData.supplements.length === 0 && Object.keys(state.importedData.markerNotes).length === 0;
      const notice = await applyAgentDraft(draft);
      const saved = JSON.parse(await encryptedGetItem(key));
      return { failed, diskUnchanged, memoryUnchanged, notice, value: kind === 'supplement' ? saved.supplements.map(item => item.name) : kind === 'marker-note' ? saved.markerNotes['biochemistry.glucose'] : saved.contextNotes };
    }, kind);
    expect(result.failed).toMatch(/Could not save/);
    expect(result.diskUnchanged).toBe(true);
    expect(result.memoryUnchanged).toBe(true);
    expect(result.notice).toContain('saved');
    expect(result.value).toEqual(kind === 'supplement' ? ['Synthetic supplement'] : kind === 'marker-note' ? 'Proposed context' : 'Original context\n\nProposed context');
  });
}

test('proposal action persists its result and remains non-actionable after history reload', async ({ page }) => {
  await page.goto('/app');
  await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const { saveImportedData } = await import('/js/data.js');
    const { configureChatMessageActionDeps } = await import('/js/chat-actions.js');
    const { renderAgentDraftCards } = await import('/js/agent-drafts.js');
    state.importedData.contextNotes = 'Original';
    if (!await saveImportedData()) throw new Error('Fixture save failed');
    state.currentThreadId = 'proposal-persistence';
    state.chatThreads = [{ id: state.currentThreadId, name: 'Proposal', createdAt: new Date().toISOString() }];
    state.chatHistory = [{ role: 'assistant', content: '', agentDrafts: [{
      id: 'draft-persistence', profileId: state.currentProfile, status: 'pending', kind: 'note',
      payload: { scope: 'profile', text: 'Applied once', mode: 'append' },
    }] }];
    const fixture = document.createElement('div'); fixture.id = 'proposal-fixture';
    fixture.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:white';
    document.body.append(fixture);
    const render = () => { fixture.innerHTML = renderAgentDraftCards(state.chatHistory[0], 0); };
    configureChatMessageActionDeps({ renderChatMessages: render }); render();
  });
  await page.locator('#proposal-fixture [data-chat-message-action="apply-agent-draft"]').click();
  await expect(page.locator('#proposal-fixture')).toContainText('Applied to getbased');
  await expect.poll(() => page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const { encryptedGetItem } = await import('/js/crypto.js');
    return JSON.parse(await encryptedGetItem(`labcharts-${state.currentProfile}-chat-t_proposal-persistence`))[0].agentDrafts[0].status;
  })).toBe('applied');
  const result = await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const { loadChatHistory } = await import('/js/chat-history.js');
    const { renderAgentDraftCards } = await import('/js/agent-drafts.js');
    await loadChatHistory();
    return { notes: state.importedData.contextNotes, card: renderAgentDraftCards(state.chatHistory[0], 0) };
  });
  expect(result.notes).toBe('Original\n\nApplied once');
  expect(result.card).toContain('Applied to getbased');
  expect(result.card).not.toContain('apply-agent-draft');
});

test('two stale tabs can apply a meal proposal only once', async ({ page, context }) => {
  await page.goto('/app');
  const profile = await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    if (!await (await import('/js/data.js')).saveImportedData()) throw new Error('Fixture save failed');
    return state.currentProfile;
  });
  const second = await context.newPage(); await second.goto('/app');
  for (const tab of [page, second]) {
    await tab.evaluate(async profile => {
      const { state } = await import('/js/state.js');
      const { encryptedGetItem } = await import('/js/crypto.js');
      const { configureChatMessageActionDeps } = await import('/js/chat-actions.js');
      const { renderAgentDraftCards } = await import('/js/agent-drafts.js');
      state.currentProfile = profile;
      localStorage.setItem('labcharts-active-profile', profile);
      state.importedData = JSON.parse(await encryptedGetItem(`labcharts-${profile}-imported`));
      state.currentThreadId = 'shared-proposal';
      state.chatThreads = [{ id: 'shared-proposal', name: 'Shared proposal' }];
      state.chatHistory = [{ role: 'assistant', content: '', agentDrafts: [{
        id: 'shared-meal-proposal', profileId: profile, kind: 'meal', status: 'pending',
        payload: { name: 'One proposed lunch', eatenAt: '2026-09-21T12:00:00Z', nutrients: { energyKcal: 500 } },
      }] }];
      const fixture = document.createElement('div'); fixture.id = 'shared-proposal-fixture';
      fixture.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:white'; document.body.append(fixture);
      const render = () => { fixture.innerHTML = renderAgentDraftCards(state.chatHistory[0], 0); };
      configureChatMessageActionDeps({ renderChatMessages: render }); render();
    }, profile);
  }
  const key = `labcharts-${profile}-agent-draft-claims`;
  await page.evaluate(key => {
    navigator.locks.request(key, async () => {
      window.proposalLockHeld = true;
      await new Promise(resolve => { window.releaseProposalLock = resolve; });
    });
  }, key);
  await page.waitForFunction(() => window.proposalLockHeld);
  try {
    await Promise.all([page, second].map(tab => tab.locator('#shared-proposal-fixture [data-chat-message-action="apply-agent-draft"]').click()));
    await expect.poll(() => page.evaluate(async key => (await navigator.locks.query()).pending.filter(lock => lock.name === key).length, key)).toBe(2);
  } finally { await page.evaluate(() => window.releaseProposalLock()); }
  await expect.poll(async () => Promise.all([page, second].map(tab => tab.evaluate(async () => (await import('/js/state.js')).state.chatHistory[0].agentDrafts[0].status)))).toEqual(expect.arrayContaining(['applied', 'failed']));
  const meals = await page.evaluate(async profile => (await import('/js/nutrition-store.js')).listNutritionMeals(profile), profile);
  expect(meals.map(meal => meal.name)).toEqual(['One proposed lunch']);
  await second.reload();
  const retried = await second.evaluate(async profile => {
    try { await (await import('/js/agent-draft-claims.js')).claimAgentDraft(profile, 'shared-meal-proposal'); return true; }
    catch { return false; }
  }, profile);
  expect(retried).toBe(false);
});

test('proposal claims follow encryption and profile cleanup', async ({ page }) => {
  await page.goto('/app');
  const result = await page.evaluate(async () => {
    const crypto = await import('/js/crypto.js');
    const { claimAgentDraft } = await import('/js/agent-draft-claims.js');
    const key = 'labcharts-claims-fixture-agent-draft-claims';
    window.__WEARABLES_TEST = true;
    await crypto._setTestSessionKey('synthetic-claims-passphrase');
    localStorage.setItem('labcharts-encryption-enabled', 'true');
    await claimAgentDraft('claims-fixture', 'private-proposal-id');
    const encrypted = !localStorage.getItem(key).includes('private-proposal-id');
    const decoded = JSON.parse(await crypto.encryptedGetItem(key));
    await (await import('/js/profile-storage-cleanup.js')).clearProfileStorage('claims-fixture');
    return { encrypted, claimed: decoded.claims['private-proposal-id'], removed: localStorage.getItem(key) === null };
  });
  expect(result).toEqual({ encrypted: true, claimed: true, removed: true });
});
