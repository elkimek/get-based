// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { mountWearablesSettings, disposeWearablesSettings, getWearablesSettingsView } from '../js/wearables-settings-component.js';
import type { WearablesSettingsSnapshot, WearablesRow } from '../js/wearables-settings-contract.js';
const manual: WearablesRow = { id:'manual',name:'Manual',connected:true,wordmark:false,status:'Connected',updated:'',tone:'success',detail:'manual',startOpen:false,identity:'Entered manually',meta:'',notices:[],explanation:'Manage entries',actions:[{action:'manual-disconnect',label:'Delete all manual entries',tone:'danger'}] };
const apple: WearablesRow = { ...manual,id:'apple_health',name:'Apple Health',connected:false,detail:'apple',startOpen:true,identity:'',actions:[] };
const snapshot: WearablesSettingsSnapshot = { profileId:'profile-a',stripHidden:false,groups:[{id:'local',title:'Import or enter data',hint:'Local sources',rows:[manual,apple]}] };
function mount(initial = snapshot) {
  const host = document.createElement('section'); host.id='wearables-section'; document.body.append(host);
  return { host,view:mountWearablesSettings(host,initial) };
}
afterEach(() => { disposeWearablesSettings(); document.body.replaceChildren(); });
it('escapes account text and action attributes without raw HTML or inline handlers', () => {
  mount({ ...snapshot,groups:[{...snapshot.groups[0]!,rows:[{...manual,identity:'<img src=x onerror=alert(1)>',actions:[{action:'disconnect',adapter:'synthetic"id',label:'Remove'}]}]}] });
  expect(document.querySelector('.wearable-adapter-identity')!.textContent).toBe('<img src=x onerror=alert(1)>');
  expect(document.querySelector('.wearable-adapter-identity img')).toBeNull();
  expect((document.querySelector('[data-wearable-settings-action="disconnect"]') as HTMLElement).dataset.wearableSettingsAdapter).toBe('synthetic"id');
  expect(document.querySelector('[onclick]')).toBeNull();
});
it('owns counts, disabled actions and import status without replacing form controls', () => {
  const { view }=mount(); const input=document.querySelector('#apple-health-file-input');
  view.setManualCounts('2 weight readings'); view.setPending('manual',true);
  expect(document.querySelector('[data-role="manual-counts"]')!.textContent).toBe('2 weight readings');
  expect((document.querySelector('[data-wearable-settings-action="manual-disconnect"]') as HTMLButtonElement).disabled).toBe(true);
  view.setImportProgress({percent:40,message:'parsing… 40%'});
  expect((document.querySelector('#apple-health-progress') as HTMLElement).hidden).toBe(false);
  expect(document.querySelector('[role="progressbar"]')!.getAttribute('aria-valuenow')).toBe('40');
  expect((document.querySelector('.apple-health-dropzone') as HTMLButtonElement).disabled).toBe(true);
  view.setImportProgress({percent:0,message:'Failed: synthetic',failed:true});
  expect((document.querySelector('.apple-health-dropzone') as HTMLButtonElement).disabled).toBe(false);
  expect(document.querySelector('#apple-health-file-input')).toBe(input);
});
it('retains focused controls and user-opened rows through same-profile refresh', () => {
  const {host,view}=mount(); const detail=document.querySelector('[data-adapter="manual"]') as HTMLDetailsElement;
  detail.open=true; detail.dispatchEvent(new Event('toggle'));
  const button=detail.querySelector('button')!; button.focus();
  view.update({...snapshot,stripHidden:true});
  expect(host.querySelector('[data-adapter="manual"]')).toBe(detail); expect(detail.open).toBe(true);
  expect(document.activeElement).toBe(button);
  expect((document.querySelector('#wearables-strip-hidden-toggle') as HTMLInputElement).checked).toBe(false);
});
it('rejects removed/replaced roots and old profile replies', () => {
  const {host,view}=mount(); host.replaceChildren(); expect(view.isCurrent()).toBe(false);
  const replacement=mountWearablesSettings(host,{...snapshot,profileId:'profile-b'});
  view.setManualCounts('STALE'); view.setImportProgress({percent:90,message:'PRIVATE OLD FILE'});
  expect(replacement.isCurrent()).toBe(true); expect(document.body.textContent).not.toContain('STALE'); expect(document.body.textContent).not.toContain('PRIVATE OLD FILE');
  host.remove(); expect(getWearablesSettingsView()).toBeNull();
});
it('clears pending/private import presentation and counts on profile replacement', () => {
  const {host,view}=mount(); view.setImportProgress({percent:20,message:'old private filename'}); view.setManualCounts('Old counts'); view.setPending('manual',true);
  mountWearablesSettings(host,{...snapshot,profileId:'profile-b'});
  expect(document.body.textContent).not.toContain('old private filename'); expect(document.body.textContent).not.toContain('Old counts');
  expect((document.querySelector('#apple-health-progress') as HTMLElement).hidden).toBe(true);
  expect((document.querySelector('[data-wearable-settings-action="manual-disconnect"]') as HTMLButtonElement).disabled).toBe(false);
});
