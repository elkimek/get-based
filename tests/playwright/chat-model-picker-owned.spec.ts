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

test('owned model picker fits open menus across themes and narrow layouts',async({page})=>{
  test.setTimeout(180000);
  const owner=page.locator('[data-chat-model-picker-view]');
  await page.locator('#chat-input').fill('Long draft with wrapped text. '.repeat(60));
  for(const theme of ['dark','light','cyberterm','glass','synth-sunrise','neuromancer']) {
    await page.evaluate(async theme=>{const themes=await import('/js/theme.js');await themes.loadExtraThemesStylesheet();themes.setTheme(theme);},theme);
    for(const [width,height] of [[1280,900],[700,900],[390,900],[320,900],[390,520],[320,520]] as const) {
      await page.setViewportSize({width,height});
      if(!await owner.evaluate(element=>(element as HTMLDetailsElement).open))await page.locator('#chat-model-menu-toggle').click();
      const label=`${theme}/${width}x${height}`;
      await expect.poll(()=>page.locator('#chat-model-menu-popover').evaluate(element=>{
        const box=element.getBoundingClientRect(),panel=document.getElementById('chat-panel')!.getBoundingClientRect();
        const header=document.querySelector('.chat-header')!.getBoundingClientRect();
        const refresh=element.querySelector('[data-chat-model-refresh]')!.getBoundingClientRect();
        return box.left>=Math.max(panel.left,0)-1 && box.right<=Math.min(panel.right,innerWidth)+1 && box.top>=Math.max(header.bottom,0)-1 && box.bottom<=innerHeight && refresh.bottom<=box.bottom+1 && element.scrollWidth<=element.clientWidth+1;
      }),{message:`${label}: open menu stays inside visible Chat`}).toBe(true);
      await expect.poll(()=>owner.evaluate(async element=>(await(window as unknown as {axe:typeof import('axe-core')}).axe.run(element,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}))),{message:label}).toEqual([]);
      expect(await page.locator('#chat-model-menu-popover').evaluate(element=>{
        const canvas=document.createElement('canvas');canvas.width=canvas.height=1;
        const paint=canvas.getContext('2d')!;paint.fillStyle=getComputedStyle(element).backgroundColor;paint.fillRect(0,0,1,1);
        return paint.getImageData(0,0,1,1).data[3];
      }),`${label}: draft text cannot show through the menu`).toBe(255);
      expect(await page.locator('#chat-model-options').evaluate(element=>{
        const clip=element.getBoundingClientRect();
        return [...element.querySelectorAll<HTMLElement>('.chat-model-option:not([hidden])')].filter(option=>{
          const box=option.getBoundingClientRect(),x=(box.left+box.right)/2,y=(box.top+box.bottom)/2;
          // A partly clipped row is reached by scrolling; test hit targets
          // only when the complete row is inside the scroll viewport.
          return box.top>=clip.top && box.bottom<=clip.bottom && !option.contains(document.elementFromPoint(x,y));
        }).map(option=>option.dataset.chatModelValue);
      }),`${label}: visible choices remain clickable above the draft`).toEqual([]);
      if(await page.evaluate(()=>matchMedia('(pointer:coarse)').matches)) {
        for(const selector of ['#chat-model-menu-toggle','#chat-model-search','#chat-model-effort','[data-chat-model-refresh]','.chat-model-option:not([hidden])']) {
          expect(await page.locator(selector).first().evaluate(element=>element.getBoundingClientRect().height),`${label}: ${selector}`).toBeGreaterThanOrEqual(44);
        }
      }
    }
  }
  await page.screenshot({path:test.info().outputPath('chat-model-picker-open.png')});
  // Real click must scroll the final row into view in the shortest layout.
  await page.locator('[data-chat-model-value="openai/reasoner-12"]').click();
  await expect(page.locator('#chat-model-menu-label')).toHaveText('<img src=x onerror=alert(1)>');
  await expect(page.locator('#chat-model-menu')).not.toHaveAttribute('open','');
});

test('owned model picker retains search during effort updates and closes with accessible focus',async({page})=>{
  const menu=page.locator('#chat-model-menu');
  await page.locator('#chat-model-menu-toggle').click();
  const search=page.locator('#chat-model-search');
  await search.fill('Reasoner 10');
  await expect(page.locator('.chat-model-option:not([hidden])')).toHaveCount(1);
  await page.locator('#chat-model-effort').fill('3');
  await expect(page.locator('#chat-model-effort-value')).toHaveText('High');
  await expect(search).toHaveValue('Reasoner 10');
  await search.press('Escape');
  await expect(menu).not.toHaveAttribute('open','');
  await expect(page.locator('#chat-model-menu-toggle')).toBeFocused();
  await expect(page.locator('#chat-panel')).toHaveClass(/open/);
  await page.locator('#chat-model-menu-toggle').press('Enter');
  await expect(search).toHaveValue('');
  await expect(menu.locator('img')).toHaveCount(0);
  await expect(menu).toContainText('<img src=x onerror=alert(1)>');
  await search.fill('Reasoner 10');
  await page.evaluate(async()=>{(await import('/js/api-provider-storage.js')).setAIProvider('venice');});
  await expect(page.locator('.chat-model-menu-head')).toContainText('Venice');
  await expect(page.locator('[data-chat-model-value="venice-only"]')).toBeVisible();
  await expect(page.locator('[data-chat-model-value="openai/reasoner-10"]')).toHaveCount(0);
  await page.locator('.chat-header-title').click();
  await expect(menu).not.toHaveAttribute('open','');
});
