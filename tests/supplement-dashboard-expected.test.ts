// @vitest-environment jsdom
import {readFileSync}from'node:fs';
import {expect,it}from'vitest';
import {expectedSupplementReceipt,qualifySupplementGrammar,supplementGrammarSources,type SupplementReceipt}from'./helpers/supplement-dashboard-expected.js';
import {supplementCases,type SupplementCase}from'./helpers/supplement-dashboard-witness.js';
const originalFile='tests/fixtures/supplement-dashboard-original.json';
const originals=JSON.parse(readFileSync(originalFile,'utf8'))as Record<SupplementCase,SupplementReceipt>;
it('qualifies immutable complete native receipts, witness, four genuine owners, projector and compiler',()=>{qualifySupplementGrammar();expect(Object.keys(originals)).toEqual([...supplementCases]);expect(supplementCases).toHaveLength(27);});
it.each(supplementCases)('%s expected transport never changes original chronology, errors, helper calls or fixture bytes',kind=>{
 const original=originals[kind],before=JSON.stringify(original),expected=expectedSupplementReceipt(kind,original,document);
 expect(expected.trace).toEqual(original.trace);expect(expected.error).toEqual(original.error);expect(expected.calls).toEqual(original.calls);expect(JSON.stringify(original)).toBe(before);
 if(original.html===null)expect(expected).toEqual(original);else{expect(expected.html).toMatch(/^<!--\[--><!--\[-1--><div class="supp-timeline-section">/);expect(expected.html).toMatch(/<\/div><!--\]--><!--\]-->$/);expect(expected.tree).toBeInstanceOf(Array);}
});
it.each([...Object.keys(supplementGrammarSources),originalFile])('rejects any changed qualified full source %s',changed=>expect(()=>qualifySupplementGrammar(file=>readFileSync(file,'utf8')+(file===changed?'\nforeign':''))).toThrow());
it('rejects an unreviewed compiler version',()=>expect(()=>qualifySupplementGrammar(file=>{const source=readFileSync(file,'utf8');if(file!=='package-lock.json')return source;const lock=JSON.parse(source)as{packages:Record<string,{version:string}>};lock.packages['node_modules/svelte']!.version='foreign';return JSON.stringify(lock);})).toThrow());
it.each(['root','comment','text','delegate','bar-order','default','trace','helper','error','extra-field']as const)('rejects corrupted native %s before expected transport',kind=>{
 const original=structuredClone(originals.single);
 if(kind==='root')original.html=original.html!.replace('<div class="supp-timeline-section">','<section class="supp-timeline-section">');
 if(kind==='comment')original.html+='<!--foreign-->';
 if(kind==='text')original.html=original.html!.replace('Claim-level finding','Foreign finding');
 if(kind==='delegate')original.html=original.html!.replace('data-supp-action="ask-mito"','data-supp-action="foreign"');
 if(kind==='bar-order')(original.tree as Array<{children:unknown[]}>)[0]!.children.reverse();
 if(kind==='default')Object.assign(original.tree as object,{foreignDefault:true});
 if(kind==='trace')original.trace.push('foreign');
 if(kind==='helper')original.calls.push(['foreign']);
 if(kind==='error')original.error={name:'ForeignError',message:'foreign'};
 if(kind==='extra-field')Object.assign(original,{foreign:true});
 expect(()=>expectedSupplementReceipt('single',original,document)).toThrow();
});
it.each(['trace','helper','error','tree','html','field-count']as const)('whole current receipt still rejects %s drift without filtering actual values',kind=>{
 const expected=expectedSupplementReceipt('field-getters',originals['field-getters'],document),changed=structuredClone(expected);
 if(kind==='trace')changed.trace.reverse();
 if(kind==='helper')changed.calls.push(['foreign']);
 if(kind==='error')changed.error='foreign';
 if(kind==='tree')changed.tree=[];
 if(kind==='html')changed.html+='<!--foreign-->';
 if(kind==='field-count')Object.assign(changed,{foreign:true});
 expect(changed).not.toEqual(expected);
});
it('retains historical hostile raw leaves in the untouched original independent oracle',()=>{
 expect(originals['raw-markup'].html).toContain('href="" data-native-breakout="yes"');expect(originals['raw-markup'].html).toContain('Primary study · PMID <em>123</em>');
 expect(originals['raw-unclosed-comment'].html).toContain('Primary study · PMID <!-- original unclosed comment');expect(originals['marker-collision'].html).toContain('Primary study · PMID gb-supp-direction-class gb-supp-summary <!---->');
});
