import { expect,test } from '@playwright/test';
import { routeHtml } from '../helpers/browser-static-routes.js';
// The 44px contract applies to genuine coarse-pointer targets; desktop density
// has separate acceptance in the Settings density suite.
test.use({ hasTouch: true });
test('owned CLI panel preserves companion states, themes, layouts and accessible controls',async ({ page,context }) => {
  test.setTimeout(180_000); await context.addInitScript({ path:'node_modules/axe-core/axe.min.js' });
  await routeHtml(page,'**/cli-settings-owned-test','<!doctype html><html lang="en"><head><title>CLI settings</title><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/css/settings.css"></head><body><main id="settings-modal" class="settings-modal"><div data-cli-agent-settings-host></div></main></body></html>');
  await page.goto('/cli-settings-owned-test');
  const setState=async (mode:string) => page.evaluate(async mode => {
    const { buildCliAgentSettingsSnapshot }=await import('/js/cli-agent-settings-presentation.js'),{ normalizeDiscoveredAgent }=await import('/js/agent-host-discovery.js'),component=await import('/js/cli-agent-settings-component.js');
    const agent={ id:'codex',name:'Codex CLI',description:'OpenAI official CLI',version:'0.150.1',status:'available',compatible:true,endpoint:'http://127.0.0.1:8325',token:'SYNTHETIC-PRIVATE-TOKEN',controlAuthorized:true,runtimeMode:'installed',capabilities:['companion-control','companion-restart'],companionVersion:'1.2.0',paused:false };
    if (mode === 'temporary') agent.runtimeMode='temporary';
    if (mode === 'paused') { agent.paused=true; agent.status='paused'; }
    if (mode === 'outdated') agent.capabilities=['chat-stream'];
    if (mode === 'linked') { agent.controlAuthorized=false; agent.capabilities.push('companion-management'); }
    if (mode === 'login') agent.status='login_required';
    if (mode === 'stopped') agent.status='unavailable';
    const snapshot=buildCliAgentSettingsSnapshot(mode === 'setup' ? [] : [normalizeDiscoveredAgent(agent)],{ selectedAgent:'codex',backend:'codex',collapsed:new Set(),platform:'linux',origin:location.origin,theme:document.documentElement.dataset.theme || 'dark' });
    const host=document.querySelector<HTMLElement>('[data-cli-agent-settings-host]')!;
    component.mountCliAgentSettings(host,snapshot,{ scan:() => {},platform:() => {},copy:() => {},login:() => {},test:() => {},toggle:() => {},disclose:agent => { const view=component.getCliAgentSettingsView()!; view.refresh({ ...view.getSnapshot(),rows:view.getSnapshot().rows.map(row => row.id === agent ? { ...row,collapsed:!row.collapsed } : row) }); },control:() => {} });
    const modelHost=component.getCliAgentSettingsView()?.getModelHost();
    if (modelHost) {
      const models=await import('/js/cli-agent-models-component.js'),projection=await import('/js/cli-agent-models-presentation.js');
      models.mountCliAgentModels(modelHost,projection.buildCliAgentModelsSnapshot([{ id:'first',model:'first',displayName:'First model',description:'',isDefault:true,defaultReasoningEffort:'',supportedReasoningEfforts:[],inputModalities:['text'] }],[],{ agent:'codex',target:'local',model:'first',effort:'',providerFilter:'' }),() => {});
    }
  },mode);
  const panel=page.locator('[data-cli-agent-settings-view]');
  const check=async (label:string) => {
    expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches), label).toBe(true);
    expect(await panel.evaluate(element => element.scrollWidth <= element.clientWidth),label).toBe(true);
    const violations=await panel.evaluate(async element => (await (window as unknown as { axe:typeof import('axe-core') }).axe.run(element,{ runOnly:{ type:'tag',values:['wcag2a','wcag2aa','wcag21aa'] } })).violations.map(v => ({ id:v.id,nodes:v.nodes.map(n => n.target) })));
    expect(violations,label).toEqual([]);
    for (const control of await panel.locator('summary:visible,button:visible,input:visible,a:visible').all()) expect(await control.evaluate(element => element.getBoundingClientRect().height),label).toBeGreaterThanOrEqual(44);
    expect(await panel.innerHTML()).not.toContain('SYNTHETIC-PRIVATE-TOKEN');
  };
  await setState('installed');
  for (const theme of ['dark','light','cyberterm','glass','synth-sunrise','neuromancer']) {
    await page.evaluate(async theme => { const themes=await import('/js/theme.js'); await themes.loadExtraThemesStylesheet(); themes.setTheme(theme); },theme);
    for (const width of [1280,700,390,320]) { await page.setViewportSize({ width,height:900 }); await check(`${theme}/${width}`); }
    await setState('setup');await check(`${theme}/setup`);await setState('installed');
  }
  const header=panel.locator('[data-settings-action="toggle-cli-agent-options"]'); await header.focus(); await header.press('Enter'); await expect(panel.locator('#cli-agent-options')).toBeHidden(); await header.press('Space'); await expect(panel.locator('#cli-agent-options')).toBeVisible(); await expect(panel.locator('input')).toBeChecked();
  for (const mode of ['setup','temporary','paused','outdated','linked','login','stopped']) {
    await setState(mode); await check(mode);
    if (mode === 'setup') { await expect(panel.getByRole('group',{ name:'Operating system' }).getByRole('button')).toHaveCount(3); await expect(panel).toContainText('No port or pairing token is needed'); }
    if (mode === 'temporary') { await expect(panel.locator('[data-value="install"]')).toBeVisible(); await expect(panel.locator('[data-value="restart-companion"]')).toHaveCount(0); }
    if (mode === 'paused') { await expect(panel.locator('[data-value="resume"]')).toBeVisible(); await expect(panel.locator('[data-value="restart"]')).toBeDisabled(); await expect(panel.locator('input')).toBeDisabled(); }
    if (mode === 'outdated') { await expect(panel).toContainText('Update required'); await expect(panel.locator('[data-settings-action="control-cli-companion"]')).toHaveCount(0); }
    if (mode === 'linked') await expect(panel.getByRole('link',{ name:'Manage Companion' })).toHaveAttribute('href','http://127.0.0.1:8325/manage');
    if (mode === 'login') await expect(panel.locator('[data-settings-action="copy-cli-agent-login"]')).toBeVisible();
    if (mode === 'stopped') { await expect(panel).toContainText('Installed · companion not running'); await expect(panel.locator('input')).toBeDisabled(); }
  }
  await page.evaluate(async () => (await import('/js/theme.js')).setTheme('dark')); await page.setViewportSize({ width:390,height:900 }); await setState('installed'); await panel.scrollIntoViewIfNeeded(); await page.screenshot({ path:test.info().outputPath('cli-settings-mobile.png'),fullPage:true });
  await page.setViewportSize({ width:1280,height:900 }); await page.screenshot({ path:test.info().outputPath('cli-settings-desktop.png'),fullPage:true });
});
