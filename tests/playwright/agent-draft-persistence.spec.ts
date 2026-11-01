import { expect, test } from './coverage-fixture.js';

for (const status of [undefined, null, '', 'applied ', 'unknown-future-status']) {
  test(`a stored unrecognized proposal status ${String(status)} cannot regain Apply after reload`, async ({ page }) => {
    await page.route('https://**/*', route => route.abort());
    await page.addInitScript(() => {
      localStorage.setItem('labcharts-default-tour', 'completed'); localStorage.setItem('labcharts-default-emptyTour', 'completed');
      localStorage.setItem('labcharts-ai-paused', 'true');
    });
    await page.goto('/app');
    await page.locator('html[data-app-ready]').waitFor();
    const before = await page.evaluate(async status => {
      const [{ state }, data, crypto, profile, tools, bindings, history] = await Promise.all([
        import('/js/state.js'), import('/js/data.js'), import('/js/crypto.js'), import('/js/profile.js'), import('/js/agent-tool-runtime.js'), import('/js/agent-tool-bindings.js'), import('/js/chat-history.js'),
      ]);
      const id = await profile.createProfile('Synthetic damaged proposal history', { sex: 'female', skipInitialSync: true });
      for (const suffix of ['tour', 'emptyTour']) localStorage.setItem(profile.profileStorageKey(id, suffix), 'completed');
      await profile.switchProfile(id);
      await (await import('/js/nutrition-store.js')).hydrateNutritionSummary(state.currentProfile);
      state.importedData.healthGoals = []; state.importedData.contextNotes = 'Keep unrelated profile data';
      if (!await data.saveImportedData({ skipSync: true })) throw new Error('Synthetic profile write failed');
      await (await import('/js/nutrition-store.js')).saveActiveProfileMeal({
        id: 'retained-meal', name: 'Retain this saved meal', eatenAt: '2026-10-20T12:00:00Z', mealType: 'lunch',
        nutrients: { energyKcal: 400, proteinG: 15 }, note: 'Retain source facts while rejecting malformed proposal history',
      });
      const evidence = 'I want to improve my sleep.';
      const runtime = tools.createAgentToolRuntime({ readContext: () => '', userMessage: evidence, ...bindings.createBrowserAgentToolDependencies(state.currentProfile) });
      const read = await runtime.execute({ tool: 'getbased_read_context_card', arguments: { card: 'healthGoals' } });
      if (!read.success) throw new Error(read.contentItems[0].text);
      const result = await runtime.execute({ tool: 'getbased_draft_context', arguments: { card: 'healthGoals', snapshotId: JSON.parse(read.contentItems[0].text).snapshotId, changes: [{ field: 'goals', operation: 'add', record: { text: 'Improve sleep' } }], reason: 'A reported goal.', evidence } });
      if (!result.success) throw new Error(result.contentItems[0].text);
      state.currentThreadId = 'unknown-proposal-status';
      state.chatThreads = [{ id: state.currentThreadId, name: 'Stored damaged proposal status', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), messageCount: 1 }];
      // Persist malformed external history, not a healthy runtime-created state.
      state.chatHistory = JSON.parse(JSON.stringify([{ role: 'assistant', content: 'Review this goal.', agentDrafts: runtime.getDrafts().map(draft => ({ ...draft, profileId: state.currentProfile, status })) }]));
      if (!await history.saveChatHistory()) throw new Error('Synthetic malformed history write failed');
      (await import('/js/changelog.js')).closeChangelog();
      return JSON.parse((await crypto.encryptedGetItem(profile.profileStorageKey(state.currentProfile, 'imported')))!) as Record<string, unknown>;
    }, status);
    await page.reload();
    await page.evaluate(async () => {
      (await import('/js/changelog.js')).closeChangelog();
      await (await import('/js/chat-loader.js')).openChatPanel();
      await (await import('/js/chat-threads.js')).switchToThread('unknown-proposal-status');
    });
    await expect(page.locator('.chat-agent-draft-failed')).toHaveCount(1);
    await expect(page.locator('[data-chat-message-action="apply-agent-draft"]')).toHaveCount(0);
    const after = await page.evaluate(async () => {
      const [{ state }, crypto, profile] = await Promise.all([import('/js/state.js'), import('/js/crypto.js'), import('/js/profile.js')]);
      return { data: JSON.parse((await crypto.encryptedGetItem(profile.profileStorageKey(state.currentProfile, 'imported')))!), statuses: state.chatHistory.flatMap(message => (message.agentDrafts || []).map(draft => draft.status)) };
    });
    expect(after.data).toEqual(before); expect(after.statuses).toEqual(['failed']);
    await page.evaluate(async () => {
      const api = await import('/js/api.js');
      await api.saveCustomApiConnection('https://synthetic-provider.example/v1', 'synthetic-key'); api.setCustomApiModel('synthetic-tool-model');
      api.setAIProvider('custom'); api.setAIPaused(false);
      (await import('/js/agent-chat-settings.js')).setChatBackend('direct');
      (await import('/js/chat-panel.js')).updateChatInputState();
    });
    await expect(page.locator('#chat-input')).toBeEditable();
  });
}

test('a correction retires its older pending card before a stale Apply control can write', async ({ page }) => {
  await page.goto('/app');
  await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const { saveImportedData } = await import('/js/data.js');
    const { configureChatMessageActionDeps } = await import('/js/chat-actions.js');
    const { renderAgentDraftCards } = await import('/js/agent-drafts.js');
    state.importedData.diet = { bloating: 'none' };
    if (!await saveImportedData()) throw new Error('Fixture save failed');
    const proposal = (id: string, value: string) => ({ id, profileId: state.currentProfile, kind: 'context', status: 'pending',
      payload: { card: 'diet', baseline: JSON.stringify(state.importedData.diet), changes: [{ field: 'bloating', value }],
        reason: 'Reported change', evidence: `My bloating is ${value}.` } });
    state.currentThreadId = 'corrected-context';
    (state as { chatThreads: unknown }).chatThreads = [{ id: state.currentThreadId, name: 'Correction', createdAt: new Date().toISOString() }];
    state.chatHistory = [{ role: 'assistant', content: 'Earlier', agentDrafts: [proposal('older-context', 'mild')] }];
    const fixture = document.createElement('div'); fixture.id = 'corrected-context-fixture';
    fixture.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:white;color:black'; document.body.append(fixture);
    const render = () => { fixture.innerHTML = state.chatHistory.map((message, index) => renderAgentDraftCards(message, index)).join(''); };
    configureChatMessageActionDeps({ renderChatMessages: render }); render();
    // The corrected answer arrived, but an older button is still on screen.
    state.chatHistory.push({ role: 'assistant', content: 'Correction', agentDrafts: [proposal('newer-context', 'severe')] });
  });
  const fixture = page.locator('#corrected-context-fixture');
  await fixture.locator('[data-chat-message-draft-id="older-context"][data-chat-message-action="apply-agent-draft"]').click();
  await expect(fixture.locator('.chat-agent-draft-superseded')).toContainText('Replaced by a newer proposal');
  await expect(fixture.locator('[data-chat-message-action="apply-agent-draft"]')).toHaveCount(1);
  expect(await page.evaluate(async () => (await import('/js/state.js')).state.importedData.diet?.bloating)).toBe('none');
  await fixture.locator('[data-chat-message-draft-id="newer-context"][data-chat-message-action="apply-agent-draft"]').click();
  await expect(fixture.locator('.chat-agent-draft-applied')).toContainText('Applied to getbased');
  const saved = await page.evaluate(async () => {
    await (await import('/js/chat-history.js')).loadChatHistory();
    const { state } = await import('/js/state.js');
    return { bloating: state.importedData.diet?.bloating, statuses: state.chatHistory.flatMap(message => (message.agentDrafts || []).map(draft => draft.status)) };
  });
  expect(saved).toEqual({ bloating: 'severe', statuses: ['superseded', 'applied'] });
});

for (const decision of ['apply', 'discard', 'conflict'] as const) {
  test(`context update proposals require review and retain their ${decision} result`, async ({ page }) => {
    await page.goto('/app');
    const original = await page.evaluate(async () => {
      const { state } = await import('/js/state.js');
      const { saveImportedData } = await import('/js/data.js');
      const { createBrowserAgentToolDependencies } = await import('/js/agent-tool-bindings.js');
      const { createAgentToolRuntime } = await import('/js/agent-tool-runtime.js');
      const { configureChatMessageActionDeps } = await import('/js/chat-actions.js');
      const { renderAgentDraftCards } = await import('/js/agent-drafts.js');
      state.importedData.diet = { type: 'omnivore', bloating: 'none', note: 'Keep existing history', breakfastTime: '08:15' };
      if (!await saveImportedData()) throw new Error('Fixture save failed');
      const evidence = 'I now have moderate bloating after dinner.';
      const runtime = createAgentToolRuntime({ readContext: () => '', userMessage: evidence,
        ...createBrowserAgentToolDependencies(state.currentProfile || '') });
      const read = await runtime.execute({ tool: 'getbased_read_context_card', arguments: { card: 'diet' } });
      if (!read.success) throw new Error('Card read failed');
      const snapshot = JSON.parse(read.contentItems[0].text) as { snapshotId: string };
      const proposal = await runtime.execute({ tool: 'getbased_draft_context', arguments: { card: 'diet', snapshotId: snapshot.snapshotId,
        changes: [{ field: 'bloating', value: 'moderate' }], reason: 'Your digestive symptoms changed.', evidence } });
      if (!proposal.success) throw new Error(proposal.contentItems[0].text);
      state.currentThreadId = 'context-proposal-review';
      (state as { chatThreads: unknown }).chatThreads = [{ id: state.currentThreadId, name: 'Context proposal', createdAt: new Date().toISOString() }];
      state.chatHistory = [{ role: 'assistant', content: 'Review this update', agentDrafts: runtime.getDrafts().map(draft => ({ ...draft, profileId: state.currentProfile || '' })) }];
      const fixture = document.createElement('div'); fixture.id = 'context-proposal-fixture';
      fixture.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:white;color:black';
      document.body.append(fixture);
      const render = () => { fixture.innerHTML = renderAgentDraftCards(state.chatHistory[0], 0); };
      configureChatMessageActionDeps({ renderChatMessages: render }); render();
      return JSON.stringify(state.importedData.diet);
    });
    const fixture = page.locator('#context-proposal-fixture');
    await expect(fixture).toContainText('Bloating · current');
    await expect(fixture).toContainText('moderate');
    await expect(fixture).toContainText('I now have moderate bloating after dinner.');
    expect(await page.evaluate(async () => {
      const { state } = await import('/js/state.js');
      return state.importedData.diet?.bloating;
    })).toBe('none');
    if (decision === 'conflict') {
      // Simulate a newer persisted answer while this tab still holds its review snapshot.
      await page.evaluate(async () => {
        const { state } = await import('/js/state.js');
        const { encryptedGetItem, encryptedSetItem } = await import('/js/crypto.js');
        const { profileStorageKey } = await import('/js/profile.js');
        const key = profileStorageKey(state.currentProfile, 'imported');
        const saved = JSON.parse((await encryptedGetItem(key))!) as { diet: { bloating: string } };
        saved.diet.bloating = 'severe';
        await encryptedSetItem(key, JSON.stringify(saved));
      });
    }
    await fixture.locator(`[data-chat-message-action="${decision === 'discard' ? 'discard' : 'apply'}-agent-draft"]`).click();
    await expect(fixture).toContainText(decision === 'apply' ? 'Applied to getbased' : decision === 'discard' ? 'Discarded' : 'Nothing was applied');
    await expect(fixture.locator('[data-chat-message-action]')).toHaveCount(0);
    const result = await page.evaluate(async () => {
      const { state } = await import('/js/state.js');
      const { encryptedGetItem } = await import('/js/crypto.js');
      const { profileStorageKey } = await import('/js/profile.js');
      const { loadChatHistory } = await import('/js/chat-history.js');
      const { renderAgentDraftCards } = await import('/js/agent-drafts.js');
      const disk = JSON.parse((await encryptedGetItem(profileStorageKey(state.currentProfile, 'imported')))!) as { diet: { bloating: string; note: string; breakfastTime: string }; changeHistory: { field: string }[] };
      await loadChatHistory();
      return { disk, status: state.chatHistory[0]!.agentDrafts![0]!.status, html: renderAgentDraftCards(state.chatHistory[0], 0) };
    });
    expect(result.status).toBe(decision === 'apply' ? 'applied' : decision === 'discard' ? 'discarded' : 'conflict');
    expect(result.disk.diet).toMatchObject({ bloating: decision === 'apply' ? 'moderate' : decision === 'discard' ? 'none' : 'severe',
      note: 'Keep existing history', breakfastTime: '08:15' });
    if (decision === 'discard') expect(JSON.stringify(result.disk.diet)).toBe(original);
    if (decision === 'apply') expect(result.disk.changeHistory.some(change => change.field === 'diet')).toBe(true);
    expect(result.html).not.toContain('apply-agent-draft');
  });
}

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
      const oldDraft = { id: `aborted-${kind}`, profileId: state.currentProfile, status: 'pending',
        kind: kind === 'supplement' ? 'supplement' : 'note',
        payload: kind === 'supplement'
          ? { name: 'Synthetic supplement', type: 'supplement', startDate: '2026-09-01' }
          : { scope: kind === 'marker-note' ? 'marker' : 'profile', marker: 'biochemistry.glucose', mode: 'append', text: 'Proposed context' },
      };
      const draft = (await (await import('/js/agent-draft-upgrade.js')).prepareLegacyAgentDraftReview(oldDraft, 'Please save the explicitly reported context.'))[0]!;
      const before: unknown = JSON.parse((await encryptedGetItem(key)) as string);
      const put = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (...args) {
        const request = put.apply(this, args);
        if (args[1] === key) request.addEventListener('success', () => this.transaction.abort(), { once: true });
        return request;
      };
      let failed = '';
      try { await applyAgentDraft(draft); } catch (error: unknown) { failed = (error as {message: string}).message; }
      finally { IDBObjectStore.prototype.put = put; }
      const diskUnchanged = JSON.stringify(JSON.parse((await encryptedGetItem(key)) as string)) === JSON.stringify(before);
      const memoryUnchanged = state.importedData.contextNotes === 'Original context'
        && state.importedData.supplements.length === 0 && Object.keys(state.importedData.markerNotes).length === 0;
      const notice = await applyAgentDraft(draft);
      const saved = JSON.parse((await encryptedGetItem(key)) as string) as {supplements:{name?:unknown}[];markerNotes:Record<string,unknown>;contextNotes?:unknown};
      return { failed, diskUnchanged, memoryUnchanged, notice, value: kind === 'supplement' ? saved.supplements.map(item => item.name) : kind === 'marker-note' ? saved.markerNotes['biochemistry.glucose'] : saved.contextNotes };
    }, kind);
    expect(result.failed).toMatch(/Could not save/);
    expect(result.diskUnchanged).toBe(true);
    expect(result.memoryUnchanged).toBe(true);
    expect(result.notice).toMatch(/updated|added/);
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
    (state as {chatThreads: unknown}).chatThreads = [{ id: state.currentThreadId, name: 'Proposal', createdAt: new Date().toISOString() }];
    const prepared = await (await import('/js/agent-draft-upgrade.js')).prepareLegacyAgentDraftReview({ id: 'old-persistence', profileId: state.currentProfile, status: 'pending', kind: 'note', payload: { scope: 'profile', text: 'Applied once', mode: 'append' } }, 'Save this reported context note.');
    state.chatHistory = [{ role: 'assistant', content: '', agentDrafts: [{ ...prepared[0]!, id: 'draft-persistence' }] }];
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
    return (JSON.parse((await encryptedGetItem(`labcharts-${state.currentProfile}-chat-t_proposal-persistence`)) as string) as {agentDrafts: {status?: unknown}[]}[])[0]!.agentDrafts[0]!.status;
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
  await context.addInitScript(() => { for (const suffix of ['tour', 'emptyTour']) localStorage.setItem(`labcharts-default-${suffix}`, 'completed'); });
  await page.goto('/app');
  await page.locator('html[data-app-ready]').waitFor();
  const profile = await page.evaluate(async () => {
    (await import('/js/views.js')).navigate('labs');
    const { state } = await import('/js/state.js');
    if (!await (await import('/js/data.js')).saveImportedData()) throw new Error('Fixture save failed');
    return state.currentProfile;
  });
  const second = await context.newPage(); await second.goto('/app');
  await second.locator('html[data-app-ready]').waitFor();
  await second.evaluate(async () => { (await import('/js/views.js')).navigate('labs'); });
  const proposalIds: string[] = [];
  for (const tab of [page, second]) {
    proposalIds.push(await tab.evaluate(async profile => {
      const { state } = await import('/js/state.js');
      const { encryptedGetItem } = await import('/js/crypto.js');
      const { configureChatMessageActionDeps } = await import('/js/chat-actions.js');
      const { renderAgentDraftCards } = await import('/js/agent-drafts.js');
      state.currentProfile = profile;
      localStorage.setItem('labcharts-active-profile', profile);
      (state as {importedData: unknown}).importedData = JSON.parse((await encryptedGetItem(`labcharts-${profile}-imported`)) as string) as unknown;
      state.currentThreadId = 'shared-proposal';
      (state as {chatThreads: unknown}).chatThreads = [{ id: 'shared-proposal', name: 'Shared proposal' }];
      const prepared = await (await import('/js/agent-draft-upgrade.js')).prepareLegacyAgentDraftReview({ id: 'old-shared-meal', profileId: profile, kind: 'meal', status: 'pending', payload: { name: 'One proposed lunch', eatenAt: '2026-09-21T12:00:00Z', nutrients: { energyKcal: 500 } } }, 'Save this reported lunch.');
      state.chatHistory = [{ role: 'assistant', content: '', agentDrafts: [prepared[0]!] }];
      const fixture = document.createElement('div'); fixture.id = 'shared-proposal-fixture';
      fixture.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:white'; document.body.append(fixture);
      const render = () => { fixture.innerHTML = renderAgentDraftCards(state.chatHistory[0], 0); };
      configureChatMessageActionDeps({ renderChatMessages: render }); render();
      return prepared[0]!.id;
    }, profile));
  }
  expect(proposalIds[0]).toBe(proposalIds[1]);
  const key = `labcharts-${profile}-agent-draft-claims`;
  await page.evaluate(key => {
    navigator.locks.request(key, async () => {
      (window as Window & {proposalLockHeld?: boolean}).proposalLockHeld = true;
      await new Promise<void>(resolve => { (window as Window & {releaseProposalLock?: (()=>void)}).releaseProposalLock = resolve; });
    });
  }, key);
  await page.waitForFunction(() => (window as Window & {proposalLockHeld?: boolean}).proposalLockHeld);
  try {
    await page.locator('#shared-proposal-fixture [data-chat-message-action="apply-agent-draft"]').click();
    await expect.poll(() => page.evaluate(async key => (await navigator.locks.query()).pending!.filter(lock => lock.name === key).length, key)).toBe(1);
    // Refresh only the native index owner after the first preparatory history
    // save. Both proposal snapshots remain stale and target the same claim;
    // an unrelated stale-index refusal must not short-circuit this race.
    const refreshed = await second.evaluate(async () => {
      const { state } = await import('/js/state.js'), history = state.chatHistory;
      const loaded = await (await import('/js/chat-threads.js')).loadChatThreads();
      return loaded !== false && state.chatHistory === history && state.chatHistory[0]!.agentDrafts![0]!.status === 'pending';
    });
    expect(refreshed).toBe(true);
    await second.locator('#shared-proposal-fixture [data-chat-message-action="apply-agent-draft"]').click();
    await expect.poll(() => page.evaluate(async key => (await navigator.locks.query()).pending!.filter(lock => lock.name === key).length, key)).toBe(2);
  } finally { await page.evaluate(() => (window as Window & {releaseProposalLock?: (()=>void)}).releaseProposalLock!()); }
  await expect.poll(async () => Promise.all([page, second].map(tab => tab.evaluate(async () => (await import('/js/state.js')).state.chatHistory[0]!.agentDrafts![0]!.status)))).toEqual(expect.arrayContaining(['applied', 'failed']));
  const meals = await page.evaluate(async profile => (await import('/js/nutrition-store.js')).listNutritionMeals(profile), profile);
  expect(meals.map(meal => meal.name)).toEqual(['One proposed lunch']);
  await second.reload();
  const retried = await second.evaluate(async ({ profile, id }) => {
    try { await (await import('/js/agent-draft-claims.js')).claimAgentDraft(profile, id); return true; }
    catch { return false; }
  }, { profile, id: proposalIds[0]! });
  expect(retried).toBe(false);
});

test('proposal claims follow encryption and profile cleanup', async ({ page }) => {
  await page.goto('/app');
  const result = await page.evaluate(async () => {
    const crypto = await import('/js/crypto.js');
    const { claimAgentDraft } = await import('/js/agent-draft-claims.js');
    const key = 'labcharts-claims-fixture-agent-draft-claims';
    (window as Window & {__WEARABLES_TEST?: unknown}).__WEARABLES_TEST = true;
    await crypto._setTestSessionKey('synthetic-claims-passphrase');
    localStorage.setItem('labcharts-encryption-enabled', 'true');
    await claimAgentDraft('claims-fixture', 'private-proposal-id');
    const { getBlob } = await import('/js/blob-storage.js');
    const encrypted = !(await getBlob(key))!.includes('private-proposal-id') && localStorage.getItem(key) === null;
    const decoded = JSON.parse((await crypto.encryptedGetItem(key)) as string) as {claims:Record<string,unknown>};
    await (await import('/js/profile-storage-cleanup.js')).clearProfileStorage('claims-fixture');
    return { encrypted, claimed: decoded.claims['private-proposal-id'], removed: localStorage.getItem(key) === null && await getBlob(key) === null };
  });
  expect(result).toEqual({ encrypted: true, claimed: true, removed: true });
});

test('legacy proposal claims migrate before a later tab can reuse an approved draft', async ({ page, context }) => {
  await page.goto('/app');
  await page.evaluate(() => localStorage.setItem('labcharts-legacy-claims-agent-draft-claims', JSON.stringify({ version: 1, claims: { 'already-applied': true } })));
  const second = await context.newPage(); await second.goto('/app');
  for (const tab of [page, second]) {
    const blocked = await tab.evaluate(async () => {
      const { claimAgentDraft } = await import('/js/agent-draft-claims.js');
      try { await claimAgentDraft('legacy-claims', 'already-applied'); return false; } catch { return true; }
    });
    expect(blocked).toBe(true);
  }
  expect(await page.evaluate(async () => {
    const key = 'labcharts-legacy-claims-agent-draft-claims';
    const { getBlob } = await import('/js/blob-storage.js');
    return { local: localStorage.getItem(key), canonical: JSON.parse((await getBlob(key))!) };
  })).toEqual({ local: null, canonical: { version: 1, claims: { 'already-applied': true } } });
});

for (const scenario of [
  { card: 'healthGoals', field: 'goals', record: { text: 'Improve sleep quality' } },
  { card: 'diagnoses', field: 'familyHistory', record: { relative: 'maternal_grandfather', condition: "Alzheimer's disease", note: 'Died at age 80; onset unknown.' } },
  { card: 'menstrualCycle', field: 'periods', record: { startDate: '2026-10-23' } },
  { card: 'lightCircadian', field: 'note', value: 'I walk outdoors every morning.' },
  { card: 'interpretiveLens', field: 'text', value: 'Longevity medicine' },
]) {
  test(`reviewed ${scenario.card} changes persist with unrelated data intact`, async ({ page }) => {
    await page.goto('/app');
    const original = await page.evaluate(async scenario => {
      const { state } = await import('/js/state.js');
      const { saveImportedData } = await import('/js/data.js');
      const { createBrowserAgentToolDependencies } = await import('/js/agent-tool-bindings.js');
      const { createAgentToolRuntime } = await import('/js/agent-tool-runtime.js');
      const { configureChatMessageActionDeps } = await import('/js/chat-actions.js');
      const { renderAgentDraftCards } = await import('/js/agent-drafts.js');
      state.importedData.contextNotes = 'Keep this profile note.';
      state.importedData.healthGoals = [{ text: 'Keep existing goal', severity: 'major', extension: 'preserve' }];
      state.importedData.diagnoses = { conditions: [{ name: 'Existing condition', extension: 'preserve' }], flags: { oldFlag: true } };
      if (!await saveImportedData()) throw new Error('Fixture save failed');
      const before = structuredClone(state.importedData);
      const evidence = 'Synthetic reported update for browser persistence.';
      const runtime = createAgentToolRuntime({ readContext: () => '', userMessage: evidence, ...createBrowserAgentToolDependencies(state.currentProfile) });
      const read = await runtime.execute({ tool: 'getbased_read_context_card', arguments: { card: scenario.card } });
      if (!read.success) throw new Error(read.contentItems[0].text);
      const { snapshotId } = JSON.parse(read.contentItems[0].text);
      const change = scenario.record ? { field: scenario.field, operation: 'add', record: scenario.record } : { field: scenario.field, value: scenario.value };
      const proposed = await runtime.execute({ tool: 'getbased_draft_context', arguments: { card: scenario.card, snapshotId, changes: [change], reason: 'Reported update', evidence } });
      if (!proposed.success) throw new Error(proposed.contentItems[0].text);
      state.currentThreadId = 'expanded-context';
      (state as { chatThreads: unknown }).chatThreads = [{ id: state.currentThreadId, name: 'Expanded context', createdAt: new Date().toISOString() }];
      state.chatHistory = [{ role: 'assistant', content: 'Review the update', agentDrafts: runtime.getDrafts().map(draft => ({ ...draft, profileId: state.currentProfile })) }];
      const fixture = document.createElement('div'); fixture.id = 'expanded-context-fixture';
      fixture.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:white;color:black'; document.body.append(fixture);
      const render = () => { fixture.innerHTML = renderAgentDraftCards(state.chatHistory[0], 0); };
      configureChatMessageActionDeps({ renderChatMessages: render }); render();
      return before;
    }, scenario);
    const fixture = page.locator('#expanded-context-fixture');
    await expect(fixture).toContainText('Synthetic reported update');
    await fixture.locator('[data-chat-message-action="apply-agent-draft"]').click();
    await expect(fixture).toContainText('Applied to getbased');
    await page.reload();
    await page.locator('html[data-app-ready]').waitFor({ state: 'attached' });
    const saved = await page.evaluate(async () => {
      const { state } = await import('/js/state.js');
      const { encryptedGetItem } = await import('/js/crypto.js');
      const { profileStorageKey } = await import('/js/profile.js');
      return JSON.parse((await encryptedGetItem(profileStorageKey(state.currentProfile, 'imported'))) || '{}');
    });
    expect(saved.contextNotes).toBe(original.contextNotes);
    if (scenario.card !== 'diagnoses') expect(saved.diagnoses).toEqual(original.diagnoses);
    if (scenario.card !== 'healthGoals') expect(saved.healthGoals).toEqual(original.healthGoals);
    if (scenario.card === 'healthGoals') expect(saved.healthGoals).toEqual([...original.healthGoals, expect.objectContaining({ text: 'Improve sleep quality' })]);
    if (scenario.card === 'diagnoses') {
      expect(saved.diagnoses.conditions).toEqual(original.diagnoses?.conditions);
      if (!scenario.record) throw new Error('Medical-history fixture requires a record.');
      expect(saved.diagnoses.familyHistory).toEqual([expect.objectContaining(scenario.record)]);
      expect(saved.diagnoses.familyHistory[0]).not.toHaveProperty('onsetAge');
    }
    if (scenario.card === 'menstrualCycle') {
      expect(saved.menstrualCycle.periods).toEqual([expect.objectContaining({ startDate: '2026-10-23', endDate: '', flow: '', endDateKnown: false, flowKnown: false })]);
      expect(saved.menstrualCycle).not.toHaveProperty('cycleLength');
      expect(saved.menstrualCycle).not.toHaveProperty('periodLength');
      expect(saved.menstrualCycle).not.toHaveProperty('cycleStatus');
    }
    if (scenario.card === 'lightCircadian') expect(saved.lightCircadian.note).toBe(scenario.value);
    if (scenario.card === 'interpretiveLens') expect(saved.interpretiveLens).toBe(scenario.value);
  });
}

test('a first approved goal appears in the normal editor and survives reload without pre-seeded profile data', async ({ page }) => {
  await page.goto('/app');
  await page.evaluate(async () => {
    const profile = await import('/js/profile.js');
    const { state } = await import('/js/state.js');
    const { encryptedGetItem } = await import('/js/crypto.js');
    const id = await profile.createProfile('Fresh goal regression', { skipInitialSync: true });
    await profile.switchProfile(id);
    if (await encryptedGetItem(profile.profileStorageKey(id, 'imported')) !== null) throw new Error('The regression needs an unpersisted empty profile');
    const { createBrowserAgentToolDependencies } = await import('/js/agent-tool-bindings.js');
    const { createAgentToolRuntime } = await import('/js/agent-tool-runtime.js');
    const { configureChatMessageActionDeps } = await import('/js/chat-actions.js');
    const { renderAgentDraftCards } = await import('/js/agent-drafts.js');
    const evidence = 'I want to improve my sleep.';
    const runtime = createAgentToolRuntime({ readContext: () => '', userMessage: evidence, ...createBrowserAgentToolDependencies(id) });
    const read = await runtime.execute({ tool: 'getbased_read_context_card', arguments: { card: 'healthGoals' } });
    const { snapshotId } = JSON.parse(read.contentItems[0].text);
    const result = await runtime.execute({ tool: 'getbased_draft_context', arguments: { card: 'healthGoals', snapshotId,
      changes: [{ field: 'goals', operation: 'add', record: { text: 'Improve my sleep' } }], reason: 'An explicitly stated goal', evidence } });
    if (!result.success) throw new Error(result.contentItems[0].text);
    state.currentThreadId = 'first-goal';
    (state as { chatThreads: unknown }).chatThreads = [{ id: state.currentThreadId, name: 'First goal' }];
    state.chatHistory = [{ role: 'assistant', content: 'Review your goal', agentDrafts: runtime.getDrafts().map(draft => ({ ...draft, profileId: id })) }];
    const fixture = document.createElement('div'); fixture.id = 'first-goal-fixture';
    fixture.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:white;color:black'; document.body.append(fixture);
    const render = () => { fixture.innerHTML = renderAgentDraftCards(state.chatHistory[0], 0); };
    configureChatMessageActionDeps({ renderChatMessages: render }); render();
  });
  const fixture = page.locator('#first-goal-fixture');
  await expect(fixture).toContainText('Health Goals');
  await fixture.locator('[data-chat-message-action="apply-agent-draft"]').click();
  await expect(fixture).toContainText('Applied to getbased');
  await page.evaluate(async () => {
    document.getElementById('first-goal-fixture')!.remove();
    await (await import('/js/context-card-lifestyle-editors.js')).openHealthGoalsEditor();
  });
  await expect(page.locator('[aria-label="Saved health goals"] .goals-text')).toHaveText(['Improve my sleep']);
  expect(await page.evaluate(async () => (await import('/js/state.js')).state.importedData.contextNotes)).toBe('');
  await page.reload();
  await page.locator('html[data-app-ready]').waitFor({ state: 'attached' });
  await page.evaluate(async () => { await (await import('/js/context-card-lifestyle-editors.js')).openHealthGoalsEditor(); });
  await expect(page.locator('[aria-label="Saved health goals"] .goals-text')).toHaveText(['Improve my sleep']);
});

type ApplyOwnershipPort = { draft: { status?: unknown }; release?: () => void; lock?: Promise<unknown>; deleted?: boolean };
for (const kind of ['context', 'data'] as const) for (const retirement of ['none', 'thread', 'delete', 'index', 'message', 'review'] as const) {
  test(`queued ${kind} Apply preserves its exact data boundary when the originating ${retirement} owner is checked`, async ({ page, context }) => {
    await context.route('https://**/*', route => route.abort());
    await page.addInitScript(() => {
      localStorage.setItem('labcharts-ai-paused', 'true'); localStorage.setItem('labcharts-analytics-disabled', 'true');
      localStorage.setItem('labcharts-analytics-consent-seen', '1'); localStorage.setItem('labcharts-default-lastViewV1', 'labs');
      for (const suffix of ['tour', 'emptyTour']) localStorage.setItem('labcharts-default-' + suffix, 'completed');
    });
    await page.goto('/app');
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    const before = await page.evaluate(async kind => {
      const profile = await import('/js/profile.js'), id = await profile.createProfile('Synthetic Apply ownership', { sex: 'female', skipInitialSync: true });
      if (!id) throw new Error('Synthetic profile missing');
      localStorage.setItem(profile.profileStorageKey(id, 'lastViewV1'), 'labs');
      for (const suffix of ['tour', 'emptyTour']) localStorage.setItem(profile.profileStorageKey(id, suffix), 'completed');
      for (const prefix of ['labcharts-onboard-extras-done-', 'labcharts-onboard-context-cards-skipped-']) localStorage.setItem(prefix + id, '1');
      await profile.switchProfile(id);
      const { state } = await import('/js/state.js'), crypto = await import('/js/crypto.js');
      state.importedData.contextNotes = 'PRIVATE_RETAINED_APPLY_NOTE'; state.importedData.healthGoals = [{ text: 'Retained original goal', severity: 'minor' }];
      state.importedData.entries = [{ date: '2026-10-20', markers: { 'biochemistry.glucose': 5 } }]; state.importedData.nutritionMeals = [];
      if (!await (await import('/js/data.js')).saveImportedData({ skipSync: true })) throw new Error('Synthetic health seed failed');
      await (await import('/js/nutrition-store.js')).reconcileNutritionMealsFromProfileData(id);
      await (await import('/js/chat-loader.js')).openChatPanel();
      const threads = await import('/js/chat-threads.js'), history = await import('/js/chat-history.js');
      const destination = threads.createNewThread({ sync: false }); if (!destination) throw new Error('Destination missing');
      state.chatHistory = [{ role: 'user', content: 'PRIVATE_DESTINATION_CONVERSATION' }];
      if (!await history.saveChatHistory()) throw new Error('Destination save failed');
      const origin = threads.createNewThread({ sync: false }); if (!origin) throw new Error('Origin missing');
      if (!await threads.saveChatThreadIndex({ sync: false })) throw new Error('Thread setup failed');
      const evidence = kind === 'context' ? 'Improve my sleep as a high priority health goal.' : 'Set my profile note to the explicit new note.';
      const runtime = (await import('/js/agent-tool-runtime.js')).createAgentToolRuntime({ readContext: () => '', userMessage: evidence, ...(await import('/js/agent-tool-bindings.js')).createBrowserAgentToolDependencies(id) });
      const read = await runtime.execute({ tool: kind === 'context' ? 'getbased_read_context_card' : 'getbased_read_data', arguments: kind === 'context' ? { card: 'healthGoals' } : { resource: 'profileNotes' } });
      if (!read.success) throw new Error(read.contentItems[0]!.text);
      const snapshotId = JSON.parse(read.contentItems[0]!.text).snapshotId;
      const drafted = await runtime.execute({ tool: kind === 'context' ? 'getbased_draft_context' : 'getbased_draft_data', arguments: kind === 'context'
        ? { card: 'healthGoals', snapshotId, changes: [{ field: 'goals', operation: 'add', record: { text: 'Improve sleep', severity: 'major' } }], evidence, reason: 'Explicit goal.' }
        : { resource: 'profileNotes', operation: 'update', snapshotId, patch: JSON.stringify({ text: 'Explicit new note' }), evidence, reason: 'Explicit note.' } });
      if (!drafted.success) throw new Error(drafted.contentItems[0]!.text);
      state.chatHistory = [{ role: 'user', content: evidence }, { role: 'assistant', content: 'Review the explicit change.', agentDrafts: runtime.getDrafts().map(draft => ({ ...draft, profileId: id })) }];
      if (!await history.saveChatHistory()) throw new Error('Origin save failed');
      const target = document.getElementById('chat-messages'); if (!target) throw new Error('Native chat missing');
      const drafts = await import('/js/agent-drafts.js');
      const render = () => { target.innerHTML = state.chatHistory.map((message, index) => drafts.renderAgentDraftCards(message, index)).join(''); };
      (await import('/js/chat-actions.js')).configureChatMessageActionDeps({ renderChatMessages: render }); render();
      const port: ApplyOwnershipPort = { draft: state.chatHistory[1]!.agentDrafts![0]! };
      (globalThis as typeof globalThis & { applyOwnershipTest?: ApplyOwnershipPort }).applyOwnershipTest = port;
      const lockName = 'getbased-profile-data:' + id;
      await new Promise<void>(held => { port.lock = navigator.locks.request(lockName, async () => { held(); await new Promise<void>(release => { port.release = release; }); }); });
      const healthKey = profile.profileStorageKey(id, 'imported'), destinationKey = profile.profileStorageKey(id, 'chat-t_' + destination.id);
      return { id, origin: origin.id, destination: destination.id, healthKey, destinationKey, lockName, data: await crypto.encryptedGetItem(healthKey), destinationData: await crypto.encryptedGetItem(destinationKey) };
    }, kind);
    try {
      await page.locator('[data-chat-message-action="apply-agent-draft"]').click();
      await expect.poll(() => page.evaluate(async name => (await navigator.locks.query()).pending?.filter(lock => lock.name === name).length || 0, before.lockName)).toBe(1);
      if (retirement === 'thread') await page.evaluate(async id => (await import('/js/chat-threads.js')).switchToThread(id), before.destination);
      if (retirement === 'delete') {
        await page.evaluate(async id => { void (await import('/js/chat-threads.js')).deleteThread(id).then(deleted => { (globalThis as typeof globalThis & { applyOwnershipTest: ApplyOwnershipPort }).applyOwnershipTest.deleted = deleted; }); }, before.origin);
        await page.locator('#confirm-dialog-overlay.show #confirm-ok').click();
        await expect.poll(() => page.evaluate(() => (globalThis as typeof globalThis & { applyOwnershipTest: ApplyOwnershipPort }).applyOwnershipTest.deleted)).toBe(true);
      }
      if (retirement === 'index') await page.evaluate(async id => { const { state } = await import('/js/state.js'); state.chatThreads = state.chatThreads.filter(thread => thread.id !== id); }, before.origin);
      if (retirement === 'message') await page.evaluate(async () => { (await import('/js/state.js')).state.chatHistory.splice(0); });
      if (retirement === 'review') await page.evaluate(() => { (globalThis as typeof globalThis & { applyOwnershipTest: ApplyOwnershipPort }).applyOwnershipTest.draft.status = 'superseded'; });
      await page.evaluate(async () => { const port = (globalThis as typeof globalThis & { applyOwnershipTest: ApplyOwnershipPort }).applyOwnershipTest; port.release!(); await port.lock; });
      await expect.poll(() => page.evaluate(() => (globalThis as typeof globalThis & { applyOwnershipTest: ApplyOwnershipPort }).applyOwnershipTest.draft.status)).toBe(retirement === 'none' ? 'applied' : 'conflict');
      const after = await page.evaluate(async ({ id, healthKey, destinationKey }) => {
        await (await import('/js/profile-data-writes.js')).queueProfileDataWrite(id, () => {});
        const crypto = await import('/js/crypto.js');
        return { data: await crypto.encryptedGetItem(healthKey), destinationData: await crypto.encryptedGetItem(destinationKey) };
      }, before);
      expect(after.destinationData).toBe(before.destinationData);
      if (retirement !== 'none') expect(after.data).toBe(before.data);
      else {
        const original = JSON.parse(before.data!), saved = JSON.parse(after.data!);
        if (kind === 'data') expect(saved).toEqual({ ...original, contextNotes: 'Explicit new note' });
        else {
          expect(saved.healthGoals).toEqual([...original.healthGoals, expect.objectContaining({ text: 'Improve sleep', severity: 'major' })]);
          expect(saved.changeHistory).toEqual([...original.changeHistory, expect.objectContaining({ field: 'healthGoals', snapshot: saved.healthGoals })]);
          const restoredAt = saved._deletedClearedAt?.healthGoals?.g_ajn6io;
          expect(Number.isSafeInteger(restoredAt) && restoredAt > 0).toBe(true);
          expect(saved).toEqual({ ...original, healthGoals: saved.healthGoals, changeHistory: saved.changeHistory,
            _deletedClearedAt: { ...original._deletedClearedAt, healthGoals: { ...original._deletedClearedAt?.healthGoals, g_ajn6io: restoredAt } } });
        }
      }
      await page.reload();
      expect(await page.evaluate(async key => (await import('/js/crypto.js')).encryptedGetItem(key), before.healthKey)).toBe(after.data);
      expect(errors).toEqual([]);
    } finally {
      await page.evaluate(() => (globalThis as typeof globalThis & { applyOwnershipTest?: ApplyOwnershipPort }).applyOwnershipTest?.release?.()).catch(() => {});
    }
  });
}
