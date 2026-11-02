import { expect } from '../playwright/coverage-fixture.js';
import type { Page, BrowserContext } from '@playwright/test';
import { seedDashboardControlProfile, dashboardHealth } from './dashboard-control-fixture.js';
import { routeJavaScript } from './browser-static-routes.js';

/** Management requests receive ordinary guidance; the browser tools retain only health authority. */
export function nativeManagementCase(provider: 'custom' | 'venice', protocol: 'native' | 'structured', statement: string, reply: string) {
  return async ({page,context}: {page: Page; context: BrowserContext}) => {
    const errors: string[] = [], downloads: string[] = []; page.on('pageerror', error => errors.push(error.message)); page.on('download', download => downloads.push(download.suggestedFilename()));
    await context.route('https://**/*', route => route.abort());
    await routeJavaScript(page, '**/js/cloud-ai-consent.js', `export * from '/js/cloud-ai-consent.js?native-management-original'; export async function requestAIProcessingApproval(){return true;} export async function requireAIProcessingApproval(){}`);
    await seedDashboardControlProfile(page);
    await page.evaluate(async provider => {
      const api = await import('/js/api.js');
      if (provider === 'venice') { await api.saveVeniceKey('synthetic-scope-key'); api.setVeniceModel('fixture-model'); api.setVeniceE2EE(false); }
      else { await api.saveCustomApiConnection('https://health-scope.example/v1', 'synthetic-scope-key'); api.setCustomApiModel('fixture-model'); }
      api.setAIProvider(provider); api.setAIPaused(false); (await import('/js/agent-chat-settings.js')).setChatBackend('direct'); await (await import('/js/chat-loader.js')).openChatPanel();
    },provider);
    const before = await dashboardHealth(page);
    const selection = await page.evaluate(async () => {
      const api = await import('/js/api.js'), {state} = await import('/js/state.js');
      return {profile:state.currentProfile,provider:api.getAIProvider(),model:api.getActiveModelId(),display:(await import('/js/display-preferences.js')).readDisplayPreferences()};
    });
    let completions = 0, unsupported = 0;
    await page.route(provider === 'venice' ? 'https://api.venice.ai/api/v1/chat/completions' : 'https://health-scope.example/v1/chat/completions', async route => {
      const body = route.request().postDataJSON();
      const policy = String(body.messages.find((item:{role:string}) => item.role === 'system')?.content || '');
      expect(policy).toContain('Application management stays manual');
      if (protocol === 'structured' && body.tools) { unsupported++; await route.fulfill({status:400,json:{error:{message:'tools not supported'}}}); return; }
      const marker = 'Supported tools:\n', start = policy.lastIndexOf(marker);
      const tools = body.tools || JSON.parse(policy.slice(start + marker.length));
      expect(tools).toHaveLength(13);
      const definitions = tools.map((item: {function?:unknown}) => item.function || item);
      for (const name of ['getbased_read_app','getbased_request_app','getbased_app_actions','getbased_draft_note']) expect(definitions.map((item: {name:string}) => item.name)).not.toContain(name);
      const navigation = definitions.find((item:{name:string}) => item.name === 'getbased_navigate');
      const properties = navigation.parameters?.properties || navigation.inputSchema?.properties;
      expect(Object.keys(properties).sort()).toEqual(['card','category','marker','recordId','view']);
      expect(properties.view.enum).not.toContain('aiSettings'); expect(properties.view.enum).not.toContain('dataSettings'); expect(properties.view.enum).not.toContain('profileShare');
      completions++;
      if(protocol === 'structured') await route.fulfill({json:{choices:[{message:{content:JSON.stringify({reply,calls:[]})},finish_reason:'stop'}]}});
      else await route.fulfill({contentType:'text/event-stream',body:`data: ${JSON.stringify({choices:[{delta:{content:reply},finish_reason:'stop'}]})}\n\ndata: [DONE]\n\n`});
    });
    await page.locator('#chat-input').fill(statement); await page.locator('#chat-send-btn').click();
    await expect(page.locator('#chat-messages')).toContainText(reply); await expect(page.locator('#chat-send-btn.streaming')).toHaveCount(0);
    await expect(page.locator('.chat-agent-draft,.chat-app-control')).toHaveCount(0);
    await expect(page.locator('#settings-modal-overlay.show,#confirm-dialog-overlay.show')).toHaveCount(0);
    expect(completions).toBe(1); expect(unsupported).toBe(protocol === 'structured'?1:0);
    expect(await dashboardHealth(page)).toBe(before);
    expect(await page.evaluate(async () => {
      const api=await import('/js/api.js'),{state}=await import('/js/state.js');
      return {profile:state.currentProfile,provider:api.getAIProvider(),model:api.getActiveModelId(),display:(await import('/js/display-preferences.js')).readDisplayPreferences()};
    })).toEqual(selection);
    expect(downloads).toEqual([]); expect(errors).toEqual([]);
  };
}
