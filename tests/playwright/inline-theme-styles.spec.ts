import {readFileSync} from 'node:fs';
import {expect,test} from './coverage-fixture.js';
const version=/self\.APP_VERSION\s*=\s*'([^']+)'/.exec(readFileSync('version.ts','utf8'))?.[1];if(!version)throw Error('Application version required');
const critical=readFileSync('tests/fixtures/inline-startup-layout-original.css','utf8'),modes=readFileSync('tests/fixtures/inline-shared-theme-modes-original.css','utf8');
test('compiled eager Tailwind keeps pre-startup reserve and exact cross-theme/sunset geometry',async({page})=>{
 await page.setViewportSize({width:1280,height:900});await page.addInitScript(version=>{localStorage.setItem('labcharts-default-emptyTour','completed');localStorage.setItem('labcharts-default-tour','completed');localStorage.setItem('labcharts-analytics-consent-seen','1');localStorage.setItem('labcharts-changelog-seen',version);},version);
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});await page.route('**/js/main.js',async route=>{await gate;await route.continue();});
 try{
  await page.goto('/index.html',{waitUntil:'commit'});await expect(page.locator('.header')).toBeVisible();
  const before=await page.evaluate(()=>{
   const styles=[...document.head.querySelectorAll('style')],first=styles[0]!,shared=document.querySelector('style[data-shared-theme-modes]')!,fonts=document.querySelector('link[href="vendor/fonts/fonts.css"]')!,anchor=document.querySelector('[data-extra-themes-stylesheet-anchor]')!;
   return{critical:first.textContent,modes:shared.textContent,criticalBeforeFonts:!!(first.compareDocumentPosition(fonts)&Node.DOCUMENT_POSITION_FOLLOWING),sharedAfterAnchor:!!(anchor.compareDocumentPosition(shared)&Node.DOCUMENT_POSITION_FOLLOWING),minHeight:getComputedStyle(document.getElementById('main-content')!).minHeight,ready:document.documentElement.hasAttribute('data-app-ready')};
  });expect(before).toEqual({critical,modes,criticalBeforeFonts:true,sharedAfterAnchor:true,minHeight:'1016px',ready:false});
  release();await page.waitForFunction(()=>document.documentElement.hasAttribute('data-app-ready'));
  let states=0;
  for(const width of[393,1280]){await page.setViewportSize({width,height:900});for(const name of['dark','light','cyberterm','glass','synth-sunrise','neuromancer'])for(const sunset of[false,true]){
   const state=await page.evaluate(async({name,sunset})=>{
    const theme=await import('/js/theme.js');theme.setSunsetMode(false);await theme.setTheme(name);theme.setSunsetMode(sunset);
    const header=getComputedStyle(document.querySelector('.header')!),sidebar=getComputedStyle(document.querySelector('.sidebar')!),main=getComputedStyle(document.querySelector('.main')!),layout=getComputedStyle(document.querySelector('.layout')!);
    return{header:[header.position,header.top,header.zIndex],sidebar:[sidebar.position,sidebar.top,sidebar.height,sidebar.zIndex],main:[main.position,main.zIndex],layout:[layout.position,layout.zIndex],sunset:theme.isSunsetMode(),sunsetAttribute:document.documentElement.dataset.sunsetMode||'',primary:getComputedStyle(document.documentElement).getPropertyValue('--bg-primary').trim(),scheme:getComputedStyle(document.documentElement).colorScheme};
   },{name,sunset});
   expect(state.header).toEqual(['sticky','0px','100']);expect(state.sidebar).toEqual(width>1024?['fixed','64px','836px','10']:['fixed','0px','900px','360']);expect(state.main).toEqual(['static','auto']);expect(state.layout).toEqual(['static','auto']);expect(state.sunset).toBe(sunset);expect(state.sunsetAttribute).toBe(sunset?'on':'');if(sunset){expect(state.primary).toBe('#0b0201');expect(state.scheme).toBe('dark');}states++;
  }}
  expect(states).toBe(24);expect(errors).toEqual([]);
 }finally{release();}
});
