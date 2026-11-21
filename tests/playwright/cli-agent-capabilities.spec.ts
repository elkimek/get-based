import { expect, test } from './coverage-fixture.js';
import {startTestCompanion} from '../pwa/cli-companion-fixture.js';

for (const outcome of ['ready', 'closed', 'failed'] as const) {
  test(`agent selection owns its image catalog when Settings is ${outcome}`, async ({ page, context, baseURL }) => {
    let release!: () => void;
    const catalogGate = new Promise<void>(resolve => { release = resolve; });
    let catalogRequested = false;
    const companion = await startTestCompanion(baseURL!, {includeHermes: true});
    try {
    await companion.restrictConnections(context);
    await page.route(companion.endpoint + '/v1/models*', async route => {
      // Obtain the production service's authorization decision before holding the response.
      const response = await route.fetch();
      expect(response.ok()).toBe(true);
      const hermes = new URL(route.request().url()).searchParams.get('agent') === 'hermes';
      if (hermes) { catalogRequested = true; await catalogGate; }
      await route.fulfill(hermes && outcome === 'failed'
        ? {response, status: 503, json: {error: 'Synthetic model catalog unavailable'}}
        : {response, json: {models:[{id:hermes ? 'hermes-vision' : 'codex-text', isDefault:true, inputModalities:hermes ? ['text','image'] : ['text']}]}});
    });
    // This case owns CLI capability selection, so complete the default profile's
    // onboarding before boot as well as the synthetic profile created below.
    await page.addInitScript(() => {
      for (const key of ['tour', 'emptyTour']) localStorage.setItem('labcharts-default-' + key, 'completed');
    });
    await page.goto('/app');
    await page.locator('html[data-app-ready]').waitFor();
    await page.evaluate(async (code) => {
      const profile = await import('/js/profile.js');
      const id = await profile.createProfile('Synthetic capability test', {sex:'male',skipInitialSync:true});
      for (const key of ['tour','emptyTour']) localStorage.setItem(profile.profileStorageKey(id,key),'completed');
      localStorage.setItem(`labcharts-onboard-extras-done-${id}`, '1');
      localStorage.setItem(`labcharts-onboard-context-cards-skipped-${id}`, '1');
      await profile.switchProfile(id);
      (await import('/js/changelog.js')).closeChangelog();
      const settings = await import('/js/agent-chat-settings.js');
      await settings.pairLocalCompanion(code);
      const codex = (await settings.discoverLocalChatAgents()).find(agent => agent.id === 'codex')!;
      await settings.saveAgentChatSettings({endpoint:codex.endpoint,token:codex.token,agent:'codex',target:'local',model:''});
      settings.setChatBackend('codex');
      (await import('/js/agent-model-catalog.js')).cacheAgentModelCatalog([{id:'codex-text',isDefault:true,inputModalities:['text']}],'codex','local');
      await (await import('/js/settings-loader.js')).openSettingsModal('ai');
    },companion.code);
    await page.locator('[data-provider=cli]').click();
    await expect(page.locator('#cli-use-hermes')).toBeEnabled();
    await page.locator('#cli-use-hermes').click();
    await expect.poll(() => catalogRequested).toBe(true);
    expect(await page.evaluate(async () => (await import('/js/agent-chat-settings.js')).getAgentHostAgent())).toBe('codex');
    if (outcome === 'closed') await page.evaluate(async () => (await import('/js/settings.js')).closeSettingsModal());
    release();
    if (outcome === 'ready') {
      await expect.poll(() => page.evaluate(async () => (await import('/js/agent-chat-settings.js')).getAgentHostAgent())).toBe('hermes');
    } else if (outcome === 'failed') await expect(page.locator('#notification-container')).toContainText('Synthetic model catalog unavailable');
    if (outcome !== 'closed') await page.evaluate(async () => (await import('/js/settings.js')).closeSettingsModal());
    await page.evaluate(async () => (await import('/js/chat-loader.js')).openChatPanel());
    const actual = await page.evaluate(async () => {
      const settings = await import('/js/agent-chat-settings.js');
      return {agent:settings.getAgentHostAgent(),backend:settings.getChatBackend(),route:(await import('/js/ai-execution-routing.js')).getAssistantExecutionRoute()};
    });
    expect(actual.agent).toBe(outcome === 'ready' ? 'hermes' : 'codex');
    expect(actual.backend).toBe('codex');
    expect(actual.route.adapter).toBe('codex');
    await page.locator('#chat-attach-btn').click();
    const photos = page.getByRole('button',{name:'Add photos',exact:true});
    if (outcome === 'ready') await expect(photos).toBeVisible();
    else await expect(photos).toBeHidden();
    } finally { release(); await companion.close(); }
  });
}
