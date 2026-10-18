import {sharedModalOwnership} from '../scripts/context-modal-style-ownership.mjs';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import postcss from 'postcss';
import {expect,it} from 'vitest';
import {compile} from '@tailwindcss/node';
import {compileModalPresentationStyles,syncDiagnoseOwnership,modalPresentationOwnership} from '../scripts/modal-presentation-style-ownership.mjs';
import {profileSharingOwnership} from '../scripts/profile-sharing-style-ownership.mjs';
import {emojiPickerOwnership} from '../scripts/emoji-picker-style-ownership.mjs';
interface Receiver {utility:string;selector:string;condition:string|null;before:string;after:string}
const fixture=JSON.parse(readFileSync('tests/fixtures/sync-diagnose-styles-original.json','utf8')) as {receivers:Receiver[];rules:number;declarations:number};
const inputPath=path.resolve('css/modal-shared.base.css'),input=readFileSync(inputPath,'utf8');
function declarations(body:string){return (()=>{const rule=postcss.parse('a{'+body+'}').first;if(rule?.type!=='rule')throw new Error('Expected receiver rule');return rule.nodes;})().map(n=>{expect(n.type).toBe('decl');if(n.type!=='decl')throw new Error('Foreign declaration');return [n.prop,n.value,n.important===true];});}
it('owns exactly75 Diagnose bodies/203 declarations beside unchanged34 Sharing receivers',async()=>{
 expect(fixture.receivers).toHaveLength(75);expect(syncDiagnoseOwnership.declarationCount).toBe(203);
 expect(profileSharingOwnership.receivers).toHaveLength(34);expect(profileSharingOwnership.declarationCount).toBe(154);
 expect(syncDiagnoseOwnership.receivers).toHaveLength(75);expect(syncDiagnoseOwnership.declarationCount).toBe(203);
 expect(emojiPickerOwnership.receivers).toHaveLength(12);expect(emojiPickerOwnership.declarationCount).toBe(58);
 const originalOwners=[...profileSharingOwnership.receivers,...syncDiagnoseOwnership.receivers];
 expect(originalOwners).toHaveLength(109);
 expect(profileSharingOwnership.declarationCount+syncDiagnoseOwnership.declarationCount).toBe(357);
 expect(modalPresentationOwnership.receivers).toEqual([...originalOwners,...emojiPickerOwnership.receivers,...sharedModalOwnership.receivers]);
 expect(sharedModalOwnership.receivers).toHaveLength(82);expect(sharedModalOwnership.declarationCount).toBe(355);
 expect(modalPresentationOwnership.receivers).toHaveLength(203);expect(modalPresentationOwnership.declarationCount).toBe(770);
 expect(syncDiagnoseOwnership.receivers).toEqual(fixture.receivers.map(r=>[r.utility,r.selector,r.condition]));
 const compiled=await compileModalPresentationStyles(input,inputPath,path.resolve('.'));
 for(const receiver of fixture.receivers){const rows=compiled.receivers.filter(r=>r.utility===receiver.utility);expect(rows).toHaveLength(1);expect(rows[0]!.selector).toBe(receiver.selector);expect(rows[0]!.condition).toBe(receiver.condition);expect(declarations(rows[0]!.body)).toEqual(declarations(receiver.before));}
});
it.each([
 ['unknown apply',()=>input.replace('@apply gb:sync-diagnose-modal;','@apply gb:foreign-diagnose;')],
 ['extra declaration',()=>input.replace('@apply gb:sync-diagnose-modal;','@apply gb:sync-diagnose-modal; color:red;')],
 ['changed media',()=>input.replace('@media (max-width: 560px)','@media (max-width: 559px)')],
 ['duplicate receiver',()=>input+'\n.sync-diagnose-modal { color:red; }'],
] as const)('rejects undeclared ownership: %s',async(_name,mutate)=>{const source=mutate();expect(source).not.toBe(input);await expect(compileModalPresentationStyles(source,inputPath,path.resolve('.'))).rejects.toMatchObject({code:'ERR_ASSERTION'});});

// Independent inline-owner oracle; Tailwind must keep each receiver's native declarations.
interface RotationReceiver {utility:string;originalStyle:string;declarations:number}
const rotations=(JSON.parse(readFileSync('tests/fixtures/sync-diagnose-styles-original.json','utf8')) as {rotationStaticReceivers:RotationReceiver[]}).rotationStaticReceivers;
const rotationPath=path.resolve('css/sync-rotation.tailwind.css');
const rotationSource=readFileSync(rotationPath,'utf8');
const rotationScope=String.raw`&:is(.modal.gb\:sync-rotation-modal, .modal.gb\:sync-rotation-modal *)`;
async function validateRotation(source:string) {
 const compiler=await compile(source,{base:path.resolve('.'),from:rotationPath,polyfills:0,onDependency:dependency=>{expect(path.isAbsolute(dependency)).toBe(true);}});
 const output=postcss.parse(compiler.build(rotations.map(row=>'gb:'+row.utility)));
 const rules=output.nodes.filter(node=>node.type!=='comment');
 expect(rules).toHaveLength(15);expect(rotations).toHaveLength(15);
 for(const receiver of rotations){
  const selector=String.raw`.gb\:`+receiver.utility+rotationScope.slice(1);
  const matches=rules.filter(node=>node.type==='rule'&&node.selector===selector);
  expect(matches).toHaveLength(1);const rule=matches[0];if(rule?.type!=='rule')throw new Error('Expected exact unlayered rotation utility');
  expect(rule.nodes.every(node=>node.type==='decl')).toBe(true);
  expect(declarations(rule.nodes.map(node=>node.toString()).join(';'))).toEqual(declarations(receiver.originalStyle));
  expect(rule.nodes).toHaveLength(receiver.declarations);
 }
 return output;
}
it('emits only15 unlayered rotation receivers with exact ordered inline declarations',async()=>{
 expect(rotationSource).toContain('@theme prefix(gb) {}');
 expect(rotationSource).toContain('@import "tailwindcss/utilities.css" prefix(gb) source(none);');
 expect(rotationSource).not.toMatch(/@layer|@import "tailwindcss"/);
 await validateRotation(rotationSource);
});
it.each([
 ['full preflight import',()=>rotationSource.replace('"tailwindcss/utilities.css"','"tailwindcss"')],
 ['foreign scope',()=>rotationSource.replaceAll(rotationScope,'&:is(.foreign-modal)')],
 ['extra declaration',()=>rotationSource.replace('max-width:560px;','max-width:560px; color:red;')],
 ['missing receiver',()=>rotationSource.replace('@utility sync-rotation-modal {', '@utility foreign-rotation-modal {')],
 ['foreign rule',()=>rotationSource+'\n.foreign-modal { color:red; }'],
] as const)('rejects rotation compiler/cascade scope corruption: %s',async(_name,mutate)=>{
 const changed=mutate();expect(changed).not.toBe(rotationSource);await expect(validateRotation(changed)).rejects.toThrow();
});
