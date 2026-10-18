import {describe,it,expect} from 'vitest';
import {JSDOM} from 'jsdom';
import {projectChartLayers,renderChartLayersPresentation} from '../js/chart-layers-presentation.js';
const availability=(mask:number)=>({hasNotes:!!(mask&1),hasSupps:!!(mask&2),hasCycle:!!(mask&4)});
const parse=(html:string)=>{const d=new JSDOM('<!doctype html><body></body>').window.document;d.body.innerHTML=html;return d;};
const labels=['📝 Notes','💊 Supplements','🔴 Cycle phase at blood draw'];
const actions=['set-note-overlay','set-supp-overlay','set-phase-overlay'];

describe('ChartLayers presentation',()=>{
  it('returns the native empty string without reading absent modes',()=>{
    const absent=()=>{throw new Error('Absent mode read');};
    expect(renderChartLayersPresentation(availability(0),absent,absent,absent)).toBe('');
  });
  it.each([1,2,3,4,5,6,7])('keeps native rows, text, action order and checkbox defaults for mask %i',mask=>{
    const calls:string[]=[];const read=(key:string)=>()=>{calls.push(key);return 'on';};
    const d=parse(renderChartLayersPresentation(availability(mask),read('notes'),read('supplements'),read('cycle')));
    const expected=[0,1,2].filter(i=>mask&(1<<i));
    expect(calls).toEqual(expected.map(i=>['notes','supplements','cycle'][i]));
    expect([...d.querySelectorAll('.chart-layers-row span')].map(n=>n.textContent)).toEqual(expected.map(i=>labels[i]));
    const inputs=[...d.querySelectorAll<HTMLInputElement>('input')];
    expect(inputs.map(n=>({type:n.type,checked:n.checked,defaultChecked:n.defaultChecked,value:n.value,action:n.getAttribute('data-lab-data-change')})))
      .toEqual(expected.map(i=>({type:'checkbox',checked:true,defaultChecked:true,value:'on',action:actions[i]})));
    expect([...d.querySelectorAll('.chart-layers-row')].map(n=>[n.tagName,n.className,n.getAttribute('data-lab-data-action')]))
      .toEqual(expected.map(()=>['LABEL','chart-layers-row','chart-layers-row']));
    const trigger=d.querySelector<HTMLButtonElement>('.chart-layers-trigger')!;
    expect({type:trigger.type,text:trigger.textContent,classes:trigger.className,action:trigger.getAttribute('data-lab-data-action'),popup:trigger.getAttribute('aria-haspopup'),expanded:trigger.getAttribute('aria-expanded'),controls:trigger.getAttribute('aria-controls')})
      .toEqual({type:'button',text:'Layers ▾',classes:'view-btn chart-layers-trigger',action:'toggle-chart-layers',popup:'true',expanded:'false',controls:'chart-layers-dropdown'});
    expect(d.querySelector('#chart-layers-dropdown')!.getAttribute('role')).toBe('menu');
  });
  it.each([null,undefined,false,0,'off','ON',''])('checks only exact on mode, preserving absent checked attribute for %s',mode=>{
    const d=parse(renderChartLayersPresentation(availability(7),()=>mode,()=>mode,()=>mode));
    expect([...d.querySelectorAll<HTMLInputElement>('input')].map(n=>[n.checked,n.defaultChecked,n.hasAttribute('checked')])).toEqual([[false,false,false],[false,false,false],[false,false,false]]);
  });
  it('short circuits thrown mode reads before later modes and native assignment',()=>{
    const d=parse('<div id="host">retained</div>'),host=d.getElementById('host')!,original=host.firstChild,trace:string[]=[];
    expect(()=>{host.innerHTML=renderChartLayersPresentation(availability(7),()=>{trace.push('notes');throw new Error('notes');},()=>{trace.push('supplements');return 'on';},()=>{trace.push('cycle');return 'on';});}).toThrow('notes');
    expect(trace).toEqual(['notes']);expect(host.innerHTML).toBe('retained');expect(host.firstChild).toBe(original);
  });
  it('does not coerce mode values or read callbacks for absent rows',()=>{
    const uncoercible={toString(){throw new Error('Unexpected coercion');}};
    expect(projectChartLayers(availability(1),()=>uncoercible,()=>{throw new Error('Absent supplement');},()=>{throw new Error('Absent phase');}))
      .toEqual({notes:{checked:false},supplements:null,cycle:null});
  });
});
