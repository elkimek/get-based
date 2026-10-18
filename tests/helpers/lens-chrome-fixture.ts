/** Test-only adapter for immutable historical arbitrary-HTML chrome receipts.
 * Production accepts closed feature views. These reference leaves deliberately
 * exercise the original fixture markup inside the current genuine chrome. */
import * as shell from '../../js/lens-page-shell.js';
import {renderHTML as renderShell} from '../../js/components/LensShellPresentation.svelte.html.js';
const placeholder={kind:'genome' as const,view:{kind:'empty' as const,contributionHref:null}};
type Options=NonNullable<Parameters<typeof shell.renderLensWidget>[5]>;
function bodyInto(root:HTMLElement,body:unknown,tools:ReturnType<typeof shell.getLensWidgetChrome>['tools'],compact:boolean):void{
 if(!compact&&!body)return;
 const target=compact?root.querySelector<HTMLElement>('.biology-score-lens-row'):root.querySelector<HTMLElement>('.dashboard-widget-body');
 if(!target)throw Error('Missing genuine Lens fixture body receiver');
 target.innerHTML=compact?String(body).replace('<!--score-tools-->',renderShell({kind:'tools',view:tools})):String(body);
}
export function renderLensWidgetChromeFixture(id:string,title:unknown,description:string|undefined,body:unknown,size='full',opts:Options={}):string{
 const host=document.createElement('div');host.innerHTML=shell.renderLensWidget(id,title,description,opts.compactScore||body?placeholder:null,size,opts);
 bodyInto(host,body,shell.getLensWidgetChrome(id,title,description,size,opts).tools,!!opts.compactScore);
 return host.innerHTML;
}
export function renderLensHeaderChromeFixture(title:unknown,subtitle:unknown,actions:unknown='',options:{className?:unknown}={}):string{
 const host=document.createElement('div');host.innerHTML=shell.renderLensHeader(title,subtitle,actions?{kind:'actions',view:{buttons:[],affiliate:false}}:null,options);
 if(actions){const target=host.querySelector('.dashboard-widget-inline-controls');if(!target)throw Error('Missing genuine Lens fixture action receiver');target.innerHTML=String(actions);}
 return host.innerHTML;
}
export function renderLensPageWidgetsChromeFixture(route:string,widgets:Array<shell.LensPageWidget|null|undefined|false>,options:{group?:string}={}):string{
 const rows=widgets.filter((w):w is shell.LensPageWidget=>!!w);
 const host=document.createElement('div');host.innerHTML=shell.renderLensPageWidgets(route,rows.map(row=>({...row,body:row.opts?.compactScore||row.body?placeholder:null})),options);
 for(const element of host.querySelectorAll<HTMLElement>(':scope > .lens-page-widgets > [data-widget-id]')){
  const row=[...rows].reverse().find(row=>row.id===element.dataset.widgetId);if(!row)throw Error('Unknown Lens fixture widget');
  const tools={move:null,dashboard:null};const receiver=document.createElement('div');receiver.append(element.cloneNode(true));
  if(row.opts?.compactScore){throw Error('Compact fixture grids must declare their original tools explicitly');}
  bodyInto(receiver,row.body,tools,false);element.replaceWith(receiver.firstElementChild!);
 }
 return host.innerHTML;
}

/** Use current genuine Dashboard chrome around immutable HTML parity leaves.
 * The product frame receives a real closed content model. Only this test host
 * places original/current captured child markup into its existing DOM receiver. */
export function renderDashboardWidgetChromeFixture(
 controls:Pick<ReturnType<typeof import('../../js/dashboard-widget-controls.js').createDashboardWidgetControls>,'renderDashboardWidget'>,
 entry:{def:import('../../js/dashboard-widget-presentation.js').DashboardWidgetDefinition;body:unknown},
 prefs:import('../../types/dashboard-widget-controls.js').ControlsPreferences,index:number,entries:{length:number},
):string {
 const host=document.createElement('div');
 host.innerHTML=controls.renderDashboardWidget({def:entry.def,content:entry.body?placeholder:null},prefs,index,entries);
 if(entry.body){
  const receiver=host.querySelector<HTMLElement>('.dashboard-widget-body');
  if(!receiver)throw new Error('Missing genuine Dashboard fixture body receiver');
  receiver.innerHTML=String(entry.body);
 }
 return host.innerHTML;
}
