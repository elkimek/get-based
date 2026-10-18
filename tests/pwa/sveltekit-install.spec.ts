import path from 'node:path';
import os from 'node:os';
import {mkdtemp, rm} from 'node:fs/promises';
import {chromium, expect, test, type CDPSession} from '@playwright/test';
import {headlessBrowserEnvironment} from '../../scripts/headless-browser-environment.js';
import {startKitServer} from './kit-server.js';

interface TargetRow {targetId:string;type:string;url:string}
interface RuntimeReply {id?:number;error?:unknown;result?:{exceptionDetails?:unknown;result?:{value?:unknown}}}
interface TargetMessage {sessionId:string;message:string}
interface LaunchObservation {ready:true;standalone:boolean;url:string;framework:string;controlled:boolean;retained:string|null}

async function targets(session:CDPSession):Promise<TargetRow[]> {
 const result: {targetInfos:TargetRow[]} = await session.send('Target.getTargets');
 return result.targetInfos;
}
async function installedPage(session:CDPSession,origin:string,initialId:string):Promise<string> {
 let found:TargetRow|undefined;
 await expect.poll(async()=>{
  found=(await targets(session)).find(row=>row.type==='page'&&row.targetId!==initialId&&row.url.startsWith(origin+'/app'));
  return !!found;
 },{timeout:15_000,message:'Installed launch must create an actual app page, rather than only an outer browser tab'}).toBe(true);
 return found!.targetId;
}
async function inspect(session:CDPSession,targetId:string):Promise<LaunchObservation> {
 const attached:{sessionId:string}=await session.send('Target.attachToTarget',{targetId,flatten:false});
 const id=41;
 let receive:((event:TargetMessage)=>void)|undefined,timeout:ReturnType<typeof setTimeout>|undefined;
 try{
  // Replies resolve even on protocol failure; the enclosing assertions then fail
  // while finally still uninstalls the synthetic app and closes its browser.
  const response=new Promise<RuntimeReply>(resolve=>{
   receive=(event:TargetMessage)=>{
    if(event.sessionId!==attached.sessionId)return;
    const reply=JSON.parse(event.message) as RuntimeReply;
    if(reply.id===id)resolve(reply);
   };
   session.on('Target.receivedMessageFromTarget',receive);
   timeout=setTimeout(()=>resolve({error:'Installed target inspection timed out'}),35_000);
  });
  const expression=`new Promise((resolve,reject)=>{const deadline=Date.now()+30000;function check(){if(document.documentElement?.hasAttribute('data-app-ready'))resolve({ready:true,standalone:matchMedia('(display-mode: standalone)').matches,url:location.href,framework:document.documentElement.dataset.shellFramework,controlled:!!navigator.serviceWorker.controller,retained:localStorage.getItem('getbased-install-acceptance')});else if(Date.now()>deadline)reject(new Error('Installed app never became ready'));else setTimeout(check,50);}check();})`;
  await session.send('Target.sendMessageToTarget',{sessionId:attached.sessionId,message:JSON.stringify({id,method:'Runtime.evaluate',params:{expression,awaitPromise:true,returnByValue:true}})});
  const reply=await response;
  expect(reply.error,'Actual target protocol response').toBeUndefined();
  expect(reply.result?.exceptionDetails,'Actual installed document startup').toBeUndefined();
  const value=reply.result?.result?.value;
  expect(value).toMatchObject({ready:true,standalone:true,framework:'sveltekit',controlled:true,retained:'retained'});
  return value as LaunchObservation;
 }finally{
  if(timeout)clearTimeout(timeout);
  if(receive)session.off('Target.receivedMessageFromTarget',receive);
  await session.send('Target.detachFromTarget',{sessionId:attached.sessionId});
 }
}

test('actual headless PWA install, standalone launch and zero-client offline launch retain local state',async({browserName})=>{
 test.skip(browserName!=='chromium','The installed-app protocol is specific to Chromium; other engines have separate browser acceptance.');
 test.setTimeout(120_000);
 const artifact=process.env.GETBASED_KIT_ARTIFACT||path.resolve('.local-notes/sveltekit-build');
 const directory=await mkdtemp(path.join(os.tmpdir(),'getbased-pwa-install-'));
 const server=await startKitServer(artifact);
 const report:{browser?:string;manifestId?:string;online?:LaunchObservation;offline?:LaunchObservation;uninstalled?:boolean}={};
 let installed=false;
 let context:Awaited<ReturnType<typeof chromium.launchPersistentContext>>|undefined;
 let session:CDPSession|undefined;
 const manifestId=server.origin+'/app';
 const environment=headlessBrowserEnvironment(path.join(directory,'runtime'));
 environment.XDG_DATA_HOME=path.join(directory,'xdg-data');
 environment.XDG_CONFIG_HOME=path.join(directory,'xdg-config');
 environment.XDG_CACHE_HOME=path.join(directory,'xdg-cache');
 try{
  context=await chromium.launchPersistentContext(path.join(directory,'profile'),{
   headless:true,channel:'chromium',env:environment,
   args:['--no-sandbox','--disable-setuid-sandbox','--no-default-browser-check','--no-first-run'],
  });
  const browser=context.browser()!;
  const activeSession=await browser.newBrowserCDPSession();
  session=activeSession;
  report.browser=browser.version();report.manifestId=manifestId;
  await context.addInitScript(()=>{
   if(!['http:','https:'].includes(location.protocol))return;
   for(const key of ['emptyTour','tour'])localStorage.setItem(`labcharts-default-${key}`,'completed');
   localStorage.setItem('labcharts-analytics-consent-seen','1');
   localStorage.setItem('labcharts-legal-acceptance',JSON.stringify({accepted:true,termsVersion:'2026-08-22',privacyVersion:'2026-08-22',policyScope:'self-hosted-notice'}));
  });
  const page=context.pages()[0]||await context.newPage();
  await page.goto(server.origin+'/app?dev-sw=1');
  await expect(page.locator('html[data-app-ready][data-shell-framework="sveltekit"]')).toBeAttached({timeout:30_000});
  await page.evaluate(()=>navigator.serviceWorker.ready.then(()=>true));
  await expect.poll(()=>page.evaluate(()=>!!navigator.serviceWorker.controller)).toBe(true);
  await page.evaluate(()=>localStorage.setItem('getbased-install-acceptance','retained'));
  const tab=await context.newCDPSession(page);
  const manifest:{errors:unknown[];manifest?:{id?:string;display?:string}}=await tab.send('Page.getAppManifest');
  expect(manifest.errors).toEqual([]);expect(manifest.manifest).toMatchObject({id:manifestId,display:'kStandalone'});
  expect(await tab.send('Page.getInstallabilityErrors')).toEqual({installabilityErrors:[]});
  const initial:{targetInfo:TargetRow}=await tab.send('Target.getTargetInfo');
  await activeSession.send('PWA.install',{manifestId,installUrlOrBundleUrl:server.origin+'/app?dev-sw=1'});installed=true;
  await activeSession.send('PWA.changeAppUserSettings',{manifestId,displayMode:'standalone'});
  await activeSession.send('PWA.launch',{manifestId,url:server.origin+'/app?dev-sw=1'});
  const onlineTarget=await installedPage(activeSession,server.origin,initial.targetInfo.targetId);
  report.online=await inspect(activeSession,onlineTarget);expect(report.online.url).toBe(server.origin+'/app?dev-sw=1');
  await activeSession.send('Target.closeTarget',{targetId:onlineTarget});
  await page.goto('about:blank');
  await expect.poll(async()=>(await targets(activeSession)).filter(row=>row.type==='page'&&row.url.startsWith(server.origin)).length,{timeout:10_000,message:'No app document may survive the cold-launch boundary'}).toBe(0);
  server.state.offline=true;
  await activeSession.send('PWA.launch',{manifestId});
  const offlineTarget=await installedPage(activeSession,server.origin,initial.targetInfo.targetId);
  report.offline=await inspect(activeSession,offlineTarget);expect(report.offline.url).toBe(manifestId);
 }finally{
  try{if(installed&&session){await session.send('PWA.uninstall',{manifestId});report.uninstalled=true;}}
  finally{
   try{await context?.close();}finally{await server.close();await rm(directory,{recursive:true,force:true});}
   await test.info().attach('actual-installed-pwa',{body:JSON.stringify(report,null,2),contentType:'application/json'});
  }
 }
 expect(report.uninstalled).toBe(true);
});
