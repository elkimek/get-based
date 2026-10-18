import {readFileSync} from 'node:fs';
import {expect,test} from './coverage-fixture.js';

const appVersion=/self\.APP_VERSION\s*=\s*'([^']+)'/.exec(readFileSync('version.ts','utf8'))?.[1];
if(!appVersion)throw new Error('Current application version required');

for(const width of [393,1280])test(`AppShell cold hydration and real header actions preserve hosts at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:900});
 await page.addInitScript(version=>{
  localStorage.setItem('labcharts-default-emptyTour','completed');
  localStorage.setItem('labcharts-default-tour','completed');
  localStorage.setItem('labcharts-default-ai-reminder-dismissed','1');
  localStorage.setItem('labcharts-analytics-consent-seen','1');
  localStorage.setItem('labcharts-changelog-seen',version);
 },appVersion);
 let release!:()=>void;const gate=new Promise<void>(done=>{release=done;});
 await page.route('**/js/main.js',async route=>{await gate;await route.continue();});
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 try {
  // The public index alias permits observing the pre-startup phase; /app's
  // shared coverage wrapper intentionally waits for application readiness.
  await page.goto('/index.html',{waitUntil:'commit'});await expect(page.locator('.header')).toBeVisible();
  const initial=await page.evaluate(async()=>{
   const ids=['sidebar-toggle','main-content','sidebar-nav','detail-modal','settings-modal','feedback-modal','pdf-input','notification-container','chat-input','chat-messages','chat-panel'];
   const refs=ids.map(id=>document.getElementById(id));
   const header=document.querySelector('.header')!,footer=document.querySelector('.app-footer')!,welcome=document.querySelector('[data-prerendered-welcome]')!;
   const buttons=[...document.querySelectorAll<HTMLButtonElement>('.header button')];
   const geometry=()=>[header,footer,...buttons].map(node=>{const rect=node.getBoundingClientRect();return[rect.x,rect.y,rect.width,rect.height];});
   const before=geometry(),input=document.getElementById('chat-input') as HTMLTextAreaElement;input.value='Restored before hydration';
   const trigger=document.querySelector<HTMLButtonElement>('.header-import-btn')!;trigger.focus();
   const {ensureAppShell}=await import('/js/app-shell-component.js');const {ensureChatShell}=await import('/js/chat-shell-component.js');
   const owned=ensureAppShell(),chat=ensureChatShell();ensureAppShell();ensureChatShell();
   return {owned,chat,identities:ids.map((id,i)=>document.getElementById(id)===refs[i]),header:document.querySelector('.header')===header,footer:document.querySelector('.app-footer')===footer,welcome:document.querySelector('[data-prerendered-welcome]')===welcome,value:input.value,focus:document.activeElement===trigger,before,after:geometry(),panels:document.querySelectorAll('#chat-panel').length};
  });
  expect(initial.owned).toBe(true);expect(initial.chat).toBe(true);expect(initial.identities.every(Boolean)).toBe(true);expect(initial.header).toBe(true);expect(initial.footer).toBe(true);expect(initial.welcome).toBe(true);expect(initial.value).toBe('Restored before hydration');expect(initial.focus).toBe(true);expect(initial.after).toEqual(initial.before);expect(initial.panels).toBe(1);
  release();await page.waitForFunction(()=>document.documentElement.hasAttribute('data-app-ready'));
  // Real cold settings and feedback delegates exercise the authored header.
  await page.locator('.settings-btn').click();await expect(page.locator('#settings-modal-overlay')).toHaveClass(/show/);
  await page.locator('#settings-modal [data-settings-action="close"]').click();await expect(page.locator('#settings-modal-overlay')).not.toHaveClass(/show/);
  if(width<=768){
   // Native responsive CSS intentionally hides the desktop feedback button.
   await expect(page.locator('.feedback-btn')).toBeHidden();
   await page.locator('.tweaks-btn').click();await expect(page.locator('#tweaks-panel')).toBeVisible();
   await page.locator('[data-tweaks-action="send-feedback"]').click();
  }else{await expect(page.locator('.feedback-btn')).toBeVisible();await page.locator('.feedback-btn').click();}
  await expect(page.locator('#feedback-modal-overlay')).toHaveClass(/show/);
  await page.locator('#feedback-modal [data-feedback-action="close"]').first().click();await expect(page.locator('#feedback-modal-overlay')).not.toHaveClass(/show/);
  if(width<800){
   await page.locator('#sidebar-toggle').click();await expect(page.locator('#sidebar-nav')).toHaveClass(/mobile-open/);
   await expect(page.locator('#sidebar-nav')).toHaveCSS('transform','matrix(1, 0, 0, 1, 0, 0)');
   const backdrop=page.locator('#sidebar-backdrop'),drawer=await page.locator('#sidebar-nav').boundingBox(),bounds=await backdrop.boundingBox();
   expect(drawer).not.toBeNull();expect(bounds).not.toBeNull();
   // The drawer covers the backdrop's center on a phone. Click the actual
   // exposed strip to exercise its normal delegated dismissal action.
   const left=Math.max(drawer!.x+drawer!.width,bounds!.x),right=bounds!.x+bounds!.width;
   expect(right).toBeGreaterThan(left);
   const x=(left+right)/2,y=bounds!.y+bounds!.height/2;
   expect(await page.evaluate(({x,y})=>document.elementFromPoint(x,y)?.id,{x,y})).toBe('sidebar-backdrop');
   await backdrop.click({position:{x:x-bounds!.x,y:y-bounds!.y}});await expect(page.locator('#sidebar-nav')).not.toHaveClass(/mobile-open/);
  }
  const navigation=await page.evaluate(async()=>{
   const header=document.querySelector('.header'),footer=document.querySelector('.app-footer'),input=document.getElementById('chat-input'),main=document.getElementById('main-content');
   const {navigate}=await import('/js/views.js');navigate('dashboard');navigate('dashboard');
   return {header:document.querySelector('.header')===header,footer:document.querySelector('.app-footer')===footer,input:document.getElementById('chat-input')===input,main:document.getElementById('main-content')===main,panels:document.querySelectorAll('#chat-panel').length,legal:document.querySelectorAll('#legal-consent-overlay').length};
  });
  expect(navigation).toEqual({header:true,footer:true,input:true,main:true,panels:1,legal:0});expect(errors).toEqual([]);
 }finally{release();}
});
