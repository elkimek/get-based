import {renderHTML} from './components/SidebarNavigation.svelte.html.js';
import {escapeAttr} from './utils.js';
export type SidebarIcon = 'search' | 'dashboard' | 'labs' | 'biologyScores' | 'genome' | 'body' | 'nutrition' | 'supplements' | 'light' | 'insight' | 'compare' | 'correlations' | 'recommendations' | 'context' | 'knowledge' | 'report' | 'plus' | 'emf';
export type SidebarActionName = 'navigate'|'open-emf-assessment'|'open-light-assessment'|'open-report-builder'|'open-context'|'open-knowledge-base'|'open-custom-marker'|'toggle-group';
export interface SidebarAction {readonly name:SidebarActionName;readonly route?:string;readonly group?:string}
export type SidebarBadge = {readonly kind:'dot'}|{readonly kind:'count'|'flagged';readonly text:string};
export interface ConditionalSidebarView {readonly category:string;readonly action:SidebarAction;readonly icon:SidebarIcon;readonly label:string;readonly badge:SidebarBadge}
export interface SidebarCategoryView {readonly category:string;readonly markerNames:string;readonly group:string;readonly action:SidebarAction;readonly label:string;readonly badge:Exclude<SidebarBadge,{readonly kind:'dot'}>}
export interface SidebarRow {readonly action:SidebarAction;readonly icon:SidebarIcon}
export interface SidebarGroup {readonly className:string;readonly name:string;readonly headerAction:SidebarAction;readonly toggleAction:SidebarAction;readonly expanded:'true'|'false';readonly accessibleName:string;readonly label:string;readonly flagged:string|null;readonly itemsName:string;readonly collapsedStyle:string|undefined;readonly items:readonly SidebarCategoryView[]}
export interface SidebarView {readonly searchIcon:SidebarIcon;readonly dashboard:SidebarRow;readonly dashboardCount:string;readonly labs:SidebarRow;readonly labsCount:string;readonly biology:SidebarRow;readonly genome:SidebarRow;readonly genomeBadge:SidebarBadge;readonly body:SidebarRow;readonly bodyBadge:SidebarBadge;readonly nutrition:SidebarRow;readonly supplements:SidebarRow;readonly light:ConditionalSidebarView;readonly insight:SidebarRow;readonly recommendations:SidebarRow;readonly compare:SidebarRow;readonly correlations:SidebarRow;readonly emf:ConditionalSidebarView;readonly lightAssessment:ConditionalSidebarView;readonly reports:SidebarRow;readonly context:SidebarRow;readonly knowledge:SidebarRow;readonly custom:SidebarRow;readonly labAction:SidebarAction;readonly categories:readonly SidebarCategoryView[];readonly groups:readonly SidebarGroup[]}
/** Match native pre-encoding escapeHTML conversion, including String(Symbol). */
export function sidebarText(value:unknown):string{return value===null||value===undefined?'':String(value);}
/** Native delegate attributes remain qualified while genuine nodes own contextual encoding. */
export function sidebarAction(native:string,name:SidebarActionName,route?:string,group?:string):SidebarAction{
 const expected=`data-nav-action="${escapeAttr(name)}"`+(route===undefined?'':` data-nav-route="${escapeAttr(String(route))}"`)+(group===undefined?'':` data-nav-group="${escapeAttr(String(group))}"`);
 if(native!==expected)throw new Error('Unqualified native Sidebar action');
 return {name,...(route===undefined?{}:{route}),...(group===undefined?{}:{group})};
}
export function renderSidebarPresentation(view:SidebarView):string{return renderHTML({view});}
