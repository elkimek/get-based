import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {expect,test} from '@playwright/test';
import type {DashboardLightWidgetView} from '../../js/dashboard-light-widget-presentation.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const styles=['styles.css','themes-extra.css','css/dashboard-widgets.css','css/light-sun.css','css/light-conditions-now.css','css/light-channels.css'].map(name=>fs.readFileSync(path.join(root,name),'utf8')).join('\n');
const views:readonly DashboardLightWidgetView[]=[
  {kind:'loading'},{kind:'today',view:null},
  {kind:'conditions',view:{kind:'widget',hasLocation:false,slot:{id:'cond-now-dashboard-widget',variant:'full',view:null}}},
  {kind:'page',view:{kind:'actions',view:{actions:[{action:'quick-log-sun',label:'Start sun session',primary:true},{action:'open-detailed-session',label:'Log past session'}],empty:true}}},
  {kind:'page',view:{kind:'prompt',view:{status:'No light session is running',label:'Open Light & Sun',action:'navigate-light',hint:'Start a session there.',extraClass:'light-live-session-empty'}}},
  {kind:'page',view:{kind:'dashboard-channels',lead:'Seven-day light rhythm',pills:[{key:'uva',name:'UV-A',icon:'☀',title:'Sunlight logged',label:'UV-A, tap to open detail',active:true,days:'2d',chart:null}]}},
];
test('genuine Light widget children retain responsive controls, keyboard focus and delegated action attributes in Chromium',async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>{
    const url=new URL(route.request().url());
    if(url.pathname.startsWith('/js/')&&url.pathname.endsWith('.js')){
      const file=path.resolve(root,'.'+url.pathname);
      if(file.startsWith(root+path.sep)&&fs.existsSync(file))return route.fulfill({contentType:'text/javascript',body:fs.readFileSync(file,'utf8')});
    }
    if(url.pathname==='/light-widget-fixture')return route.fulfill({contentType:'text/html',body:`<!doctype html><html lang="en" data-theme="dark"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${styles}</style></head><body><form><section class="dashboard-widget"><div class="dashboard-widget-body" id="host"></div></section></form></body></html>`});
    return route.abort();
  });
  await page.goto('http://getbased.test/light-widget-fixture');
  let states=0;
  for(const width of [375,1280]){
    await page.setViewportSize({width,height:844});
    for(const view of views){
      await page.evaluate(async serialized=>{
        const model:DashboardLightWidgetView=JSON.parse(serialized);
        const module=await import('/js/components/DashboardLightWidgetBody.svelte.html.js');
        const host=document.getElementById('host');if(!host)throw new Error('Missing fixture host');host.innerHTML=module.renderHTML({view:model});
      },JSON.stringify(view));
      if(view.kind==='loading')await expect(page.locator('#host [aria-busy="true"]')).toContainText('Loading Light & Sun');
      const buttons=page.locator('#host button');const count=await buttons.count();
      for(let index=0;index<count;index++)expect(await buttons.nth(index).evaluate(button=>button instanceof HTMLButtonElement?button.type:null)).toBe('button');
      if(count){await buttons.first().focus();await expect(buttons.first()).toBeFocused();if(count>1){await page.keyboard.press('Tab');await expect(buttons.nth(1)).toBeFocused();}}
      expect(await page.locator('#host').evaluate(host=>host.scrollWidth<=Math.max(host.clientWidth,375))).toBe(true);
      expect(await page.locator('#host [data-light-page-action],#host [data-light-conditions-action],#host [data-dashboard-widget-action],#host [data-ai-action]').count()).toBe(count);
      states++;
    }
  }
  expect(states).toBe(12);expect(errors).toEqual([]);
});
