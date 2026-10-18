import fs from 'node:fs/promises';
import path from 'node:path';
import {expect,test,type Page} from '@playwright/test';
import {createDefaultProfileData,migrateProfileData} from '../../js/profile.js';
import {productionRawModuleAssets} from '../../scripts/build-production.mjs';
import {startKitServer} from './kit-server.js';
import {artifactInputs,cacheReceipt,profile,activate} from './kit-native-receipts.js';
import {installOfflineStartupDiagnostics} from '../helpers/offline-launch-diagnostics.js';
import {readyLightArtifact as ready} from '../helpers/light-artifact-navigation.js';
const returning=JSON.parse(await fs.readFile(new URL('../fixtures/startup-banners-returning-user.json',import.meta.url),'utf8')) as {personality:'default';threads:unknown[]};
// A recent real fixture timestamp prevents the unrelated backup reminder from changing this test over time.
const backupTimestamp=new Date().toISOString();
const analytics=['js/analytics-consent-rendering.js','js/components/AnalyticsConsentBody.svelte.html.js'] as const;
const updates=['js/version-update-rendering.js','js/components/VersionUpdateBody.svelte.html.js','js/components/VersionUpdateCopy.svelte.html.js'] as const;
const modules=[...analytics,'js/utils.js','js/state.js'] as const;
const sheets=['css/app-shell.css','css/redesign-shell.css','css/modal-shared.css'] as const;
type Artifact=Awaited<ReturnType<typeof artifactInputs>>;
interface EventRow {action:string;trusted:boolean;type:string;key:string|null;pointerType:string|null}
interface ProbeWindow extends Window {startupBannersPwaEvents:EventRow[];startupBannersPwaCsp(value:string):Promise<void>}
async function preference(page:Page){return page.evaluate(()=>({seen:localStorage.getItem('labcharts-analytics-consent-seen'),disabled:localStorage.getItem('labcharts-analytics-disabled'),
  fullStorage:Object.fromEntries(Object.keys(localStorage).sort().map(key=>[key,localStorage.getItem(key)]))}));}
async function rawUpdateCache(page:Page,artifact:Artifact,required:string[]){
  const entries=await page.evaluate(async paths=>{const result=[];
    for(const path of paths){const response=await caches.match(new URL(path,location.origin).href);if(!response?.ok)throw new Error('Missing cached raw startup module '+path);
      const bytes=await response.arrayBuffer(),digest=await crypto.subtle.digest('SHA-256',bytes);
      result.push({path,bytes:bytes.byteLength,sha256:Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('')});}
    return result;
  },required);
  for(const entry of entries)expect(entry).toEqual(artifact.files.find(file=>file.path===entry.path));return entries;
}
async function syntheticUpdate(page:Page){return page.evaluate(async()=>{
  const messages:unknown[]=[];const waiting={postMessage:(message:unknown)=>messages.push(message)};
  const url='/js/service-worker-update.js';const module=await import(url) as typeof import('../../js/service-worker-update.js');
  const shown=module.showVersionUpdateBanner({waiting});
  (window as unknown as {startupWaitingModel:{messages:unknown[];waiting:typeof waiting}}).startupWaitingModel={messages,waiting};
  return {shown,modelled:true,realWorkerActivated:false};
});}
async function dismissedModel(page:Page){return page.evaluate(async()=>{
  const model=(window as unknown as {startupWaitingModel:{messages:unknown[];waiting:import('../../js/service-worker-update.js').UpdateWorkerView}}).startupWaitingModel;
  const url='/js/service-worker-update.js';const module=await import(url) as typeof import('../../js/service-worker-update.js');
  return {messages:model.messages,sameWorkerOffered:module.showVersionUpdateBanner({waiting:model.waiting})};
});}

test('static startup banner first construction offline and two zero-page cold launches preserve consent and profile',async({page,context},info)=>{
  test.setTimeout(150000);
  const artifact=await artifactInputs(modules,sheets),rawAssets=await productionRawModuleAssets();
  const nativeDeclarations=await fs.readFile('service-worker-assets.js','utf8');
  for(const name of [...analytics,...updates])expect(nativeDeclarations).toContain("'/"+name+"'");
  // Original architecture retains the Update entry and its exact static-import graph. No five-raw/five-bundle guess.
  const requiredRaw=['/js/service-worker-update.js',...updates.map(name=>'/'+name)];
  for(const name of requiredRaw){expect(rawAssets.has(name)).toBe(true);expect(await fs.readFile(path.join(artifact.directory,name.slice(1)))).toEqual(await fs.readFile(name.slice(1)));}
  for(const name of analytics){const required=rawAssets.has('/'+name);expect(artifact.files.some(row=>row.path==='/'+name)).toBe(required);}
  const worker=await fs.readFile(path.join(artifact.directory,'service-worker.js'),'utf8');
  const shell=JSON.parse(worker.match(/const APP_SHELL = (\[[\s\S]*?\]);/)![1]!) as string[];
  for(const name of requiredRaw)expect(shell).toContain(name);
  const seeded=migrateProfileData({...createDefaultProfileData(),contextNotes:'Synthetic startup banner PWA receipt'});
  await installOfflineStartupDiagnostics(context);
  await context.addInitScript(({seed,returning,backupTimestamp})=>{
    if(!['http:','https:'].includes(location.protocol)||localStorage.getItem('startup-banners-pwa-seeded'))return;
    localStorage.setItem('startup-banners-pwa-seeded','1');localStorage.setItem('labcharts-theme','dark');
    localStorage.setItem('labcharts-profiles',JSON.stringify([{id:'default',name:'Synthetic banner profile',sex:'male',dob:'1987-11-22',createdAt:1,
      location:{country:'',zip:''},tags:[],notes:'',status:'active',lastUpdated:1,pinned:false,height:null,heightUnit:'cm',avatar:null}]));
    localStorage.setItem('labcharts-active-profile','default');localStorage.setItem('labcharts-default-imported',JSON.stringify(seed));
    localStorage.setItem('labcharts-default-tour','completed');localStorage.setItem('labcharts-default-emptyTour','completed');
    localStorage.setItem('labcharts-encryption-enabled','false');localStorage.setItem('labcharts-encryption-nudge-dismissed','true');
    localStorage.setItem('labcharts-ai-provider','openrouter');localStorage.setItem('labcharts-ai-paused','true');
    localStorage.setItem('labcharts-analytics-consent-seen','1');localStorage.setItem('labcharts-analytics-disabled','false');
    localStorage.setItem('labcharts-show-product-recs','false');localStorage.setItem('labcharts-last-manual-backup',backupTimestamp);
    localStorage.setItem('labcharts-default-chat-threads',JSON.stringify(returning.threads));localStorage.setItem('labcharts-default-chatPersonality',returning.personality);
    localStorage.setItem('labcharts-legal-acceptance',JSON.stringify({accepted:true,termsVersion:'2026-08-22',privacyVersion:'2026-08-22',policyScope:'self-hosted-notice',
      acceptedAt:'2026-10-07T00:00:00Z',appVersion:'test',location:'local-test'}));
    localStorage.setItem('labcharts-ai-transparency-acknowledgement',JSON.stringify({version:'2026-08-31',acknowledged:true}));
  },{seed:seeded,returning,backupTimestamp});
  const errors:string[]=[],external:string[]=[],csp:string[]=[];
  const watch=(target:Page)=>target.on('pageerror',error=>errors.push(error.message));watch(page);context.on('page',watch);
  await context.exposeBinding('startupBannersPwaCsp',(_source,value:string)=>csp.push(value));
  await context.addInitScript(()=>{
    const observed=window as unknown as ProbeWindow;observed.startupBannersPwaEvents=[];
    for(const type of ['click','keydown','pointerdown'])document.addEventListener(type,event=>{
      const target=event.target;if(!(target instanceof Element))return;
      const button=target.closest('[data-analytics-consent-action],[data-version-update-action]');if(!button)return;
      observed.startupBannersPwaEvents.push({action:button.getAttribute('data-analytics-consent-action')??button.getAttribute('data-version-update-action')!,
        trusted:event.isTrusted,type,key:event instanceof KeyboardEvent?event.key:null,pointerType:event instanceof PointerEvent?event.pointerType:null});
    },true);
    document.addEventListener('securitypolicyviolation',event=>void observed.startupBannersPwaCsp(event.violatedDirective));
  });
  const server=await startKitServer(artifact.directory);let stopped=false;
  await context.route('**/*',async route=>{const url=new URL(route.request().url());
    if(['http:','https:'].includes(url.protocol)&&url.origin!==server.origin){external.push(url.href);await route.abort();}else await route.continue();});
  const phases:unknown[]=[],boundaries:unknown[]=[];
  try{
    await ready(page,server.origin);
    // Settle this document's native imports before deliberately navigating it
    // again; Firefox reports aborted imports from the retired page as pageerrors.
    await page.waitForLoadState('networkidle');await ready(page,server.origin);
    const close=page.getByRole('button',{name:'Close chat',exact:true});if(await close.isVisible())await activate(page,close);
    await expect(page.locator('#analytics-consent-banner,#version-update-banner')).toHaveCount(0);
    const before=await profile(page,artifact.state),beforePreference=await preference(page),cache=await cacheReceipt(page,artifact),raw=await rawUpdateCache(page,artifact,requiredRaw);
    expect(before.stored).toEqual(seeded);expect(before.live.contextNotes).toBe(seeded.contextNotes);
    expect(beforePreference.seen).toBe('1');expect(beforePreference.disabled).toBe('false');
    // Disclosed fixture input, before offline document bootstrap: cold first-time Analytics body has not rendered online.
    await page.evaluate(()=>localStorage.removeItem('labcharts-analytics-consent-seen'));
    const armed=await preference(page);expect(armed.seen).toBeNull();expect(armed.disabled).toBe('false');
    await server.close();stopped=true;await expect(fetch(server.origin+'/index.html')).rejects.toThrow();
    await page.waitForLoadState('networkidle');await page.reload({waitUntil:'load'});
    await page.waitForLoadState('networkidle');await ready(page,server.origin);
    for(let phase=0;phase<3;phase++){
      const beforeNewPage=phase?context.pages().length:null;
      if(phase){expect(beforeNewPage).toBe(0);page=await context.newPage();expect(context.pages()).toHaveLength(1);await ready(page,server.origin);}
      const closeChat=page.getByRole('button',{name:'Close chat',exact:true});if(await closeChat.isVisible())await activate(page,closeChat);
      expect(await profile(page,artifact.state)).toEqual(before);
      if(phase===0)await expect(page.locator('#analytics-consent-banner')).toBeVisible({timeout:10000});
      else{await expect(page.locator('#analytics-consent-banner')).toHaveCount(0);const prefs=await preference(page);expect(prefs.seen).toBe('1');expect(prefs.disabled).toBe('true');}
      expect(await syntheticUpdate(page)).toEqual({shown:true,modelled:true,realWorkerActivated:false});
      const banner=page.locator('#version-update-banner');await expect(banner).toBeVisible();await expect(banner).toHaveAttribute('aria-label','App update available');
      await expect(banner.locator('button')).toHaveCount(2);await expect(banner.locator('button').first()).toHaveAttribute('type','button');
      await activate(page,banner.locator('[data-version-update-action="dismiss"]'));await expect(banner).toHaveCount(0);
      expect(await dismissedModel(page)).toEqual({messages:[],sameWorkerOffered:false});
      if(phase===0){await activate(page,page.locator('#analytics-consent-banner [data-analytics-consent-action="disable"]'));
        await expect(page.locator('#analytics-consent-banner')).toHaveCount(0);}
      const prefs=await preference(page);expect(prefs.seen).toBe('1');expect(prefs.disabled).toBe('true');
      expect(await profile(page,artifact.state)).toEqual(before);expect(await cacheReceipt(page,artifact)).toEqual(cache);
      expect(await rawUpdateCache(page,artifact,requiredRaw)).toEqual(raw);
      const events=await page.evaluate(()=>(window as unknown as ProbeWindow).startupBannersPwaEvents);
      const clicks=events.filter(event=>event.type==='click');expect(clicks.map(event=>[event.action,event.trusted])).toEqual(phase===0?[['dismiss',true],['disable',true]]:[['dismiss',true]]);
      const retained={phase,profile:await profile(page,artifact.state),preferences:prefs,events,rawUpdateCache:raw};
      await info.attach('startup-banners-phase-'+phase,{body:JSON.stringify(retained,null,2),contentType:'application/json'});
      phases.push(retained);
      await page.close();expect(context.pages()).toHaveLength(0);boundaries.push({phase,beforeNewPage,afterClose:context.pages().length});
    }
    expect(errors).toEqual([]);expect(csp).toEqual([]);expect(external).toEqual([]);expect(await artifactInputs(modules,sheets)).toEqual(artifact);
    await info.attach('startup-banners-offline-cold-acceptance',{body:JSON.stringify({artifact,before,beforePreference,armed,cache,raw,phases,boundaries,errors,csp,external,
      scope:'Static Kit actual cached markup/source bytes and full native profile/consent preference persistence; first offline Analytics construction, two zero-page cold launches. Update waiting worker is an explicit fixture model, Later sends no message; real activation/old-tab reload remains separately covered by unchanged maintained A/B tests. Four headless profiles; no physical installation/provider/whole-app claim.'},null,2),contentType:'application/json'});
  }finally{await info.attach('startup-banners-retained-diagnostics',{body:JSON.stringify({phases,boundaries,errors,csp,external},null,2),contentType:'application/json'});if(!stopped)await server.close();}
});
