import {withoutStandaloneLensEntries} from './helpers/sidebar-lens-entries.js';
// @vitest-environment jsdom
import {readFileSync}from'node:fs';
import {expect,it}from'vitest';
import {expectedSidebarPwaReceipt,qualifySidebarPwaGrammar,sidebarPwaGrammarSources,type SidebarExpectedNode}from'./helpers/sidebar-pwa-expected-annotations.js';
import {expectedSidebarHTML}from'./helpers/sidebar-owned-receipts.js';
import {sidebarPresentationReceipt,type SidebarNativeOracle}from'./helpers/sidebar-pwa-receipt.js';
import {renderSidebarPresentation,type SidebarView,type SidebarIcon,type SidebarActionName}from'../js/sidebar-presentation.js';
import {expectedCurrentSidebarPwaReceipt} from './helpers/sidebar-pwa-expected-annotations.js';
const oracleFile='tests/fixtures/sidebar-pwa-native.json';
const oracle=JSON.parse(readFileSync(oracleFile,'utf8'))as SidebarNativeOracle;
const row=(icon:SidebarIcon,name:SidebarActionName,route?:string)=>({icon,action:{name,...(route===undefined?{}:{route})}});
const conditional=(category:string,icon:SidebarIcon,label:string,name:SidebarActionName,route?:string)=>({category,icon,label,action:{name,...(route===undefined?{}:{route})},badge:{kind:'dot'as const}});
const category=(name:string,markers:string,group:string,label:string,flagged:boolean)=>({category:name,markerNames:markers,group,action:{name:'navigate'as const,route:name},label,badge:{kind:flagged?'flagged'as const:'count'as const,text:'1'}});
// Independent fixed DTO for the unchanged original assignment. Every one of the
// thirteen PWA states uses this same complete initial renderer assignment.
const view:SidebarView={searchIcon:'search',dashboard:row('dashboard','navigate','dashboard'),dashboardCount:'3',labs:row('labs','navigate','labs'),labsCount:'3',biology:row('biologyScores','navigate','biology-scores'),genome:row('genome','navigate','genome'),genomeBadge:{kind:'count',text:'1 H1'},body:row('body','navigate','body'),bodyBadge:{kind:'count',text:'1'},nutrition:row('nutrition','navigate','nutrition'),supplements:row('supplements','navigate','supplements'),light:{...conditional('light','light','Light','navigate','light'),badge:{kind:'count',text:'1'}},insight:row('insight','navigate','insight'),recommendations:row('recommendations','navigate','recommendations'),compare:row('compare','navigate','compare'),correlations:row('correlations','navigate','correlations'),emf:conditional('emf','emf','EMF assessment','open-emf-assessment'),lightAssessment:conditional('light-env-assessment','light','Light assessment','open-light-assessment'),reports:row('report','open-report-builder'),context:row('context','open-context'),knowledge:row('knowledge','open-knowledge-base'),custom:row('plus','open-custom-marker'),labAction:{name:'open-custom-marker'},categories:[category('sidebarBlood','Blood normal','','Sidebar Blood <&>',false)],groups:[{className:'sidebar-group-header collapsed',name:'Sidebar specialty',headerAction:{name:'toggle-group',group:'Sidebar specialty'},toggleAction:{name:'toggle-group',group:'Sidebar specialty'},expanded:'false',accessibleName:'Sidebar specialty group',label:'Sidebar specialty',flagged:'1',itemsName:'Sidebar specialty',collapsedStyle:'display:none',items:[category('sidebarSpecialty','Flagged marker <&>|Grouped normal','Sidebar specialty','Group <&>',true)]}]};
it('qualifies original bytes, independent grammar, all genuine owners and compiler',()=>{qualifySidebarPwaGrammar();expect(Object.keys(oracle.receipts)).toHaveLength(13);expect(new Set(Object.values(oracle.rawAssignments)).size).toBe(1);});
it('current complete genuine renderer equals the independently qualified original grammar byte for byte',()=>{const original=oracle.rawAssignments['constructed-collapsed']!;expect(withoutStandaloneLensEntries(renderSidebarPresentation(view))).toBe(expectedSidebarHTML(original));});
it.each(Object.entries(oracle.receipts))('%s preserves every original semantic node and exact state metadata',(_name,input)=>{
 const before=JSON.stringify(input),raw=oracle.rawAssignments['constructed-collapsed']!,expected=expectedSidebarPwaReceipt(input,raw);
 const template=document.createElement('aside');template.innerHTML=expectedSidebarHTML(raw);
 const rendered=sidebarPresentationReceipt(template);
 // Compare every marker coordinate independently against the real fixed owner;
 // native dynamic attrs stay exact in the whole expected receipt below.
 const markers=(nodes:SidebarExpectedNode[]):unknown[]=>nodes.flatMap(n=>n.type===8?[{type:n.type,text:n.text}]:n.children?markers(n.children):[]);
 expect(markers(expected.children as SidebarExpectedNode[])).toEqual(markers(rendered.children as SidebarExpectedNode[]));
 expect(expected.query).toBe(input.query);expect(expected.active).toEqual(input.active);expect(JSON.stringify(input)).toBe(before);
 function preserve(nodes:SidebarExpectedNode[],original:SidebarExpectedNode[]):void {let index=0;for(const n of nodes){if(n.type===8)continue;const old=original[index++]!;expect({...n,children:undefined}).toEqual({...old,children:undefined});if(n.children)preserve(n.children,old.children!);}expect(index).toBe(original.length);}
 preserve(expected.children as SidebarExpectedNode[],input.children as SidebarExpectedNode[]);
});
it.each([...Object.keys(sidebarPwaGrammarSources),oracleFile])('rejects changed qualified source %s',changed=>expect(()=>qualifySidebarPwaGrammar(file=>readFileSync(file,'utf8')+(file===changed?'\nforeign':''))).toThrow());
it('rejects an unreviewed compiler',()=>expect(()=>qualifySidebarPwaGrammar(file=>{const source=readFileSync(file,'utf8');if(file!=='package-lock.json')return source;const lock=JSON.parse(source)as{packages:Record<string,{version:string}>};lock.packages['node_modules/svelte']!.version='foreign';return JSON.stringify(lock);})).toThrow());
it.each(['comment','label','attribute','namespace','row-order','query','active']as const)('refuses mutated native %s instead of transporting it',kind=>{
 const input=structuredClone(oracle.receipts['constructed-collapsed']!),nodes=input.children as SidebarExpectedNode[];
 if(kind==='comment')nodes.push({type:8,text:'foreign'});
 if(kind==='label')nodes[1]!.children![0]!.text='Foreign';
 if(kind==='attribute')nodes[2]!.attributes!.push(['data-foreign','yes']);
 if(kind==='namespace')nodes[0]!.namespace='urn:foreign';
 if(kind==='row-order')nodes.reverse();
 if(kind==='query')input.query='foreign';
 if(kind==='active')input.active=[];
 expect(()=>expectedSidebarPwaReceipt(input,oracle.rawAssignments['constructed-collapsed']!)).toThrow();
});
it('rejects a changed original assignment',()=>expect(()=>expectedSidebarPwaReceipt(oracle.receipts['constructed-collapsed']!,oracle.rawAssignments['constructed-collapsed']!+'foreign')).toThrow());
it.each(['comment','label','attribute','namespace','row-order','query','active']as const)('whole exact receipt detects actual %s corruption without an inverse',kind=>{
 const expected=expectedSidebarPwaReceipt(oracle.receipts['constructed-collapsed']!,oracle.rawAssignments['constructed-collapsed']!),actual=structuredClone(expected),nodes=actual.children as SidebarExpectedNode[];
 if(kind==='comment')nodes[0]!.text='foreign';
 if(kind==='label')nodes.find(n=>n.attributes?.some(a=>a[0]==='class'&&a[1]==='nav-section'))!.children![0]!.text='foreign';
 if(kind==='attribute')nodes.find(n=>n.name==='div')!.attributes!.push(['data-foreign','yes']);
 if(kind==='namespace')nodes.find(n=>n.name==='div')!.namespace='urn:foreign';
 if(kind==='row-order')nodes.reverse();
 if(kind==='query')actual.query='foreign';
 if(kind==='active')actual.active=[];
 expect(actual).not.toEqual(expected);
});

it('checks the complete current navigation tree while retaining immutable legacy state qualification',()=>{
 const original=oracle.rawAssignments['constructed-collapsed']!;
 const host=document.createElement('aside');host.innerHTML=renderSidebarPresentation(view);
 host.querySelector('[data-category="dashboard"]')!.setAttribute('aria-current','page');
 expect(sidebarPresentationReceipt(host)).toEqual(expectedCurrentSidebarPwaReceipt(oracle.receipts['constructed-collapsed']!,original));
});
