import {describe,expect,it} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import postcss from 'postcss';
import {compileDashboardMtdnaStudyStyles,dashboardMtdnaStudyOwnership} from '../scripts/dashboard-mtdna-study-style-ownership.mjs';
const root=process.cwd(),inputPath=path.join(root,'css/dashboard-data.base.css');
// Retained independently qualified leaf recipe; the complete live stylesheet is checked by panel styles below.
const input=fs.readFileSync(new URL('./fixtures/dashboard-mtdna-study-source.css',import.meta.url),'utf8');
const original=fs.readFileSync(new URL('./fixtures/dashboard-mtdna-study-original.css',import.meta.url),'utf8');
function signature(css:string){
  const tree=postcss.parse(css);const result:unknown[]=[];
  tree.walk(node=>{
    if(node.type==='rule')result.push(['rule',node.selector]);
    else if(node.type==='decl')result.push(['decl',node.prop,node.value,node.important]);
    else if(node.type==='atrule')result.push(['at',node.name,node.params]);
    else if(node.type==='comment')result.push(['comment',node.text]);
  });return result;
}
function foreign(css:string){
  const tree=postcss.parse(css),edits:Array<{start:number;end:number}>=[];
  tree.walkRules(rule=>{
    if(!dashboardMtdnaStudyOwnership.receivers.some(([,selector])=>selector===rule.selector))return;
    const start=rule.source?.start?.offset,end=rule.source?.end?.offset;
    if(typeof start!=='number'||typeof end!=='number')throw new Error('Exact owned source coordinates required');
    const open=start+rule.selector.length+(rule.raws.between||'').length;
    expect(css.slice(start,end)).toBe(rule.toString());
    expect(css[open]).toBe('{');expect(css[end-1]).toBe('}');
    edits.push({start:open+1,end:end-1});
  });
  expect(edits).toHaveLength(13);
  // Only complete owned bodies (including their formatting whitespace) are
  // masked. Selectors/braces/comments/media and ALL foreign bytes remain.
  let masked=css;
  for(const edit of edits.sort((a,b)=>b.start-a.start))masked=masked.slice(0,edit.start)+'<owned-body>'+masked.slice(edit.end);
  return masked;
}
function declarations(css:string,selector:string){
  const tree=postcss.parse(css),matches:unknown[][]=[];
  tree.walkRules(rule=>{
    if(rule.selector!==selector)return;
    const rows:unknown[]=[];
    rule.each(node=>{if(node.type!=='decl')throw new Error('Only declared owned properties');rows.push([node.prop,node.value,node.important===true]);});
    matches.push(rows);
  });
  expect(matches).toHaveLength(1);return matches[0]!;
}
let evidenceIndex=0;
async function exact(css:string){
  const output=await compileDashboardMtdnaStudyStyles(css,inputPath,root);
  const originalForeign=foreign(original),candidateForeign=foreign(output.css);
  // Optional root-owned isolated evidence retains complete raw CSS and both
  // whole foreign-byte projections before any semantic/equality assertion.
  const outputDirectory=process.env['GETBASED_MTDNA_STUDY_STYLE_OUTPUT'];
  if(outputDirectory)fs.writeFileSync(path.join(outputDirectory,`style-${evidenceIndex++}.json`),JSON.stringify({original,candidate:output.css,originalForeign,candidateForeign,receivers:output.receivers},null,2));
  expect(signature(output.css)).toEqual(signature(original));
  expect(candidateForeign).toBe(originalForeign);
  expect(output.edits).toHaveLength(14); // 13 bodies plus compact compile metadata.
  expect(output.receivers).toHaveLength(13);return output;
}
describe('study-only native Tailwind recipe ownership',()=>{
  it('preserves all native declarations, cascade topology and foreign bytes',async()=>{await exact(input);});
  it('retains shared grid/media body and distinct mixed/null colors',async()=>{
    const output=await exact(input);expect(declarations(output.css,'.db-mtdna-study-mixed')).toEqual([['border-left-color','#f59e0b',false]]);
    expect(declarations(output.css,'.db-mtdna-study-null')).toEqual([['border-left-color','#94a3b8',false]]);
    expect(output.css).toContain('.db-mtdna-facts,\n  .db-mtdna-study-grid { grid-template-columns: 1fr; }');
  });
  for(const [name,mutate] of [
    ['changed owned declaration',(css:string)=>css.replace('border-left-color: #f59e0b','border-left-color: #f59e0c')],
    ['changed foreign declaration',(css:string)=>css.replace('grid-template-columns: repeat(2, minmax(0, 1fr))','grid-template-columns: repeat(3, minmax(0, 1fr))')],
    ['missing utility',(css:string)=>css.replace('@utility dashboard-mtdna-study-01','@utility unowned')],
    ['missing receiver',(css:string)=>css.replace('@apply gb:dashboard-mtdna-study-01;','display: block;')],
  ] as const)it('rejects '+name,async()=>{await expect(exact(mutate(input))).rejects.toThrow();});
});
