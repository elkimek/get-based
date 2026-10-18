import type {FormSupplementReader,FormPeriodReader} from '../../js/supplement-form-ui.js';
export const formPresentationCases=['ingredient-empty','ingredient-standard','ingredient-custom','ingredient-hostile','ingredient-coercion-throw',
 'period-empty','period-summary','period-no-remove','period-hostile','quality-empty','quality-potency','quality-excluded','quality-hostile',
 'form-new','form-photos','form-active','form-paused','form-ended','form-planned','form-medication','form-selected-days','form-interval','form-prn','form-course','form-cycle','form-phased','form-other','form-hostile','form-read-throw','form-coercion-throw'] as const;
export type FormPresentationCase=typeof formPresentationCases[number];
export interface FormRenderer {ingredientRowHtml(index:number,name?:unknown,amount?:unknown,times?:unknown,outer?:unknown,source?:unknown):string;
 periodRowHtml(index:number,period?:FormPeriodReader,remove?:unknown,original?:number):string;
 qualityTestRowHtml(index:number,test?:Record<string,unknown>,original?:number,importIndex?:number):string;
 suppFormHtml(index:number,supplement:FormSupplementReader|null,review?:unknown):string;}
const hostile='<button data-supplement-private-removeAction="getbased-supplement-ingredient-removeAction-private"> & " \' <!--keep-literal--> getbased-supplement-form-name-private';
export function formPresentationWitness(kind:FormPresentationCase){
 const trace:string[]=[];const photos=kind==='form-photos';
 const tracked=<T extends object>(name:string,value:T):T=>new Proxy(value,{get(target,key,receiver){if(typeof key==='string')trace.push(name+'.'+key);return Reflect.get(target,key,receiver);}});
 function render(renderer:FormRenderer){
  if(kind.startsWith('ingredient-')){
   const name=kind==='ingredient-hostile'?hostile:kind==='ingredient-coercion-throw'?{toString(){trace.push('name.toString');throw new Error('ingredient name');}}:'Magnesium';
   const source=kind==='ingredient-standard'?tracked('ingredient',{name,amount:'25 mg',amountValue:25,amountUnit:'mg'}):kind==='ingredient-custom'?tracked('ingredient',{name,amount:'3 strange',amountValue:3,amountUnit:'strange unit'}):null;
   return renderer.ingredientRowHtml(2,kind==='ingredient-empty'?'':name,kind==='ingredient-empty'?'':'25 mg',kind==='ingredient-empty'?'':1.5,'2',source);
  }
  if(kind.startsWith('period-')){const period:FormPeriodReader=kind==='period-empty'?{}:tracked('period',{start:'2024-01-01',end:'2024-03-31',dose:kind==='period-hostile'?hostile:'500 mg',ingredientDoses:kind==='period-summary'?[{ingredient:'A&B',value:50,unit:'mg'},{ingredient:'D',text:'20 µg'}]:[]});return renderer.periodRowHtml(3,period,kind!=='period-no-remove',1);}
  if(kind.startsWith('quality-')){const test=kind==='quality-empty'?{}:tracked('quality',{category:kind==='quality-potency'?'potency':'contaminant',analyte:kind==='quality-hostile'?hostile:'Lead',resultText:'<0.2',unit:'µg/g',basis:'lot "12"',includeInAIContext:kind!=='quality-excluded'});return renderer.qualityTestRowHtml(4,test,2,1);}
  if(kind==='form-new'||photos)return renderer.suppFormHtml(-1,null,'<!--source-review--><p data-source-review="yes">Facts &amp; reviewed</p>');
  const mode=kind.slice(5);const supplement:FormSupplementReader=tracked('supplement',{name:kind==='form-hostile'?hostile:'Magnesium',type:kind==='form-medication'?'medication':'supplement',sourceUrl:'https://example.invalid/?a=1&b=2',
   servingSize:tracked('serving',{value:2,unit:'capsule'}),timesPerDay:1.5,ingredients:[tracked('ingredient',{name:'Mg',amount:'25 mg',amountValue:25,amountUnit:'mg',timesPerDay:1})],inactiveIngredients:['A&B','Vegetable capsule'],
   periods:[{start:'2024-01-01',end:kind==='form-ended'?'2024-03-31':null,dose:{value:50,unit:'mg'}}],lifecycle:{state:['paused','ended','planned'].includes(mode)?mode:'active',reason:'controlled'},
   schedule:tracked('schedule',{mode:['selected-days','interval','prn','course','cycle','phased','other'].includes(mode)?mode:'daily',daysOfWeek:[1,3,5],intervalDays:3,maxPerDay:2}),route:'oral',brand:'A&B',genericName:'Mg',dosageForm:'capsule',labelDirections:'Take with food',dosage:'once daily',
   qualityTests:[{category:'potency',analyte:'Mg',resultText:'25',unit:'mg',basis:'capsule'},{category:'contaminant',analyte:'Lead',resultText:'ND',unit:'µg/g',includeInAIContext:true}],qualityEvidenceScope:'matching-lot',reason:'fixture',prescriber:'Controlled',note:'two\nlines'});
  if(kind==='form-read-throw')Object.defineProperty(supplement,'name',{get(){trace.push('name.throw');throw new Error('name getter');}});
  if(kind==='form-coercion-throw')supplement.name={toString(){trace.push('name.toString');throw new Error('name coercion');}};
  return renderer.suppFormHtml(2,supplement,kind==='form-hostile'?'<!--getbased-supplement-form-name-private--><section>Local review</section>':'');
 }
 return {trace,photos,render};
}
export function nativeSupplementFormTree(html:string,document:Document):unknown {
 const template=document.createElement('template');template.innerHTML=html;
 function read(node:Node):unknown{if(node instanceof Element)return {type:node.nodeType,name:node.localName,namespace:node.namespaceURI,attributes:[...node.attributes].map(a=>[a.name,a.value]),
 defaults:node instanceof HTMLInputElement?{type:node.type,value:node.value,defaultValue:node.defaultValue,checked:node.checked,defaultChecked:node.defaultChecked,disabled:node.disabled,required:node.required,min:node.min,max:node.max,step:node.step,tabIndex:node.tabIndex,hidden:node.hidden}:node instanceof HTMLSelectElement?{value:node.value,selectedIndex:node.selectedIndex,disabled:node.disabled,multiple:node.multiple,tabIndex:node.tabIndex}:node instanceof HTMLOptionElement?{selected:node.selected,defaultSelected:node.defaultSelected,value:node.value}:node instanceof HTMLTextAreaElement?{value:node.value,defaultValue:node.defaultValue,rows:node.rows,tabIndex:node.tabIndex}:node instanceof HTMLButtonElement?{type:node.type,disabled:node.disabled,tabIndex:node.tabIndex}:null,children:[...node.childNodes].map(read)};return {type:node.nodeType,text:node.nodeValue};}
 return [...template.content.childNodes].map(read);
}
