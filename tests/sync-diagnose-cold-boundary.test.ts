// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {expect, it} from 'vitest';
import {parseModuleSpecifiers} from '../scripts/architecture-map.mjs';
const sha = (value: string) => createHash('sha256').update(value).digest('hex');
const read = (file: string) => fs.readFileSync(file, 'utf8');
const original = read('tests/fixtures/sync-diagnose-ui-cold-original.ts.txt');
const facade = read('js/sync-diagnose-ui.ts'), implementation = read('js/sync-diagnose-ui-impl.ts');
const originalPin = "7eefdb078503f97f0c7a6073eccebe964a9a62eb5eadf3db466758701e6736ec";
const componentPin = "486a96d64a10fdcd061468172703d0e84e6601976824a5e1e6991047cf4cb622";
function originalShow(source: string): string {
  const start = source.indexOf('export async function showSyncDiagnose(');
  const end = source.indexOf('// Copies the Sync diagnose snapshot', start);
  return source.slice(start, end < 0 ? undefined : end);
}
function restoredShow(source: string): string {
  return originalShow(source)
    .replace('export async function showSyncDiagnose(owner: SyncDiagnoseOpenOwner, cutoverEnabled: (profileId?: string | null) => boolean, copySyncDiagnose: (btn?: HTMLElement | null) => Promise<void>): Promise<void> {', 'export async function showSyncDiagnose() {')
    .replaceAll('  if (!owner.current()) return;\n', '')
    .replace('  owner.release();\n', '')
    .replace('cutoverEnabled(diagnostics.activeProfileId)', '_isPhase2CutoverEnabled(diagnostics.activeProfileId)')
    .replace("overlay.addEventListener('click', event => handleSyncDiagnoseActionClick(event, copySyncDiagnose));", "overlay.addEventListener('click', handleSyncDiagnoseActionClick);");
}
it('retains an independent pinned original, unchanged authored owner and exact configuration/clipboard/action dispatch bodies', () => {
  expect(sha(original)).toBe(originalPin);
  expect(sha(read('js/components/SyncDiagnoseModal.svelte'))).toBe(componentPin);
  const configuration = original.slice(original.indexOf('export function configureSyncDiagnoseUI('), original.indexOf('// Read-only modal'));
  expect(facade).toContain(configuration);
  expect(facade.slice(facade.indexOf('// Copies the Sync diagnose snapshot'))).toBe(original.slice(original.indexOf('// Copies the Sync diagnose snapshot')));
  const handler = original.slice(original.indexOf('function handleSyncDiagnoseActionClick'), original.indexOf('type SyncDiagnoseUIDependencies'));
  expect(implementation).toContain(handler.replace('function handleSyncDiagnoseActionClick(event: MouseEvent) {', 'function handleSyncDiagnoseActionClick(event: MouseEvent, copySyncDiagnose: (btn?: HTMLElement | null) => Promise<void>) {'));
  expect(restoredShow(implementation)).toBe(originalShow(original));
  expect(implementation.match(/if \(!owner.current\(\)\) return;/g)).toHaveLength(3);
  expect(implementation.match(/owner.release\(\);/g)).toHaveLength(1);
});
it('the exact inverse still rejects original UI text, lifecycle, event and render-input corruption', () => {
  for (const changed of [
    implementation.replace("overlay.className = 'modal-overlay'", "overlay.className = 'foreign-overlay'"),
    implementation.replace('openModalOverlay(overlay)', 'closeModalOverlay(overlay)'),
    implementation.replace("overlay.addEventListener('click', event => handleSyncDiagnoseActionClick(event, copySyncDiagnose));", "overlay.addEventListener('change', event => handleSyncDiagnoseActionClick(event, copySyncDiagnose));"),
    implementation.replace('quota: getRelayQuotaEstimate()', 'quota: null'),
  ]) {expect(changed).not.toBe(implementation); expect(restoredShow(changed)).not.toBe(originalShow(original));}
});
it('the exact identity-rotation function/type leaf keeps the old public presentation re-export and only moves its direct action import', () => {
  const leaf = read('js/sync-diagnose-identity-presentation.ts');
  expect(sha(leaf.slice(leaf.indexOf('export function renderSyncIdentityRotation')))).toBe("498f21ca7a50c6e4a10d51902623011cbb4541be4b731be5fe58d42f97ac2ee0");
  expect(sha(leaf.slice(leaf.indexOf('/** Only the original successful QR library call'), leaf.indexOf('export function renderSyncIdentityRotation')))).toBe("f28d89f5afff39f739434d2356d79a71891d51bf0ea274a85f6eae722841ae84");
  const publicSource = read('js/sync-diagnose-presentation.ts');
  const movedTypes = leaf.slice(leaf.indexOf('/** Only the original successful QR library call'), leaf.indexOf('export function renderSyncIdentityRotation'));
  const movedBody = leaf.slice(leaf.indexOf('export function renderSyncIdentityRotation'));
  const restored = publicSource
    .replace("export { renderSyncIdentityRotation } from './sync-diagnose-identity-presentation.js';\nexport type { GeneratedIdentityQR, SyncRotationView } from './sync-diagnose-identity-presentation.js';\n", '')
    .replace("import { renderHTML as diagnoseHTML } from './components/SyncDiagnoseModal.svelte.html.js';\n", "import { renderHTML as diagnoseHTML } from './components/SyncDiagnoseModal.svelte.html.js';\nimport { renderHTML as rotationHTML } from './components/SyncIdentityRotation.svelte.html.js';\n")
    .replace('/** Serialize the already projected', movedTypes + '/** Serialize the already projected') + movedBody;
  expect(sha(restored)).toBe("50896377ee3e60800348a087c5eddbeba12adc1d0fe2dc7ff9095ec53ab664c0");
  expect(publicSource).toContain("export { renderSyncIdentityRotation } from './sync-diagnose-identity-presentation.js';");
  expect(publicSource).toContain("export type { GeneratedIdentityQR, SyncRotationView } from './sync-diagnose-identity-presentation.js';");
  expect(read('js/sync-diagnose-identity-actions.ts')).toContain("import { renderSyncIdentityRotation, type GeneratedIdentityQR } from './sync-diagnose-identity-presentation.js';");
});
function closure(entry: string): string[] {
  const seen = new Set<string>();
  function visit(file: string) {
    if (seen.has(file)) return; seen.add(file);
    const source = read(file), script = file.endsWith('.svelte') ? source.match(/<script\b[^>]*>([\s\S]*?)<\/script>/)?.[1] ?? '' : source;
    for (const edge of parseModuleSpecifiers(script, file.endsWith('.svelte') ? file + '.ts' : file).dependencies.filter(edge => edge.kind === 'static')) {
      if (!edge.specifier.startsWith('.')) continue;
      const relative = edge.specifier.replace(/\.svelte\.(?:native|html)\.js$/, '.svelte').replace(/\.js$/, '.ts');
      const next = path.resolve(path.dirname(file), relative);
      if (fs.existsSync(next)) visit(next);
    }
  }
  visit(path.resolve(entry)); return [...seen].map(file => path.relative(process.cwd(), file));
}
it('the real public facade static closure excludes the Diagnose renderer/component and retains its typed default action context', () => {
  const files = closure('js/sync-diagnose-ui.ts');
  for (const forbidden of ['js/sync-diagnose-ui-impl.ts', 'js/sync-diagnose-render.ts', 'js/sync-diagnose-presentation.ts', 'js/components/SyncDiagnoseModal.svelte']) expect(files).not.toContain(forbidden);
  expect(files).toContain('js/sync-diagnose-actions-context.ts');
  expect(files).toContain('js/sync-diagnose-identity-presentation.ts');
  const imports = parseModuleSpecifiers(facade, 'js/sync-diagnose-ui.ts').dependencies.filter(edge => edge.kind === 'dynamic').map(edge => edge.specifier);
  expect(imports).toEqual(['./sync-diagnose-ui-impl.js?lazy-retry=1', './sync-diagnose-ui-impl.js']);
  expect(parseModuleSpecifiers(implementation, 'js/sync-diagnose-ui-impl.ts').dependencies.some(edge => edge.specifier === './sync-diagnose-ui.js')).toBe(false);
});
const url = (file: string) => pathToFileURL(path.resolve(file)).href;
function native(script: string): unknown {
  return JSON.parse(execFileSync(process.execPath, ['--max-old-space-size=768', '--input-type=module', '--eval', script], {cwd: process.cwd(), encoding: 'utf8', timeout: 15_000, maxBuffer: 16_384}).trim());
}
it('actual native ESM canonical/retry UI bodies stay distinct, public action identities and old rotation re-export stay exact', () => {
  expect(native(`
    import assert from 'node:assert/strict';
    await import(${JSON.stringify(url('tests/_node-shim.js'))});
    const facade=await import(${JSON.stringify(url('js/sync-diagnose-ui.js'))});
    const actions=await import(${JSON.stringify(url('js/sync-diagnose-actions.js'))});
    const canonical=await import(${JSON.stringify(url('js/sync-diagnose-ui-impl.js'))});
    const retry=await import(${JSON.stringify(url('js/sync-diagnose-ui-impl.js') + '?lazy-retry=1')});
    const presentation=await import(${JSON.stringify(url('js/sync-diagnose-presentation.js'))});
    const leaf=await import(${JSON.stringify(url('js/sync-diagnose-identity-presentation.js'))});
    const actionNames=['confirmBackfillBlockers','confirmCompactRelay','confirmDisablePhase2','confirmEnablePhase2','confirmResetDeltaTelemetry','confirmRotateIdentity','refreshRelayStorage'];
    assert.deepEqual(Object.keys(facade).sort(),[...actionNames,'configureSyncDiagnoseUI','copySyncDiagnose','showSyncDiagnose'].sort());
    for(const name of actionNames)assert.equal(facade[name],actions[name]);
    assert.deepEqual(Object.keys(canonical),['showSyncDiagnose']);assert.deepEqual(Object.keys(retry),['showSyncDiagnose']);
    assert.notEqual(canonical,retry);assert.notEqual(canonical.showSyncDiagnose,retry.showSyncDiagnose);
    assert.equal(presentation.renderSyncIdentityRotation,leaf.renderSyncIdentityRotation);
    console.log(JSON.stringify({distinctUI:true,publicActionsExact:true,rotationIdentityExact:true}));
  `)).toEqual({distinctUI: true, publicActionsExact: true, rotationIdentityExact: true});
});
it('actual native cold facade retries the fixed query after import failure, shares pending load, and reads live configuration without shadowing copy', () => {
  expect(native(`
    import assert from 'node:assert/strict';
    import {registerHooks} from 'node:module';
    import {JSDOM} from 'jsdom';
    await import(${JSON.stringify(url('tests/_node-shim.js'))});
    const dom=new JSDOM('<!doctype html><body><main id="main-content"><p>Retained</p></main></body>');
    Object.assign(globalThis,{document:dom.window.document,Element:dom.window.Element,Node:dom.window.Node,MutationObserver:dom.window.MutationObserver});
    const attempts=[],failure=new Error('first canonical import failed');
    let release;globalThis.uiGate=new Promise(resolve=>{release=resolve;});globalThis.uiInitializations=0;globalThis.uiCalls=[];
    const hooks=registerHooks({
      resolve(source,context,next){if(source.includes('sync-diagnose-ui-impl.js')){attempts.push(source);if(attempts.length===1)throw failure;}return next(source,context);},
      load(url,context,next){if(url.includes('/sync-diagnose-ui-impl.js?lazy-retry=1'))return{format:'module',shortCircuit:true,source:'globalThis.uiInitializations++;await globalThis.uiGate;export async function showSyncDiagnose(owner,cutover,copy){if(!owner.current())throw Error("stale test owner");globalThis.uiCalls.push({cutover:cutover("synthetic-profile"),copy:copy===globalThis.expectedCopy});owner.release();}'};return next(url,context);},
    });
    const facade=await import(${JSON.stringify(url('js/sync-diagnose-ui.js'))});
    const context=await import(${JSON.stringify(url('js/sync-diagnose-actions-context.js'))});
    assert.equal(context.currentSyncEnabled(),false);
    facade.configureSyncDiagnoseUI({isSyncEnabled:()=>true,isPhase2CutoverEnabled:()=>false});
    assert.equal(context.currentSyncEnabled(),true);facade.configureSyncDiagnoseUI({isSyncEnabled:undefined});assert.equal(context.currentSyncEnabled(),true);
    globalThis.expectedCopy=facade.copySyncDiagnose;
    await assert.rejects(facade.showSyncDiagnose(),error=>error===failure);
    const older=facade.showSyncDiagnose(),newer=facade.showSyncDiagnose();
    for(let n=0;n<20&&globalThis.uiInitializations!==1;n++)await new Promise(setImmediate);
    assert.equal(globalThis.uiInitializations,1);facade.configureSyncDiagnoseUI({isPhase2CutoverEnabled:()=>true});
    release();assert.equal(await older,undefined);assert.equal(await newer,undefined);
    facade.configureSyncDiagnoseUI({isPhase2CutoverEnabled:()=>false});assert.equal(await facade.showSyncDiagnose(),undefined);
    assert.deepEqual(attempts,['./sync-diagnose-ui-impl.js','./sync-diagnose-ui-impl.js?lazy-retry=1']);
    assert.deepEqual(globalThis.uiCalls,[{cutover:true,copy:true},{cutover:false,copy:true}]);assert.equal(globalThis.uiInitializations,1);
    hooks.deregister();dom.window.close();
    console.log(JSON.stringify({retryExact:true,loadOnce:true,liveConfiguration:true,latestRequestOnly:true}));
  `)).toEqual({retryExact: true, loadOnce: true, liveConfiguration: true, latestRequestOnly: true});
});
