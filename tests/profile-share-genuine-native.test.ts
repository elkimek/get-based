import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
import * as ts from 'typescript/unstable/ast';
import {withParsedSource} from '../scripts/native-typescript-ast.js';
import {JSDOM} from 'jsdom';
import {expect,it} from 'vitest';
import {escapeAttr,escapeHTML} from '../js/utils.js';
import {projectActiveShare,projectCreateShare,renderActiveShare,renderCreateShare,renderResultShare,renderLoadShare,renderShareShell,type ShareBodyView} from '../js/profile-share-presentation.js';
const original=readFileSync('tests/fixtures/profile-share-native-before/profile-share.ts.txt','utf8');
const functions=new Set(['renderActiveShareList','renderCreateShareBody','renderShareResultBody','renderLoadShareBody','renderProfileShareShell']);
const declarations=withParsedSource(original,'profile-share.ts',ast=>ast.statements.filter(node=>ts.isFunctionDeclaration(node)&&functions.has(node.name?.text||'')||ts.isVariableStatement(node)&&node.declarationList.declarations.some(decl=>ts.isIdentifier(decl.name)&&['COPY_ICON','REFRESH_ICON'].includes(decl.name.text))).map(node=>node.getText(ast)).join('\n'));
const native=stripTypeScriptTypes(declarations);
const markers=new Set(['','[',']','[0','[1','[2','[-1']);
function tree(node:Node):unknown {
 if(node.nodeType===8)return markers.has(node.nodeValue||'')?null:{unexpectedComment:node.nodeValue};
 if(node.nodeType===3)return node.nodeValue;
 const e=node as Element,children:unknown[]=[];
 for(const child of e.childNodes){const value=tree(child);if(value===null)continue;if(typeof value==='string'&&typeof children.at(-1)==='string')children[children.length-1]=(children.at(-1) as string)+value;else children.push(value);}
 return {tag:e.tagName,namespace:e.namespaceURI,attributes:[...e.attributes].map(a=>[a.name,a.value]),children,
  defaults:e.tagName==='INPUT'?{type:(e as HTMLInputElement).type,value:(e as HTMLInputElement).value,defaultValue:(e as HTMLInputElement).defaultValue,checked:(e as HTMLInputElement).checked,required:(e as HTMLInputElement).required,readOnly:(e as HTMLInputElement).readOnly}:e.tagName==='SELECT'?{value:(e as HTMLSelectElement).value,selectedIndex:(e as HTMLSelectElement).selectedIndex}:e.tagName==='BUTTON'?{type:(e as HTMLButtonElement).type,disabled:(e as HTMLButtonElement).disabled}:null};
}
function dom(html:string):unknown {const doc=new JSDOM(html).window.document;return tree(doc.body.firstElementChild!);}
const expiry='2030-01-01T00:00:00Z';
const result={profileName:'Alice <&>',profileId:'p',shareUrl:'https://example.invalid/#share=abcdefghijklmnopqrstuvwx',password:'synthetic-only',expiresAt:expiry};
const format=(value:string)=>new Date(value).toLocaleString([],{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
const records=[{id:'link-1',shareUrl:result.shareUrl,expiresAt:expiry}];
function run(kind:'active'|'create'|'result'|'load'|'shell',filled:boolean,current:boolean):string {
 const rows=filled?records:[],active=()=>projectActiveShare(rows,format,()=> 'p');
 if(current){
  if(kind==='active')return renderActiveShare(rows,format,()=> 'p');
  if(kind==='create')return renderCreateShare(()=>result.profileName,()=> 'p',result.password,active);
  if(kind==='result')return renderResultShare(result,value=>new Date(value).toLocaleString(),active);
  if(kind==='load')return renderLoadShare(result.shareUrl);
  const body:ShareBodyView={kind:'create',view:projectCreateShare(()=>result.profileName,()=> 'p',result.password,active)};
  return renderShareShell('Share Profile','Share Profile',body);
 }
 const document=new JSDOM().window.document;let captured='';
 const context=vm.createContext({state:{currentProfile:'p'},escapeAttr,escapeHTML,SHARE_OVERLAY_ID:'profile-share-overlay',document,HTMLElement:document.defaultView!.HTMLElement,
  getProfileShareRecords:()=>rows,formatShareExpiry:format,generateProfileSharePassword:()=>result.password,profileNameForShare:()=>result.profileName,
  closeProfileShareModal:()=>{},openAppendedModalOverlay:(overlay:HTMLElement)=>{captured=overlay.outerHTML;},installProfileShareDelegates:()=>{},result,id:result.shareUrl});
 const call=kind==='active'?"renderActiveShareList('p')":kind==='create'?"renderCreateShareBody('p')":kind==='result'?'renderShareResultBody(result)':kind==='load'?'renderLoadShareBody(id)':"renderProfileShareShell({title:'Share Profile',body:renderCreateShareBody('p')})";
 const output=vm.runInContext(native+'\n'+call,context) as string|undefined;return output||captured;
}
it.each(['active','create','result','load','shell'] as const)('retains the complete native %s DOM, ordered attributes, whitespace, SVG and form defaults',kind=>{
 for(const filled of [false,true])expect(dom(run(kind,filled,true))).toEqual(dom(run(kind,filled,false)));
});
it('keeps every extra attribute, text/default change, element and unknown comment observable',()=>{
 const html=run('create',true,true),baseline=dom(html);
 for(const changed of [html.replace('<form','<form data-corrupt="yes"'),html.replace('synthetic-only','changed-secret'),html.replace('required',''),html.replace('Create Link','Wrong action'),html.replace('<form','<!--foreign--><form'),html.replace('</form>','<span>Extra</span></form>')]){
  expect(changed).not.toBe(html);expect(dom(changed)).not.toEqual(baseline);
 }
});
it('uses genuine typed children without private HTML protocols',()=>{
 for(const name of ['ProfileShareBody','ProfileShareActive','ProfileShareCreate','ProfileShareResult','ProfileShareLoad','ProfileShareShell'])expect(readFileSync('js/components/'+name+'.svelte','utf8')).not.toContain('{@html');
 expect(readFileSync('js/profile-share-presentation.ts','utf8')).not.toMatch(/nativeOwnedHTML|composeOwnedHTML|SLOT_CHECKSUM/);
});
