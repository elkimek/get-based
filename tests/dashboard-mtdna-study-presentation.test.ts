import {expectedMtdnaStudyHTML,mtdnaNativeTree} from './helpers/dashboard-mtdna-study-owned-receipts.js';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import {JSDOM} from 'jsdom';
import {parse} from 'svelte/compiler';
import {projectDashboardMtdnaStudy,renderDashboardMtdnaStudy} from '../js/dashboard-mtdna-study-presentation.js';
import type {MtdnaStudyReader} from '../types/dashboard-widget-renderers.js';
let captureIndex=0;
function captureMarkup(kind:'original'|'compiled',markup:string,props?:unknown):void{
  const outputDirectory=process.env['GETBASED_MTDNA_STUDY_QUALIFICATION_OUTPUT'];
  if(!outputDirectory)return;
  // Compiled props are the already captured readonly primitives.
  // Original study input is NEVER inspected/cloned by this observer.
  const dom=new JSDOM('',{url:'http://127.0.0.1/'});
  try{
    const document=dom.window.document,template=document.createElement('template');
    template.innerHTML=markup; // genuine inert native parser, no scripts/resources.
    function walk(node:Node):unknown{
      const element=node instanceof dom.window.Element?node:null;
      const defaults=element instanceof dom.window.HTMLAnchorElement
        ?{href:element.href,target:element.target,rel:element.rel,tabIndex:element.tabIndex}
        :element instanceof dom.window.HTMLInputElement
        ?{type:element.type,value:element.value,defaultValue:element.defaultValue,checked:element.checked,defaultChecked:element.defaultChecked,disabled:element.disabled,readOnly:element.readOnly}
        :element instanceof dom.window.HTMLButtonElement
        ?{type:element.type,disabled:element.disabled,value:element.value}
        :element instanceof dom.window.HTMLTextAreaElement
        ?{value:element.value,defaultValue:element.defaultValue,disabled:element.disabled,readOnly:element.readOnly}
        :element instanceof dom.window.HTMLSelectElement
        ?{value:element.value,selectedIndex:element.selectedIndex,multiple:element.multiple,disabled:element.disabled}
        :element instanceof dom.window.HTMLOptionElement
        ?{value:element.value,selected:element.selected,defaultSelected:element.defaultSelected,disabled:element.disabled}
        :element instanceof dom.window.HTMLElement?{tabIndex:element.tabIndex}:null;
      return {type:node.nodeType,value:node.nodeValue,tag:element?.tagName??null,localName:element?.localName??null,
        namespace:element?.namespaceURI??null,
        attrs:element?[...element.attributes].map(attr=>({name:attr.name,value:attr.value,namespace:attr.namespaceURI,prefix:attr.prefix})):null,
        text:node.textContent,defaults,children:[...node.childNodes].map(walk)};
    }
    fs.writeFileSync(path.join(outputDirectory,`raw-${captureIndex++}-${kind}.json`),JSON.stringify({kind,props:props??null,markup,
      tree:[...template.content.childNodes].map(walk)},null,2),{flag:'wx'});
  }finally{dom.window.close();}
}
const ports=vi.hoisted(()=>({change:(html:string)=>html}));
vi.mock('../js/components/DashboardMtdnaStudy.svelte.html.js',async importOriginal=>{
  const actual=await importOriginal<typeof import('../js/components/DashboardMtdnaStudy.svelte.html.js')>();
  return {renderHTML:(props:Parameters<typeof actual.renderHTML>[0])=>{
    const markup=actual.renderHTML(props);
    captureMarkup('compiled',markup,props); // BEFORE mutation and facade gates.
    return ports.change(markup);
  }};
});
const escape=(value:unknown)=>value==null?'':String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));
vi.mock('../js/utils.js',()=>({escapeHTML:(value:unknown)=>value==null?'':String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!))}));
const source=fs.readFileSync(new URL('./fixtures/dashboard-mtdna-study-original.txt',import.meta.url),'utf8');
const originalFunction=vm.runInNewContext('('+source+')',{escapeHTML:escape,escapeAttr:escape}) as (study:MtdnaStudyReader|null|undefined)=>string;
function original(study:MtdnaStudyReader|null|undefined):string{
  const markup=originalFunction(study);captureMarkup('original',markup);return markup;
}
const full:MtdnaStudyReader={pmid:'PMID 26406369',direction:'MiXeD',studyLabel:'Clinical cohort',title:'Mitochondrial evidence',scopeLabel:'Scope',summary:'Summary',model:'Model',limitations:'Limits'};
beforeEach(()=>{ports.change=html=>html;});
afterEach(()=>{ports.change=html=>html;});
describe('complete Dashboard mtDNA study original contract',()=>{
  const cases: Array<MtdnaStudyReader|null|undefined>=[undefined,null,{},full,{...full,direction:'null'}, {...full,pmid:'no digits',scopeLabel:'',summary:'',model:'',limitations:''}, {pmid:0,direction:false,title:0,studyLabel:0}, {...full,pmid:Symbol('264'),direction:Symbol('MIXED')}];
  cases.forEach((study,index)=>it('preserves original complete HTML and native controls '+index,()=>{
    const legacy=original(study),html=renderDashboardMtdnaStudy(study);expect(html).toBe(expectedMtdnaStudyHTML(legacy));expect(mtdnaNativeTree(html)).toEqual(mtdnaNativeTree(legacy,true));
    const dom=new JSDOM(html);try{
      const root=dom.window.document.querySelector('article')!;
      expect(root.querySelector('button,input,textarea,select,script,[onclick],[onkeydown]')).toBeNull();
      expect([...root.querySelectorAll('a')].map(a=>[a.getAttribute('href'),a.target,a.rel,a.textContent])).toEqual(study&&String(study.pmid||'').replace(/\D/g,'')?[[`https://pubmed.ncbi.nlm.nih.gov/${String(study.pmid||'').replace(/\D/g,'')}/`,'_blank','noopener',`PubMed · PMID ${String(study.pmid||'').replace(/\D/g,'')}`]]:[]);
    }finally{dom.window.close();}
  }));
  it('renders hostile text and private/comment literals without rescanning data',()=>{
    const hostile='<script>bad()</script> & " \' <!--[0--> gb-mtdna-study-slot-0-end data-x="bad"';
    const study={...full,direction:hostile,studyLabel:hostile,title:hostile,scopeLabel:hostile,summary:hostile,model:hostile,limitations:hostile};
    const legacy=original(study),html=renderDashboardMtdnaStudy(study);expect(html).toBe(expectedMtdnaStudyHTML(legacy));expect(mtdnaNativeTree(html)).toEqual(mtdnaNativeTree(legacy,true));
    const dom=new JSDOM(html);try{expect(dom.window.document.querySelector('script,[data-x]')).toBeNull();expect(dom.window.document.querySelector('strong')!.textContent).toBe(hostile);}finally{dom.window.close();}
  });
  it('preserves ordered/repeated getters and string-hint coercion including different direction reads',()=>{
    const run=(render:(study:MtdnaStudyReader)=>unknown)=>{
      const trace:string[]=[];let directions=0;
      const study=new Proxy(full,{get(target,key,receiver){trace.push(String(key));if(key==='direction')return ++directions===1?'MIXED':'visible direction';const value=Reflect.get(target,key,receiver);return typeof value==='string'?{[Symbol.toPrimitive](hint:string){trace.push(String(key)+':'+hint);return value;}}:value;}});
      return {trace,result:render(study)};
    };
    const old=run(original),now=run(renderDashboardMtdnaStudy);expect(now).toEqual({...old,result:expectedMtdnaStudyHTML(old.result as string)});
    const projected=projectDashboardMtdnaStudy(full);expect(projected.directionClass).toBe('mixed');expect(projected.direction).toBe('MiXeD');
  });
  it('stops at the original throwing getter without reading later fields',()=>{
    const run=(render:(study:MtdnaStudyReader)=>unknown)=>{
      const trace:string[]=[];const study=new Proxy(full,{get(target,key,receiver){trace.push(String(key));if(key==='summary')throw new Error('summary failed');return Reflect.get(target,key,receiver);}});
      expect(()=>render(study)).toThrow('summary failed');return trace;
    };
    expect(run(renderDashboardMtdnaStudy)).toEqual(run(original));
  });
  it('owns no authored HTML injection or event attributes/directives',()=>{
    const ast=parse(fs.readFileSync(new URL('../js/components/DashboardMtdnaStudy.svelte',import.meta.url),'utf8'),{modern:true});
    function visit(value:unknown):void{
      if(!value||typeof value!=='object')return;
      const node=value as Record<string,unknown>;
      expect(node.type).not.toBe('HtmlTag');expect(node.type).not.toBe('EventDirective');
      if(node.type==='Attribute')expect(String(node.name)).not.toMatch(/^on(?::|[a-z])/i);
      for(const child of Object.values(node))if(Array.isArray(child))child.forEach(visit);else visit(child);
    }
    visit(ast);
  });
  for(const [name,mutate] of [
    ['unknown comment',(html:string)=>html.replace('<article','<!--foreign--><article')],
    ['extra root',(html:string)=>html+'<article></article>'],
    ['missing root annotation',(html:string)=>html.replace('<!--[-->','')],
    ['changed class',(html:string)=>html.replace('db-mtdna-study-mixed','db-mtdna-study-context')],
    ['changed text',(html:string)=>html.replace('Clinical cohort','Foreign cohort')],
    ['unsafe href',(html:string)=>html.replace('https://pubmed.ncbi.nlm.nih.gov/26406369/','javascript:foreign()')],
    ['single-quoted identical attribute',(html:string)=>html.replace('target="_blank"',"target='_blank'")],
    ['equivalent text entity',(html:string)=>html.replace('Clinical cohort','Clinical&#32;cohort')],
  ] as const)it('independently rejects complete SSR corruption: '+name,()=>{
    const legacy=original(full);ports.change=mutate;const actual=renderDashboardMtdnaStudy(full);
    expect(()=>expect(actual).toBe(expectedMtdnaStudyHTML(legacy))).toThrow();
    if(name==='single-quoted identical attribute'||name==='equivalent text entity')expect(mtdnaNativeTree(actual)).toEqual(mtdnaNativeTree(legacy,true));
    else expect(mtdnaNativeTree(actual)).not.toEqual(mtdnaNativeTree(legacy,true));
  });
  it('keeps public URL names and native arity while removing private reconstruction',()=>{
    expect(renderDashboardMtdnaStudy.length).toBe(1);expect(projectDashboardMtdnaStudy.length).toBe(1);
    const source=fs.readFileSync(new URL('../js/dashboard-mtdna-study-presentation.ts',import.meta.url),'utf8');
    expect(source).not.toMatch(/privateMarkup|gb-mtdna-study-slot|matchAll|indexOf|escapeHTML|\.replace\(\/<!--/);
  });
  for(const field of ['pmid','direction','studyLabel','title','scopeLabel','summary','model','limitations'] as const)it('preserves native read termination at '+field,()=>{
    const run=(render:(study:MtdnaStudyReader)=>unknown)=>{const trace:string[]=[];const input=new Proxy(full,{get(target,key,receiver){trace.push(String(key));if(key===field)throw new Error(field);return Reflect.get(target,key,receiver);}});expect(()=>render(input)).toThrow(field);return trace;};
    expect(run(renderDashboardMtdnaStudy)).toEqual(run(original));
  });
  for(const value of ['&amp; &quot; &#39; < > " \'','\u0000\r\n\ud800','α🧬<!--]-->gb-mtdna-study-slot-0-end'])it('preserves exact independent lexical contexts for '+JSON.stringify(value),()=>{
    const input={...full,direction:value,title:value,studyLabel:value,scopeLabel:value,summary:value,model:value,limitations:value};
    const legacy=original(input),actual=renderDashboardMtdnaStudy(input);
    expect(actual).toBe(expectedMtdnaStudyHTML(legacy));expect(mtdnaNativeTree(actual)).toEqual(mtdnaNativeTree(legacy,true));
  });
});
