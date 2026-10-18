import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {JSDOM} from 'jsdom';
import {beforeEach,expect,it,vi} from 'vitest';
import {projectChatTranscriptMessage,type ChatTranscriptMessage} from '../js/chat-transcript-presentation.js';
import {e2eeLockHTML,e2eeLockFootnote} from '../js/chat-attestation.js';
import {renderHTML as badgeHTML} from '../js/components/ChatAttestationBadge.svelte.html.js';
import type {AttestationBadgeView} from '../js/chat-attestation-presentation.js';

const ports=vi.hoisted(()=>({trace:[] as string[],hide:false,state:{chatHistory:[] as unknown[],chatThreads:[],currentThreadId:null}}));
const mark=<T>(name:string,value:T):T=>{ports.trace.push(name);return value;};
vi.mock('../js/state.js',()=>({state:ports.state}));
vi.mock('../js/markdown.js',()=>({renderMarkdown:()=>mark('markdown','<p>Safe body</p>')}));
vi.mock('../js/schema.js',()=>({calculateCost:()=>mark('cost',0.12),formatCost:()=>mark('format','$0.12')}));
vi.mock('../js/api.js',()=>({getAIProvider:()=>mark('provider','openrouter'),getActiveModelDisplay:()=>mark('model-display','Synthetic model'),getActiveModelId:()=>mark('model-id','synthetic/model')}));
vi.mock('../js/app-extension-runtime.js',()=>({shouldHideAppExtensionAIUsage:()=>mark('hide-usage',ports.hide)}));
vi.mock('../js/cli-agent-brand-assets.js',()=>({getAIOutputAttribution:()=>mark('attribution',null)}));
vi.mock('../js/chat-message-avatars.js',()=>({shouldShowChatPersonaLabel:()=>false,projectChatMessageAvatar:()=>mark('avatar',{text:'A',image:null,size:null,photo:false,branded:false})}));
vi.mock('../js/chat-message-actions-contract.js',()=>({projectChatMessageActions:()=>mark('actions',null)}));
vi.mock('../js/chat-message-content-contract.js',()=>({projectChatCitations:()=>mark('citations',null),projectChatStoredImages:()=>mark('images',null)}));
vi.mock('../js/chat-render-runtime.js',()=>({isChatRenderProductRecsEnabled:()=>mark('recs-enabled',true),getChatRecommendationSectionViews:()=>mark('recommendations',[])}));
vi.mock('../js/chat-attestation-presentation.js',async original=>{
 const actual=await original<typeof import('../js/chat-attestation-presentation.js')>();
 return {...actual,projectAttestationBadge:(value:unknown)=>{ports.trace.push('badge');return actual.projectAttestationBadge(value);}};
});
interface PublicCase {name:string;attestation:unknown;badge:AttestationBadgeView|null;header:string;footnote:string}
const reference=JSON.parse(readFileSync('tests/fixtures/chat-attestation-public-original.json','utf8')) as {cases:PublicCase[]};
const oldSource=readFileSync('tests/fixtures/chat-receipt-original-projector.txt','utf8');
const original=vm.runInNewContext(oldSource+';projectChatTranscriptMessage',{
 state:ports.state,renderMarkdown:()=>mark('markdown','<p>Safe body</p>'),calculateCost:()=>mark('cost',0.12),formatCost:()=>mark('format','$0.12'),
 getAIProvider:()=>mark('provider','openrouter'),getActiveModelDisplay:()=>mark('model-display','Synthetic model'),getActiveModelId:()=>mark('model-id','synthetic/model'),
 shouldHideAppExtensionAIUsage:()=>mark('hide-usage',ports.hide),getAIOutputAttribution:()=>mark('attribution',null),
 projectChatMessageAvatar:()=>mark('avatar',{text:'A',image:null,size:null,photo:false,branded:false}),projectChatMessageActions:()=>mark('actions',null),
 projectChatCitations:()=>mark('citations',null),projectChatStoredImages:()=>mark('images',null),e2eeLockFootnote,
 isChatRenderProductRecsEnabled:()=>mark('recs-enabled',true),getChatRecommendationSectionViews:()=>mark('recommendations',[]),
}) as (message:unknown,index:number,attention?:boolean)=>Omit<ChatTranscriptMessage,'usage'>&{usage:{text:string;receipt:string}|null};
beforeEach(()=>{ports.trace=[];ports.hide=false;ports.state.chatHistory=[];});
function tree(html:string):unknown {
 const dom=new JSDOM('');try{
 const host=dom.window.document.createElement('template');host.innerHTML=html;
 function walk(node:Node):unknown {const e=node instanceof dom.window.Element?node:null;return {type:node.nodeType,value:node.nodeValue,tag:e?.tagName??null,namespace:e?.namespaceURI??null,
  attributes:e?[...e.attributes].map(a=>[a.name,a.value,a.namespaceURI,a.prefix]):null,
  defaults:e instanceof dom.window.HTMLButtonElement?{type:e.type,disabled:e.disabled,value:e.value,tabIndex:e.tabIndex}:null,children:[...node.childNodes].map(walk)};}
 return [...host.content.childNodes].map(walk);
 }finally{dom.window.close();}
}
it.each(reference.cases)('preserves exact public serializer bytes and complete native graph: $name',row=>{
 for(const [actual,expected] of [[e2eeLockHTML(row.attestation),row.header],[e2eeLockFootnote(row.attestation),row.footnote]]){
  expect(actual).toBe(expected);expect(tree(actual!)).toEqual(tree(expected!));
 }
});
function watched<T extends object>(name:string,value:T):T{return new Proxy(value,{get(target,key,receiver){ports.trace.push(name+'.'+String(key));return Reflect.get(target,key,receiver);}});}
type Message=Parameters<typeof projectChatTranscriptMessage>[0];
function message(options:{role?:string;provider?:string;e2ee?:boolean;attestation?:unknown;tokens?:boolean;throwAt?:'attestation'|'badge'|'host'|'usage'}={}):Message {
 let attestation=options.attestation===undefined?{securityVerified:true,enclaveHost:'synthetic.invalid',codeFingerprint:'0123456789abcdef'}:options.attestation;
 if(options.throwAt==='badge')attestation={get securityVerified(){throw new Error('badge failed');}};
 if(options.throwAt==='host')attestation={securityVerified:true,enclaveHost:{[Symbol.toPrimitive](hint:string){ports.trace.push('host-coerce:'+hint);throw new Error('host failed');}}};
 if(attestation&&typeof attestation==='object')attestation=watched('attestation',attestation);
 const usage=watched('usage',{get inputTokens(){if(options.throwAt==='usage')throw new Error('usage failed');return options.tokens===false?0:10;},outputTokens:options.tokens===false?0:20});
 return watched('message',{role:options.role||'assistant',provider:options.provider||'openrouter',modelId:'synthetic/model',modelDisplay:'Synthetic model',content:'Body',usage,
  e2ee:options.e2ee!==false,get attestation(){if(options.throwAt==='attestation')throw new Error('attestation failed');return attestation;}}) as Message;
}
function run(api:typeof original|typeof projectChatTranscriptMessage,options:Parameters<typeof message>[0]) {
 ports.trace=[];const input=message(options);ports.state.chatHistory=[input];
 try{return {input,view:api(input,0),trace:[...ports.trace],error:null};}
 catch(error){return {input,view:null,trace:[...ports.trace],error:{name:(error as Error).name,message:(error as Error).message}};}
}
it.each([
 ['verified',{}],['unverified',{attestation:{securityVerified:false}}],['E2EE no-data',{attestation:null}],['plain',{e2ee:false}],
 ['zero usage',{tokens:false}],['user',{role:'user'}],['CLI',{provider:'codex-agent'}],['gateway',{provider:'personal-agent-gateway'}],
] as const)('preserves original projection/getter chronology: %s',(_name,options)=>{
 const old=run(original,options),now=run(projectChatTranscriptMessage,options);expect(now.error).toEqual(old.error);expect(now.trace).toEqual(old.trace);
 expect(old.view!.key).toBe(old.input);expect(now.view!.key).toBe(now.input);
 const {key:_oldKey,usage:oldUsage,...oldRest}=old.view!,{key:_nowKey,usage:nowUsage,...nowRest}=now.view!;
 expect(nowRest).toEqual(oldRest);expect(nowUsage?.text??null).toBe(oldUsage?.text??null);
 if(oldUsage?.receipt){
  expect(nowUsage?.receipt).not.toBeNull();expect(typeof nowUsage?.receipt).toBe('object');
  expect(now.trace.filter(value=>value==='badge')).toHaveLength(1);expect(now.trace.indexOf('badge')).toBeLessThan(now.trace.indexOf('markdown'));
 }else expect(nowUsage?.receipt??null).toBeNull();
});
it.each(reference.cases)('retains the projected receipt security model and full genuine control graph: $name',row=>{
 const result=run(projectChatTranscriptMessage,{attestation:row.attestation});expect(result.error).toBeNull();
 expect(result.view!.usage?.receipt).toEqual({badge:row.badge});expect(result.trace.filter(value=>value==='badge')).toHaveLength(1);
 expect(tree(badgeHTML({view:row.badge,footnote:true}))).toEqual(tree(row.footnote));
});
it.each([
 ['color',(html:string)=>html.replace('#a78bfa','#ef4444')],['mark',(html:string)=>html.replace('>TEE + GPU</span>','>failed</span>')],
 ['expanded',(html:string)=>html.replace('aria-expanded="false"','aria-expanded="true"')],
 ['disabled',(html:string)=>html.replace('<button','<button disabled')],['button type',(html:string)=>html.replace('type="button"','type="submit"')],
 ['tooltip',(html:string)=>html.replace('Encrypted Venice session','Wrong evidence')],
 ['extra comment',(html:string)=>html+'<!--foreign-->'],['extra node',(html:string)=>html+'<i>Extra</i>'],
] as const)('detects complete genuine receipt graph corruption: %s',(_name,mutate)=>{
 const row=reference.cases.find(row=>row.name==='gpu')!,html=badgeHTML({view:row.badge,footnote:true}),expected=tree(row.footnote);
 function requireGraph(value:string):void {if(JSON.stringify(tree(value))!==JSON.stringify(expected))throw new Error('Changed genuine receipt graph');}
 expect(()=>requireGraph(html)).not.toThrow();const changed=mutate(html);expect(changed).not.toBe(html);
 expect(()=>requireGraph(changed)).toThrow('Changed genuine receipt graph');
});
it('keeps hidden usage from reading a receipt or attestation',()=>{
 ports.hide=true;const old=run(original,{}),now=run(projectChatTranscriptMessage,{});expect(now.trace).toEqual(old.trace);expect(now.view?.usage).toBeNull();
 expect(now.trace).not.toContain('message.e2ee');expect(now.trace).not.toContain('message.attestation');
});
it.each(['attestation','badge','host','usage'] as const)('preserves atomic failure and original chronology: %s',throwAt=>{
 const old=run(original,{throwAt}),now=run(projectChatTranscriptMessage,{throwAt});expect(now.error).toEqual(old.error);expect(now.error?.message).toBe(throwAt+' failed');expect(now.trace).toEqual(old.trace);
 expect(now.view).toBeNull();expect(now.trace).not.toContain('markdown');expect(now.trace).not.toContain('actions');
});
it('uses one genuine badge owner and preserves sanitized markdown and tooltip installation',()=>{
 const source=readFileSync('js/chat-transcript-presentation.ts','utf8'),component=readFileSync('js/components/ChatMessage.svelte','utf8');
 expect(source).toContain("import './chat-attestation.js'");expect(source).not.toContain('e2eeLockFootnote(');
 expect(component.match(/<ChatAttestationBadge\b/g)).toHaveLength(1);expect(component).not.toContain('{@html view.usage.receipt}');expect(component).toContain('{@html view.body}');
 const shared=readFileSync('js/components/ChatAttestationBadge.svelte','utf8');expect(shared).toContain('view === undefined ? projectAttestationBadge(attestation) : view');
});
