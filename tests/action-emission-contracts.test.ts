import fs from 'node:fs';import {expect,it}from'vitest';import*as ts from'typescript/unstable/ast';
import{withParsedSource}from'../scripts/native-typescript-ast.js';
import{REVIEWED_ATTRIBUTE_RECORDS,qualifyFixedAttributeReturn}from'./helpers/action-emission-contracts.js';
import{projectWearableManualLog}from'../js/wearables-entry-presentation.js';
import{captureNutritionContextActionAttributes}from'../js/nutrition-context-card-view.js';
function keys(file:string,owner:string,property?:string):string[]{
 return withParsedSource(fs.readFileSync(file,'utf8'),file,parsed=>{
  const declaration=parsed.statements.find(node=>ts.isInterfaceDeclaration(node)&&node.name.text===owner);
  if(!declaration||!ts.isInterfaceDeclaration(declaration))throw new Error('Missing reviewed interface '+owner);
  let members:readonly ts.TypeElement[]=declaration.members;
  if(property){const item=members.find(node=>ts.isPropertySignatureDeclaration(node)&&node.name.getText(parsed)===property);
   if(!item||!ts.isPropertySignatureDeclaration(item)||!item.type||!ts.isTypeLiteralNode(item.type))throw new Error('Spread must retain a closed literal tuple: '+owner+'.'+property);members=item.type.members;}
  return members.map(node=>{if(!ts.isPropertySignatureDeclaration(node)||!node.modifiers?.some(modifier=>modifier.kind===ts.SyntaxKind.ReadonlyKeyword))throw new Error('Spread contract must have readonly named keys');
   if(ts.isIdentifier(node.name)||ts.isStringLiteralLikeNode(node.name))return node.name.text;throw new Error('Unreviewed computed/indexed attribute key');}).sort();
 });
}
it.each([
 ['js/components/CorrelationWorkspaceChrome.svelte','view.panel','js/correlation-workspace-chrome-presentation.ts','CorrelationAnalysisPanel',undefined],
 ['js/components/CorrelationWorkspaceUsageSegments.svelte','row.accessibility','js/correlation-workspace-chrome-presentation.ts','CorrelationUsageSegment','accessibility'],
 ['js/components/MarkerPairComparison.svelte','view.scroll','js/therapy-comparison-presentation.ts','MarkerPairComparisonView','scroll'],
 ['js/components/TherapyComparisonResults.svelte','view.scroll','js/therapy-comparison-presentation.ts','TherapyComparisonView','scroll'],
 ['js/components/SunBodyPicker.svelte','figure.placement','js/sun-body-picker-presentation.ts','BodyPickerFigureView','placement'],
]as const)('binds %s spread %s to actual closed readonly attribute keys',(component,spread,file,owner,property)=>{
 expect(keys(file,owner,property)).toEqual([...REVIEWED_ATTRIBUTE_RECORDS[component]![spread]!].sort());
});
it('keeps validated public nutrition data attributes explicit without inventing namespace restrictions',()=>{
 expect(captureNutritionContextActionAttributes({'data-report-action':'literal "<&>','data-profile-share-probe':'native'})).toEqual({'data-report-action':'literal "<&>','data-profile-share-probe':'native'});
 // Deliberately invalid runtime calls exercise the existing public validation.
 // @ts-expect-error event attributes are outside the declared data-only contract.
 expect(()=>captureNutritionContextActionAttributes({onclick:'alert(1)'})).toThrow(TypeError);
 // @ts-expect-error arbitrary objects are outside the declared string-value contract.
 expect(()=>captureNutritionContextActionAttributes({'data-probe':{}})).toThrow(TypeError);
 expect(()=>captureNutritionContextActionAttributes({'data-bad key':'x'})).toThrow(TypeError);
});

it('binds new manual-form spreads to the actual bounded native attribute decoder',()=>{
 const project=(form:string)=>projectWearableManualLog({mode:'detail-weight',today:'2026-10-15',note:()=>({id:'note'}),form:()=>form,cancel:()=> 'data-wearable-action="cancel-detail-manual-add"'});
 expect(project('data-wearable-form="add" data-wearable-kind="weight"').form).toEqual({'data-wearable-form':'add','data-wearable-kind':'weight'});
 for(const fragment of ['data-report-action="foreign"','onclick="alert(1)"','data-wearable-form="add" data-extra="foreign"','data-wearable-form="<button>"'])expect(()=>project(fragment)).toThrow('Unexpected wearable delegated attribute fragment');
 const keys=['data-wearable-action','data-wearable-form','data-wearable-kind','data-wearable-metric'].sort();
 for(const field of ['view.save','view.cancel','view.form'])expect([...REVIEWED_ATTRIBUTE_RECORDS['js/components/WearableManualLog.svelte']![field]!].sort()).toEqual(keys);
});

it('qualifies Sync literal ARIA passthrough and rejects helper ownership mutations',()=>{
 const file='js/components/SyncDiagnoseModal.svelte',source=fs.readFileSync(file,'utf8');
 const expected=REVIEWED_ATTRIBUTE_RECORDS[file]!['storageValueAttributes(s.pct)']!;
 expect(expected).toEqual(['aria-valuenow']);
 expect(()=>qualifyFixedAttributeReturn(source,file,'storageValueAttributes',expected)).not.toThrow();
 const original="return {'aria-valuenow': value};";
 for(const replacement of ["return {'data-wearable-action': value};","return {'aria-valuenow': value, 'data-report-action': value};","return {[value]: value};","return {...unknown};","return {'aria-valuenow': String(value)};","storageValueAttributes = other; return {'aria-valuenow': value};"]){
  const changed=source.replace(original,replacement);expect(changed).not.toBe(source);expect(()=>qualifyFixedAttributeReturn(changed,file,'storageValueAttributes',expected)).toThrow();
 }
 const rebound=source.replace('</script>',"storageValueAttributes = other;</script>");expect(rebound).not.toBe(source);expect(()=>qualifyFixedAttributeReturn(rebound,file,'storageValueAttributes',expected)).toThrow();
});
