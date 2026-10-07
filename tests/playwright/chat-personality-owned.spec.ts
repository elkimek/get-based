import { expect, test } from './coverage-fixture.js';

test.beforeEach(async ({page,context}) => {
  await context.route('https://openrouter.ai/**',route=>route.abort());
  await context.addInitScript({path:'node_modules/axe-core/axe.min.js'});
  await context.addInitScript(() => {
    for(const key of ['emptyTour','tour']) localStorage.setItem(`labcharts-default-${key}`,'completed');
    localStorage.setItem('labcharts-analytics-consent-seen','1');
    localStorage.setItem('labcharts-ai-paused','false');
    localStorage.setItem('labcharts-legal-acceptance',JSON.stringify({accepted:true,termsVersion:'2026-08-22',privacyVersion:'2026-08-22',policyScope:'self-hosted-notice',acceptedAt:'2026-10-07T00:00:00Z',appVersion:'test',location:'local-test'}));
    localStorage.setItem('labcharts-ai-provider','openrouter');
    localStorage.setItem('labcharts-openrouter-key','local-picker-fixture-key');
    localStorage.setItem('labcharts-openrouter-model','openai/reasoner-1');
    localStorage.setItem('labcharts-openrouter-models',JSON.stringify(Array.from({length:12},(_,i)=>({id:`openai/reasoner-${i+1}`,name:i===11?'<img src=x onerror=alert(1)>':`Reasoner ${i+1}`,reasoning:{supported_efforts:['low','medium','high']}}))));
    localStorage.setItem('labcharts-venice-model','venice-only');
    localStorage.setItem('labcharts-venice-models',JSON.stringify([{id:'venice-only',name:'Venice Only'}]));
  });
  await page.goto('/app');
  await page.evaluate(async()=>{
    await(await import('/js/chat-panel.js')).openChatPanel();
    const {state}=await import('/js/state.js');
    state.chatHistory=[{role:'user',content:'Question'},{role:'assistant',content:'Answer'}];
    (await import('/js/chat-render.js')).renderChatMessages();
  });
  await expect(page.locator('#chat-input')).toBeVisible();
});


test('owned personality picker and editor remain usable across themes and compact layouts',async({page})=>{
  test.setTimeout(180000);
  await page.evaluate(async()=>{const p=await import('/js/chat-personalities.js');await p.saveCustomPersonalities([{id:'custom_literal',name:'<img src=x onerror=alert(1)>',icon:'🌿',promptText:'Literal instructions'}]);p.updatePersonalityBar();});
  for(const theme of ['dark','light','cyberterm','glass','synth-sunrise','neuromancer']){
    await page.evaluate(async theme=>{const t=await import('/js/theme.js');await t.loadExtraThemesStylesheet();t.setTheme(theme);},theme);
    for(const width of [1280,390,320]){
      await page.setViewportSize({width,height:900});const label=`${theme}/${width}`;
      await page.locator('.chat-personality-current').click();
      await expect(page.locator('#chat-personality-options')).toBeVisible();
      expect(await page.locator('#chat-personality-options').evaluate(element=>{const b=element.getBoundingClientRect();return b.left>=0&&b.right<=innerWidth&&b.bottom<=innerHeight&&element.scrollWidth<=element.clientWidth+1;}),label).toBe(true);
      await expect(page.locator('#chat-personality-custom-section img')).toHaveCount(0);
      await expect(page.locator('.chat-personality-opt[data-personality="custom_literal"]')).toContainText('<img src=x onerror=alert(1)>');
      expect(await page.locator('#chat-personality-options').evaluate(async element=>(await(window as unknown as {axe:typeof import('axe-core')}).axe.run(element,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.failureSummary)}))),label).toEqual([]);
      await page.locator('.chat-personality-edit').click();
      const editor=page.locator('[role="dialog"].chat-personality-editor');await expect(editor).toBeVisible();
      await expect(page.locator('#chat-personality-custom-name')).toHaveValue('<img src=x onerror=alert(1)>');
      expect(await editor.evaluate(element=>{const b=element.getBoundingClientRect();const save=element.querySelector('.chat-personality-custom-save')!.getBoundingClientRect();return b.left>=-1&&b.right<=innerWidth+1&&b.top>=-1&&b.bottom<=innerHeight+1&&save.bottom<=b.bottom+1&&element.scrollWidth<=element.clientWidth+1;}),label).toBe(true);
      await page.locator('#chat-personality-custom-prompt').fill('Revised instructions to check the enabled Save button.');
      expect(await editor.evaluate(async element=>(await(window as unknown as {axe:typeof import('axe-core')}).axe.run(element,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.failureSummary)}))),label).toEqual([]);
      await page.locator('#chat-personality-custom-prompt').fill('Literal instructions');
      await page.locator('.chat-personality-custom-cancel').click();await expect(editor).toHaveCount(0);
      await expect(page.locator('.chat-personality-add-btn')).toBeFocused();
      await page.keyboard.press('Escape');await expect(page.locator('.chat-personality-current')).toBeFocused();await expect(page.locator('#chat-panel')).toHaveClass(/open/);
    }
  }
  await page.locator('.chat-personality-current').click();await page.screenshot({path:test.info().outputPath('persona-picker.png')});await page.locator('.chat-personality-edit').click();await page.screenshot({path:test.info().outputPath('persona-editor.png')});
});
