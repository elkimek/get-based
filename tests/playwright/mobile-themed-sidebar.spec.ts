import {expect,test} from './coverage-fixture.js';
test('every mobile theme keeps sidebar links above the dismissing backdrop',async({page})=>{
 test.setTimeout(60000);await page.setViewportSize({width:393,height:852});
 await page.addInitScript(()=>{for(const key of ['emptyTour','tour'])localStorage.setItem(`labcharts-default-${key}`,'completed');localStorage.setItem('labcharts-ai-paused','true');});
 await page.goto('/app');
 for(const theme of ['dark','light','cyberterm','glass','synth-sunrise','neuromancer']){
  await page.evaluate(async theme=>{const m=await import('/js/theme.js');await m.loadExtraThemesStylesheet();m.setTheme(theme);},theme);
  for(const width of [320,393,768,1024]){
   await page.setViewportSize({width,height:900});await page.getByRole('button',{name:'Menu',exact:true}).click();
   const sidebar=page.locator('#sidebar-nav');await expect(sidebar).toHaveClass(/mobile-open/);await expect(sidebar).toHaveCSS('position','fixed');await expect(sidebar).toHaveCSS('z-index','360');
   const route=sidebar.locator('[data-nav-route="body"]');await route.click();await expect(sidebar).not.toHaveClass(/mobile-open/);await expect(page.locator('.lens-page-widgets[data-lens-route="body"]')).toBeVisible();
   await page.getByRole('button',{name:'Menu',exact:true}).click();await page.locator('#sidebar-backdrop').click({position:{x:width-2,y:100}});await expect(sidebar).not.toHaveClass(/mobile-open/);
  }
 }
});
