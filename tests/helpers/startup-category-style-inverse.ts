import {restoreCategoryPageChromeStyleBodies} from './category-page-chrome-style-inverse.js';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import postcss,{type Rule} from 'postcss';
import {restoreCategoryPresentationStyleBodies} from './category-presentation-style-inverse.js';
import {restoreCorrelationWorkspaceChromeStyleBodies} from './correlation-workspace-chrome-style-inverse.js';
import {restoreCorrelationWorkspaceControlStyleBodies} from './correlation-workspace-controls-style-inverse.js';
import {restoreTherapyComparisonStyleBodies} from './therapy-comparison-style-inverse.js';
import {restoreCorrelationsSelectionStyleBodies} from './correlations-selection-style-inverse.js';
import inverse from '../fixtures/startup-category-compatibility-inverse.json' with {type:'json'};
/** Compose retained exact historical CSS inverses before the unchanged Startup hash predicate. */
export function restoreStartupCategoryStyleBytes(compiled:string):string {
 const original=readFileSync(path.join(import.meta.dirname,'../fixtures/compare-dates-category-original.css'),'utf8');
 compiled=restoreCategoryPresentationStyleBodies(restoreCategoryPageChromeStyleBodies(compiled),original);
 compiled=restoreCorrelationWorkspaceChromeStyleBodies(compiled,original);
 compiled=restoreCorrelationWorkspaceControlStyleBodies(compiled,original);
 compiled=restoreTherapyComparisonStyleBodies(compiled,original);
 compiled=restoreCorrelationsSelectionStyleBodies(compiled,original);
 const tree=postcss.parse(compiled),edits:{start:number;end:number;before:string;after:string}[]=[];
 assert.equal(inverse.compareBodies.length,42);
 for(const row of inverse.compareBodies){const matches:Rule[]=[];tree.walkRules(r=>{if(r.selector===row.selector&&(r.parent?.type==='atrule'?r.parent.params:null)===row.condition)matches.push(r);});assert.equal(matches.length,1);const rule=matches[0]!;const start=rule.source!.start!.offset!+rule.selector.length+(rule.raws.between||'').length+1,end=rule.source!.end!.offset!-1;assert.equal(compiled.slice(start,end),row.before);edits.push({start,end,before:row.before,after:row.after});}
 for(const row of inverse.commentMoves){const comments:postcss.Comment[]=[];tree.walkComments(n=>{if(n.text===row.text)comments.push(n);});assert.equal(comments.length,1);const comment=comments[0]!;assert.equal(comment.parent?.type,'root');const start=comment.source!.start!.offset!,end=start+row.before.length;assert.equal(compiled.slice(start,end),row.before);edits.push({start,end,before:row.before,after:row.after});}
 for(const e of edits.sort((a,b)=>b.start-a.start)){assert.equal(compiled.slice(e.start,e.end),e.before);compiled=compiled.slice(0,e.start)+e.after+compiled.slice(e.end);}
 assert.ok(compiled.startsWith(inverse.prefix.before),'Exact source-owned metadata whitespace epoch');
 return inverse.prefix.after+compiled.slice(inverse.prefix.before.length);
}
