import assert from 'node:assert/strict';
import {isDeepStrictEqual} from 'node:util';
import {createHash} from 'node:crypto';
import {existsSync,readFileSync} from 'node:fs';
import {parseAppShellEntries} from '../../scripts/app-shell-budget.mjs';
import {parseModuleSpecifiers} from '../../scripts/architecture-map.mjs';
import {mergeProfileMutation} from '../../js/profile-data-writes.js';
import type {profile} from '../pwa/kit-native-receipts.js';
export type NativeProfileReceipt = Awaited<ReturnType<typeof profile>>;
export const noteText = 'Offline synthetic albumin note: <b>literal</b> & Ω';
export interface SaveWindow {minimum:number;maximum:number}
export function expectedNote(before: NativeProfileReceipt, timestamp:number, bounds:SaveWindow): NativeProfileReceipt {
  assert.ok(isDeepStrictEqual(before.live, before.stored), 'Whole live and durable baseline exact');
  assert.ok(isDeepStrictEqual(JSON.parse(before.rawCommitted), before.stored), 'Whole parsed native wire exact');
  assert.ok(isDeepStrictEqual(JSON.parse(before.rawProfiles!),before.profiles),'Complete native registry wire exact');
  assert.equal(before.current,'default');assert.equal(before.active,'default');
  assert.equal(Object.keys(before.stored).length,39,'Complete synthetic baseline');
  const draft=structuredClone(before.stored);
  assert.ok(isDeepStrictEqual(draft.markerNotes,{}),'Known empty marker-note baseline');
  draft.markerNotes={'proteins.albumin':noteText};
  const committed=mergeProfileMutation(before.stored,draft,structuredClone(before.stored));
  const other=structuredClone(committed);other.markerNotes={};
  assert.ok(isDeepStrictEqual(other,before.stored),'Only intended note changes');
  assert.ok(Number.isSafeInteger(bounds.minimum)&&Number.isSafeInteger(bounds.maximum)&&bounds.minimum<=bounds.maximum,'Actual ordered browser clock bounds');
  assert.ok(Number.isSafeInteger(timestamp)&&timestamp>=bounds.minimum&&timestamp<=bounds.maximum,'Exactly bounded native save timestamp');
  const rows=structuredClone(before.profiles) as Array<Record<string,unknown>>;
  const active=rows.filter(row=>row.id==='default');assert.equal(active.length,1,'Single native default registry row');
  assert.notEqual(timestamp,active[0]!.lastUpdated,'Note save changes timestamp');active[0]!.lastUpdated=timestamp;
  return {...structuredClone(before),profiles:rows,rawProfiles:JSON.stringify(rows),live:structuredClone(committed),stored:committed,rawCommitted:JSON.stringify(committed)};
}
export function requireExactReceipt(actual: NativeProfileReceipt, expected: NativeProfileReceipt): void {
  for(const field of Object.keys(expected) as Array<keyof NativeProfileReceipt>)
    assert.ok(isDeepStrictEqual(actual[field],expected[field]), 'Exact native profile receipt field '+field);
  assert.ok(isDeepStrictEqual(Object.keys(actual),Object.keys(expected)),'No extra/missing receipt fields');
}
export const authored=['js/marker-detail-complete-presentation.js','js/marker-detail-complete-compiler.js','js/components/MarkerDetailChrome.svelte.html.js','js/components/MarkerDetailBioAge.svelte.html.js','js/components/MarkerDetailNotes.svelte.html.js','js/marker-detail-results-presentation.js','js/marker-detail-compiler-anchors.js','js/components/MarkerDetailHistory.svelte.html.js','js/components/MarkerDetailRange.svelte.html.js','js/components/MarkerReferenceEditor.svelte.html.js'] as const;
/** Original ten-URL roster stays immutable above, including its two archived
 * private compiler protocols. Current genuine composition retains eight original
 * public URLs and adds these three public modal/projection entrypoints. */
export const currentNativeAuthored=['js/marker-detail-complete-presentation.js','js/components/MarkerDetailChrome.svelte.html.js','js/components/MarkerDetailBioAge.svelte.html.js','js/components/MarkerDetailNotes.svelte.html.js','js/marker-detail-results-presentation.js','js/components/MarkerDetailHistory.svelte.html.js','js/components/MarkerDetailRange.svelte.html.js','js/components/MarkerReferenceEditor.svelte.html.js','js/marker-detail-modal-presentation.js','js/marker-detail-projection.js','js/components/MarkerDetailModal.svelte.html.js']as const;
export const retiredNativeAuthored=['js/marker-detail-complete-compiler.js','js/marker-detail-compiler-anchors.js']as const;
const retiredArchiveHashes={
 'tests/fixtures/archived-native-ui/marker-detail-complete-compiler.ts':'bc3ef01680d3894026f296341aff05c2548fba7caf4a3ff0eb21622f0b459900',
 'tests/fixtures/archived-native-ui/marker-detail-compiler-anchors.ts':'fbb17cc4603f9e17976fdfbc5bca7cd2c6fcb5ff3af0ff05635d4231efadf925',
}as const;
const nativeAdapterImports={
 'js/marker-detail-complete-presentation.ts':['./components/MarkerDetailChrome.svelte.html.js','./components/MarkerDetailBioAge.svelte.html.js','./components/MarkerDetailNotes.svelte.html.js'],
 'js/marker-detail-results-presentation.ts':['./components/MarkerDetailHistory.svelte.html.js','./components/MarkerDetailRange.svelte.html.js','./components/MarkerReferenceEditor.svelte.html.js'],
 'js/marker-detail-modal-presentation.ts':['./components/MarkerDetailModal.svelte.html.js'],
}as const;
/** Exact migration roster qualification, never a missing-resource allowance.
 * The parsed maintained SW declaration, extant public files, genuine adapter
 * edges, retired canonical absence and unchanged original archives all agree. */
export function qualifyMarkerDetailNativeShell(declarations:string,read=(file:string)=>readFileSync(file,'utf8'),fileExists=(file:string)=>existsSync(file)):void {
 const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
 assert.equal(digest(JSON.stringify(authored)),'4d67836a7eca1674aa990efa03bcbc9f9886a27bd8a64d78a96f0c972d7e9024','Immutable original Marker Detail ten-URL roster');
 const current:readonly string[]=currentNativeAuthored,original:readonly string[]=authored;
 assert.deepEqual(original.filter(file=>!current.includes(file)),retiredNativeAuthored,'Only two private fragment compiler URLs retired');
 assert.deepEqual(current.filter(file=>!original.includes(file)),['js/marker-detail-modal-presentation.js','js/marker-detail-projection.js','js/components/MarkerDetailModal.svelte.html.js'],'Exactly three genuine composition URLs added');
 const shell=parseAppShellEntries(declarations);
 for(const module of current){assert.equal(shell.filter(url=>url==='/'+module).length,1,'Current native module in maintained APP_SHELL: '+module);assert(fileExists(module),'Extant current public module: '+module);}
 for(const module of retiredNativeAuthored){
  assert(!shell.includes('/'+module),'Retired private compiler absent from maintained APP_SHELL: '+module);
  for(const file of[module,module.replace(/\.js$/,'.ts'),module.replace(/\.js$/,'.d.ts')])assert(!fileExists(file),'Retired private compiler has no canonical runtime/source/declaration: '+file);
 }
 for(const[file,hash]of Object.entries(retiredArchiveHashes))assert.equal(digest(read(file)),hash,'Preserved independent original compiler archive: '+file);
 for(const[file,expected]of Object.entries(nativeAdapterImports)){
  const parsed=parseModuleSpecifiers(read(file),file);assert.deepEqual(parsed.nonLiteralDynamicImports,[]);
  assert.deepEqual(parsed.dependencies.map(edge=>edge.specifier),expected,'Complete current native adapter import edges: '+file);
 }
 const modal='js/marker-detail-modal-impl.ts',dependencies=parseModuleSpecifiers(read(modal),modal).dependencies.map(edge=>edge.specifier);
 assert.deepEqual(dependencies.filter(specifier=>['./marker-detail-modal-presentation.js','./marker-detail-projection.js'].includes(specifier)),['./marker-detail-modal-presentation.js','./marker-detail-projection.js'],'Actual modal imports both current composition entrypoints');
 for(const retired of retiredNativeAuthored)assert(!dependencies.includes('./'+retired.slice(3)),'Actual modal never imports retired private protocol');
}
// Preserve authored's immutable original roster above. The optimized modal
// composes genuine children and no longer imports the retired fragment compiler
// or each child's standalone HTML facade. Every listed owner still requires its
// complete current source bytes and cached chunk through artifactInputs.
const artifactOwners=['js/marker-detail-modal-presentation.js','js/marker-detail-projection.js','js/components/MarkerDetailModal.svelte.html.js','js/components/MarkerDetailModal.svelte','js/components/MarkerDetailChrome.svelte','js/components/MarkerDetailBioAge.svelte','js/components/MarkerDetailNotes.svelte','js/components/MarkerDetailHistory.svelte','js/components/MarkerDetailRange.svelte','js/components/MarkerPlacementSummary.svelte','js/marker-detail-results-presentation.js','js/components/MarkerReferenceEditor.svelte.html.js','js/components/MarkerReferenceEditor.svelte'] as const;
export const modules=[...artifactOwners,'js/marker-detail-modal.js','js/marker-detail-modal-impl.js','js/marker-detail-editing.js','js/marker-detail-store.js','js/marker-detail-actions.js','js/marker-detail-content.js','js/modal-trigger-memory.js','js/category-page-view.js','js/category-view-renderers.js','js/data-calculated-markers.js','js/profile-data-writes.js','js/state.js'] as const;
export const sheets=['css/marker-detail-modal.css','css/modal-shared.css','css/category-views.css','styles.css'] as const;
