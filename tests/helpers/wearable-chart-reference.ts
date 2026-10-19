import {nativeTabKey} from './native-tab-key.js';
import assert from 'node:assert/strict';
import {deepStrictEqual} from 'node:assert';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import {pathToFileURL} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {expect,type Browser,type BrowserContext,type BrowserContextOptions,type Page,type Locator,type TestInfo} from '@playwright/test';
import {materializeWearableOriginalApplication,type WearableFixtureLifecycle} from '../../scripts/wearable-native-fixture.mjs';
import {startKitServer} from '../pwa/kit-server.js';
import {profile,cacheReceipt,activate,type artifactInputs} from '../pwa/kit-native-receipts.js';
import {readyLightArtifact as ready} from './light-artifact-navigation.js';
import type * as DiscussionFixture from './chat-discussion-fixture.js';
import type * as OfflineDiagnostics from './offline-launch-diagnostics.js';
import type * as OriginalObserver from './wearable-detail-pwa-receipt.js';

type DeviceReceipt = Awaited<ReturnType<typeof OriginalObserver.wearableDailyDeviceReceipt>>;
type ChartReceipt = Awaited<ReturnType<typeof OriginalObserver.wearableActualChartReceipt>>;
type ProfileReceipt = Awaited<ReturnType<typeof profile>>;
type Artifact = Awaited<ReturnType<typeof artifactInputs>>;
interface NativeOracle {profileStates:Record<string,ProfileReceipt>;detailBodies:Record<string,ReturnType<typeof OriginalObserver.wearableDetailBodyReceipt>>;dailyStates:Record<string,unknown>;chartStates:Record<string,unknown>;originalDetailSHA256:string;originalManualSHA256:string;deviceSchema:unknown;eventChronology:unknown[];nativePOSTRequests:unknown[];}
interface NativeState {name:string;profileState:string;raw:string;body:ReturnType<typeof OriginalObserver.wearableDetailBodyReceipt>;profile:ProfileReceipt;device:DeviceReceipt;chart:ChartReceipt|null}
interface ReferenceHistory {artifact:Artifact;oracle:NativeOracle;rawStates:Record<string,NativeState>;chartCallbacks:Record<string,{cases:ChartReceipt['nativeCallbackCases'];outputs:ChartReceipt['nativeCallbackOutputs']}>;phases:Array<{phase:number;steps:NativeState[]}>}
interface WarmHistory {profile:ProfileReceipt;device:DeviceReceipt;protectedStorage:unknown;cache:Awaited<ReturnType<typeof cacheReceipt>>}
export interface WearableChartFrame {key:string;width:number;height:number;rgba:Buffer;paint:ChartReceipt['paint'];datasetMetadata:ChartReceipt['datasetMetadata']}
const sha=(bytes:Uint8Array|string)=>createHash('sha256').update(bytes).digest('hex');
export const wearableReferenceKeys = [
 'phase-0/migrated-baseline/weight-90d','phase-0/migrated-baseline/weight-all','phase-0/migrated-baseline/bp-invalid-form',
 'phase-0/after-bp-save/bp-after-save','phase-0/after-same-date-merge/weight-after-merge','phase-0/after-same-date-merge/bp-after-delete-cancel',
 'phase-0/after-selected-pair-delete/bp-after-selected-pair-delete','phase-0/after-selected-pair-delete/pulse-after-merge',
 ...[1,2].flatMap(phase=>['weight-90d','weight-all','bp-invalid-form','bp-after-cancel','pulse-after-merge'].map(name=>`phase-${phase}/after-selected-pair-delete/${name}`)),
];
/** Native point coordinates depend on the actual renderer. Their active gate
 * is exact original/current equality in the same browser. Keep all historical
 * dataset identity, ordering, point count/shape and other metadata unchanged. */
export function historicalWearableDatasetMetadata(metadata:ChartReceipt['datasetMetadata']) {
 return metadata.map(dataset=>({...dataset,points:dataset.points.map(point=>{
  assert(Number.isFinite(point.x)&&Number.isFinite(point.y),'Finite actual native dataset coordinates');
  return {...point,x:0,y:0};
 })}));
}
/** Cocoa WebKit needs Option for physical full-control traversal. Expand only
 * the six known chords in the authenticated 110-row historical chronology. */
export function wearableExpectedEventChronology(historical:readonly unknown[],platform:string,browserName:string):unknown[] {
 assert.equal(historical.length,110,'Complete frozen 110-event chronology');
 if(platform!=='darwin'||browserName!=='webkit')return structuredClone([...historical]);
 const reverse={type:'keydown',action:'modal-close',metric:null,key:'Shift',trusted:true,focus:''};
 const forward={type:'keydown',action:'delete-detail-manual-entry',metric:'weight',key:'Tab',trusted:true,focus:''};
 const positions=new Map<number,typeof reverse|typeof forward>([[2,reverse],[4,forward],[56,reverse],[58,forward],[84,reverse],[86,forward]]);
 for(const [index,expected] of positions){
  assert.deepEqual(historical[index],expected,'Exact frozen physical chord owner, metric, key, trust and focus');
  if(expected===reverse)assert.deepEqual(historical[index+1],{...reverse,key:'Tab'},'Exact frozen reverse chord Tab');
 }
 const expanded:unknown[]=[];
 for(const [index,row] of historical.entries()){
  const chord=positions.get(index);if(chord)expanded.push({...chord,key:'Alt'});
  expanded.push(structuredClone(row));
 }
 assert.equal(expanded.length,116,'Exactly six trusted Cocoa Option keydowns');
 return expanded;
}
/** Actual bytes, dimensions and complete paint receipt; neither tolerances nor
 * an alternate SHA can satisfy this boundary. The case checks all nonpaint too. */
export function assertWearableChartFrame(expected:WearableChartFrame,actual:WearableChartFrame) {
 assert.equal(actual.key,expected.key,'Exact chronological chart state');
 for(const frame of [expected,actual]) {
  assert(Number.isSafeInteger(frame.width)&&frame.width>0&&Number.isSafeInteger(frame.height)&&frame.height>0);
  assert(Buffer.isBuffer(frame.rgba)&&frame.rgba.length===frame.width*frame.height*4&&frame.rgba.length<=16*1024*1024,'Complete bounded RGBA frame');
  assert.equal(frame.rgba.length,frame.paint.bytes);assert.equal(sha(frame.rgba),frame.paint.sha256,'Raw canvas/observer coherence');
 }
 assert.equal(actual.width,expected.width);assert.equal(actual.height,expected.height);
 assert(actual.rgba.equals(expected.rgba),'Exact same-browser original/current RGBA');
 assert.deepEqual(actual.paint,expected.paint,'Complete same-browser original/current paint receipt');
 assert.deepEqual(actual.datasetMetadata,expected.datasetMetadata,'Exact same-browser original/current native dataset metadata');
}
export function assertWearableReferenceInventory(frames:readonly WearableChartFrame[]) {
 assert.equal(frames.length,18,'Exactly eighteen chart frames');
 assert.deepEqual(frames.map(frame=>frame.key),wearableReferenceKeys,'Unique chronological 8+5+5 chart states');
 let total=0;for(const frame of frames){assertWearableChartFrame(frame,frame);total+=frame.rgba.length;assert(total<=64*1024*1024,'Unchanged 64MiB native journey cap');}
}
async function rawFrame(page:Page,key:string,chart:ChartReceipt,binding:Artifact['state'],observer:typeof OriginalObserver.wearableActualChartReceipt):Promise<WearableChartFrame> {
 const frame=await page.evaluate(()=>{
  const canvas=document.querySelector<HTMLCanvasElement>('#chart-modal'),context=canvas?.getContext('2d');
  if(!canvas||!context)throw Error('Native registered canvas is required');
  if(canvas.width*canvas.height*4>16*1024*1024)throw Error('Native frame exceeds byte cap');
  const bytes=context.getImageData(0,0,canvas.width,canvas.height).data;let binary='';
  for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
  return {width:canvas.width,height:canvas.height,base64:btoa(binary)};
 });
 const actual={key,width:frame.width,height:frame.height,rgba:Buffer.from(frame.base64,'base64'),paint:chart.paint,datasetMetadata:structuredClone(chart.datasetMetadata)};
 assertWearableChartFrame(actual,actual);
 assert.deepEqual(await page.evaluate(observer,binding),chart,'Readback leaves the complete registered native Chart untouched');
 return actual;
}
async function browserEnvironment(page:Page) {
 await page.setContent('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">');
 return page.evaluate(()=>({viewport:{width:innerWidth,height:innerHeight},screen:{width:screen.width,height:screen.height},dpr:devicePixelRatio,userAgent:navigator.userAgent,language:navigator.language,timezone:Intl.DateTimeFormat().resolvedOptions().timeZone,coarse:matchMedia('(pointer: coarse)').matches,hover:matchMedia('(hover: hover)').matches,dark:matchMedia('(prefers-color-scheme: dark)').matches,reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches}));
}
// Public context options only; both contexts use the very same Browser instance.
// Test-scoped UTC is explicit because TestInfo.project.use describes project config.
function referenceContextOptions(info:TestInfo):BrowserContextOptions {
 const options:BrowserContextOptions={...info.project.use.contextOptions,timezoneId:'UTC'};
 const names=['acceptDownloads','bypassCSP','clientCertificates','colorScheme','contrast','deviceScaleFactor','extraHTTPHeaders','forcedColors','geolocation','hasTouch','httpCredentials','ignoreHTTPSErrors','isMobile','javaScriptEnabled','locale','offline','permissions','proxy','reducedMotion','screen','storageState','userAgent','viewport','baseURL','serviceWorkers'] as const;
 for(const name of names)if(info.project.use[name]!==undefined)Object.assign(options,{[name]:info.project.use[name]});
 return options;
}
const modules=['js/wearables.js','js/wearables-detail-modal.js','js/wearables-detail-runtime.js','js/wearables-bp-detail-chart.js','js/wearables-manual.js','js/wearables-manual-detail.js','js/wearables-store.js','js/wearables-summary.js','js/wearables-summary-model.js','js/wearables-entry-presentation.js','js/dashboard-widget-runtime.js','js/dashboard-widget-controls.js','js/state.js','js/profile.js','js/startup-maintenance.js','js/modal-lifecycle.js','js/charts.js'] as const;
const sheets=['css/wearables.css','css/dashboard-widgets.css','css/dashboard-data.css','css/modal-shared.css'] as const;
async function keyboard(page:Page,target:Locator){await target.scrollIntoViewIfNeeded();await target.focus();await expect(target).toBeFocused();await page.keyboard.press('Enter');}
async function dashboard(page:Page){const chat=page.getByRole('button',{name:'Close chat',exact:true});if(await chat.isVisible())await activate(page,chat);const menu=page.getByRole('button',{name:'Menu',exact:true});if(await menu.isVisible()&&!await page.locator('#sidebar-nav').evaluate(e=>e.classList.contains('mobile-open')))await activate(page,menu);await activate(page,page.locator('#sidebar-nav [data-nav-action="navigate"][data-nav-route="dashboard"]'));await expect(page.locator('.dashboard-widget[data-widget-id="wearables"]')).toBeVisible();}
async function detail(page:Page,metric:string){const trigger=page.locator('.dashboard-widget[data-widget-id="wearables"] [data-dashboard-widget-action="open-biometric-detail"][data-dashboard-widget-id="'+metric+'"]');await keyboard(page,trigger);await expect(page.locator('#modal-overlay')).toBeVisible();await expect(page.locator('#detail-modal .modal-close')).toBeFocused();return trigger;}
async function otherStorage(page:Page){return page.evaluate(()=>Object.fromEntries(Object.keys(localStorage).filter(key=>key.startsWith('labcharts-other-')||['labcharts-active-profile','labcharts-theme','labcharts-accent','labcharts-encryption-enabled','labcharts-ai-provider','labcharts-ai-paused','labcharts-show-product-recs'].includes(key)).sort().map(key=>[key,localStorage.getItem(key)])));}

/** Render the frozen application once in this test's actual browser, using the
 * original migration and observer bytes. The original 8+5+5 action loop remains
 * separate from candidate owners; all original nonpaint/history checks fail closed. */
export async function captureWearableChartReference(browser:Browser,candidatePage:Page,info:TestInfo,historyInput:unknown,warmInput:unknown) {
 const history=historyInput as ReferenceHistory,warm=warmInput as WarmHistory;
 assert(history&&warm);assert.deepEqual(Object.keys(history.rawStates),wearableReferenceKeys);
 const frames:WearableChartFrame[]=[],historicalPaintMismatches:Array<{key:string;expected:ChartReceipt['paint'];actual:ChartReceipt['paint']}>=[];
 const historicalDatasetCoordinateMismatches:Array<{key:string;expected:ChartReceipt['datasetMetadata'];actual:ChartReceipt['datasetMetadata']}>=[];
 const expectedEventChronology=wearableExpectedEventChronology(history.oracle.eventChronology,process.platform,browser.browserType().name());
 let originalEventChronology:unknown[]=[],originalEventsQualified=false;
 const lifecycle:WearableFixtureLifecycle={errors:[],dropped:0,removed:false};
 let fixture:Awaited<ReturnType<typeof materializeWearableOriginalApplication>>|undefined,context:BrowserContext|undefined,ownedServer:Awaited<ReturnType<typeof startKitServer>>|undefined;
 let primary:unknown,present=false,totalBytes=0,environment:Awaited<ReturnType<typeof browserEnvironment>>|undefined;
 const cleanupErrors:Array<{stage:string;message:string}>=[];
 const cleanupError=(stage:string,error:unknown)=>{let message='Unprintable thrown value';try{message=String(error).slice(0,2048);}catch{}cleanupErrors.push({stage,message});};
 try {
  const candidateEnvironment=await browserEnvironment(candidatePage);assert.equal(candidateEnvironment.timezone,'UTC');
  fixture=await materializeWearableOriginalApplication(lifecycle);
  context=await browser.newContext(referenceContextOptions(info));let page=await context.newPage();
  environment=await browserEnvironment(page);assert.deepEqual(environment,candidateEnvironment,'Identical actual public browser/context environment');
  const originalSourceDirectory=fixture.sourceDirectory;
  // Stateful setup remains original fixture data too. These standalone modules
  // contain only erasable TypeScript and type-only SDK imports (Node.js24).
  assert.equal(process.versions.node.split('.')[0],'24');
  const {installDiscussionFixture}=await import(pathToFileURL(path.join(originalSourceDirectory,'tests/helpers/chat-discussion-fixture.ts')).href) as typeof DiscussionFixture;
  const {installOfflineStartupDiagnostics}=await import(pathToFileURL(path.join(originalSourceDirectory,'tests/helpers/offline-launch-diagnostics.ts')).href) as typeof OfflineDiagnostics;
  // Shared helpers are infrastructure, not alternate native owners. Bind the
  // stateful read-only/profile/cache/activation bodies to their original source.
  const oldReceipts=await fs.readFile(path.join(originalSourceDirectory,'tests/pwa/kit-native-receipts.ts'),'utf8');
  const currentReceipts=await fs.readFile('tests/pwa/kit-native-receipts.ts','utf8');
  for(const name of ['profile','cacheReceipt','activate']) {
   const section=(text:string)=>{const start=text.indexOf('export async function '+name+'(');assert(start>=0);const end=text.indexOf('\nexport ',start+1);return text.slice(start,end<0?undefined:end).trim();};
   assert.equal(section(currentReceipts),section(oldReceipts),'Unchanged original read-only infrastructure '+name);
  }
  for(const name of ['tests/pwa/kit-server.ts','tests/helpers/light-artifact-navigation.ts'])assert.deepEqual(await fs.readFile(name),await fs.readFile(path.join(originalSourceDirectory,name)),'Unchanged original server/readiness infrastructure');
  const source=await fs.readFile(path.join(originalSourceDirectory,'js/profile.js'),'utf8'),defaults=source.slice(5660,6650);
  assert.equal(sha(defaults),'fafbbb2dba2e8c1c9da8cf2383d28ffce3b24fed8c82f9c025ee7b002c783bab','Exact original literal default-profile function');
  const createDefaultProfileData=vm.runInNewContext('('+defaults+')',Object.create(null),{timeout:1000}) as ()=>Record<string,unknown>;
  const {migrateProfileData}=await import(pathToFileURL(path.join(originalSourceDirectory,'js/profile-data-migrations.js')).href) as {migrateProfileData:(value:Record<string,unknown>)=>Record<string,unknown>};
  const {wearableAcceptanceTime,wearableAcceptanceSelection,wearableAcceptanceSeedFields,wearableAcceptanceRegistry,wearableDetailBodyReceipt,wearableDailyDeviceReceipt,wearableActualChartReceipt}=await import(pathToFileURL(path.join(originalSourceDirectory,'tests/helpers/wearable-detail-pwa-receipt.js')).href) as typeof OriginalObserver;
  const originalArtifact={...history.artifact,directory:fixture.artifactDirectory};
  const originalArtifactInputs=async(requestedModules:readonly string[],requestedSheets:readonly string[])=>{
   assert.deepEqual(requestedModules,modules);assert.deepEqual(requestedSheets,sheets);await fixture!.verify();
   assert.deepEqual(fixture!.inventory,originalArtifact.files,'Complete historical original artifact inventory');
   assert.equal(originalArtifact.buildId,'84924c09f326ea10684b8a0c0aa92f51419c7498b6dfe03654370378207987ec');assert.equal(originalArtifact.files.length,769);
   for(const mapping of originalArtifact.mappings){assert(modules.includes(mapping.module as typeof modules[number]));const bytes=await fs.readFile(path.join(originalSourceDirectory,mapping.module));assert.equal(bytes.length,mapping.sourceBytes);assert.equal(sha(bytes),mapping.sourceSHA256);for(const chunk of mapping.chunks)assert(originalArtifact.cachePaths.includes(chunk));}
   for(const css of sheets)assert.deepEqual(await fs.readFile(path.join(originalArtifact.directory,css)),await fs.readFile(path.join(originalSourceDirectory,css)));
   return originalArtifact;
  };
  const qualifyOriginalWarm=async(actualProfile:ProfileReceipt,device:DeviceReceipt,storage:unknown,cache:Awaited<ReturnType<typeof cacheReceipt>>,actualArtifact:Artifact,origin:string)=>{
   assert.deepEqual(actualArtifact,originalArtifact);assert.deepEqual(actualProfile,warm.profile);assert.deepEqual(actualProfile,history.oracle.profileStates['migrated-baseline']);assert.deepEqual(device,warm.device);assert.deepEqual(storage,warm.protectedStorage);assert.deepEqual(cache.entries,warm.cache.entries);assert.deepEqual(cache.keys,warm.cache.keys);assert.equal(cache.controller,origin+'/service-worker.js');assert.deepEqual(cache.registrations,[cache.controller]);
  };
  const recordOriginalStep=async(phase:number,receipt:NativeState,target:Page,actualArtifact:Artifact)=>{
   assert.deepEqual(actualArtifact,originalArtifact);const key=`phase-${phase}/${receipt.profileState}/${receipt.name}`;assert.equal(key,wearableReferenceKeys[frames.length],'Every original state once in chronological order');
   const expected=history.rawStates[key];assert(expected&&receipt.chart&&expected.chart);
   const {chart,...nonChart}=receipt,{chart:oldChart,...oldNonChart}=expected;assert.deepEqual(nonChart,oldNonChart,'Exact complete historical original non-chart receipt');
   const {paint,...metadata}=chart,{paint:oldPaint,...oldMetadata}=oldChart;assert.deepEqual({...metadata,datasetMetadata:historicalWearableDatasetMetadata(chart.datasetMetadata)},{...oldMetadata,datasetMetadata:historicalWearableDatasetMetadata(oldChart.datasetMetadata)},'Exact historical original nonpaint Chart except same-browser point coordinates');
   assert.deepEqual(chart.rawNativeConfiguration,history.oracle.chartStates[receipt.profileState+'/'+receipt.name]);assert.deepEqual({cases:chart.nativeCallbackCases,outputs:chart.nativeCallbackOutputs},history.chartCallbacks[receipt.profileState+'/'+receipt.name]);
   const frame=await rawFrame(target,key,chart,actualArtifact.state,wearableActualChartReceipt);totalBytes+=frame.rgba.length;assert(totalBytes<=64*1024*1024,'Unchanged 64MiB native journey cap');frames.push(frame);
   if(!isDeepStrictEqual(paint,oldPaint))historicalPaintMismatches.push({key,expected:oldPaint,actual:paint});
   if(!isDeepStrictEqual(chart.datasetMetadata,oldChart.datasetMetadata))historicalDatasetCoordinateMismatches.push({key,expected:oldChart.datasetMetadata,actual:chart.datasetMetadata});
  };
const oracle:NativeOracle={profileStates:{},detailBodies:{},dailyStates:{},chartStates:{},originalDetailSHA256:'65474562db0838d4267e1f57b6e6e0cde791c5545eb160554305363102f3fb16',originalManualSHA256:'',deviceSchema:null,eventChronology:[],nativePOSTRequests:[]};const cryptoModule=await import('node:crypto');const originalDetail=await fs.readFile(originalSourceDirectory+'/js/wearables-detail-modal.ts');expect(cryptoModule.createHash('sha256').update(originalDetail).digest('hex')).toBe(oracle.originalDetailSHA256);oracle.originalManualSHA256=cryptoModule.createHash('sha256').update(await fs.readFile(originalSourceDirectory+'/js/wearables-manual.ts')).digest('hex');const capture=<T>(dictionary:Record<string,T>,key:string,value:T)=>{if(Object.prototype.hasOwnProperty.call(dictionary,key))deepStrictEqual(value,dictionary[key]);else dictionary[key]=structuredClone(value);};const rawStates:Record<string,NativeState>={},chartCallbacks:Record<string,unknown>={};const seeded=migrateProfileData({...createDefaultProfileData(),...structuredClone(wearableAcceptanceSeedFields)});const artifact=await originalArtifactInputs(modules,sheets);const server=await startKitServer(artifact.directory);ownedServer=server;const errors:string[]=[],csp:string[]=[],external:string[]=[],events:unknown[]=[],requests:unknown[]=[],phases:Array<{phase:number;steps:unknown[]}>=[];
 await installDiscussionFixture(context,{paused:true});await installOfflineStartupDiagnostics(context);await context.addInitScript(({seeded,registry,selection})=>{if(!['http:','https:'].includes(location.protocol)||localStorage.getItem('wearable-detail-acceptance-seeded'))return;localStorage.setItem('wearable-detail-acceptance-seeded','1');localStorage.setItem('labcharts-theme','dark');localStorage.setItem('labcharts-encryption-enabled','false');localStorage.setItem('labcharts-profiles',JSON.stringify(registry));localStorage.setItem('labcharts-active-profile','default');localStorage.setItem('labcharts-default-onboarded','profile-set');localStorage.setItem('labcharts-default-imported',JSON.stringify(seeded));localStorage.setItem('labcharts-default-units','EU');localStorage.setItem('labcharts-default-rangeMode','reference');localStorage.setItem('labcharts-default-lastViewV1','light');localStorage.setItem('labcharts-default-dashboardBiometricMetricsV1',JSON.stringify(selection));localStorage.setItem('labcharts-other-imported',JSON.stringify({foreign:'preserve unrelated raw bytes <&>'}));localStorage.setItem('labcharts-analytics-disabled','true');localStorage.setItem('labcharts-show-product-recs','false');localStorage.setItem('labcharts-last-manual-backup',new Date().toISOString());},{seeded,registry:wearableAcceptanceRegistry,selection:wearableAcceptanceSelection});
 const observe=(target:Page)=>target.on('pageerror',error=>errors.push(error.message));observe(page);context.on('page',observe);context.on('request',request=>{requests.push({url:request.url(),method:request.method(),body:request.postData()});const url=new URL(request.url());if(['http:','https:'].includes(url.protocol)&&url.origin!==server.origin)external.push(url.href);});await context.routeWebSocket('**/*',socket=>{external.push(socket.url());socket.close();});await context.exposeBinding('wearableAcceptanceEvent',(_,value:unknown)=>events.push(value));await context.exposeBinding('wearableAcceptanceCSP',(_,value:string)=>csp.push(value));await context.addInitScript(()=>{const observed=window as unknown as {wearableAcceptanceEvent(value:unknown):Promise<void>;wearableAcceptanceCSP(value:string):Promise<void>};for(const type of ['click','keydown','submit','change'])document.addEventListener(type,event=>{const target=event.target;if(!(target instanceof Element))return;const owner=target.closest('[data-wearable-action],[data-wearable-form],[data-wearable-log-action],[data-dashboard-widget-action]');if(!owner)return;void observed.wearableAcceptanceEvent({type,action:owner.getAttribute('data-wearable-action')||owner.getAttribute('data-wearable-form')||owner.getAttribute('data-wearable-log-action')||owner.getAttribute('data-dashboard-widget-action'),metric:owner.getAttribute('data-wearable-metric')||owner.getAttribute('data-dashboard-widget-id'),key:event instanceof KeyboardEvent?event.key:null,trusted:event.isTrusted,focus:document.activeElement?.id??null});},true);document.addEventListener('securitypolicyviolation',event=>void observed.wearableAcceptanceCSP(event.violatedDirective+':'+event.blockedURI));});
  await page.clock.setFixedTime(new Date(wearableAcceptanceTime));await ready(page,server.origin);
  await expect.poll(async()=>{const value=await profile(page,artifact.state);return Object.keys((value.live.wearableSummary as {metrics?:Record<string,unknown>}|undefined)?.metrics??{}).sort();}).toEqual(['bp_diastolic','bp_systolic','rhr','weight']);let previousNativeBaseline='',nativeBaselineStable=0;await expect.poll(async()=>{const current=JSON.stringify({profile:await profile(page,artifact.state),device:await page.evaluate(wearableDailyDeviceReceipt)});if(current===previousNativeBaseline)nativeBaselineStable++;else nativeBaselineStable=0;previousNativeBaseline=current;return nativeBaselineStable;},{timeout:30000,intervals:[250,500,1000]}).toBeGreaterThanOrEqual(3);oracle.profileStates['migrated-baseline']=await profile(page,artifact.state);expect(oracle.profileStates['migrated-baseline']!.live.biometrics).toEqual(wearableAcceptanceSeedFields.biometrics);const protectedStorage=await otherStorage(page),cache=await cacheReceipt(page,artifact),nativeDeviceBaseline=await page.evaluate(wearableDailyDeviceReceipt);oracle.deviceSchema=structuredClone(nativeDeviceBaseline.schema);oracle.dailyStates['migrated-baseline']=structuredClone(nativeDeviceBaseline.dailyRows);await info.attach('wearable-native-warm-baseline',{body:JSON.stringify({artifact,profile:await profile(page,artifact.state),device:await page.evaluate(wearableDailyDeviceReceipt),cache,protectedStorage},null,2),contentType:'application/json'});await qualifyOriginalWarm(oracle.profileStates['migrated-baseline'],nativeDeviceBaseline,protectedStorage,cache,artifact,server.origin);await server.close();await expect(fetch(server.origin+'/index.html')).rejects.toThrow();
  let currentPhase=0;const check=async(name:string,profileState:string,chartExpected:boolean)=>{const modal=page.locator('#detail-modal');capture(oracle.detailBodies,profileState+'/'+name,await modal.evaluate(wearableDetailBodyReceipt));const actualProfile=await profile(page,artifact.state);capture(oracle.profileStates,profileState,actualProfile);expect(await otherStorage(page)).toEqual(protectedStorage);expect(await cacheReceipt(page,artifact)).toEqual(cache);const device=await page.evaluate(wearableDailyDeviceReceipt);expect(device.name).toBe(nativeDeviceBaseline.name);expect(device.version).toBe(nativeDeviceBaseline.version);expect(device.schema).toEqual(oracle.deviceSchema);capture(oracle.dailyStates,profileState,device.dailyRows);expect(device.otherStores).toEqual(nativeDeviceBaseline.otherStores);let previousPaint='',stablePaintCount=0;if(chartExpected)await expect.poll(async()=>{const paint=await page.evaluate(wearableActualChartReceipt,artifact.state);if(paint.paint.alphaPixels>0&&paint.paint.sha256===previousPaint)stablePaintCount++;else stablePaintCount=0;previousPaint=paint.paint.sha256;return stablePaintCount;},{timeout:15000,intervals:[250,500,500]}).toBeGreaterThanOrEqual(3);const chart=chartExpected?await page.evaluate(wearableActualChartReceipt,artifact.state):null;if(chart){capture(oracle.chartStates,profileState+'/'+name,chart.rawNativeConfiguration);capture(chartCallbacks,profileState+'/'+name,{cases:chart.nativeCallbackCases,outputs:chart.nativeCallbackOutputs});expect(chart.nativeRegisteredInstance).toBe(true);expect(chart.paint.alphaPixels).toBeGreaterThan(0);expect(chart.paint.distinctRGBAColors).toBeGreaterThan(1);expect(chart.canvas.width).toBeGreaterThan(0);expect(chart.canvas.height).toBeGreaterThan(0);}const receipt={name,profileState,body:await modal.evaluate(wearableDetailBodyReceipt),raw:await modal.evaluate(e=>e.innerHTML),profile:actualProfile,device,chart};rawStates['phase-'+currentPhase+'/'+profileState+'/'+name]=receipt;const daily=device.dailyRows as {values:Array<{date:string;source:string;bp_systolic?:number;bp_diastolic?:number;rhr?:number;weight?:number;note?:string;tags?:string[]}>};if(profileState==='after-bp-save'||profileState==='after-same-date-merge'||profileState==='after-selected-pair-delete'){const written=daily.values.find(row=>row.source==='manual'&&row.date==='2026-08-06');expect(written).toBeDefined();expect(written!.rhr).toBe(61);expect(written!.tags).toEqual(['resting']);expect(written!.note).toBe('Synthetic note <&> \"paired\"');if(profileState==='after-selected-pair-delete'){expect(Object.prototype.hasOwnProperty.call(written,'bp_systolic')).toBe(false);expect(Object.prototype.hasOwnProperty.call(written,'bp_diastolic')).toBe(false);}else{expect(written!.bp_systolic).toBe(121);expect(written!.bp_diastolic).toBe(79);}if(profileState!=='after-bp-save')expect(written!.weight).toBe(71.5);}await info.attach('wearable-phase-'+currentPhase+'-'+name+'-raw',{body:JSON.stringify(receipt,null,2),contentType:'application/json'});await recordOriginalStep(currentPhase,receipt,page,artifact);return receipt;};
  // Every native state retains complete configuration, callback, device and
  // actual raw-pixel qualification through all three chronological phases.
  for(let phase=0;phase<3;phase++){currentPhase=phase;
   if(phase){expect(context.pages()).toHaveLength(0);page=await context.newPage();await page.clock.setFixedTime(new Date(wearableAcceptanceTime));await ready(page,server.origin);}await dashboard(page);const steps:unknown[]=[];const state=phase?'after-selected-pair-delete':'migrated-baseline';const trigger=await detail(page,'weight');steps.push(await check('weight-90d',state,true));const focusable=page.locator('#detail-modal').locator('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])');await focusable.first().focus();await page.keyboard.press(nativeTabKey(page, true));await expect(focusable.last()).toBeFocused();await page.keyboard.press(nativeTabKey(page));await expect(focusable.first()).toBeFocused();const ranges=page.locator('#detail-modal .wearable-detail-range');await keyboard(page,ranges.locator('[data-wearable-range="all"]'));await expect(ranges.locator('[data-wearable-range="all"]')).toBeFocused();steps.push(await check('weight-all',state,true));await keyboard(page,ranges.locator('[data-wearable-range="90d"]'));await expect(ranges.locator('[data-wearable-range="90d"]')).toHaveAttribute('aria-pressed','true');await expect(ranges.locator('[data-wearable-range="90d"]')).toBeFocused();await page.keyboard.press('Escape');await expect(page.locator('#modal-overlay')).toBeHidden();await expect(trigger).toBeFocused();
   await detail(page,'bp_systolic');await keyboard(page,page.locator('#detail-modal [data-wearable-action="open-detail-manual-add"]'));await expect(page.locator('#wlad-sys')).toBeFocused();await page.locator('#wlad-date').fill('2026-08-06');await page.locator('#wlad-sys').fill('80');await page.locator('#wlad-dia').fill('120');await keyboard(page,page.locator('#detail-modal .wearable-manual-add-form [type="submit"]'));await expect(page.locator('.notification-toast.error').filter({hasText:'Diastolic should be lower than systolic'})).toBeVisible();steps.push(await check('bp-invalid-form',state,true));
   if(!phase){await page.locator('#wlad-sys').fill('121');await page.locator('#wlad-dia').fill('79');await page.locator('#wlad-pulse').fill('61');await page.locator('#wlad-note').fill('  Synthetic note <&> "paired"  ');await activate(page,page.locator('#detail-modal .wearable-log-chip[data-tag="resting"]'));await keyboard(page,page.locator('#detail-modal .wearable-manual-add-form [type="submit"]'));await expect(page.locator('#detail-modal .wearable-manual-add-form')).toHaveCount(0);await expect(page.locator('#detail-modal .wearable-manual-entry[data-entry-date="2026-08-06"]')).toContainText('121');steps.push(await check('bp-after-save','after-bp-save',true));await page.keyboard.press('Escape');await expect(page.locator('#modal-overlay')).toBeHidden();
    await detail(page,'weight');await keyboard(page,page.locator('#detail-modal [data-wearable-action="open-detail-manual-add"]'));await expect(page.locator('#wlad-val')).toBeFocused();await page.locator('#wlad-date').fill('2026-08-06');await page.locator('#wlad-val').fill('71.5');await expect(page.locator('#wlad-note')).toHaveValue('');await keyboard(page,page.locator('#detail-modal .wearable-manual-add-form [type="submit"]'));await expect(page.locator('#detail-modal .wearable-manual-add-form')).toHaveCount(0);await expect(page.locator('#detail-modal .wearable-manual-entry[data-entry-date="2026-08-06"]')).toContainText('71.5');steps.push(await check('weight-after-merge','after-same-date-merge',true));await page.keyboard.press('Escape');await expect(page.locator('#modal-overlay')).toBeHidden();
    await detail(page,'bp_systolic');const remove=page.locator('#detail-modal [data-wearable-action="delete-detail-manual-entry"][data-wearable-date="2026-08-06"]');await keyboard(page,remove);const confirm=page.locator('#confirm-dialog-overlay');await expect(confirm).toHaveClass(/\bshow\b/);await expect(confirm.locator('#confirm-cancel')).toBeFocused();await keyboard(page,confirm.locator('#confirm-cancel'));await expect(confirm).not.toHaveClass(/\bshow\b/);steps.push(await check('bp-after-delete-cancel','after-same-date-merge',true));await keyboard(page,remove);await expect(confirm).toHaveClass(/\bshow\b/);await keyboard(page,confirm.locator('#confirm-ok'));await expect(confirm).not.toHaveClass(/\bshow\b/);await expect(page.locator('#detail-modal .wearable-manual-entry[data-entry-date="2026-08-06"]')).toHaveCount(0);steps.push(await check('bp-after-selected-pair-delete','after-selected-pair-delete',true));}
   else{await keyboard(page,page.locator('#detail-modal [data-wearable-action="close-detail-manual-add"]'));steps.push(await check('bp-after-cancel',state,true));}
   await page.keyboard.press('Escape');await expect(page.locator('#modal-overlay')).toBeHidden();await detail(page,'rhr');steps.push(await check('pulse-after-merge','after-selected-pair-delete',true));await page.keyboard.press('Escape');await expect(page.locator('#modal-overlay')).toBeHidden();phases.push({phase,steps});await page.close();expect(context.pages()).toHaveLength(0);
  }
  oracle.eventChronology=structuredClone(events);originalEventChronology=structuredClone(events);oracle.nativePOSTRequests=requests.filter(row=>(row as {method:string}).method==='POST').map(row=>{const request=row as {url:string;method:string;body:string|null};return{path:new URL(request.url).pathname,method:request.method,body:request.body};});expect(errors).toEqual([]);expect(csp).toEqual([]);expect(external).toEqual([]);expect(await originalArtifactInputs(modules,sheets)).toEqual(artifact);const captured={originalNativeBrowserCapture:true,project:info.project.name,oracle,chartCallbacks,rawStates,artifact,phases,events,requests,errors,csp,external,allSourceKnownMutationGuardsPassed:true,actualRealVendorChart:true,candidateAcceptanceClaimed:false};
  assert.deepEqual(captured.oracle,{...history.oracle,eventChronology:expectedEventChronology},'Complete original semantic oracle, exact platform chord events and native POST chronology');originalEventsQualified=true;
  assert.deepEqual(captured.phases.map(value=>({phase:value.phase,keys:(value.steps as NativeState[]).map(row=>row.profileState+'/'+row.name)})),history.phases.map(value=>({phase:value.phase,keys:value.steps.map(row=>row.profileState+'/'+row.name)})));
  assertWearableReferenceInventory(frames);await fixture.verify();
 } catch(error) {primary=error;present=true;}
 finally {
  if(ownedServer&&!ownedServer.state.offline)try{await ownedServer.close();}catch(error){cleanupError('original server close',error);}
  if(context)try{await context.close();}catch(error){cleanupError('original context close',error);}
  if(fixture)try{await fixture.cleanup();}catch(error){cleanupError('original fixture aftercheck/removal',error);}
  try {const originalProof=info.outputPath('wearable-same-browser-original-reference.json');await fs.writeFile(originalProof,JSON.stringify({project:info.project.name,browser:browser.browserType().name(),browserVersion:browser.version(),environment,eventChronology:originalEventChronology,historicalEventChronology:history.oracle.eventChronology,expectedEventChronology,eventChronologyQualified:originalEventsQualified,originalApplicationSHA256:'0d2741f9fdd336dd29c6a3012ea3cb4694e53b879147395fd6fd3e8f2bb4968a',frames:frames.map(({rgba,...frame})=>({...frame,rgbaBytes:rgba.length})),totalRGBABytes:totalBytes,historicalPaintMismatches,historicalDatasetCoordinateMismatches,historicalDatasetCoordinateGatePassed:frames.length===18&&historicalDatasetCoordinateMismatches.length===0,historicalPaintGatePassed:frames.length===18&&historicalPaintMismatches.length===0,lifecycle,cleanupErrors,completed:!present&&frames.length===18&&cleanupErrors.length===0&&lifecycle.errors.length===0&&lifecycle.dropped===0&&lifecycle.removed},null,2),{flag:'wx'});await info.attach('wearable-same-browser-original-reference',{path:originalProof,contentType:'application/json'});}catch(error){cleanupError('original reference attachment',error);}
 }
 if(present)throw primary;
 assert.equal(cleanupErrors.length,0,'Original reference cleanup and evidence must succeed');assert.equal(lifecycle.errors.length,0);assert.equal(lifecycle.dropped,0);assert(lifecycle.removed);
 let consumed=0,candidateBytes=0;
 const comparedStates:Array<{key:string;width:number;height:number;bytes:number;sha256:string;rawBytesEqual:true;completePaintEqual:true;datasetMetadataEqual:true}>=[];
 return {
  frames,historicalPaintMismatches,eventChronology:structuredClone(originalEventChronology),expectedEventChronology:structuredClone(expectedEventChronology),
  async compare(page:Page,key:string,chart:ChartReceipt,binding:Artifact['state'],observer:typeof OriginalObserver.wearableActualChartReceipt) {
   assert.equal(key,wearableReferenceKeys[consumed],'Every candidate state once in chronological order');const expected=frames[consumed];assert(expected);
   const actual=await rawFrame(page,key,chart,binding,observer);candidateBytes+=actual.rgba.length;assert(candidateBytes<=64*1024*1024,'Unchanged 64MiB candidate journey cap');assertWearableChartFrame(expected,actual);comparedStates.push({key,width:actual.width,height:actual.height,bytes:actual.rgba.length,sha256:actual.paint.sha256,rawBytesEqual:true,completePaintEqual:true,datasetMetadataEqual:true});consumed++;return expected.paint;
  },
  finish() {assert.equal(consumed,18);assertWearableReferenceInventory(frames);assert.equal(comparedStates.length,18);assert.deepEqual(comparedStates.map(row=>row.key),wearableReferenceKeys);return {frames:consumed,comparedStates:comparedStates.map(row=>({...row})),originalRGBABytes:totalBytes,candidateRGBABytes:candidateBytes,historicalOriginalPaintMismatches:historicalPaintMismatches,historicalOriginalDatasetCoordinateMismatches:historicalDatasetCoordinateMismatches};},
 };
}
