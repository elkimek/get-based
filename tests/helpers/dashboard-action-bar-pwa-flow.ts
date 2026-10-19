import {nativeTabKey} from './native-tab-key.js';
import {expect, type Locator, type Page} from '@playwright/test';
export const layoutKey = 'labcharts-default-dashboardWidgetsV13';
export const biometricKey = 'labcharts-default-dashboardBiometricMetricsV1';
export interface NativeEvent {type:string;target:string;action:string|null;trusted:boolean;key:string|null;pointerType:string|null;at:number}
export interface FlowWindow extends Window {dashboardActionEvents:NativeEvent[]; dashboardActionCsp(value:string):Promise<void>}
export async function activate(page:Page,control:Locator){
  if(await page.evaluate(()=>matchMedia('(pointer: coarse)').matches))await control.tap();else await control.click();
}
export async function openDashboard(page:Page){
  const chat=page.getByRole('button',{name:'Close chat',exact:true});if(await chat.isVisible())await activate(page,chat);
  const changelog=page.locator('#changelog-overlay [data-changelog-action="close"]');if(await changelog.isVisible())await activate(page,changelog);
  const menu=page.getByRole('button',{name:'Menu',exact:true});if(await menu.isVisible())await activate(page,menu);
  await activate(page,page.locator('[data-nav-action="navigate"][data-nav-route="dashboard"]:visible').first());
  await expect(page.locator('.dashboard-sticky-actions:visible,.m-dashboard-widget-actions:visible').first()).toBeVisible();
}
export function toolbar(page:Page){return page.locator('.dashboard-sticky-actions:visible,.m-dashboard-widget-actions:visible').first();}
export function action(page:Page,name:string){return toolbar(page).locator('[data-dashboard-widget-action="'+name+'"]');}
export async function tabTo(page:Page,target:Locator){
  for(let n=0;n<100;n++){if(await target.evaluate(node=>node===document.activeElement))return;await page.keyboard.press(nativeTabKey(page));}
  throw new Error('Native Tab did not reach Dashboard action bar control');
}
export function installEvents(){
  const port=window as unknown as FlowWindow;port.dashboardActionEvents=[];
  for(const type of ['pointerdown','click','keydown','focusin','focusout'])document.addEventListener(type,event=>{
    const target=event.target;if(!(target instanceof Element)||!target.closest('.dashboard-sticky-actions,.m-dashboard-widget-actions,.dashboard-organize-footer,#dashboard-widget-picker-overlay,.dashboard-widget-tool'))return;
    port.dashboardActionEvents.push({type,target:target.id||target.tagName,action:target.closest('[data-dashboard-widget-action]')?.getAttribute('data-dashboard-widget-action')??null,
      trusted:event.isTrusted,key:event instanceof KeyboardEvent?event.key:null,pointerType:event instanceof PointerEvent?event.pointerType:null,at:performance.now()});
  },true);
  document.addEventListener('securitypolicyviolation',event=>void port.dashboardActionCsp(event.violatedDirective));
}
export async function preferences(page:Page){return page.evaluate(()=>Object.fromEntries(Object.keys(localStorage).sort().map(key=>[key,localStorage.getItem(key)])));}
export function protectedPreferences(value:Record<string,string|null>){
  const copy={...value};delete copy[layoutKey];delete copy[biometricKey];return copy;
}
export async function flow(page:Page,record:(name:string)=>Promise<void>){
  const start=await page.evaluate(()=>(window as unknown as FlowWindow).dashboardActionEvents.length);
  const before=await preferences(page);await expect(action(page,'toggle-organize')).toHaveText('Customize');
  await expect(action(page,'reset-widgets')).toHaveCount(0);await record('normal');
  await tabTo(page,action(page,'toggle-organize'));await page.keyboard.press('Enter');
  await expect(action(page,'toggle-organize')).toHaveText('Done');await expect(action(page,'reset-widgets')).toHaveCount(1);await record('organize');
  await tabTo(page,action(page,'open-picker'));await activate(page,action(page,'open-picker'));const picker=page.locator('#dashboard-widget-picker-overlay');
  await expect(picker).toBeVisible();await expect(picker.getByRole('dialog')).toHaveAttribute('aria-labelledby','dashboard-widget-picker-title');
  await expect(page.locator('body')).toHaveCSS('overflow','hidden');await record('picker');
  await page.keyboard.press('Escape');await expect(picker).toHaveCount(0);
  await expect(action(page,'open-picker')).toBeFocused();await record('escape-closed');
  await tabTo(page,action(page,'open-picker'));await activate(page,action(page,'open-picker'));await expect(picker).toBeVisible();
  await activate(page,picker.locator('[data-dashboard-widget-action="close-picker"]'));
  await expect(picker).toHaveCount(0);await expect(action(page,'open-picker')).toBeFocused();
  await tabTo(page,action(page,'open-picker'));await activate(page,action(page,'open-picker'));await expect(picker).toBeVisible();
  expect(await page.evaluate(()=>document.elementFromPoint(8,8)?.id)).toBe('dashboard-widget-picker-overlay');
  if(await page.evaluate(()=>matchMedia('(pointer: coarse)').matches))await page.touchscreen.tap(8,8);else await page.mouse.click(8,8);
  await expect(picker).toHaveCount(0);await expect(action(page,'open-picker')).toBeFocused();
  await page.keyboard.press(nativeTabKey(page, true));await expect(action(page,'toggle-organize')).toBeFocused();await page.keyboard.press('Space');
  await expect(action(page,'toggle-organize')).toHaveText('Customize');expect(await preferences(page)).toEqual(before);await record('done');
  await activate(page,action(page,'toggle-organize'));await expect(action(page,'toggle-organize')).toHaveText('Done');
  await activate(page,action(page,'reset-widgets'));await expect(action(page,'toggle-organize')).toHaveText('Customize');
  await expect(action(page,'reset-widgets')).toHaveCount(0);
  const reset=await preferences(page);expect(reset[layoutKey]).toBeUndefined();expect(reset[biometricKey]).toBeUndefined();
  expect(protectedPreferences(reset)).toEqual(protectedPreferences(before));await record('reset');
  const events=await page.evaluate(start=>(window as unknown as FlowWindow).dashboardActionEvents.slice(start),start);
  const clicks=events.filter(event=>event.type==='click'&&event.action);
  expect(clicks.map(event=>[event.action,event.trusted])).toEqual([
    ['toggle-organize',true],['open-picker',true],['open-picker',true],['close-picker',true],['open-picker',true],
    ['toggle-organize',true],['toggle-organize',true],['reset-widgets',true],
  ]);
  expect(events.some(event=>event.type==='keydown'&&event.trusted&&event.key==='Enter')).toBe(true);
  expect(events.some(event=>event.type==='keydown'&&event.trusted&&event.key===' ')).toBe(true);
  expect(events.some(event=>event.type==='keydown'&&event.trusted&&event.key==='Escape')).toBe(true);
  let lastAt=-Infinity;
  for(const event of events){expect(Number.isFinite(event.at)).toBe(true);expect(event.at).toBeGreaterThanOrEqual(lastAt);lastAt=event.at;if(['click','keydown','pointerdown'].includes(event.type))expect(event.trusted).toBe(true);}
  return {before,reset,events};
}
