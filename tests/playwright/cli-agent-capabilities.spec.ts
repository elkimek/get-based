import { expect, test } from './coverage-fixture.js';
import { AGENT_TOOL_CONTRACT_VERSION } from '../../shared/agent-tool-contract.js';
import { AGENT_HOST_CAPABILITY_LIST, AGENT_HOST_PROTOCOL_VERSION } from '../../shared/agent-host-protocol.js';

for (const outcome of ['ready', 'closed', 'failed'] as const) {
  test(`agent selection owns its image catalog when Settings is ${outcome}`, async ({ page }) => {
    let release!: () => void;
    const catalogGate = new Promise<void>(resolve => { release = resolve; });
    let catalogRequested = false;
    const endpoint = 'http://127.0.0.1:8324', token = 'synthetic-capability-token';
    const descriptor = { endpoint, token, service:'getbased-agent-host', protocolVersion:AGENT_HOST_PROTOCOL_VERSION,
      toolContractVersion:AGENT_TOOL_CONTRACT_VERSION, capabilities:AGENT_HOST_CAPABILITY_LIST,
      agents:['codex','hermes'].map(id => ({id, name:id, status:'available', compatible:true})) };
    await page.route('**/api/local-agents*', route => route.fulfill({json:{agents:[]}}));
    await page.route('**/v1/**', async route => {
      const url = new URL(route.request().url());
      if (url.pathname === '/v1/models') {
        const hermes = url.searchParams.get('agent') === 'hermes';
        if (hermes) { catalogRequested = true; await catalogGate; }
        await route.fulfill(hermes && outcome === 'failed' ? {status:503,json:{error:'Synthetic model catalog unavailable'}}
          : {json:{models:[{id:hermes ? 'hermes-vision' : 'codex-text', isDefault:true, inputModalities:hermes ? ['text','image'] : ['text']}]}});
      } else if (url.pathname === '/v1/targets') await route.fulfill({json:{targets:[{id:'local',label:'Local CLI',status:'available'}]}});
      else await route.fulfill({json:descriptor});
    });
    // This case owns CLI capability selection, so complete the default profile's
    // onboarding before boot as well as the synthetic profile created below.
    await page.addInitScript(() => {
      for (const key of ['tour', 'emptyTour']) localStorage.setItem('labcharts-default-' + key, 'completed');
    });
    await page.goto('/app');
    await page.locator('html[data-app-ready]').waitFor();
    await page.evaluate(async ({endpoint,token}) => {
      const profile = await import('/js/profile.js');
      const id = await profile.createProfile('Synthetic capability test', {sex:'male',skipInitialSync:true});
      for (const key of ['tour','emptyTour']) localStorage.setItem(profile.profileStorageKey(id,key),'completed');
      localStorage.setItem(`labcharts-onboard-extras-done-${id}`, '1');
      localStorage.setItem(`labcharts-onboard-context-cards-skipped-${id}`, '1');
      await profile.switchProfile(id);
      (await import('/js/changelog.js')).closeChangelog();
      const settings = await import('/js/agent-chat-settings.js');
      await settings.saveAgentChatSettings({endpoint,token,agent:'codex',target:'local',model:''});
      settings.setChatBackend('codex');
      (await import('/js/agent-model-catalog.js')).cacheAgentModelCatalog([{id:'codex-text',isDefault:true,inputModalities:['text']}],'codex','local');
      await (await import('/js/settings-loader.js')).openSettingsModal('ai');
    },{endpoint,token});
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
  });
}
