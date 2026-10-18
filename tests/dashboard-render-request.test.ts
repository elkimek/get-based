// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {state} from '../js/state.js';
import {recordRouteChange} from '../js/route-lifecycle.js';
import {beginDashboardRenderRequest,retireDashboardRenderRequests,showDashboardRendererFailure,showDashboardRendererLoading} from '../js/dashboard-render-request.js';

const previous={currentView:state.currentView,currentProfile:state.currentProfile,importedData:state.importedData};
let mobile=false;
beforeEach(()=>{Object.assign(state,previous,{currentView:'dashboard',currentProfile:'render-owner'});document.body.innerHTML='<button id="outside">Outside</button><main id="main-content"></main>';mobile=false;});
afterEach(()=>{retireDashboardRenderRequests();Object.assign(state,previous);document.body.replaceChildren();});
const main=()=>document.getElementById('main-content')!;
it('allows only the captured route or Dashboard within the same navigation revision',()=>{
  state.currentView='labs';const request=beginDashboardRenderRequest(main(),()=>mobile);expect(request.isCurrent()).toBe(true);
  state.currentView='dashboard';expect(request.isCurrent()).toBe(true);state.currentView='insight';expect(request.isCurrent()).toBe(false);
});
it.each(['profile','data','route revision','same-route replacement','main replacement','disconnected main','viewport'] as const)('retires publication after %s',kind=>{
  const host=main(),request=beginDashboardRenderRequest(host,()=>mobile);expect(request.isCurrent()).toBe(true);
  if(kind==='profile')state.currentProfile='other';
  if(kind==='data')state.importedData={...state.importedData};
  if(kind==='route revision')recordRouteChange();
  if(kind==='same-route replacement')beginDashboardRenderRequest(host,()=>mobile);
  if(kind==='main replacement'){const replacement=document.createElement('main');replacement.id='main-content';host.replaceWith(replacement);}
  if(kind==='disconnected main')host.remove();
  if(kind==='viewport')mobile=true;
  expect(request.isCurrent()).toBe(false);expect(request.mayRunFocusEffects()).toBe(false);
});
it('retires pending populated publication when the synchronous empty owner renders',()=>{
  const request=beginDashboardRenderRequest(main(),()=>mobile);retireDashboardRenderRequests();expect(request.isCurrent()).toBe(false);
});
it('preserves a newly focused outside control or modal while allowing the owned page publication',()=>{
  const request=beginDashboardRenderRequest(main(),()=>mobile);expect(request.mayRunFocusEffects()).toBe(true);
  document.getElementById('outside')!.focus();expect(request.isCurrent()).toBe(true);expect(request.mayRunFocusEffects()).toBe(false);
  document.getElementById('outside')!.blur();
  const dialog=document.createElement('dialog');dialog.setAttribute('open','');document.body.append(dialog);
  expect(request.isCurrent()).toBe(true);expect(request.mayRunFocusEffects()).toBe(false);
});
it('renders explicit accessible loading/failure feedback and a real one-shot retry control',()=>{
  const host=main(),retry=vi.fn();showDashboardRendererLoading(host);
  const status=host.querySelector('[role="status"]')!;expect(status.textContent).toBe('Loading Dashboard…');expect(status.getAttribute('aria-busy')).toBe('true');
  showDashboardRendererFailure(host,retry);expect(host.querySelector('[role="alert"]')?.textContent).toContain('Dashboard could not be loaded. Try again.');
  const button=host.querySelector<HTMLButtonElement>('[data-dashboard-render-retry]')!;expect(button.type).toBe('button');button.click();button.click();expect(retry).toHaveBeenCalledTimes(1);
});
