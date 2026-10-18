import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {JSDOM} from 'jsdom';
import {projectClientFormAvatar,projectClientFormTag,projectClientListForm,type ClientFormInput} from '../js/client-list-form-presentation.js';
import {renderClientFormAvatar,renderClientFormTagBody,renderClientListForm} from '../js/client-list-form-rendering.js';

const original=readFileSync(new URL('./fixtures/client-list-form/original-new-form.html',import.meta.url),'utf8');
function fragment(markup:string):Document {
  const document=new JSDOM('<!doctype html><html><head></head><body></body></html>').window.document;
  document.body.innerHTML=markup;return document;
}
const native=fragment(original);
const haplogroups=[...native.querySelectorAll<HTMLOptionElement>('#cl-haplogroup option')].slice(1).map(option=>option.value);
const input=(overrides:Partial<ClientFormInput>={}):ClientFormInput=>({
  editing:false,avatar:{kind:'initial',color:'#a3e635',initial:'?'},removeAvatar:false,readCount:()=> 'Create a local profile',
  name:'',sex:'',dob:'',country:'',zip:'',notes:'',status:'active',heightUnit:'cm',heightDisplay:'',tags:[],
  officialHost:()=>false,readHaplogroups:()=>haplogroups,readSelectedHaplogroup:()=>undefined,readCouplingLabel:()=>undefined,...overrides,
});
const parse=(overrides:Partial<ClientFormInput>={})=>fragment(renderClientListForm(projectClientListForm(input(overrides))));
const controls=(document:Document)=>[...document.querySelectorAll('input,textarea,select,option,button')].map(node=>{
  const common={tag:node.tagName,attributes:[...node.attributes].map(a=>[a.name,a.value])};
  if(node.tagName==='INPUT'){const input=node as HTMLInputElement;return {...common,value:input.value,defaultValue:input.defaultValue,checked:input.checked,defaultChecked:input.defaultChecked,type:input.type};}
  if(node.tagName==='TEXTAREA'){const textarea=node as HTMLTextAreaElement;return {...common,value:textarea.value,defaultValue:textarea.defaultValue};}
  if(node.tagName==='OPTION'){const option=node as HTMLOptionElement;return {...common,value:option.value,selected:option.selected,defaultSelected:option.defaultSelected};}
  if(node.tagName==='SELECT'){const select=node as HTMLSelectElement;return {...common,value:select.value,selectedIndex:select.selectedIndex};}
  return {...common,type:(node as HTMLButtonElement).type};
});
type Anchor={path:number[];value:string};
type Join={parent:number[];index:number;values:string[]};
const at=(node:Node,path:number[]):Node=>path.reduce((parent,index)=>{const child=parent.childNodes[index];expect(child).toBeDefined();return child!;},node);
const tree=(node:Node):unknown=>node.nodeType===3?{text:node.nodeValue}:node.nodeType===1?{
  tag:(node as Element).tagName,attributes:[...(node as Element).attributes].map(a=>[a.name,a.value]),children:[...node.childNodes].map(tree),
}:node.nodeType===9?{children:[...node.childNodes].map(tree)}:(()=>{throw new Error('Unexpected remaining compiler/comment node');})();
function reverseReviewedNewFormAccessibility(document:Document):void {
  // Verify the intended accessibility additions before reconstructing the original literal.
  const unit=document.querySelector('#cl-height-unit-toggle')!;
  expect(unit.getAttribute('href')).toBe('#cl-height');unit.setAttribute('href','#');
  const tags=document.querySelector('#cl-tag-input')!.parentElement!.previousElementSibling!;
  expect(tags.tagName).toBe('LABEL');expect(tags.getAttribute('for')).toBe('cl-tag-input');tags.removeAttribute('for');
  for(const [labelId,groupSelector,text] of [['cl-sex-label','#cl-sex-toggle','Sex'],['cl-status-label','.cl-status-radios','Status']] as const){
    const label=document.getElementById(labelId)!,group=document.querySelector(groupSelector)!;
    expect([...label.attributes].map(a=>[a.name,a.value])).toEqual([['class','cl-form-label'],['id',labelId]]);
    expect(label.tagName).toBe('SPAN');expect(label.textContent).toBe(text);
    expect(group.getAttribute('role')).toBe('group');expect(group.getAttribute('aria-labelledby')).toBe(labelId);
    group.removeAttribute('role');group.removeAttribute('aria-labelledby');
    const old=document.createElement('label');old.className='cl-form-label';old.append(...label.childNodes);label.replaceWith(old);
  }
}
function exactNewForm(document:Document):void {
  const policy=JSON.parse(readFileSync(new URL('./fixtures/client-list-form/compiler-comments.json',import.meta.url),'utf8')) as {
    active:boolean;renders:null|{newForm:{anchors:Anchor[];joins:Join[]}};
  };
  expect(policy.active,'Actual compiler inventory must be reviewed before full literal parity').toBe(true);
  expect(policy.renders).not.toBeNull();
  const root=document.body,recipe=policy.renders!.newForm;
  const observed:Anchor[]=[];
  function walk(node:Node,path:number[]):void {[...node.childNodes].forEach((child,index)=>{
    const next=[...path,index];if(child.nodeType===8)observed.push({path:next,value:child.nodeValue!});else walk(child,next);
  });}walk(root,[]);
  expect(observed).toEqual(recipe.anchors);
  // Resolve every reviewed path before deleting any node; no generic comment filtering.
  const anchors=recipe.anchors.map(anchor=>at(root,anchor.path));anchors.forEach(node=>node.parentNode!.removeChild(node));
  for(const join of recipe.joins){const parent=at(root,join.parent),nodes=[...parent.childNodes].slice(join.index,join.index+join.values.length);
    expect(nodes.map(node=>({type:node.nodeType,text:node.nodeValue}))).toEqual(join.values.map(text=>({type:3,text})));
    nodes[0]!.nodeValue=join.values.join('');nodes.slice(1).forEach(node=>parent.removeChild(node));
  }
  reverseReviewedNewFormAccessibility(document);
  expect(tree(root)).toEqual(tree(native.body));expect(controls(document)).toEqual(controls(native));
}

describe('Client List form presentation',()=>{
  it('retains the independently captured New form, complete text/attributes/defaults after reviewed exact anchors',()=>exactNewForm(parse()));
  it('rejects extra, moved, changed, or missing compiler anchors on the native fragment seam',()=>{
    const mutations:((d:Document)=>void)[]=[
      d=>d.body.append(d.createComment('unknown')),
      d=>d.body.append(d.body.firstChild!),
      d=>{d.body.firstChild!.nodeValue='[changed';},
      d=>{d.body.firstChild!.remove();},
    ];
    for(const mutate of mutations){const d=parse();mutate(d);expect(()=>exactNewForm(d)).toThrow();}
  });
  it('rejects unreviewed text joins, whitespace, attributes, defaults and order changes',()=>{
    const mutations:((d:Document)=>void)[]=[
      d=>{d.querySelector('.cl-health-note')!.firstChild!.nodeValue+=' ';},
      d=>d.querySelector('.cl-health-note')!.prepend(d.createTextNode('extra')),
      d=>{d.querySelector('.cl-title')!.firstChild!.nodeValue='Changed';},
      d=>d.querySelector('#cl-name')!.removeAttribute('required'),
      d=>d.querySelector('#cl-name')!.setAttribute('value','changed default'),
      d=>d.querySelector('.cl-form-actions')!.append(d.querySelector('.cl-form-cancel')!),
    ];
    for(const mutate of mutations){const d=parse();mutate(d);expect(()=>exactNewForm(d)).toThrow();}
  });
  it('keeps explicit button types, delegated actions, hidden file input and native autofocus',()=>{
    const d=parse();expect([...d.querySelectorAll('button')].map(b=>b.type)).toEqual([...native.querySelectorAll('button')].map(b=>b.type));
    expect(d.querySelector('#cl-name')!.hasAttribute('autofocus')).toBe(true);
    expect(d.querySelector('#cl-avatar-input')!.getAttribute('style')).toBe('display:none');
    expect(d.querySelector('form')!.getAttribute('data-cl-submit-action')).toBe('save-form');
    expect(d.querySelector('.cl-avatar-picker')!.getAttribute('data-cl-key-action')).toBe('choose-avatar');
  });
  it('retains Edit title, BMI/link branches, remove photo, and native date/number sanitation',()=>{
    const d=parse({editing:true,removeAvatar:true,readCount:()=> 'Ada',name:'Ada',dob:'not-a-date',heightDisplay:'not-a-number',heightUnit:'in'});
    expect(d.querySelector('h2')!.textContent).toBe('Edit Client');expect(d.querySelector('.cl-form-save')!.textContent).toBe('Save Changes');
    expect(d.querySelector('#cl-bmi-display')).not.toBeNull();expect(d.querySelector('.cl-health-link')!.getAttribute('data-cl-action')).toBe('health-metrics');
    expect(d.querySelector('.cl-avatar-remove')!.getAttribute('data-cl-action')).toBe('remove-avatar');
    for(const id of ['cl-dob','cl-height']){const control=d.querySelector<HTMLInputElement>('#'+id)!;expect(control.value).toBe('');expect(control.defaultValue).toBe(id==='cl-dob'?'not-a-date':'not-a-number');}
    expect(d.querySelector('#cl-height')!.getAttribute('step')).toBe('0.1');
  });
  it('preserves native radio/default checked, sex class, textarea default and selected option',()=>{
    const d=parse({status:'flagged',sex:'female',notes:'line one\nline two',readSelectedHaplogroup:()=> 'H1'});
    expect([...d.querySelectorAll<HTMLInputElement>('[name=cl-status]')].map(n=>[n.checked,n.defaultChecked])).toEqual([[false,false],[true,true],[false,false]]);
    expect(d.querySelector('[data-sex=female]')!.className).toBe('sex-toggle-btn active');
    const notes=d.querySelector<HTMLTextAreaElement>('#cl-notes')!;expect([notes.value,notes.defaultValue]).toEqual(['line one\nline two','line one\nline two']);
    const option=d.querySelector<HTMLOptionElement>('#cl-haplogroup option[value=H1]')!;expect([option.selected,option.defaultSelected]).toEqual([true,true]);
  });
  it('preserves callback and independent conversion order including three unit string hints',()=>{
    const log:string[]=[];const value=(name:string)=>({[Symbol.toPrimitive](hint:string){log.push(name+':'+hint);return name;}});
    const hap=value('hap');projectClientListForm(input({readCount:()=>{log.push('count');return value('countValue');},name:value('name'),dob:value('dob'),country:value('country'),zip:value('zip'),
      officialHost:()=>{log.push('official');return false;},heightUnit:value('unit'),heightDisplay:value('height'),
      readHaplogroups:()=>{log.push('list');return [hap];},readSelectedHaplogroup:()=>{log.push('selected');return hap;},
      readCouplingLabel:()=>{log.push('coupling');return value('couplingValue');},tags:[value('tag')],notes:value('notes')}));
    expect(log).toEqual(['count','countValue:string','name:string','dob:string','country:string','zip:string','official','unit:string','unit:string','height:string','unit:string','list','hap:default','selected','hap:default','coupling','couplingValue:string','tag:string','notes:string']);
  });
  it('retains sparse map skipping without collapsing selected reads',()=>{
    let reads=0;const list:unknown[]=new Array(3);list[1]='H';const tags:unknown[]=new Array(2);tags[1]='one';
    const view=projectClientListForm(input({readHaplogroups:()=>list,readSelectedHaplogroup:()=>{reads++;return 'H';},tags}));
    expect(view.haplogroups).toEqual([{value:'H',text:'H',selected:true}]);expect(view.tags).toEqual(['one']);expect(reads).toBe(1);
  });
  it('retains strict nullish text while raw template nullish strings remain literal',()=>{
    for(const value of [null,undefined,false,0,'']){
      const view=projectClientListForm(input({name:value,notes:value,heightUnit:value,readCouplingLabel:()=>value}));
      expect(view.name).toBe(value===null||value===undefined?'':String(value));expect(view.unitAttr).toBe(String(value));expect(view.coupling).toBe(value?String(value):'');
    }
  });
  it('short circuits a thrown early conversion before downstream services',()=>{
    const log:string[]=[];expect(()=>projectClientListForm(input({name:{toString(){throw new Error('name');}},officialHost:()=>{log.push('official');return false;}}))).toThrow('name');expect(log).toEqual([]);
  });
  it('retains option default-hint Symbol failure before coupling/tags',()=>{
    const log:string[]=[];expect(()=>projectClientListForm(input({readHaplogroups:()=>[Symbol('hap')],readCouplingLabel:()=>{log.push('coupling');return '';}}))).toThrow(TypeError);expect(log).toEqual([]);
  });
  it('retains raw template Symbol failure for the height unit',()=>expect(()=>projectClientListForm(input({heightUnit:Symbol('unit')}))).toThrow(TypeError));
  it('keeps the official privacy copy independently selected',()=>{
    const d=parse({officialHost:()=>true});expect(d.querySelector('.cl-form-help')!.textContent).toBe('Postal codes are optional and stay in this browser. The hosted app uses country-level latitude rather than sending your postal code through getbased or Vercel; current phone location remains a separate opt-in.');
  });
  it('escapes formerly raw height-unit attributes and text without injected nodes',()=>{
    const hostile='\"><img data-injected=unit>';const d=parse({heightUnit:hostile});
    expect(d.querySelector('#cl-height-unit-toggle')!.getAttribute('data-unit')).toBe(hostile);
    expect(d.querySelector('#cl-height-unit-toggle')!.textContent).toBe(hostile);expect(d.querySelector<HTMLInputElement>('#cl-height-unit')!.defaultValue).toBe(hostile);expect(d.querySelector('[data-injected]')).toBeNull();
  });
  it('escapes formerly raw haplogroup and coupling values as literal data',()=>{
    const hostile='\"><img data-injected=hap>';const d=parse({readHaplogroups:()=>[hostile],readSelectedHaplogroup:()=>hostile,readCouplingLabel:()=>'<b data-injected=coupling>x</b>'});
    const option=d.querySelectorAll<HTMLOptionElement>('#cl-haplogroup option')[1]!;expect([option.value,option.textContent,option.defaultSelected]).toEqual([hostile,hostile,true]);
    expect(d.querySelector('#cl-hg-coupling')!.textContent).toBe('<b data-injected=coupling>x</b>');expect(d.querySelector('[data-injected]')).toBeNull();
  });
  it('keeps name, notes and tags escaped with native defaults',()=>{
    const hostile='<img data-injected=name>';const d=parse({name:hostile,notes:hostile,tags:[hostile]});
    expect(d.querySelector<HTMLInputElement>('#cl-name')!.defaultValue).toBe(hostile);expect(d.querySelector<HTMLTextAreaElement>('#cl-notes')!.defaultValue).toBe(hostile);
    expect([...d.querySelector('.cl-tag-pill')!.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent).join('')).toBe(hostile);expect(d.querySelector('[data-injected]')).toBeNull();
  });
  it('retains avatar fragments without new wrappers and exact original camera SVG',()=>{
    const d=fragment(renderClientFormAvatar(projectClientFormAvatar('data:image/png;base64,AA',true,'ignored','ignored')));
    expect(d.querySelector('#cl-avatar-img')!.getAttribute('src')).toBe('data:image/png;base64,AA');expect(d.querySelector('#cl-avatar-img')!.getAttribute('alt')).toBe('');
    expect([...d.body.children].map(n=>n.tagName)).toEqual(['IMG','SPAN']);expect(d.querySelector('svg path')!.getAttribute('d')).toBe('M14.5 4 13 6H8a3 3 0 0 0-3 3v8a3 3 0 0 0 3 3h8a3 3 0 0 0 3-3V9a3 3 0 0 0-3-3h-.5L14.5 4z');
  });
  it('retains the tag-body native button and literal text without a new pill wrapper',()=>{
    const d=fragment(renderClientFormTagBody(projectClientFormTag('<b>x</b>')));
    expect(d.body.textContent).toBe('<b>x</b>');expect([...d.body.children].map(n=>n.tagName)).toEqual(['BUTTON']);
    expect(d.querySelector('button')!.getAttribute('data-cl-action')).toBe('remove-tag');expect(d.querySelector('button')!.getAttribute('aria-label')).toBe('Remove tag');expect(d.querySelector('b')).toBeNull();
  });
  it('associates groups, tag input and BMI output without adding form submission controls',()=>{
    const d=parse({editing:true});
    for(const [selector,label] of [['#cl-sex-toggle','cl-sex-label'],['.cl-status-radios','cl-status-label']]){
      const group=d.querySelector(selector!)!;expect(group.getAttribute('role')).toBe('group');expect(group.getAttribute('aria-labelledby')).toBe(label);
      expect(d.getElementById(label!)!.tagName).toBe('SPAN');
    }
    expect(d.querySelector('label[for=cl-tag-input]')!.textContent).toBe('Tags');
    expect(d.querySelector('label[for=cl-bmi-display]')!.textContent).toBe('BMI');expect(d.getElementById('cl-bmi-display')!.tagName).toBe('OUTPUT');
    expect(d.querySelector('#cl-height-unit-toggle')!.getAttribute('href')).toBe('#cl-height');
    expect(d.querySelector('.cl-health-link')!.getAttribute('href')).toBe('#dashboard');
  });

});
