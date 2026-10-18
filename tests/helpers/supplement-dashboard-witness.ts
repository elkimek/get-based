import type {SupplementDomainRecord} from '../../js/supplement-medication-domain.js';
import type {MitoEvidenceMatch} from '../../js/supplement-warnings.js';
export const supplementCases=['empty','history','scheduled','active','medication','gaps','invalid-period','same-day','hostile-row',
 'single','scope','grouped','multiple-compounds','adverse-human','beneficial','mixed','null','mechanism','unknown-direction',
 'raw-markup','raw-unclosed-comment','marker-collision','field-getters','coercion','name-throw','summary-throw','url-symbol'] as const;
export type SupplementCase=typeof supplementCases[number];
export interface SupplementWitness {supplements:SupplementDomainRecord[];warnings:MitoEvidenceMatch[];trace:string[]}
export function supplementWitness(kind:SupplementCase):SupplementWitness {
 const trace:string[]=[];
 const active:SupplementDomainRecord={name:'Example 30 capsules',type:'supplement',dosage:'5 mg',startDate:'2001-01-02',endDate:null};
 const evidence:MitoEvidenceMatch={id:'evidence-1',match:'example',type:'compound',compound:'Example',category:'fixture',productNames:['Example tracked'],
  matchedTerms:['example'],matchedField:'name',url:'https://example.invalid/study',searchUrl:'https://example.invalid/search',
  pmid:123,studyType:'cell',studyLabel:'Cell study',direction:'adverse',scopeLabel:'',model:'Native model',
  exposure:'Controlled exposure',limitations:'No dose inference',title:'Study title',summary:'Claim-level finding'};
 let supplements:SupplementDomainRecord[]=[active],warnings:MitoEvidenceMatch[]=[];
 switch(kind) {
  case 'empty':supplements=[];break;
  case 'history':supplements=[{...active,endDate:'2001-01-03'}];break;
  case 'scheduled':supplements=[{...active,startDate:'2099-01-01'}];break;
  case 'active':break;
  case 'medication':active.type='medication';break;
  case 'gaps':active.periods=[{start:'2001-01-02',end:'2001-02-02'},{start:'2001-03-03',end:null}];break;
  case 'invalid-period':active.periods=[{start:'invalid',end:null},{start:'2001-01-02',end:null}];break;
  case 'same-day':active.startDate='2024-04-15';break;
  case 'hostile-row':active.name='" <b>& gb-supp-row-name data-supp-private-action="edit"';active.dosage="' <em>&";break;
  default:warnings=[evidence];
 }
 if(kind==='scope')evidence.scopeLabel='Specific population';
 if(kind==='grouped')warnings=[evidence,{...evidence,id:'evidence-2',direction:'beneficial',scopeLabel:'Other population'}];
 if(kind==='multiple-compounds')warnings=[evidence,{...evidence,id:'evidence-2',compound:'Other',productNames:[]}];
 if(kind==='adverse-human')evidence.studyType='human_trial';
 if(['beneficial','mixed','null','mechanism','unknown-direction'].includes(kind))evidence.direction=kind==='unknown-direction'?'opaque':kind;
 if(kind==='raw-markup'){evidence.url='" data-native-breakout="yes';evidence.pmid='<em>123</em>';evidence.searchUrl='" data-search="yes';}
 if(kind==='raw-unclosed-comment')evidence.pmid='<!-- original unclosed comment';
 if(kind==='marker-collision')for(const field of ['url','pmid','searchUrl','studyLabel','summary','model','exposure','limitations','title'])
  evidence[field]='gb-supp-direction-class gb-supp-summary <!---->gb-supp-detail<!----> <!--[0-->';
 if(kind==='field-getters')for(const [key,value] of Object.entries(evidence))Object.defineProperty(evidence,key,{enumerable:true,get(){trace.push('get:'+key);return value;}});
 if(kind==='coercion')for(const key of ['studyLabel','summary','model','exposure','limitations','title','scopeLabel'])
  evidence[key]={[Symbol.toPrimitive](hint:string){trace.push('coerce:'+key+':'+hint);return '<native '+key+'>';}};
 if(kind==='name-throw')active.name={replace(){trace.push('replace:name');throw new RangeError('native-name-throw');},[Symbol.toPrimitive](hint:string){trace.push('coerce:name:'+hint);return 'Native';}};
 if(kind==='summary-throw')Object.defineProperty(evidence,'summary',{get(){trace.push('get:summary');throw new RangeError('native-summary-throw');}});
 if(kind==='url-symbol')Object.defineProperty(evidence,'url',{value:Symbol('native URL')});
 return {supplements,warnings,trace};
}
export function nativeSupplementTree(html:string, document:Document):unknown {
 const template=document.createElement('template');template.innerHTML=html;
 function visit(node:Node):unknown {
  if(node instanceof Element)return {type:node.nodeType,name:node.localName,namespace:node.namespaceURI,
   attributes:Array.from(node.attributes,a=>[a.name,a.value]),children:Array.from(node.childNodes,visit),
   ...(node instanceof HTMLDetailsElement?{open:node.open}:{}),
   ...(node instanceof HTMLButtonElement?{buttonType:node.type,disabled:node.disabled,tabIndex:node.tabIndex}: {})};
  return {type:node.nodeType,text:node.nodeValue};
 }
 return Array.from(template.content.childNodes,visit);
}
