import {test,expect} from '@playwright/test';
test('genuine Lens children retain keyboard actions ordering and responsive empty states',async({page})=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('/app',{waitUntil:'load'});
 await page.locator('html[data-app-ready]').waitFor({state:'attached'});
 await page.evaluate(async()=>{
  const shell=await import('/js/lens-page-shell.js');const {state}=await import('/js/state.js');const {projectLensActions}=await import('/js/lens-content-presentation.js');
  const calls:string[]=[];const host=document.createElement('div');host.id='typed-lens-acceptance';host.dataset.calls='[]';host.style.cssText='position:fixed;inset:0;z-index:20000;overflow:auto;padding:12px;background:var(--bg-primary);box-sizing:border-box';
  const note=(value:string)=>{calls.push(value);host.dataset.calls=JSON.stringify(calls);};state.currentProfile='typed-lens-acceptance';state.currentView='body';
  shell.configureLensPageShell({getAvailableDashboardFixedWidgetIds:()=>['sources','genome'],getDashboardWidgetPrefs:()=>({hidden:[]}),openChatPanel:()=>note('chat'),navigate:route=>note('navigate:'+route),removeDashboardWidgetFromLens:id=>note('remove:'+id)});
  host.innerHTML=shell.renderLensHeader('Body','',{kind:'actions',view:projectLensActions('insight')})+shell.renderLensPageWidgets('body',[
   {id:'sources',title:'Body sources',body:{kind:'body-sources',view:{empty:true,sources:[]}}},
   {id:'genome',title:'Genome',body:{kind:'genome',view:{kind:'empty',contributionHref:null}}},
  ],{group:'acceptance'});document.body.append(host);
  let rejected=false;try{shell.renderLensWidget('invalid','Unsafe','', '<p>ordinary HTML</p>');}catch(error){rejected=error instanceof TypeError&&error.message.includes('typed owner view');}host.dataset.rawRejected=String(rejected);
 });
 const host=page.locator('#typed-lens-acceptance');await expect(host).toHaveAttribute('data-raw-rejected','true');
 for(const width of [1280,390]){await page.setViewportSize({width,height:900});for(const theme of ['dark','light']){
  await page.evaluate(async theme=>(await import('/js/theme.js')).setTheme(theme),theme);
  await expect(host.locator('[data-widget-id]')).toHaveCount(2);await expect(host.getByRole('button',{name:'Connect body data'})).toBeVisible();
  expect(await host.evaluate(element=>element.scrollWidth<=element.clientWidth+1)).toBe(true);
 }}
 const chat=host.locator('[data-lens-page-action="open-ai-chat"]');await chat.focus();await page.keyboard.press('Enter');await expect(host).toHaveAttribute('data-calls','["chat"]');
 await host.locator('[data-lens-page-action="remove-dashboard-widget"]').first().click();await expect(host).toHaveAttribute('data-calls','["chat","remove:sources"]');
 await host.locator('[data-lens-page-action="move-widget"][data-lens-page-direction="1"]').first().click();
 const order=await page.evaluate(async()=>{const {profileStorageKey}=await import('/js/profile.js');return JSON.parse(localStorage.getItem(profileStorageKey('typed-lens-acceptance','lensPageOrder-body-acceptance-v1'))!);});
 expect(order).toEqual(['genome','sources']);await expect(host).toHaveAttribute('data-calls','["chat","remove:sources","navigate:body"]');expect(errors).toEqual([]);
});
