// @vitest-environment jsdom
import{expect,it}from'vitest';import{createHash}from'node:crypto';
import history from'./fixtures/dashboard-loading-state-history.json'with{type:'json'};
import{renderDashboardLoadingState}from'../js/dashboard-loading-state-presentation.js';
const expected='<!--[-->'+history.nativeHTML+'<!--]-->';
function assertCurrent(html:string):void{
 expect(html).toBe(expected);const host=document.createElement('div');host.innerHTML=html;
 expect(host.childNodes).toHaveLength(3);expect(host.firstChild?.nodeType).toBe(Node.COMMENT_NODE);expect(host.firstChild?.textContent).toBe('[');expect(host.lastChild?.textContent).toBe(']');
 const element=host.children[0]!;expect(host.children).toHaveLength(1);expect(element.tagName).toBe('DIV');
 expect([...element.attributes].map(item=>[item.name,item.value])).toEqual([['class','dashboard-widget-empty'],['aria-busy','true'],['aria-live','polite']]);
 expect(element.children).toHaveLength(0);expect(element.childNodes).toHaveLength(1);expect(element.textContent).toBe('\n      Loading Light & Sun…\n    ');
}
it('retains the complete actual genuine loading SSR and native DOM without compiler-frame authentication',()=>{assertCurrent(renderDashboardLoadingState({kind:'light-sun-loading'}));});
const corruptions:{name:string;change:(value:string)=>string}[]=[
 {name:'class',change:x=>x.replace('dashboard-widget-empty','dashboard-widget-wrong')},
 {name:'busy ARIA',change:x=>x.replace('aria-busy="true"','aria-busy="false"')},
 {name:'live ARIA',change:x=>x.replace('aria-live="polite"','aria-live="assertive"')},
 {name:'escaped text',change:x=>x.replace('&amp;','&')},
 {name:'label',change:x=>x.replace('Loading','Ready')},
 {name:'whitespace',change:x=>x.replace('      Loading','     Loading')},
 {name:'tag',change:x=>x.replace('<div','<span')},
 {name:'prefix comment',change:x=>x.replace('<!--[-->','<!--foreign-->')},
 {name:'suffix comment',change:x=>x.slice(0,-1)},
 {name:'extra sibling',change:x=>x+'<div></div>'},
];
for(const corruption of corruptions)it('rejects actual genuine loading corruption: '+corruption.name,()=>{
 const actual=renderDashboardLoadingState({kind:'light-sun-loading'}),changed=corruption.change(actual);expect(changed).not.toBe(actual);expect(()=>assertCurrent(changed)).toThrow();
});
it('rejects an unqualified branch',()=>{
 // @ts-expect-error invalid runtime branch deliberately tests the closed contract.
 expect(()=>renderDashboardLoadingState({kind:'other'})).toThrow('Unqualified Dashboard loading branch');
});
it('retains the actual branch getter failure',()=>{const failure=new Error('branch read');expect(()=>renderDashboardLoadingState({get kind():'light-sun-loading'{throw failure;}})).toThrow(failure);});
function qualifyHistory(frame:typeof history.frames.production,native=history.nativeHTML):void{expect(history.frames.nativeHTML).toBe(native);expect(frame.html).toBe(frame.prefix+native+frame.suffix);}
for(const mode of ['production','development']as const)it('preserves the original '+mode+' compiler frame as explicit immutable history',()=>{qualifyHistory(history.frames[mode]);});
it('preserves exact original anchor and test evidence without restoring a runtime protocol',()=>{
 expect(createHash('sha256').update(history.retiredAnchorSource).digest('hex')).toBe('550d01386551165c92b74590be69e366a24dec145118685e93efdf7778f7a1f7');
 expect(createHash('sha256').update(history.retiredTestSource).digest('hex')).toBe('753d7bf47345c88b7cc2edebc77df2b35d7bcee04c2650d2dc0b9c1136669a08');
});
it('rejects altered historical native-body data',()=>{expect(()=>qualifyHistory(history.frames.production,'wrong')).toThrow();});
it('rejects altered historical prefix extraction in both original modes',()=>{for(const mode of ['production','development']as const)expect(()=>qualifyHistory({...history.frames[mode],prefix:history.frames[mode].prefix+'x'})).toThrow();});
it('rejects altered historical suffix extraction in both original modes',()=>{for(const mode of ['production','development']as const)expect(()=>qualifyHistory({...history.frames[mode],suffix:history.frames[mode].suffix+'x'})).toThrow();});
