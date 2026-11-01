import { expect, test } from './coverage-fixture.js';

for (const decision of ['apply', 'discard'] as const) {
  test(`profile proposal ${decision} preserves the reviewed height and ordinary editor after reload`, async ({ page }) => {
    await page.goto('/app'); await page.locator('html[data-app-ready]').waitFor();
    await page.evaluate(async () => {
      const { state } = await import('/js/state.js');
      const { updateProfileMeta } = await import('/js/profile.js');
      if (!await updateProfileMeta(state.currentProfile, { name: 'Original profile', height: 170, heightUnit: 'cm', location: { country: 'Germany', zip: '12345' }, sex: null })) throw new Error('Fixture save failed');
      const runtime = (await import('/js/agent-tool-runtime.js')).createAgentToolRuntime({ readContext: () => '', userMessage: 'My height is 70 inches and I moved to Czechia.', ...(await import('/js/agent-tool-bindings.js')).createBrowserAgentToolDependencies(state.currentProfile) });
      const read = await runtime.execute({ tool: 'getbased_read_data', arguments: { resource: 'profile' } });
      if (!read.success) throw new Error(read.contentItems[0].text);
      const { snapshotId } = JSON.parse(read.contentItems[0].text);
      const result = await runtime.execute({ tool: 'getbased_draft_data', arguments: { resource: 'profile', snapshotId, operation: 'update',
        patch: JSON.stringify({ height: { value: 70, unit: 'in' }, location: { country: 'Czechia' } }), evidence: 'My height is 70 inches and I moved to Czechia.', reason: 'The user reported updated details.' } });
      if (!result.success) throw new Error(result.contentItems[0].text);
      state.currentThreadId = 'profile-proposal'; state.chatThreads = [{ id: state.currentThreadId, name: 'Profile proposal', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), messageCount: 1 }];
      state.chatHistory = [{ role: 'assistant', content: 'Review the profile change.', agentDrafts: runtime.getDrafts().map(draft => ({ ...draft, profileId: state.currentProfile })) }];
      const fixture = document.createElement('div'); fixture.id = 'profile-proposal-fixture'; fixture.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:white;color:black;overflow:auto'; document.body.append(fixture);
      const { renderAgentDraftCards } = await import('/js/agent-drafts.js'); const render = () => { fixture.innerHTML = renderAgentDraftCards(state.chatHistory[0], 0); };
      await (await import('/js/chat-loader.js')).loadChatModule();
      (await import('/js/chat-actions.js')).configureChatMessageActionDeps({ renderChatMessages: render }); render();
    });
    const fixture = page.locator('#profile-proposal-fixture');
    await expect(fixture).toContainText('Profile Details'); await expect(fixture).toContainText('177.8');
    expect(await page.evaluate(async () => (await import('/js/profile.js')).getProfileHeight().height)).toBe(170);
    await fixture.locator(`[data-chat-message-action="${decision}-agent-draft"]`).click();
    await expect(fixture).toContainText(decision === 'apply' ? 'Applied to getbased' : 'Discarded');
    await page.reload(); await page.locator('html[data-app-ready]').waitFor();
    await page.evaluate(async () => {
      const clients = await import('/js/client-list.js');
      await clients.openClientList(); clients.openClientForm((await import('/js/state.js')).state.currentProfile);
    });
    await expect(page.locator('#cl-height')).toHaveValue(decision === 'apply' ? '178' : '170');
    await expect(page.locator('#cl-height-unit')).toHaveValue('cm');
    await expect(page.locator('#cl-country')).toHaveValue(decision === 'apply' ? 'Czechia' : 'Germany');
    await expect(page.locator('#cl-zip')).toHaveValue('12345');
  });
}

test('profile Apply checks another renderer and rereads its saved details after conflict', async ({ page, context }) => {
  await page.goto('/app'); await page.locator('html[data-app-ready]').waitFor();
  const peer = await context.newPage(); await peer.goto('/app'); await peer.locator('html[data-app-ready]').waitFor();
  const draft = await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const runtime = (await import('/js/agent-tool-runtime.js')).createAgentToolRuntime({ readContext: () => '', userMessage: 'Call this profile New name.', ...(await import('/js/agent-tool-bindings.js')).createBrowserAgentToolDependencies(state.currentProfile) });
    const read = await runtime.execute({ tool: 'getbased_read_data', arguments: { resource: 'profile' } });
    const { snapshotId } = JSON.parse(read.contentItems[0].text);
    const result = await runtime.execute({ tool: 'getbased_draft_data', arguments: { resource: 'profile', snapshotId, operation: 'update', patch: '{"name":"New name"}', evidence: 'Call this profile New name.', reason: 'Explicit rename.' } });
    if (!result.success) throw new Error(result.contentItems[0].text);
    return { ...runtime.getDrafts()[0]!, profileId: state.currentProfile };
  });
  await peer.evaluate(async profile => { if (!await (await import('/js/profile.js')).updateProfileMeta(profile, { name: 'Peer name' })) throw new Error('Peer save failed'); }, draft.profileId);
  expect(await page.evaluate(async draft => {
    try { await (await import('/js/agent-drafts.js')).applyAgentDraft(draft); return false; }
    catch (error) { return !!(error as { noChangeApplied?: boolean }).noChangeApplied; }
  }, draft)).toBe(true);
  const name = await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const tools = (await import('/js/agent-tool-bindings.js')).createBrowserAgentToolDependencies(state.currentProfile);
    return (await tools.readData({ resource: 'profile', recordId: '', create: false, query: '', offset: 0, limit: 10 }) as { current: { name: string } }).current.name;
  });
  expect(name).toBe('Peer name');
});

test('ordinary metadata writers in two renderers retain independent changes', async ({ page, context }) => {
  await page.goto('/app'); await page.locator('html[data-app-ready]').waitFor(); const peer = await context.newPage(); await peer.goto('/app'); await peer.locator('html[data-app-ready]').waitFor();
  const id = await page.evaluate(async () => (await import('/js/state.js')).state.currentProfile);
  await Promise.all([
    page.evaluate(async id => { if (!await (await import('/js/profile.js')).updateProfileMeta(id, { name: 'Concurrent name' })) throw new Error('Name save failed'); }, id),
    peer.evaluate(async id => { if (!await (await import('/js/profile.js')).updateProfileMeta(id, { sex: 'female' })) throw new Error('Sex save failed'); }, id),
  ]);
  await page.reload(); await page.locator('html[data-app-ready]').waitFor();
  expect(await page.evaluate(async id => (await import('/js/profile.js')).getProfiles().find(profile => profile.id === id), id)).toMatchObject({ name: 'Concurrent name', sex: 'female' });
});
