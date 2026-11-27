import { expect, test } from './coverage-fixture.js';
import {startTestCompanion} from '../pwa/cli-companion-fixture.js';

for (const outcome of ['ready', 'closed', 'failed', 'loading the original catalog'] as const) {
  test(`agent selection owns its image catalog when Settings is ${outcome}`, async ({ page, context, baseURL }) => {
    let release!: () => void;
    const catalogGate = new Promise<void>(resolve => { release = resolve; });
    const overlapsInitialCatalog = outcome === 'loading the original catalog';
    const selectedAgent = outcome === 'ready' || overlapsInitialCatalog ? 'hermes' : 'codex';
    let releaseInitialStatus!: () => void;
    let releaseSelectionStatus!: () => void;
    const initialStatus = new Promise<void>(resolve => { releaseInitialStatus = resolve; });
    const selectionStatus = new Promise<void>(resolve => { releaseSelectionStatus = resolve; });
    let initialStatusRequests = 0;
    let selectionStatusRequests = 0;
    let selecting = false;
    let holdStatus = false;
    let catalogRequested = false;
    const companion = await startTestCompanion(baseURL!, {includeHermes: true});
    try {
      await companion.restrictConnections(context);
      if (overlapsInitialCatalog) await page.route(companion.endpoint + '/v1/status', async route => {
        if (!holdStatus) return route.continue();
        const waiting = selecting ? selectionStatus : initialStatus;
        if (selecting) ++selectionStatusRequests;
        else ++initialStatusRequests;
        const response = await route.fetch();
        await waiting;
        await route.fulfill({response});
      });
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
        localStorage.setItem('labcharts-analytics-disabled', 'true');
        localStorage.setItem('labcharts-analytics-consent-seen', '1');
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
      },companion.code);
      holdStatus = overlapsInitialCatalog;
      await page.evaluate(async () => (await import('/js/settings-loader.js')).openSettingsModal('ai'));
      await page.locator('[data-provider=cli]').click();
      const agents = page.getByRole('region', {name: 'CLI agents', exact: true});
      await expect(agents.locator('#cli-use-codex')).toBeChecked();
      if (overlapsInitialCatalog) {
        await expect.poll(() => initialStatusRequests).toBeGreaterThan(0);
        await expect(agents.getByText('Loading CLI model options…', {exact: true})).toBeVisible();
      } else {
        await expect(agents.locator('#cli-agent-model-summary')).toContainText('codex-text');
        await expect(agents.getByText('Loading CLI model options…', {exact: true})).toHaveCount(0);
      }
      const hermes = agents.locator('#cli-use-hermes');
      await expect(hermes).toBeEnabled();
      selecting = overlapsInitialCatalog;
      await hermes.click();
      if (overlapsInitialCatalog) {
        await expect(agents).toHaveAttribute('aria-busy', 'true');
        await expect.poll(() => selectionStatusRequests).toBeGreaterThan(0);
        // Let the already pending Codex refresh reconnect before the explicit Hermes selection.
        const originalCatalog = page.waitForRequest(request => {
          const url = new URL(request.url());
          return url.origin === companion.endpoint && url.pathname === '/v1/models' && url.searchParams.get('agent') === 'codex';
        });
        releaseInitialStatus();
        await originalCatalog;
        releaseSelectionStatus();
      }
      await expect.poll(() => catalogRequested).toBe(true);
      expect(await page.evaluate(async () => (await import('/js/agent-chat-settings.js')).getAgentHostAgent())).toBe('codex');
      if (outcome === 'closed') await page.evaluate(async () => (await import('/js/settings.js')).closeSettingsModal());
      release();
      if (selectedAgent === 'hermes') {
        await expect.poll(() => page.evaluate(async () => (await import('/js/agent-chat-settings.js')).getAgentHostAgent())).toBe('hermes');
      } else if (outcome === 'failed') await expect(page.locator('#notification-container')).toContainText('Synthetic model catalog unavailable');
      if (outcome !== 'closed') await page.evaluate(async () => (await import('/js/settings.js')).closeSettingsModal());
      await page.evaluate(async () => (await import('/js/chat-loader.js')).openChatPanel());
      const actual = await page.evaluate(async () => {
        const settings = await import('/js/agent-chat-settings.js');
        return {agent:settings.getAgentHostAgent(),backend:settings.getChatBackend(),route:(await import('/js/ai-execution-routing.js')).getAssistantExecutionRoute()};
      });
      expect(actual.agent).toBe(selectedAgent);
      expect(actual.backend).toBe('codex');
      expect(actual.route.adapter).toBe('codex');
      await page.locator('#chat-attach-btn').click();
      const photos = page.getByRole('button',{name:'Add photos',exact:true});
      if (selectedAgent === 'hermes') await expect(photos).toBeVisible();
      else await expect(photos).toBeHidden();
    } finally {
      releaseInitialStatus();
      releaseSelectionStatus();
      release();
      await companion.close();
    }
  });
}
