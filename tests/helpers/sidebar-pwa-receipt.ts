import type {ProfileData} from '../../types/app-state.js';
export const sidebarGroup='Sidebar specialty';
export const sidebarRoutes={group:'sidebarSpecialty',blood:'sidebarBlood'} as const;
export const sidebarRegistry=[{id:'default',name:'Synthetic Sidebar profile',sex:'male',dob:'1987-11-22',createdAt:1,lastUpdated:1,tags:[],notes:'',status:'active',pinned:false,height:null,heightUnit:'cm',location:{country:'',zip:''}},{id:'other',name:'Keep unrelated Sidebar profile',sex:'female',dob:'1988-01-01',createdAt:2,lastUpdated:2,tags:[],notes:'Keep registry bytes',status:'active',pinned:false,height:null,heightUnit:'cm',location:{country:'',zip:''}}];
export const sidebarSeedFields={
 entries:[{date:'2024-05-10',sourceFile:'synthetic-sidebar.pdf',markers:{'sidebarSpecialty.flagged':130,'sidebarSpecialty.normal':80,'sidebarBlood.normal':80}}],
 customMarkers:{
  'sidebarSpecialty.flagged':{name:'Flagged marker <&>',unit:'u',refMin:60,refMax:100,categoryLabel:'Sidebar specialty: Group <&>',group:sidebarGroup},
  'sidebarSpecialty.normal':{name:'Grouped normal',unit:'u',refMin:60,refMax:100,categoryLabel:'Sidebar specialty: Group <&>',group:sidebarGroup},
  'sidebarBlood.normal':{name:'Blood normal',unit:'u',refMin:60,refMax:100,categoryLabel:'Sidebar Blood <&>'},
 },
 genetics:{snps:{rs429358:{genotype:'TT'}},mtdna:{haplogroup:'H1'}},wearableConnections:{manual:{source:'manual',connectedAt:1,lastSyncAt:1}},
 sunDefaults:{fitzpatrick:'II',completedAt:1},sunSessions:[{id:'sidebar-sun',startedAt:1786100400000,endedAt:1786101300000,durationMin:15,bodyExposure:{preset:'shorts_top_off',fraction:0.45},eyeExposure:{mode:'direct'},doses:{vitamin_d:100,circadian:2000},safety:{medFraction:0.1,fitzpatrick:'II'},calculationStatus:'computed'}],
 lightDevices:[],deviceSessions:[],lightMeasurements:[],lightAudits:[],lightEnvironment:{rooms:[],screens:[]},lightDailyVerdicts:{},
 notes:[{date:'2023-12-01',text:'Keep unrelated Sidebar note <&>'}],contextNotes:'Keep Sidebar context bytes',markerNotes:{'sidebarSpecialty.flagged':'Keep marker note'},importBenchmarks:[],
} satisfies Partial<ProfileData>;
/** All authored child markup remains exact. Native shell/mobile classes are
 * checked separately; dynamic search/filter/style attributes remain ordered. */
export function sidebarPresentationReceipt(root:Element){
 const node=(n:Node):unknown=>{if(n.nodeType===1){const element=n as Element;return{type:n.nodeType,name:element.localName,namespace:element.namespaceURI,attributes:[...element.attributes].map(a=>[a.name,a.value]),children:[...element.childNodes].map(node)};}return{type:n.nodeType,text:n.nodeValue};};
 return{children:[...root.childNodes].map(node),query:(root.querySelector('#sidebar-search')as HTMLInputElement|null)?.value??null,active:[...root.querySelectorAll('.nav-item.active')].map(el=>[el.getAttribute('data-category'),el.getAttribute('aria-current')])};
}
export type SidebarReceipt=ReturnType<typeof sidebarPresentationReceipt>;
export interface SidebarNativeOracle {seed:ProfileData;profileKeys:string[];data:unknown;originalControllerSHA256:string;receipts:Record<string,SidebarReceipt>;rawAssignments:Record<string,string>;groups:Record<string,string|null>;}
