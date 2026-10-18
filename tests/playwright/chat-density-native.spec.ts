import {expect,test} from './coverage-fixture.js';
import {routeHtml} from '../helpers/browser-static-routes.js';

for (const touch of [false,true]) test(`Chat preserves native desktop density and coarse targets (touch=${touch})`,async({browser})=>{
 test.setTimeout(90000);
 const context=await browser.newContext({hasTouch:touch,viewport:{width:1280,height:900},serviceWorkers:'block'});
 const page=await context.newPage(); const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 try {
 await routeHtml(page,'**/chat-density-test','<!doctype html><html lang="en"><head><title>Conversation density</title><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/css/chat-panel-open.css"><link rel="stylesheet" href="/css/chat-mobile.css"><link rel="stylesheet" href="/css/chat-redesign-open.css"></head><body><main style="width:min(100%,280px);height:700px;display:flex"><div id="chat-thread-list" class="chat-thread-list" tabindex="0"></div></main></body></html>');
 await page.goto('/chat-density-test');
 await page.evaluate(async()=>{
  const {mountChatThreadNavigation}=await import('/js/chat-thread-navigation-component.js');
  const {projectThreadNavigation}=await import('/js/chat-thread-navigation-presentation.js');
  const stamp=new Date().toISOString();
  mountChatThreadNavigation(document.getElementById('chat-thread-list')!,projectThreadNavigation([{id:'a',name:'Native compact conversation',createdAt:stamp,updatedAt:stamp,messageCount:2}], 'a','recent','',[],{default:'🔬'}),{switch:()=>{document.body.dataset.action='switch';},pin:()=>{document.body.dataset.action='pin';},rename:()=>{},delete:()=>{},move:()=>{},renameProject:()=>{},deleteProject:()=>{},jump:()=>{}},()=>true);
 });
 for(const theme of ['dark','light','cyberterm','glass','synth-sunrise','neuromancer']){
  await page.evaluate(async theme=>{const m=await import('/js/theme.js');await m.loadExtraThemesStylesheet();m.setTheme(theme);},theme);
  for(const width of [1280,390]){
   await page.setViewportSize({width,height:900});
   const row=page.locator('.chat-thread-item-main'),summary=page.locator('.chat-thread-item-menu summary');
   const style=await row.evaluate(el=>{const s=getComputedStyle(el);return{gap:s.gap,padding:s.padding,font:s.fontFamily,size:s.fontSize,min:s.minHeight};});
   expect(style.gap).toBe('2px');expect(style.font).toBe(await row.evaluate(el=>getComputedStyle(el.parentElement!).fontFamily));expect(style.size).toBe('16px');
   expect(style.padding).toBe(width<=768?'12px 58px 12px 14px':touch?'8px 58px 8px 10px':'8px 38px 8px 10px');
   const box=(await row.boundingBox())!;if(touch||width<=768)expect(box.height).toBeGreaterThanOrEqual(64);else expect(box.height).toBeCloseTo(48.59375,1);
   expect(await summary.evaluate(el=>getComputedStyle(el).width)).toBe(touch?'44px':width<=768?'34px':'20px');
   await summary.click();const pin=page.locator('[data-chat-thread-action="pin"]');
   expect(await pin.evaluate(el=>getComputedStyle(el).minHeight)).toBe(touch?'44px':'32px');expect(await pin.evaluate(el=>getComputedStyle(el).fontSize)).toBe('11px');
   await summary.press('Escape');await expect(summary).toBeFocused();await expect(summary.locator('..')).not.toHaveAttribute('open');
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
 }
 await page.locator('.chat-thread-item-main').click();await expect(page.locator('body')).toHaveAttribute('data-action','switch');
 await page.locator('.chat-thread-item-menu summary').click();await page.locator('[data-chat-thread-action="pin"]').click();await expect(page.locator('body')).toHaveAttribute('data-action','pin');expect(errors).toEqual([]);
 }finally{await context.close();}
});
