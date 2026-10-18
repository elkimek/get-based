// Archived original private codec contracts. Current genuine owners are exercised by native/current presentation and browser tests.
// @vitest-environment jsdom
import {afterEach,describe,expect,it,vi} from 'vitest';
const mutation=vi.hoisted(()=>({alter:(html:string)=>html}));
vi.mock('./fixtures/archived-native-ui/components/SupplementTimeline.svelte.html.js',async importActual=>{
 const actual=await importActual<typeof import('./fixtures/archived-native-ui/components/SupplementTimeline.svelte.html.js')>();
 return {renderHTML:(props:{kind:string})=>mutation.alter(actual.renderHTML(props))};
});
import {renderSupplementHeader,renderSupplementEmpty,renderSupplementRow,renderSupplementBar} from './fixtures/archived-native-ui/supplement-dashboard-presentation.js';
afterEach(()=>{mutation.alter=html=>html;});
function headerChild(html:string):string {
 const production='<!---->gb-supp-header<!---->',development='<!--abfmdj-->gb-supp-header<!---->';
 const choices=[production,development].filter(value=>html.includes(value));
 if(choices.length!==1)throw new Error('Unexpected actual child envelope in corruption fixture');return choices[0]!;
}
describe('private compiled supplement coordinates',()=>{
 it.each([
  ['missing root',(html:string)=>html.slice(8)],
  ['wrong branch',(html:string)=>html.replace('<!--[0-->','<!--[9-->')],
  ['missing action',(html:string)=>html.replace('data-supp-private-action="manage"','')],
  ['duplicate action',(html:string)=>html.replace('</div>','<button class="supp-add-btn" data-supp-private-action="manage"></div>')],
  ['unknown comment',(html:string)=>html.replace('</button>','</button><!-- unknown -->')],
  ['unknown token',(html:string)=>html.replace('Manage','gb-supp-unowned')],
  ['wrong title encoding',(html:string)=>html.replace('&amp; medications','& medications')],
  ['wrong action tag',(html:string)=>html.replace('class="supp-add-btn"','class="wrong"')],
 ])('rejects %s before inserting any data',(_name,alter)=>{mutation.alter=alter;expect(()=>renderSupplementHeader(null)).toThrow(/Unqualified supplement/);});
 it.each([
  ['missing child',(html:string)=>html.replace(headerChild(html),'')],
  ['duplicate child',(html:string)=>html.replace(headerChild(html),headerChild(html)+headerChild(html))],
  ['unknown child boundary',(html:string)=>html.replace(headerChild(html),'<!-- unknown -->gb-supp-header<!---->')],
 ])('rejects %s',(_name,alter)=>{mutation.alter=alter;expect(()=>renderSupplementEmpty('owned header','empty')).toThrow(/Unqualified supplement/);});
 it('never rescans inserted native markup, literal comments or private marker collisions',()=>{
  const child='<!-- native comment --><em>gb-supp-header</em><!--[0-->';
  expect(renderSupplementEmpty(child,'gb-supp-empty')).toBe('<div class="supp-timeline-section">\n    '+child+'<div class="supp-timeline"><div class="supp-empty">gb-supp-empty</div></div></div>');
  const row=renderSupplementRow(3,'gb-supp-row-aria " <','gb-supp-row-name',child);
  expect(row).toContain('aria-label="Edit gb-supp-row-aria &quot; &lt;"');expect(row).toContain(child);
 });
 it('retains exact period class/style and rejects an impossible period branch',()=>{
  expect(renderSupplementBar('medication','12.34',0.5,true)).toBe('<div class="supp-bar supp-bar-medication supp-bar-ongoing" style="left:12.34%;width:0.5%"></div>');
  expect(()=>renderSupplementBar('gap','0','5',true)).toThrow('Unknown supplement period kind');
 });
});
