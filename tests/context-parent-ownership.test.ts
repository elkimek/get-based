// @vitest-environment jsdom
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {state} from '../js/state.js';
import {createDefaultProfileData} from '../js/profile.js';
import {projectProfileContextCards, renderProfileContextCards} from '../js/context-cards.js';
import {publishContextCardStatus} from '../js/context-card-status.js';
import {acceptContextNotes, contextNotesPresentation} from '../js/context-notes-session.js';
import {ensureContextCardStatus} from '../js/context-card-status-view.js';
import {ensureContextNotes} from '../js/context-notes-view.js';
import {renderDesktopDashboardPage, type DesktopDashboardPageView} from '../js/desktop-dashboard-presentation.js';
import {hydrateDesktopDashboardPage} from '../js/dashboard-page-hydration.js';
import {disposeDashboardPage} from '../js/dashboard-page-owner.js';
import {projectDashboardWidgetFrame, type DashboardWidgetEntry} from '../js/dashboard-widget-presentation.js';
import {contextChildIsOwned} from '../js/context-child-ownership.js';
import {contextStatusElement} from './helpers/context-card-status-fixture.js';
let sequence=0;
const previous={profile:state.currentProfile,data:state.importedData,sex:state.profileSex,dob:state.profileDob};
beforeEach(()=>{
 vi.useFakeTimers();state.currentProfile='context-parent-owner-'+ ++sequence;state.profileSex=null;state.profileDob=null;
 state.importedData=createDefaultProfileData();state.importedData.diet={breakfast:'Reported eggs'};state.importedData.contextNotes='Captured note';
 globalThis.dispatchEvent(new Event('labcharts-profile-switched'));
 document.body.innerHTML='<aside><input id="outside" value="retained"></aside><main></main>';
});
afterEach(async()=>{
 disposeDashboardPage();document.body.replaceChildren();vi.clearAllTimers();vi.useRealTimers();
 state.currentProfile=previous.profile;state.importedData=previous.data;state.profileSex=previous.sex;state.profileDob=previous.dob;
 globalThis.dispatchEvent(new Event('labcharts-profile-switched'));await Promise.resolve();
});
function parent(){
 const main=document.querySelector<HTMLElement>('main')!;
 const entry:DashboardWidgetEntry={def:{id:'profile-context',title:'Your health context'},content:{kind:'profile-context',view:projectProfileContextCards()}};
 const view:DesktopDashboardPageView={greeting:{title:'Dashboard',name:'Tester',subtitle:''},dateRange:null,onboarding:null,reminder:null,
  stickyControls:{organizeLabel:'Customize',showReset:false},organizing:false,widgets:[projectDashboardWidgetFrame(entry,{hidden:[],order:[]},0,[entry],false)],empty:null,footerControls:null};
 main.innerHTML=renderDesktopDashboardPage(view);
 const input=main.querySelector<HTMLTextAreaElement>('.ctx-notes-textarea')!,button=main.querySelector('button'),outside=document.getElementById('outside');
 let inputs=0;input.addEventListener('input',()=>inputs++);input.focus();
 hydrateDesktopDashboardPage(main,view);
 expect(main.querySelector('.ctx-notes-textarea')).toBe(input);expect(main.querySelector('button')).toBe(button);expect(document.activeElement).toBe(input);expect(document.getElementById('outside')).toBe(outside);
 return {main,input,get inputs(){return inputs;}};
}
it('keeps parent-owned status and note subscriptions live through native ensure calls without a second hydration',()=>{
 const current=parent(),summary=contextStatusElement('summary','diet',current.main),indicator=contextStatusElement('health','diet',current.main);
 publishContextCardStatus('diet',{visible:true,label:'Loading',loading:true,tips:true,summary:'Service summary',insight:'Current assessment'});
 expect(()=>{ensureContextCardStatus();ensureContextNotes();ensureContextCardStatus();ensureContextNotes();}).not.toThrow();
 expect(contextStatusElement('health-label','diet',current.main)?.textContent).toBe('Loading');
 expect(contextStatusElement('summary','diet',current.main)).toBe(summary);expect(summary?.textContent).toBe('Service summary');
 expect(contextStatusElement('health','diet',current.main)).toBe(indicator);expect(contextStatusElement('ai','diet',current.main)?.textContent).toContain('Current assessment');
 expect(current.main.querySelectorAll('[data-context-status-key="diet"] .ctx-tips-badge')).toHaveLength(1);
 publishContextCardStatus('diet',{label:'Ready',loading:false,summary:'Updated summary'});
 expect(contextStatusElement('health-label','diet',current.main)?.textContent).toBe('Ready');expect(summary?.textContent).toBe('Updated summary');
 expect(acceptContextNotes(contextNotesPresentation().ticket,'Service note <&>')).toBe(true);
 expect(current.input.value).toBe('Service note <&>');expect(current.main.querySelector('.ctx-notes-status')?.textContent).toBe('Saving…');
 current.input.value='Native input retained';current.input.dispatchEvent(new Event('input',{bubbles:true}));
 expect(current.inputs).toBe(1);expect(contextNotesPresentation().notes).toBe('Native input retained');
 expect(current.main.querySelector('.ctx-notes-textarea')).toBe(current.input);expect(document.activeElement).toBe(current.input);
});

it('retains standalone SSR hydration alongside a genuine parent and releases both child lifetimes',()=>{
 const current=parent();
 const parentHosts=[...current.main.querySelectorAll<HTMLElement>('[data-context-status-host],[data-context-notes-host]')];
 expect(parentHosts.length).toBeGreaterThan(10);expect(parentHosts.every(contextChildIsOwned)).toBe(true);
 const native=document.createElement('div');native.innerHTML=renderProfileContextCards();document.body.append(native);
 const nativeInput=native.querySelector('.ctx-notes-textarea');
 expect(()=>{ensureContextCardStatus();ensureContextNotes();}).not.toThrow();
 const nativeHosts=[...native.querySelectorAll<HTMLElement>('[data-context-status-host],[data-context-notes-host]')];
 expect(nativeHosts.every(contextChildIsOwned)).toBe(true);expect(native.querySelector('.ctx-notes-textarea')).toBe(nativeInput);
 publishContextCardStatus('diet',{visible:true,label:'Ready together',summary:'Both reactive children',tips:true});
 for(const host of [current.main,native]){
  expect(contextStatusElement('health-label','diet',host)?.textContent).toBe('Ready together');
  expect(contextStatusElement('summary','diet',host)?.textContent).toBe('Both reactive children');
  expect(host.querySelectorAll('[data-context-status-key="diet"] .ctx-tips-badge')).toHaveLength(1);
 }
 const detachedSummary=contextStatusElement('summary','diet',current.main)!;
 disposeDashboardPage();expect(parentHosts.every(host=>!contextChildIsOwned(host))).toBe(true);
 expect(nativeHosts.every(contextChildIsOwned)).toBe(true);
 publishContextCardStatus('diet',{summary:'Standalone remains live'});
 expect(contextStatusElement('summary','diet',native)?.textContent).toBe('Standalone remains live');
 expect(detachedSummary.textContent).toBe('Both reactive children');
 native.remove();ensureContextCardStatus();ensureContextNotes();
 expect(nativeHosts.every(host=>!contextChildIsOwned(host))).toBe(true);
});
