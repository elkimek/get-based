import fs from 'node:fs/promises';
import {expect,test,type Page} from '@playwright/test';
import {startKitServer} from './kit-server.js';
import {artifactInputs,cacheReceipt,profile,sha} from './kit-native-receipts.js';
import {installDiscussionFixture} from '../helpers/chat-discussion-fixture.js';
import {installOfflineStartupDiagnostics} from '../helpers/offline-launch-diagnostics.js';
import {readyLightArtifact as ready} from '../helpers/light-artifact-navigation.js';
import {flow,installEvents,openDashboard,preferences,protectedPreferences} from '../helpers/dashboard-action-bar-pwa-flow.js';
const authored=['js/dashboard-action-bar-presentation.js','js/dashboard-action-bar-rendering.js','js/components/DashboardActionBar.svelte.html.js'] as const;
const modules=[...authored,'js/dashboard-widget-controls.js','js/dashboard-widgets.js','js/dashboard-picker-presentation.js','js/views-runtime.js','js/nav.js','js/state.js','js/profile.js'] as const;
const sheets=['css/app-shell.css','css/dashboard-core.css','css/dashboard-widgets.css','css/mobile-dashboard.css','css/chat-panel-open.css','css/modal-shared.css'] as const;
async function wholeProfile(page:Page,artifact:Awaited<ReturnType<typeof artifactInputs>>){
  const active=await profile(page,artifact.state);
  const stores=await page.evaluate(async()=>{
    const request=indexedDB.open('labcharts-blobs',1);request.onupgradeneeded=()=>request.transaction?.abort();
    const db=await new Promise<IDBDatabase>((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
    try{const tx=db.transaction('kv','readonly'),store=tx.objectStore('kv'),keys=store.getAllKeys(),values=store.getAll();
      await new Promise<void>((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});
      return keys.result.map((key,index)=>[key,values.result[index]] as const);
    }finally{db.close();}
  });return {active,stores};
}
test('Dashboard action bar first offline use and two zero-page cold launches preserve complete profiles',async({page,context},info)=>{
  test.setTimeout(180000);const artifact=await artifactInputs(modules,sheets),sw=await fs.readFile('service-worker-assets.js','utf8');
  for(const module of authored)expect(sw).toContain("'/"+module+"'");
  await installDiscussionFixture(context,{provider:'openrouter',paused:true});await installOfflineStartupDiagnostics(context);
  const imported=await fs.readFile(new URL('../fixtures/dashboard-action-bar-pwa-profile.json',import.meta.url),'utf8'),registry=JSON.parse(await fs.readFile(new URL('../fixtures/dashboard-action-bar-pwa-registry.json',import.meta.url),'utf8')) as unknown[];
  const returningFixture=JSON.parse(await fs.readFile(new URL('../fixtures/startup-banners-returning-user.json',import.meta.url),'utf8')) as {personality:string;threads:unknown[]};
  // A real recent synthetic input timestamp keeps the returning-user backup boundary stable over time.
  const returning={...returningFixture,backupTimestamp:new Date().toISOString()};
  expect(Date.now()-Date.parse(returning.backupTimestamp)).toBeLessThan(30*86400000);expect(Date.parse(returning.backupTimestamp)).toBeLessThanOrEqual(Date.now());
  await context.addInitScript(({imported,registry,returning})=>{
    if(!['http:','https:'].includes(location.protocol)||localStorage.getItem('dashboard-action-bar-pwa-seeded'))return;
    localStorage.setItem('dashboard-action-bar-pwa-seeded','1');localStorage.setItem('labcharts-theme','dark');localStorage.setItem('labcharts-analytics-disabled','true');
    localStorage.setItem('labcharts-profiles',JSON.stringify(registry));localStorage.setItem('labcharts-active-profile','default');localStorage.setItem('labcharts-default-imported',imported);
    localStorage.setItem('labcharts-show-product-recs','false');localStorage.setItem('labcharts-last-manual-backup',returning.backupTimestamp);
    localStorage.setItem('labcharts-default-chat-threads',JSON.stringify(returning.threads));localStorage.setItem('labcharts-default-chatPersonality',returning.personality);
    localStorage.setItem('labcharts-default-lastViewV1','light');
    localStorage.setItem('labcharts-default-onboarded','profile-set');
    localStorage.setItem('labcharts-default-dashboardWidgetsV13',JSON.stringify({order:['notes'],hidden:[]}));localStorage.setItem('labcharts-default-dashboardBiometricMetricsV1','["weight"]');
  },{imported,registry,returning});
  const errors:string[]=[],csp:string[]=[],external:string[]=[],denied:string[]=[],traffic:Array<{method:string;url:string}>=[];
  const requestFailures:Array<{method:string;url:string;errorText:string|null}>=[];
  const observe=(target:Page)=>{target.on('pageerror',error=>errors.push(error.message));
    target.on('requestfailed',request=>requestFailures.push({method:request.method(),url:request.url(),errorText:request.failure()?.errorText??null}));};observe(page);context.on('page',observe);
  context.on('request',request=>traffic.push({method:request.method(),url:request.url()}));
  await context.exposeBinding('dashboardActionCsp',(_,value:string)=>csp.push(value));await context.addInitScript(installEvents);
  const server=await startKitServer(artifact.directory);let closed=false;
  await context.route('**/*',async route=>{const url=new URL(route.request().url());
    if(['http:','https:'].includes(url.protocol)&&(url.origin!==server.origin||url.username||url.password)){external.push(url.href);await route.abort();}else {const request=route.request(),known=artifact.files.some(file=>file.path===url.pathname)||['/','/app','/app/','/api/commit','/js/bundle-legacy-probe-AAA.js'].includes(url.pathname);
      if(!known||request.method()!=='GET'||url.hash||(url.search&&url.pathname+url.search!=='/app?dev-sw=1'&&url.href!==server.origin+'/version.js?update-check=1')){denied.push(request.method()+' '+url.href);await route.abort();}else await route.continue();}
  });
  const phases:unknown[]=[],boundaries:unknown[]=[];let stage='online-ready';
  try{
    // Normal ready shell only: no Dashboard navigation, action-bar interaction or Picker warm before stopped origin.
    await ready(page,server.origin);await ready(page,server.origin);
    expect(await page.locator('.dashboard-sticky-actions,.m-dashboard-widget-actions').count()).toBe(0);
    const before=await wholeProfile(page,artifact),onlinePrefs=protectedPreferences(await preferences(page));
    expect(onlinePrefs['labcharts-default-lastViewV1']).toBe('light');
    const beforePrefs={...onlinePrefs,'labcharts-default-lastViewV1':'dashboard'}; // Exact public router-owned preference write on first offline navigation.
    expect(before.active.rawProfiles).toBe(JSON.stringify(registry));expect(before.active.stored).toEqual(JSON.parse(imported));expect(before.active.live).toEqual(JSON.parse(imported));
    const onlineCache=await cacheReceipt(page,artifact),served=await fetch(server.origin+'/service-worker.js').then(response=>response.arrayBuffer());
    expect(sha(new Uint8Array(served))).toBe(artifact.servedWorkerSHA256);
    await server.close();closed=true;await expect(fetch(server.origin+'/index.html')).rejects.toThrow();
    // Offline boundary is the stopped real origin; browser offline emulation is not enabled.
    for(let phase=0;phase<3;phase++){
      stage=phase===0?'first-offline':'cold-'+phase;
      const beforeNewPage=phase===0?null:context.pages().length;
      if(phase>0){expect(beforeNewPage).toBe(0);page=await context.newPage();expect(context.pages()).toHaveLength(1);await ready(page,server.origin);}
      await openDashboard(page);expect(await wholeProfile(page,artifact)).toEqual(before);
      const states:unknown[]=[];
      const result=await flow(page,async name=>{const state=await wholeProfile(page,artifact),prefs=await preferences(page);
        states.push({name,state,prefs});expect(state).toEqual(before);expect(protectedPreferences(prefs)).toEqual(beforePrefs);});
      const cache=await cacheReceipt(page,artifact);expect(cache.keys).toEqual(onlineCache.keys);
      const raw={phase:phase===0?'first-offline':'cold-'+phase,states,result,cache};
      await info.attach('dashboard-action-bar-phase-'+phase,{body:JSON.stringify(raw,null,2),contentType:'application/json'});phases.push(raw);
      for(const client of context.pages())await client.close();expect(context.pages()).toHaveLength(0);
      boundaries.push({phase,beforeNewPage,afterClose:context.pages().length});
    }
    expect(phases).toHaveLength(3);expect(errors).toEqual([]);expect(csp).toEqual([]);expect(external).toEqual([]);expect(denied).toEqual([]);
    expect(await artifactInputs(modules,sheets)).toEqual(artifact);expect(await fs.readFile('service-worker-assets.js','utf8')).toBe(sw);
    await info.attach('dashboard-action-bar-stopped-origin',{body:JSON.stringify({artifact,before,beforePrefs,onlineCache,boundaries,phases,traffic,errors,csp,external,denied,onlinePrefs,
      stoppedListener:true,browserOfflineEmulation:false,servedWorkerSHA256:sha(new Uint8Array(served)),coldLaunches:2,
      boundary:'Actual public delegates/static Kit/SW/cache and committed native whole profiles. Returning-user synthetic preboot fixture and paused credential-free discussion. Existing kit-test-a/version/legacyProbe seam; no OS installation/provider/backend/import/export/destruction or hardware-browser claim.'},null,2),contentType:'application/json'});
  }catch(error){
    // Failure-only read: no navigation, module import, fetch, cache write or worker update.
    const workerCache=await page.evaluate(async paths=>{
      const controller=navigator.serviceWorker.controller;
      const registrations=await navigator.serviceWorker.getRegistrations();
      const entries=[];
      for(const path of paths){const response=await caches.match(new URL(path,location.origin).href);
        if(!response){entries.push({path,missing:true});continue;}
        const bytes=await response.arrayBuffer(),digest=await crypto.subtle.digest('SHA-256',bytes);
        entries.push({path,status:response.status,bytes:bytes.byteLength,sha256:Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('')});}
      return {url:location.href,at:performance.now(),controller:controller?{scriptURL:controller.scriptURL,state:controller.state}:null,
        registrations:registrations.map(registration=>({scope:registration.scope,active:registration.active?{scriptURL:registration.active.scriptURL,state:registration.active.state}:null,
          waiting:registration.waiting?{scriptURL:registration.waiting.scriptURL,state:registration.waiting.state}:null,installing:registration.installing?{scriptURL:registration.installing.scriptURL,state:registration.installing.state}:null})),
        cacheKeys:await caches.keys(),entries};
    },artifact.cachePaths).catch(diagnosticError=>({diagnosticError:String(diagnosticError)}));
    await info.attach('dashboard-action-bar-failure-diagnostics',{body:JSON.stringify({stage,stoppedListener:closed,browserOfflineEmulation:false,
      failure:String(error),artifact,workerCache,requestFailures,traffic,errors,csp,external,denied,phases,boundaries},null,2),contentType:'application/json'});
    throw error;
  }finally{if(!closed)await server.close();}
});
