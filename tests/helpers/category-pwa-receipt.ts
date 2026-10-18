import type {ProfileData} from '../../types/app-state.js';
/** Synthetic imported records enter through the actual profile migration/data
 * projection. The retained singlePoint custom category exercises the native
 * singleDate/FattyAcids route; it is not a changed modern Fatty Acids schema. */
export const categoryRoutes={series:'categoryPilot',snapshot:'categorySnapshot'} as const;
export const categoryDates=['2024-01-10','2024-02-10','2024-03-10','2024-04-10','2024-05-10'] as const;
export const categoryRegistry=[{id:'default',name:'Synthetic Category profile',sex:'male',dob:'1987-11-22',createdAt:1,lastUpdated:1,tags:[],notes:'',status:'active',pinned:false,height:null,heightUnit:'cm',location:{country:'',zip:''}},{id:'other',name:'Keep unrelated profile',sex:'female',dob:'1988-01-01',createdAt:2,lastUpdated:2,tags:[],notes:'Keep registry bytes',status:'active',pinned:false,height:null,heightUnit:'cm',location:{country:'',zip:''}}];
export const categorySeedFields={
 entries:categoryDates.map((date,index)=>({date,sourceFile:'synthetic-category-'+date+'.pdf',markers:{
  ...(index===2?{}:{'categoryPilot.ranged':[80,null,null,130,90][index]!}),
  ...(index===2?{}:{'categoryPilot.unrated':[1.2,1.4,null,null,2][index]!}),
  ...(index===1?{'categoryPilot.sparse':42}:{}),
  // A native date with no populated category column stays in the global series.
  'biochemistry.glucose':5,
  ...(index===4?{'categorySnapshot.omega3':7,'categorySnapshot.omega6':18}:{}),
 }})),
 customMarkers:{
  'categoryPilot.ranged':{name:'Synthetic ApoB <&>',unit:'mg/dL',refMin:60,refMax:100,categoryLabel:'Synthetic Category'},
  'categoryPilot.unrated':{name:'Synthetic No Range',unit:'u',refMin:null,refMax:null,categoryLabel:'Synthetic Category'},
  'categoryPilot.sparse':{name:'Synthetic Sparse',unit:'long qualifier / sample',refMin:40,refMax:60,categoryLabel:'Synthetic Category'},
  'categoryPilot.empty':{name:'Synthetic Empty',unit:'',refMin:null,refMax:null,categoryLabel:'Synthetic Category'},
  'categorySnapshot.omega3':{name:'Synthetic Omega 3 (EPA/DHA)',unit:'%',refMin:4,refMax:12,categoryLabel:'Synthetic Snapshot',singlePoint:true,group:'Category PWA snapshot'},
  'categorySnapshot.omega6':{name:'Synthetic Omega 6',unit:'%',refMin:6,refMax:14,categoryLabel:'Synthetic Snapshot',singlePoint:true,group:'Category PWA snapshot'},
 },
 refOverrides:{'categoryPilot.ranged':{optimalMin:70,optimalMax:90},'categorySnapshot.omega3':{optimalMin:8,optimalMax:12},'categorySnapshot.omega6':{optimalMin:6,optimalMax:10}},
 notes:[{date:'2023-12-01',text:'Keep unrelated synthetic note'}],contextNotes:'Keep unrelated context bytes',markerNotes:{'categoryPilot.ranged':'Keep marker note'},
 importBenchmarks:[],wearableConnections:{},
} satisfies Partial<ProfileData>;
export type CategoryRangeMode='reference'|'optimal'|'both';
export type CategoryViewMode='charts'|'table'|'heatmap';
/** Exact native static presentation surface. Chart.js owns canvas sizing and
 * paint, checked separately; every remaining card/table/rail node here is exact. */
export function categoryPresentationReceipt(root:Element){
 // Native branch markers alone are ignored; preserve every literal character
 // and ordered attribute, joining adjacent text split by those markers.
 const children=(parent:Node,read:(node:Node)=>unknown):unknown[]=>{
  const result:unknown[]=[];
  for(const child of parent.childNodes){
   if(child.nodeType===8){if(!/^(?:\[(?:-1|[0-9]+)?|\]|)$/.test(child.nodeValue??''))throw new Error('Unqualified Category HTML comment');continue;}
   const current=read(child) as {type?:number;text?:string|null},prior=result.at(-1) as {type?:number;text?:string|null}|undefined;
   if(current.type===3&&prior?.type===3)prior.text=(prior.text??'')+(current.text??'');else result.push(current);
  }
  return result;
 };

 const attrs=(element:Element)=>[...element.attributes].map(attribute=>[attribute.name,attribute.value]);
 const text=(element:Element|null)=>element?.textContent??null;
 const nodeReceipt=(node:Node):unknown=>{if(node.nodeType===1){const element=node as Element;return {type:node.nodeType,name:element.localName,namespace:element.namespaceURI,attributes:attrs(element),children:children(element,nodeReceipt)};}return {type:node.nodeType,text:node.nodeValue};};
 const nodes=(selector:string,within:Element=root)=>[...within.querySelectorAll(selector)].map(nodeReceipt);
 return {
  cards:[...root.querySelectorAll('.chart-card:not(.chart-card-add)')].map(card=>({attributes:attrs(card),mainAttributes:attrs(card.querySelector('.chart-card-main')!),header:nodes('.chart-card-header',card),snapshot:nodes('.chart-card-snapshot',card),recent:nodes('.chart-values',card),canvas:[...card.querySelectorAll('canvas')].map(canvas=>({id:canvas.id,ariaHidden:canvas.getAttribute('aria-hidden')})),recommendations:nodes('[id^="chart-rec-"]',card)})),
  tables:nodes('.gb-table-shell'),
  fattyHeading:text(root.querySelector('h3')),
  fattyCards:nodes('.fa-card'),
  fattyCanvas:[...root.querySelectorAll('#chart-fa-bar')].map(canvas=>({id:canvas.id,tag:canvas.localName})),
 };
}
export type CategoryPresentationReceipt=ReturnType<typeof categoryPresentationReceipt>;
export interface CategoryChartDataset {label:string|null;type:string|null;data:unknown;pointStatuses:unknown}
export interface CategoryChartReceipt {key:string;canvas:string;labels:unknown;datasets:CategoryChartDataset[];referenceBand:unknown;optimalBand:unknown;yMin:number|null;yMax:number|null}
export interface CategoryNativeOracle {seed:Record<string,unknown>;profileKeys:string[];data:{dates:string[];dateLabels:string[];categories:Record<string,unknown>};presentations:Record<string,CategoryPresentationReceipt>;charts:Record<string,CategoryChartReceipt[]>;originalControllerSHA256:string;}
