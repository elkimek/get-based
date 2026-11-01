import { expect, test } from './coverage-fixture.js';
import { seedDashboardControlProfile, dashboardHealth } from '../helpers/dashboard-control-fixture.js';
import { nativeManagementCase } from '../helpers/chat-native-management.js';
for (const view of ['healthImport','reportBuilder','profileShare','lightTools','dataSettings']) {
  for(const provider of ['custom','venice'] as const) for(const protocol of ['native','structured'] as const)
    test(`${provider} ${protocol} ${view} uses native guidance`, nativeManagementCase(provider,protocol,`Open ${view} for me.`,`Use the native application controls for ${view}.`));
  test(`retired ${view} cannot open over an unsaved health form`, async ({page}) => {
    await seedDashboardControlProfile(page); const before=await dashboardHealth(page);
    await page.evaluate(async () => (await import('/js/agent-tool-bindings.js')).navigateFromAgent({view:'contextEditor',card:'healthGoals',marker:''}));
    await page.locator('#goal-text-input').fill('Keep my unsaved goal');
    const result=await page.evaluate(async view => {
      try {await (await import('/js/agent-tool-bindings.js')).navigateFromAgent({view,marker:''});return 'unexpected';}
      catch(error){return error instanceof Error ? error.message : String(error);}
    },view);
    expect(result).toContain('native settings'); await expect(page.locator('#goal-text-input')).toHaveValue('Keep my unsaved goal');
    expect(await dashboardHealth(page)).toBe(before);
  });
}

test('Data settings leaves provider initialization cold until the human selects AI', async ({ page, context }) => {
  await context.route('https://**/*', route => route.abort()); await seedDashboardControlProfile(page);
  await page.evaluate(async () => { const api = await import('/js/api.js'); await api.saveCustomApiConnection('https://native-handoff.example/v1', 'synthetic-handoff-key'); api.setAIProvider('custom'); (await import('/js/agent-chat-settings.js')).setChatBackend('direct'); });
  let providerLoads = 0;
  await page.route('**/js/provider-panels.js', async route => { providerLoads++; await route.continue(); });
  await page.evaluate(async () => (await import('/js/settings.js')).openSettingsModal('data'));
  await expect(page.locator('#settings-tab-data.active')).toBeVisible(); expect(providerLoads).toBe(0);
  await page.locator('#settings-nav-ai').click();
  await expect(page.locator('#settings-tab-ai.active [data-custom-settings-host]')).toBeVisible(); expect(providerLoads).toBe(1);
});
