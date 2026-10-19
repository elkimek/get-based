import {nativeTabKey} from '../helpers/native-tab-key.js';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { startKitServer } from './kit-server.js';
import {installOfflineStartupDiagnostics} from '../helpers/offline-launch-diagnostics.js';
const artifact=process.env.GETBASED_KIT_ARTIFACT||path.resolve('.local-notes/sveltekit-build');
async function open(page: Page, origin: string) {
  await page.goto(origin+'/app?dev-sw=1');
  await expect(page.locator('html[data-app-ready]')).toBeAttached({timeout:30000});
  await page.evaluate(()=>navigator.serviceWorker.ready.then(()=>true));
  await expect.poll(()=>page.evaluate(()=>!!navigator.serviceWorker.controller)).toBe(true);
  await page.getByRole('button',{name:'Start guided chat',exact:true}).click();
  await expect(page.locator('#chat-panel')).toHaveClass(/open/);
}
test('static Chat owns persisted splitter geometry through an unavailable-origin cold launch',async({page,context},info)=>{
  test.setTimeout(90000);
  const mobile=page.viewportSize()!.width<769;
  await installOfflineStartupDiagnostics(context);
  const requestFailures:Array<{method:string;url:string;resourceType:string;error:string|null}>=[];
  context.on('requestfailed',request=>{
    if(requestFailures.length===64)requestFailures.shift();
    requestFailures.push({method:request.method(),url:request.url(),resourceType:request.resourceType(),error:request.failure()?.errorText??null});
  });
  const errors:string[]=[];context.on('page',target=>target.on('pageerror',error=>errors.push(error.message)));page.on('pageerror',error=>errors.push(error.message));
  await context.addInitScript(mobile=>{
    if(!['http:','https:'].includes(location.protocol)) return;
    for(const key of ['emptyTour','tour']) localStorage.setItem(`labcharts-default-${key}`,'completed');
    localStorage.setItem('labcharts-analytics-consent-seen','1');localStorage.setItem('labcharts-encryption-nudge-dismissed','true');
    localStorage.setItem('labcharts-legal-acceptance',JSON.stringify({accepted:true,termsVersion:'2026-08-22',privacyVersion:'2026-08-22',policyScope:'self-hosted-notice',acceptedAt:'2026-10-07T00:00:00Z',appVersion:'test',location:'local-test'}));
    localStorage.setItem('labcharts-ai-provider','ollama');localStorage.setItem('labcharts-ai-paused','false');
    if(localStorage.getItem('layout-fixture-seeded'))return;localStorage.setItem('layout-fixture-seeded','1');
    localStorage.setItem('labcharts-chat-panel-width','710');localStorage.setItem('labcharts-chat-panel-with-rail-width','900');localStorage.setItem('labcharts-chat-rail-width','240');
    localStorage.setItem('labcharts-default-chatRailOpen',mobile?'false':'true');
  },mobile);
  const server=await startKitServer(artifact);let stage='warm-open';
  try{
    await open(page,server.origin);
    const panel=page.locator('#chat-panel');const panelHandle=page.locator('#chat-panel-resize-handle');const railHandle=page.locator('#chat-rail-resize-handle');
    const rail=page.locator('#chat-thread-rail'),toggle=page.getByRole('button',{name:'Toggle conversations',exact:true});
    // Closed clipped rail controls must be absent from genuine keyboard traversal.
    if(await rail.evaluate(node=>node.classList.contains('open')))await toggle.click();
    await expect(rail).toHaveAttribute('inert','');await toggle.focus();
    for(let step=0;step<16;step++){
      await page.keyboard.press(nativeTabKey(page));
      expect(await rail.evaluate(node=>node.contains(document.activeElement))).toBe(false);
    }
    await toggle.focus();await page.keyboard.press('Enter');await expect(rail).not.toHaveAttribute('inert');
    const railControl=page.getByRole('button',{name:mobile?'Close conversations':'New conversation',exact:true});
    if(mobile){
      // The explicit opener must transfer focus before its header is covered.
      await expect(railControl).toBeFocused();await expect(railControl).toBeInViewport();
      await page.keyboard.press(nativeTabKey(page));await expect(page.getByRole('button',{name:'New conversation',exact:true})).toBeFocused();
      await page.keyboard.press(nativeTabKey(page, true));await expect(railControl).toBeFocused();
    }else{
      // Desktop retains header focus; traverse into preceding live rail controls.
      await toggle.focus();let reached=false;
      for(let step=0;step<80;step++){
        await page.keyboard.press(nativeTabKey(page, true));
        if(await railControl.evaluate(node=>document.activeElement===node)){reached=true;break;}
      }
      expect(reached,'Opened rail control is reachable by physical keyboard events').toBe(true);
      await expect(railControl).toBeFocused();await expect(railControl).toBeInViewport();await toggle.focus();
    }
    await page.keyboard.press('Enter');
    await expect(rail).toHaveAttribute('inert','');await expect(toggle).toBeFocused();
    // Restore the exact persisted starting layout for existing geometry/cold-launch checks.
    if(!mobile){await toggle.click();await expect(rail).not.toHaveAttribute('inert');}

    if(mobile){
      await expect(panelHandle).toBeHidden();await expect(railHandle).toBeHidden();await expect(panel).toHaveCSS('width',`${page.viewportSize()!.width}px`);
    }else{
      await expect(panel).toHaveCSS('width','900px');await expect(railHandle).toHaveAttribute('aria-valuenow','240');
      await page.getByRole('button',{name:'Toggle conversations',exact:true}).click();await expect(panel).toHaveCSS('width','710px');await expect(railHandle).toBeHidden();
      await panelHandle.focus();await page.keyboard.press('ArrowLeft');await expect(panel).toHaveCSS('width','726px');
      await page.getByRole('button',{name:'Toggle conversations',exact:true}).click();await expect(panel).toHaveCSS('width','900px');
      await railHandle.focus();await page.keyboard.press('ArrowRight');await expect(railHandle).toHaveAttribute('aria-valuenow','256');
      await panelHandle.focus();await page.keyboard.press('ArrowLeft');await expect(panel).toHaveCSS('width','916px');
      await expect(page.locator('#main-content')).toHaveCSS('padding-right','948px');
    }
    await page.screenshot({path:test.info().outputPath('chat-layout-static.png')});
    stage='offline-cold-open';server.state.offline=true;await page.close();const cold=await context.newPage();await open(cold,server.origin);
    stage='cold-geometry';await expect(cold.locator('#kit-root #chat-shell')).toHaveCount(1);
    if(mobile){await expect(cold.locator('#chat-panel-resize-handle')).toBeHidden();await expect(cold.locator('#chat-panel')).toHaveCSS('width',`${cold.viewportSize()!.width}px`);}
    else{await expect(cold.locator('#chat-panel')).toHaveCSS('width','916px');await expect(cold.locator('#chat-rail-resize-handle')).toHaveAttribute('aria-valuenow','256');}
    expect(await cold.evaluate(()=>['labcharts-chat-panel-width','labcharts-chat-panel-with-rail-width','labcharts-chat-rail-width'].map(key=>localStorage.getItem(key)))).toEqual(mobile?['710','900','240']:['726','916','256']);
    expect(errors).toEqual([]);
  }catch(error){
    // Failure-only observation: no fetch, navigation, import, cache write or worker update.
    let timer:ReturnType<typeof setTimeout>|undefined;
    try{
      const current=context.pages().at(-1);
      const failedURLs=[...new Set(requestFailures.filter(failure=>failure.method==='GET'&&new URL(failure.url).origin===server.origin).map(failure=>failure.url))].slice(-16);
      const workerCache=current?await Promise.race([current.evaluate(async urls=>{
        const controller=navigator.serviceWorker.controller,keys=await caches.keys();
        const registrations=await navigator.serviceWorker.getRegistrations();
        const describe=(worker:ServiceWorker|null)=>worker?{scriptURL:worker.scriptURL,state:worker.state}:null;
        const entries=[];
        for(const cacheName of keys.slice(0,8))for(const url of urls){
          try{
            // cacheName matching reads an existing cache without opening/creating one.
            const response=await caches.match(url,{cacheName});
            if(!response){entries.push({cacheName,url,missing:true});continue;}
            const bytes=await response.arrayBuffer(),digest=await crypto.subtle.digest('SHA-256',bytes);
            entries.push({cacheName,url,status:response.status,headers:Array.from(response.headers),bytes:bytes.byteLength,
              sha256:Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('')});
          }catch(readError){entries.push({cacheName,url,readError:String(readError)});}
        }
        return {url:location.href,at:performance.now(),appReady:document.documentElement.dataset.appReady,
          startupErrors:(window as unknown as {__getbasedOfflineStartupErrors?:unknown}).__getbasedOfflineStartupErrors,
          controller:describe(controller),registrations:registrations.map(registration=>({scope:registration.scope,
            active:describe(registration.active),waiting:describe(registration.waiting),installing:describe(registration.installing)})),
          cacheKeys:keys,entries,limits:{cacheNames:8,failedURLs:16}};
      },failedURLs),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('Chat failure diagnostics exceeded five seconds')),5000);})]):{unavailable:'No live page remains'};
      await info.attach('chat-layout-failure-diagnostics',{body:JSON.stringify({stage,originUnavailable:server.state.offline,
        failure:String(error),errors,requestFailures,workerCache},null,2),contentType:'application/json'});
    }catch(diagnosticError){
      // Diagnostic failure must never replace the original acceptance failure.
      await info.attach('chat-layout-diagnostic-error',{body:String(diagnosticError),contentType:'text/plain'}).catch(()=>{});
    }finally{if(timer!==undefined)clearTimeout(timer);}
    throw error;
  }finally{await server.close();}
});
