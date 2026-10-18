import {restoreReviewedMigrationSource} from './helpers/migration-review-exact-source-inverse.js';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import postcss from 'postcss';
import {expect,it} from 'vitest';
import {compileInlineStyleMap,buildInlineStyleMaps} from '../scripts/build-inline-style-maps.mjs';
import {inlineStyleMapOwners} from '../scripts/inline-style-map-owners.mjs';
import {componentStaticStyles} from '../js/component-inline-style-map.generated.js';
interface Style {key:string;utility:string;value:string;declarations:number}
interface Edit {start:number;end:number;before:string;after:string;keys:string[]}
interface Component {file:string;beforeSha256:string;afterSha256:string;edits:Edit[]}
const text=readFileSync('tests/fixtures/component-inline-style-original.json','utf8');
const original:{propertyOccurrences:number;styles:Style[];components:Component[]}=JSON.parse(text);
const owner=inlineStyleMapOwners.find(row=>row.id==='component-inline');
if(!owner)throw new Error('Missing canonical component inline owner');
const inputPath=path.resolve(owner.input),input=readFileSync(inputPath,'utf8');
const producerText=readFileSync('tests/fixtures/component-inline-producers-original.json','utf8');
const producers:Component[]=JSON.parse(producerText);
const styles=[...original.styles,{key:'categoryCardRail',utility:'component-inline-category-card-rail',value:'margin-top:8px;width:100%',declarations:2}];
const expected=Object.fromEntries(styles.map(row=>[row.key,row.value]));
async function qualify(source=input){
 const result=await compileInlineStyleMap(source,inputPath,process.cwd(),owner!);
 expect(result.values).toEqual(expected);
 return result;
}
const customMarkerHandoffBefore = `  } else if (action === 'open-custom-marker') {
    openCreateMarkerFromNavRuntime();
  } else if (action === 'toggle-group') {`;
const customMarkerHandoffFixed = `  } else if (action === 'open-custom-marker') {
    if (document.getElementById('sidebar-nav')?.classList.contains('mobile-open')) closeMobileSidebar();
    openCreateMarkerFromNavRuntime();
  } else if (action === 'toggle-group') {`;
function restoreReviewedComponentSource(file:string,source:string){
 if(file==='js/nav.ts'){
  // Qualify the real mobile handoff repair separately from the immutable
  // style-port proof, then retain its original complete-source SHA checks.
  expect(source.split(customMarkerHandoffFixed).length-1).toBe(1);
  source=source.replace(customMarkerHandoffFixed,customMarkerHandoffBefore);
 }
 return restoreReviewedMigrationSource(file,source);
}
function restoreSource(source:string,record:Component){
 let delta=0;
 const edits=record.edits.map(edit=>{
  const start=edit.start+delta,end=start+edit.after.length;delta+=edit.after.length-edit.before.length;
  expect(source.slice(start,end)).toBe(edit.after);
  return{start,end,original:edit.before};
 });
 let restored=source;
 for(const edit of edits.sort((a,b)=>b.start-a.start))restored=restored.slice(0,edit.start)+edit.original+restored.slice(edit.end);
 expect(crypto.createHash('sha256').update(restored).digest('hex')).toBe(record.beforeSha256);
 return restored;
}
it('pins independently captured literals from29components/76property occurrences and closes both opaque producer ports into25recipes/47decl',async()=>{
 expect(crypto.createHash('sha256').update(text).digest('hex')).toBe('51fbeac49720595379d05bf969382cafea8362582a18feed0d9673c2b00b9a57');
 expect(original.components).toHaveLength(29);expect(original.propertyOccurrences).toBe(76);
 expect(original.styles).toHaveLength(24);expect(original.styles.reduce((sum,row)=>sum+row.declarations,0)).toBe(45);
 expect(owner.declarationCount).toBe(47);expect(owner.recipes).toHaveLength(25);
 expect(crypto.createHash('sha256').update(producerText).digest('hex')).toBe('43371b79864131d28ad7360192e18e8bd0ad76e19885c299a327f0b5a633d272');
 expect(producers).toHaveLength(2);
 const result=await qualify();
 expect(componentStaticStyles).toEqual(expected);expect(Object.isFrozen(componentStaticStyles)).toBe(true);
 expect(readFileSync(owner.output,'utf8')).toBe(result.javascript);
 expect(readFileSync(owner.output.replace(/\.js$/,'.d.ts'),'utf8')).toBe(result.declaration);
 await buildInlineStyleMaps(process.cwd(),[owner],true);
});
it.each(original.components)('$file changes only its exact staticstyle bindings and one typed import',record=>{
 const source=restoreReviewedComponentSource(record.file,readFileSync(record.file,'utf8'));
 expect(crypto.createHash('sha256').update(source).digest('hex')).toBe(record.afterSha256);
 const restored=restoreSource(source,record);
 expect(restored).not.toContain('componentStaticStyles');
 expect(record.edits.filter(edit=>edit.before==='')).toHaveLength(1);
});
it.each(producers)('$file closes its opaque style port with only an exact binding and one typed import',record=>{
 const source=restoreReviewedComponentSource(record.file,readFileSync(record.file,'utf8'));
 expect(crypto.createHash('sha256').update(source).digest('hex')).toBe(record.afterSha256);
 restoreSource(source,record);
 expect(record.edits).toHaveLength(2);
 expect(record.edits.filter(edit=>edit.before==='')).toHaveLength(1);
});
it.each(styles)('rejects an actual value mutation in $key',async row=>{
 const tree=postcss.parse(input);let changed=false;
 tree.walkAtRules('utility',rule=>{
  if(rule.params!==row.utility)return;
  const declaration=rule.nodes?.find(node=>node.type==='decl');
  if(declaration?.type!=='decl')throw new Error('Missing actual owned declaration');
  declaration.value=declaration.value==='initial'?'inherit':'initial';changed=true;
 });
 expect(changed).toBe(true);
 await expect(qualify(tree.toString())).rejects.toThrow();
});
it('rejects a wrong component recipe binding before any original-source reconstruction',()=>{
 const record=original.components.find(row=>row.file.endsWith('/CategoryDataTable.svelte'));
 if(!record)throw new Error('Missing category literal fixture');
 const source=readFileSync(record.file,'utf8'),changed=source.replace('componentStaticStyles.categoryEmpty','componentStaticStyles.hidden');
 expect(changed).not.toBe(source);expect(()=>restoreSource(changed,record)).toThrow();
});
it('preserves dynamic interpolation syntax, empty/undefined branches and static state-port values',()=>{
 expect(componentStaticStyles.rangeLowStart).toBe('left:0%;');
 expect(readFileSync('js/components/CategoryRangeRail.svelte','utf8')).toContain('style="{componentStaticStyles.rangeLowStart}width:{view.lowWidth}%"');
 expect(readFileSync('js/components/MarkerDetailRange.svelte','utf8')).toContain('style="{componentStaticStyles.rangeLowStart}width:{node.width}%"');
 expect(readFileSync('js/components/SunDataSourcePresentation.svelte','utf8')).toContain("style={view.showSelfhost ? '' : componentStaticStyles.hidden}");
 expect(readFileSync('js/components/CategoryDataRows.svelte','utf8')).toContain('style={row.id?componentStaticStyles.pointer:undefined}');
});

it.each(['js/components/ChatShell.svelte','js/components/RoutstrSettings.svelte'])('rejects foreign current code while exactly reconstructing the reviewed later changes in %s',file=>{
 const source=readFileSync(file,'utf8');
 expect(()=>restoreReviewedMigrationSource(file,source+'\n<!-- foreign source -->')).toThrow();
 const changed=file.endsWith('ChatShell.svelte')?source.replace('inert={!layout.open || !layout.railOpen}','inert={false}'):
  source.replace('actions.refreshWallet();','actions.mints();');
 expect(changed).not.toBe(source);expect(()=>restoreReviewedMigrationSource(file,changed)).toThrow();
});


it.each(['missing close','different action','reordered close'] as const)('rejects a corrupted current Custom markers handoff: %s',mutation=>{
 const file='js/nav.ts',source=readFileSync(file,'utf8');
 const corrupted=mutation==='missing close'?customMarkerHandoffBefore:
  mutation==='different action'?customMarkerHandoffFixed.replace("action === 'open-custom-marker'","action === 'open-client-list'"):
  `  } else if (action === 'open-custom-marker') {
    openCreateMarkerFromNavRuntime();
    if (document.getElementById('sidebar-nav')?.classList.contains('mobile-open')) closeMobileSidebar();
  } else if (action === 'toggle-group') {`;
 const changed=source.replace(customMarkerHandoffFixed,corrupted);
 expect(changed).not.toBe(source);
 expect(()=>restoreReviewedComponentSource(file,changed)).toThrow();
});
