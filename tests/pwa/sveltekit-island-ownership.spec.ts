import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { startKitServer } from './kit-server.js';

const artifact = process.env.GETBASED_KIT_ARTIFACT || path.resolve('.local-notes/sveltekit-build');
type EventRow = { at:string; phase:number; canceled:boolean; trusted:boolean; target:string; submitter:string|null };
async function rows(page:Page):Promise<EventRow[]> {
  return page.evaluate(()=>JSON.parse(document.getElementById('ownership-events')!.textContent!) as EventRow[]);
}
function row(at:string,phase:number,canceled:boolean,id:string):EventRow {
  return {at,phase,canceled,trusted:true,target:id,submitter:id+'-submit'};
}
// Diagnostic-only forms establish framework ownership. They do not stand in for
// Wearables, ClientList, or any other application's native acceptance fixtures.
test('Kit delegates navigation inside its island and preserves native form chronology outside',async({page,context})=>{
  const errors:string[]=[]; page.on('pageerror',error=>errors.push(error.message));
  await context.addInitScript(()=>{
    if(!['http:','https:'].includes(location.protocol))return;
    for(const name of ['emptyTour','tour'])localStorage.setItem(`labcharts-default-${name}`,'completed');
    localStorage.setItem('labcharts-analytics-consent-seen','1');
    localStorage.setItem('labcharts-encryption-nudge-dismissed','true');
    localStorage.setItem('labcharts-ai-paused','true');
    localStorage.setItem('labcharts-legal-acceptance',JSON.stringify({accepted:true,termsVersion:'2026-08-22',privacyVersion:'2026-08-22',policyScope:'self-hosted-notice',acceptedAt:'2026-10-07T00:00:00Z',appVersion:'test',location:'local-test'}));
    localStorage.setItem('labcharts-ai-transparency-acknowledgement',JSON.stringify({version:'2026-08-31',acknowledged:true,acknowledgedAt:'2026-10-07T00:00:00Z'}));
  });
  const server=await startKitServer(artifact,[async(request,response)=>{
    if(request.method!=='GET'||request.url!=='/ownership-native-form-result.html?ownership=outside-foreign')return false;
    response.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'none'; frame-ancestors 'self'"});
    response.end('<!doctype html><html><head><title>Owned form navigation</title></head><body><p id="owned-frame-payload">Native GET received</p></body></html>');
    return true;
  }]);
  const navigation:{url:string;main:boolean;method:string}[]=[];
  page.on('request',request=>{if(request.isNavigationRequest())navigation.push({url:request.url(),main:request.frame()===page.mainFrame(),method:request.method()});});
  try {
    await page.goto(server.origin+'/app?dev-sw=1');
    await expect(page.locator('html[data-app-ready][data-shell-framework="sveltekit"]')).toBeAttached({timeout:30000});
    await expect(page.locator('#kit-root #chat-shell')).toHaveCount(1);
    await page.evaluate(()=>navigator.serviceWorker.ready.then(()=>true));
    await expect.poll(()=>page.evaluate(()=>!!navigator.serviceWorker.controller)).toBe(true);
    await page.evaluate(()=>{
      const root=document.getElementById('kit-root')!;
      const receipt=document.createElement('script'); receipt.id='ownership-events';receipt.type='application/json';receipt.textContent='[]';document.body.append(receipt);
      const record=(at:string,event:Event)=>{
        if(!(event.target instanceof HTMLFormElement)||!event.target.hasAttribute('data-ownership-fixture'))return;
        const list=JSON.parse(receipt.textContent!) as EventRow[];
        list.push({at,phase:event.eventPhase,canceled:event.defaultPrevented,trusted:event.isTrusted,target:event.target.id,submitter:(event as SubmitEvent).submitter?.id||null});
        receipt.textContent=JSON.stringify(list);
      };
      document.addEventListener('submit',event=>record('document-capture',event),true);
      root.addEventListener('submit',event=>record('kit-root',event));
      document.documentElement.addEventListener('submit',event=>record('html',event));
      document.addEventListener('submit',event=>{
        record('document',event);
        if((event.target as HTMLFormElement).id==='outside-native')event.preventDefault();
      });
      document.addEventListener('submit',event=>{if((event.target as HTMLFormElement).id==='outside-foreign-handler'){record('foreign-document',event);event.preventDefault();}});
      window.addEventListener('submit',event=>record('window',event));
      const host=document.createElement('div');host.id='ownership-outside';host.style.cssText='position:fixed;left:0;top:0;z-index:999999;background:white;color:black';document.body.append(host);
      const inside=document.createElement('div');inside.id='ownership-inside';inside.style.cssText='position:fixed;left:0;top:180px;z-index:999999;background:white;color:black';root.append(inside);
      const frame=document.createElement('iframe');frame.name='ownership-sink';frame.id='ownership-sink';host.append(frame);
      for(const id of ['outside-native','outside-target-cancel','outside-target-stop','outside-foreign','outside-foreign-handler','inside-kit']){
        const form=document.createElement('form');form.id=id;form.dataset.ownershipFixture='';form.action='/app';
        if(id==='outside-foreign'){form.target='ownership-sink';form.action='/ownership-native-form-result.html';}
        const input=document.createElement('input');input.name='ownership';input.value=id;form.append(input);
        const button=document.createElement('button');button.id=id+'-submit';button.textContent=id;form.append(button);
        form.addEventListener('submit',event=>{record('target',event);if(id==='outside-target-cancel')event.preventDefault();if(id==='outside-target-stop'){event.preventDefault();event.stopPropagation();}});
        (id==='inside-kit'?inside:host).append(form);
      }
      // Position below the measured diagnostic host; retain real trusted clicks.
      inside.style.top=`${host.getBoundingClientRect().bottom+16}px`;
      // Retain a document marker and check that navigation makes no document request.
      document.documentElement.dataset.ownershipDocument='retained';
    });
    const fixtureGeometry=await page.evaluate(()=>{
      const outside=document.getElementById('ownership-outside')!.getBoundingClientRect();
      const inside=document.getElementById('ownership-inside')!.getBoundingClientRect();
      return {outsideBottom:outside.bottom,insideTop:inside.top,insideBottom:inside.bottom,viewportHeight:innerHeight};
    });
    expect(fixtureGeometry.insideTop).toBe(fixtureGeometry.outsideBottom+16);
    expect(fixtureGeometry.insideBottom).toBeLessThanOrEqual(fixtureGeometry.viewportHeight);
    await test.info().attach('framework-fixture-geometry.json',{body:JSON.stringify(fixtureGeometry,null,2),contentType:'application/json'});
    const reset=async()=>page.locator('#ownership-events').evaluate(node=>{node.textContent='[]';});
    const initial=page.url(); const initialRequests=navigation.length;
    await reset();await page.locator('#inside-kit-submit').click();
    await expect(page).toHaveURL(server.origin+'/app?ownership=inside-kit');
    expect(await rows(page)).toEqual([row('document-capture',1,false,'inside-kit'),row('target',2,false,'inside-kit'),row('kit-root',3,true,'inside-kit')]);
    expect(navigation).toHaveLength(initialRequests);
    expect(await page.locator('html').getAttribute('data-ownership-document')).toBe('retained');
    await expect(page.locator('#kit-root #chat-shell')).toHaveCount(1);
    await page.goBack();await expect(page).toHaveURL(initial);
    expect(navigation).toHaveLength(initialRequests);
    expect(await page.locator('html').getAttribute('data-ownership-document')).toBe('retained');
    await test.info().attach('inside-kit-positive-control.json',{body:JSON.stringify({navigation,events:await rows(page),url:page.url()},null,2),contentType:'application/json'});
    await reset();
    await page.locator('#outside-native-submit').click();
    expect(await rows(page)).toEqual([row('document-capture',1,false,'outside-native'),row('target',2,false,'outside-native'),row('html',3,false,'outside-native'),row('document',3,false,'outside-native'),row('window',3,true,'outside-native')]);
    expect(page.url()).toBe(initial);expect(navigation).toHaveLength(initialRequests);
    await reset();await page.locator('#outside-target-cancel-submit').click();
    expect(await rows(page)).toEqual([row('document-capture',1,false,'outside-target-cancel'),row('target',2,false,'outside-target-cancel'),row('html',3,true,'outside-target-cancel'),row('document',3,true,'outside-target-cancel'),row('window',3,true,'outside-target-cancel')]);
    expect(page.url()).toBe(initial);expect(navigation).toHaveLength(initialRequests);
    await reset();await page.locator('#outside-target-stop-submit').click();
    expect(await rows(page)).toEqual([row('document-capture',1,false,'outside-target-stop'),row('target',2,false,'outside-target-stop')]);
    expect(page.url()).toBe(initial);expect(navigation).toHaveLength(initialRequests);
    await reset();await page.locator('#outside-foreign-handler-submit').click();
    expect(await rows(page)).toEqual([row('document-capture',1,false,'outside-foreign-handler'),row('target',2,false,'outside-foreign-handler'),row('html',3,false,'outside-foreign-handler'),row('document',3,false,'outside-foreign-handler'),row('foreign-document',3,false,'outside-foreign-handler'),row('window',3,true,'outside-foreign-handler')]);
    expect(page.url()).toBe(initial);expect(navigation).toHaveLength(initialRequests);
    await reset();await page.locator('#outside-foreign-submit').click();
    await expect.poll(()=>navigation.length).toBe(initialRequests+1);
    expect(await rows(page)).toEqual([row('document-capture',1,false,'outside-foreign'),row('target',2,false,'outside-foreign'),row('html',3,false,'outside-foreign'),row('document',3,false,'outside-foreign'),row('window',3,false,'outside-foreign')]);
    expect(navigation.at(-1)).toEqual({url:server.origin+'/ownership-native-form-result.html?ownership=outside-foreign',main:false,method:'GET'});
    expect(page.url()).toBe(initial);
    const iframe=page.frameLocator('#ownership-sink');
    await expect(iframe.locator('#owned-frame-payload')).toHaveText('Native GET received');
    expect(await iframe.locator('html').evaluate(node=>node.ownerDocument.location.href)).toBe(server.origin+'/ownership-native-form-result.html?ownership=outside-foreign');
    await expect(iframe.locator('script')).toHaveCount(0);
    await expect(iframe.locator('#kit-root')).toHaveCount(0);
    expect(navigation).toHaveLength(initialRequests+1);
    expect(errors).toEqual([]);
    await test.info().attach('framework-ownership-events.json',{body:JSON.stringify({navigation,final:await rows(page)},null,2),contentType:'application/json'});
  }finally{
    const final=await page.evaluate(()=>({url:location.href,events:document.getElementById('ownership-events')?.textContent||null,documentMarker:document.documentElement.dataset.ownershipDocument||null})).catch(error=>({error:String(error)}));
    await test.info().attach('framework-ownership-final.json',{body:JSON.stringify({navigation,errors,final},null,2),contentType:'application/json'});
    await server.close();
  }
});
