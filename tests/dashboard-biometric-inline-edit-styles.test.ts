// @vitest-environment node
import {readFileSync} from 'node:fs';
import path from 'node:path';
import postcss from 'postcss';
import {expect,it} from 'vitest';
import {compileDashboardLabMarkerDataStyles,dashboardLabMarkerDataOwnership} from '../scripts/dashboard-lab-markers-style-ownership.mjs';
import {compileNativeStyleBodies} from '../scripts/native-recipe-styles.mjs';
import {restoreInlineBiometricRemoveSource,restoreInlineBiometricRemoveCss} from './helpers/dashboard-biometric-style-inverse.js';
const inputPath=path.resolve('css/dashboard-data.base.css'),input=readFileSync(inputPath,'utf8');
const utility='dashboard-biometric-inline-edit-remove';
const selector='.db-biometric-manual-empty:has(.wearable-log-form) + .db-biometric-remove';
const recipe='@utility '+utility+' {\n  display: none;\n}\n';
const receiver=selector+' { @apply gb:'+utility+'; }\n';
const compiledRule=selector+' { display: none; }\n';
it('adds only the editing-specific sibling hide and preserves every other stylesheet byte and Remove declaration',async()=>{
 expect(input.split(recipe)).toHaveLength(2);expect(input.split(receiver)).toHaveLength(2);
 const priorSource=restoreInlineBiometricRemoveSource(input);
 expect(priorSource).toBe(input.replace(recipe,'').replace(receiver,''));
 expect(dashboardLabMarkerDataOwnership.receivers.at(-1)).toEqual([utility,selector,null]);
 // The exact immediately prior owner retains all earlier recipe/geometry fixes.
 const priorOwnership={...dashboardLabMarkerDataOwnership,receivers:dashboardLabMarkerDataOwnership.receivers.slice(0,-1),declarationCount:dashboardLabMarkerDataOwnership.declarationCount-1};
 const prior=await compileNativeStyleBodies(priorSource,inputPath,process.cwd(),priorOwnership);
 const current=await compileDashboardLabMarkerDataStyles(input,inputPath,process.cwd());
 expect(restoreInlineBiometricRemoveCss(current.css)).toBe(prior.css);
 const matches:postcss.Rule[]=[];postcss.parse(current.css).walkRules(rule=>{if(rule.selector===selector)matches.push(rule);});
 expect(matches).toHaveLength(1);expect(matches[0]!.parent?.type).toBe('root');
 expect(matches[0]!.nodes.map(node=>node.type==='decl'?[node.prop,node.value,!!node.important]:node.type)).toEqual([['display','none',false]]);
 expect(priorSource).toContain('@utility dashboard-biometric-db-biometric-remove {\n  position: absolute;\n  top: 8px;\n  right: 8px;\n  width: 30px;\n  height: 30px;');
 expect(priorSource).toContain('@utility dashboard-biometric-db-biometric-remove-pointer-coarse {\n  width: 44px;\n  height: 44px;\n  opacity: 1;');
});
it('removes only the qualified inline-edit rule and its trailing LF from compiled CSS',()=>{
 const before='.foreign { color: red; }\n',after='.tail { color: blue; }\n';
 expect(restoreInlineBiometricRemoveCss(before+compiledRule+after)).toBe(before+after);
});
it.each([
 ['missing owner',(s:string)=>s.replace(recipe,'')],
 ['duplicate recipe',(s:string)=>s+recipe],
 ['display value',(s:string)=>s.replace(recipe,recipe.replace('none','block'))],
 ['priority',(s:string)=>s.replace(recipe,recipe.replace('none','none !important'))],
 ['missing receiver',(s:string)=>s.replace(receiver,'')],
 ['duplicate receiver',(s:string)=>s+receiver],
 ['broader receiver',(s:string)=>s.replace(receiver,receiver.replace(':has(.wearable-log-form)',''))],
 ['wrong editor',(s:string)=>s.replace(receiver,receiver.replace('.wearable-log-form','.foreign-editor'))],
 ['non-sibling scope',(s:string)=>s.replace(receiver,receiver.replace(' + ',' '))],
 ['media ancestry',(s:string)=>s.replace(receiver,'@media (pointer: coarse) {\n'+receiver+'}\n')],
] as const)('rejects inline-edit source corruption: %s',(_,mutate)=>{
 const changed=mutate(input);expect(changed).not.toBe(input);expect(()=>restoreInlineBiometricRemoveSource(changed)).toThrow();
});
it.each([
 ['display value',(s:string)=>s.replace('none','block')],
 ['priority',(s:string)=>s.replace('none','none !important')],
 ['extra declaration',(s:string)=>s.replace('none;','none; opacity: 0;')],
 ['broader receiver',(s:string)=>s.replace(':has(.wearable-log-form)','')],
 ['duplicate receiver',(s:string)=>s+s],
 ['media ancestry',(s:string)=>'@media (pointer: coarse) {\n'+s+'}\n'],
] as const)('rejects inline-edit compiled corruption: %s',(_,mutate)=>{
 const changed=mutate(compiledRule);expect(changed).not.toBe(compiledRule);expect(()=>restoreInlineBiometricRemoveCss(changed)).toThrow();
});
