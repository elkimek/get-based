import { expect, test } from './coverage-fixture.js';

test('owned composer keeps theme contrast, compact layouts and replacement icons', async ({ page, context }) => {
  test.setTimeout(180000);
  await context.addInitScript({path:'node_modules/axe-core/axe.min.js'});
  await context.addInitScript(() => {
    for(const key of ['emptyTour','tour']) localStorage.setItem(`labcharts-default-${key}`,'completed');
    localStorage.setItem('labcharts-ai-provider','ollama'); localStorage.setItem('labcharts-ai-paused','false');
    localStorage.setItem('labcharts-analytics-consent-seen','1');
    localStorage.setItem('labcharts-legal-acceptance',JSON.stringify({accepted:true,termsVersion:'2026-08-22',privacyVersion:'2026-08-22',policyScope:'self-hosted-notice',acceptedAt:'2026-10-07T00:00:00Z',appVersion:'test',location:'local-test'}));
  });
  await page.goto('/app');
  await page.evaluate(async()=>{
    const panel=await import('/js/chat-panel.js'); await panel.openChatPanel();
    const {state}=await import('/js/state.js'); state.chatHistory=[{role:'user',content:'Question'},{role:'assistant',content:'Answer'}];
    (await import('/js/chat-render.js')).renderChatMessages();
  });
  const owner=page.locator('[data-chat-composer-view]');
  await page.locator('#chat-input').fill('A focused draft');
  for(const theme of ['dark','light','cyberterm','glass','synth-sunrise','neuromancer']) {
    await page.evaluate(async theme=>{const themes=await import('/js/theme.js');await themes.loadExtraThemesStylesheet();themes.setTheme(theme);},theme);
    for(const width of [1280,700,390,320]) {
      await page.setViewportSize({width,height:900}); const label=`${theme}/${width}`;
      await expect.poll(()=>owner.evaluate(element=>element.scrollWidth-element.clientWidth),{message:label}).toBeLessThanOrEqual(1);
      await expect.poll(()=>owner.evaluate(element=>{
        const area=element.getBoundingClientRect();
        return [...element.querySelectorAll<HTMLElement>('.chat-composer-toolbar > div > button,.chat-composer-toolbar > div > details > summary')]
          .filter(control=>control.getClientRects().length>0)
          .filter(control=>{const box=control.getBoundingClientRect();return box.left<area.left||box.right>area.right;})
          .map(control=>control.id);
      }),{message:`${label}: controls remain inside composer`}).toEqual([]);
      // Width and theme color transitions may still be settling after a resize.
      await expect.poll(()=>owner.evaluate(async element=>(await(window as unknown as {axe:typeof import('axe-core')}).axe.run(element,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}))),{message:label}).toEqual([]);
    }
  }
  const icons=await page.evaluate(async()=>{
    const send=await import('/js/chat-send.js');const button=document.getElementById('chat-send-btn')!;
    const measure=()=>{const icon=button.querySelector('svg')!;const styles=getComputedStyle(icon);return{width:styles.width,height:styles.height,fill:styles.fill,stroke:styles.stroke};};
    send.setSendButtonMode(button,'streaming');const stop=measure();const stopLabel=button.getAttribute('aria-label');
    send.setSendButtonMode(button,'idle');const idle=measure();
    return{stop,idle,stopLabel,idleLabel:button.getAttribute('aria-label')};
  });
  expect(icons.stopLabel).toBe('Stop generating');expect(icons.idleLabel).toBe('Send message');
  for(const icon of [icons.stop,icons.idle]){expect(icon.width).toBe('18px');expect(icon.height).toBe('18px');expect(icon.fill).toBe('none');expect(icon.stroke).not.toBe('none');}
  await page.screenshot({path:test.info().outputPath('chat-composer-owned.png')});
});
