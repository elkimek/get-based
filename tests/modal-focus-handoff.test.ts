// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { closeModalOverlay, openModalOverlay, openAppendedModalOverlay, removeModalOverlay, trapModalFocus } from '../js/modal-lifecycle.js';
import {rememberModalTrigger,restoreModalTrigger} from '../js/modal-trigger-memory.js';
import {installMarkerDetailActionDelegates,type MarkerDetailOptions} from '../js/marker-detail-actions.js';
import {openWithMarkerDetailStylesheet} from '../js/marker-detail-runtime.js';

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = '<button id="launcher">Open</button><div id="overlay"><button id="back">Back</button><input id="draft" aria-label="Draft"></div>';
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

it('does not steal focus from a user editing after an already-visible modal handoff', () => {
  const overlay = document.getElementById('overlay')!; overlay.classList.add('show');
  openModalOverlay(overlay, { initialFocus: '#back', focusDelay: 30 });
  const draft = document.getElementById('draft') as HTMLInputElement;
  draft.focus(); draft.value = 'Keep my draft';
  vi.advanceTimersByTime(30);
  expect(document.activeElement).toBe(draft); expect(draft.value).toBe('Keep my draft');
});
it('still moves unchanged focus to the requested handoff target', () => {
  const overlay = document.getElementById('overlay')!; overlay.classList.add('show');
  document.getElementById('launcher')!.focus();
  openModalOverlay(overlay, { initialFocus: '#back', focusDelay: 30 });
  vi.advanceTimersByTime(30);
  expect(document.activeElement).toBe(document.getElementById('back'));
});
it('keeps explicit focus selected synchronously inside a newly opened modal', () => {
  const overlay = document.getElementById('overlay')!;
  document.getElementById('launcher')!.focus();
  openModalOverlay(overlay, { initialFocus: '#back', focusDelay: 30 });
  document.getElementById('draft')!.focus(); vi.advanceTimersByTime(30);
  expect(document.activeElement).toBe(document.getElementById('draft'));
});


it.each(['explicit', 'auto'] as const)('keeps nested confirmation focus when the parent %s callback runs later', mode => {
  const parent = document.getElementById('overlay')!;
  parent.classList.add('modal-overlay');
  document.getElementById('launcher')!.focus();
  openModalOverlay(parent, mode === 'explicit'
    ? { initialFocus: '#draft', focusDelay: 50 }
    : { focusDelay: 50 });
  const confirmation = document.createElement('div');
  confirmation.className = 'confirm-overlay';
  confirmation.innerHTML = '<button id="confirmation-cancel">Cancel</button>';
  document.body.appendChild(confirmation);
  openModalOverlay(confirmation, { initialFocus: '#confirmation-cancel', focusDelay: 0 });
  vi.advanceTimersByTime(0);
  const cancel = document.getElementById('confirmation-cancel');
  expect(document.activeElement).toBe(cancel);
  vi.advanceTimersByTime(50);
  expect(document.activeElement).toBe(cancel);
});

it.each(['explicit', 'auto'] as const)('keeps custom nonmodal foreground focus ahead of the parent %s callback', mode => {
  const parent = document.getElementById('overlay')!;
  parent.classList.add('modal-overlay');
  document.getElementById('launcher')!.focus();
  openModalOverlay(parent, mode === 'explicit'
    ? { initialFocus: '#draft', focusDelay: 50 }
    : { focusDelay: 50 });
  const foreground = document.createElement('div');
  foreground.innerHTML = '<button id="custom-confirmation-cancel">Cancel</button>';
  document.body.appendChild(foreground);
  openModalOverlay(foreground, { initialFocus: '#custom-confirmation-cancel', focusDelay: 0, showClass: 'visible' });
  vi.advanceTimersByTime(0);
  const cancel = document.getElementById('custom-confirmation-cancel');
  expect(foreground.classList.contains('visible')).toBe(true);
  expect(document.activeElement).toBe(cancel);
  vi.advanceTimersByTime(50);
  expect(document.activeElement).toBe(cancel);
});

it('does not focus a background parent before the foreground confirmation selects a control', () => {
  const parent = document.getElementById('overlay')!;
  parent.classList.add('modal-overlay');
  const launcher = document.getElementById('launcher')!;
  launcher.focus();
  openModalOverlay(parent, { initialFocus: '#draft', focusDelay: 50 });
  const confirmation = document.createElement('div');
  confirmation.className = 'confirm-overlay';
  confirmation.innerHTML = '<button>Cancel</button>';
  document.body.appendChild(confirmation);
  openModalOverlay(confirmation, { autoFocus: false });
  vi.advanceTimersByTime(50);
  expect(document.activeElement).toBe(launcher);
});

it.each(['explicit', 'auto'] as const)('admits a custom nonmodal %s focus handoff after an older visible modal', mode => {
  const parent = document.getElementById('overlay')!;
  const older = document.createElement('div');
  older.className = 'modal-overlay show';
  document.body.insertBefore(older, parent);
  document.getElementById('launcher')!.focus();
  openModalOverlay(parent, mode === 'explicit'
    ? { initialFocus: '#draft', focusDelay: 50, showClass: 'visible' }
    : { focusDelay: 50, showClass: 'visible' });
  vi.advanceTimersByTime(50);
  expect(parent.classList.contains('visible')).toBe(true);
  expect(document.activeElement).toBe(document.getElementById(mode === 'explicit' ? 'draft' : 'back'));
});

it('allows the parent delayed handoff after its nested confirmation closes', () => {
  const parent = document.getElementById('overlay')!;
  parent.classList.add('modal-overlay');
  document.getElementById('launcher')!.focus();
  openModalOverlay(parent, { initialFocus: '#draft', focusDelay: 50 });
  const confirmation = document.createElement('div');
  confirmation.className = 'confirm-overlay';
  confirmation.innerHTML = '<button id="closing-confirmation-cancel">Cancel</button>';
  document.body.appendChild(confirmation);
  openModalOverlay(confirmation, { initialFocus: '#closing-confirmation-cancel', focusDelay: 0 });
  vi.advanceTimersByTime(0);
  expect(document.activeElement).toBe(document.getElementById('closing-confirmation-cancel'));
  closeModalOverlay(confirmation);
  expect(document.activeElement).toBe(document.getElementById('launcher'));
  vi.advanceTimersByTime(50);
  expect(document.activeElement).toBe(document.getElementById('draft'));
});


it.each(['missing', 'detached'] as const)('leaves a closed overlay when its trigger is %s', mode => {
  const overlay = document.getElementById('overlay')!;
  const launcher = document.getElementById('launcher')!;
  if (mode === 'detached') launcher.focus();
  else launcher.remove();
  openModalOverlay(overlay, {autoFocus: false});
  if (mode === 'detached') launcher.remove();
  const draft = document.getElementById('draft')!;
  draft.focus();
  expect(document.activeElement).toBe(draft);
  closeModalOverlay(overlay);
  expect(overlay.classList.contains('show')).toBe(false);
  expect(overlay.contains(document.activeElement)).toBe(false);
  expect(document.activeElement).toBe(document.body);
});

it('still restores the connected caller when closing an overlay', () => {
  const overlay = document.getElementById('overlay')!;
  const launcher = document.getElementById('launcher')!;
  launcher.focus();
  openModalOverlay(overlay, {autoFocus: false});
  document.getElementById('draft')!.focus();
  closeModalOverlay(overlay);
  expect(document.activeElement).toBe(launcher);
});

it('leaves focus ownership to the caller when restoration is explicitly disabled', () => {
  const overlay = document.getElementById('overlay')!;
  document.getElementById('launcher')!.focus();
  openModalOverlay(overlay, {autoFocus: false});
  const draft = document.getElementById('draft')!;
  draft.focus();
  closeModalOverlay(overlay, {restoreFocus: false});
  expect(document.activeElement).toBe(draft);
});

it('retires an older initial-focus timer when the same retained overlay closes and reopens', () => {
  const overlay = document.getElementById('overlay')!;
  const launcher = document.getElementById('launcher')!;
  launcher.focus();
  openModalOverlay(overlay, {initialFocus: '#back', focusDelay: 30});
  vi.advanceTimersByTime(10);
  closeModalOverlay(overlay);
  expect(document.activeElement).toBe(launcher);
  openModalOverlay(overlay, {initialFocus: '#draft', focusDelay: 100});
  expect(document.getElementById('overlay')).toBe(overlay);
  vi.advanceTimersByTime(20);
  expect(document.activeElement).toBe(launcher);
  vi.advanceTimersByTime(80);
  expect(document.activeElement).toBe(document.getElementById('draft'));
});

it('retires an older automatic-focus timer across a retained-overlay session', () => {
  const overlay = document.getElementById('overlay')!;
  const launcher = document.getElementById('launcher')!;
  launcher.focus();
  openModalOverlay(overlay, {focusDelay: 30});
  vi.advanceTimersByTime(10);
  closeModalOverlay(overlay);
  openModalOverlay(overlay, {initialFocus: '#draft', focusDelay: 100});
  vi.advanceTimersByTime(20);
  expect(document.activeElement).toBe(launcher);
  vi.advanceTimersByTime(80);
  expect(document.activeElement).toBe(document.getElementById('draft'));
});
it.each(['explicit', 'auto'] as const)('retires the old %s timer when its overlay ID belongs to a replacement node', mode => {
  const original = document.getElementById('overlay')!;
  const launcher = document.getElementById('launcher')!;
  launcher.focus();
  openModalOverlay('overlay', mode === 'explicit' ? {initialFocus: '#back', focusDelay: 30} : {focusDelay: 30});
  vi.advanceTimersByTime(10);
  closeModalOverlay('overlay');
  original.remove();
  const replacement = document.createElement('div');
  replacement.id = 'overlay';
  replacement.innerHTML = '<button id="back">Replacement back</button><input id="draft" aria-label="Replacement draft">';
  document.body.appendChild(replacement);
  openModalOverlay('overlay', {initialFocus: '#draft', focusDelay: 100});
  expect(document.getElementById('overlay')).toBe(replacement);
  expect(original.isConnected).toBe(false);
  vi.advanceTimersByTime(20);
  expect(document.activeElement).toBe(launcher);
  vi.advanceTimersByTime(80);
  expect(document.activeElement).toBe(replacement.querySelector('#draft'));
});

it('does not run a disposed focus-trap timer into a reopened retained overlay', () => {
  const overlay = document.getElementById('overlay')!;
  const launcher = document.getElementById('launcher')!;
  launcher.focus();
  openModalOverlay(overlay, {autoFocus: false});
  const release = trapModalFocus(overlay);
  try {
    vi.advanceTimersByTime(10);
    closeModalOverlay(overlay);
    release(false);
    openModalOverlay(overlay, {initialFocus: '#draft', focusDelay: 100});
    vi.advanceTimersByTime(20);
    expect(document.activeElement).toBe(launcher);
    vi.advanceTimersByTime(80);
    expect(document.activeElement).toBe(document.getElementById('draft'));
  } finally {release(false); closeModalOverlay(overlay);}
});


it.each(['escape', 'external removal'] as const)('restores the explicit modal initiator after %s when clicking did not focus it', async mode => {
  const launcher = document.getElementById('launcher')!;
  const previous = document.createElement('button'); document.body.appendChild(previous); previous.focus();
  expect(document.activeElement).toBe(previous); expect(document.activeElement).not.toBe(launcher);
  const overlay = document.createElement('div'); overlay.className = 'modal-overlay';
  overlay.innerHTML = '<div role="dialog"><button id="owned-close">Close</button></div>';
  openAppendedModalOverlay(overlay, () => removeModalOverlay(overlay), {returnFocus: launcher});
  vi.advanceTimersByTime(30); expect(document.activeElement).toBe(overlay.querySelector('button'));
  if (mode === 'escape') document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true, cancelable: true}));
  else overlay.remove();
  await Promise.resolve();
  expect(overlay.isConnected).toBe(false); expect(document.activeElement).toBe(launcher);
  previous.remove();
});

it('falls back to existing focus when an explicit modal initiator is disconnected', () => {
  const launcher = document.getElementById('launcher')!; launcher.focus();
  const overlay = document.getElementById('overlay')!;
  openModalOverlay(overlay, {autoFocus: false, returnFocus: document.createElement('button')});
  document.getElementById('back')!.focus(); closeModalOverlay(overlay);
  expect(document.activeElement).toBe(launcher);
});


it('retains the exact external delegated owner across stylesheet loading and unrelated active focus',async()=>{
 const overlay=document.getElementById('overlay')!;overlay.id='modal-overlay';
 const root=document.createElement('div');root.innerHTML='<button data-marker-detail-action="show-detail-modal" data-marker-detail-id="categoryPilot_sparse"><span>Open sparse</span></button>';document.body.prepend(root);
 const launcher=root.querySelector('button')!;document.getElementById('launcher')!.focus();
 let opening:unknown;let captured:MarkerDetailOptions|undefined;
 installMarkerDetailActionDelegates({showDetailModal:(_id,options)=>{
  captured=options;opening=openWithMarkerDetailStylesheet(()=>{
   rememberModalTrigger(options.returnFocus);openModalOverlay(overlay,{returnFocus:options.returnFocus});
  });
 }},root);
 root.querySelector('span')!.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true}));
 expect(captured?.returnFocus).toBe(launcher);expect(overlay.classList.contains('show')).toBe(false);
 // A delayed stylesheet resolves after mouse activation left another target active.
 document.getElementById('launcher')!.focus();
 const stylesheet=document.querySelector<HTMLLinkElement>('[data-marker-detail-stylesheet]');expect(stylesheet).not.toBeNull();stylesheet!.dispatchEvent(new Event('load'));
 await opening;vi.advanceTimersByTime(30);expect(document.activeElement).toBe(document.getElementById('back'));
 closeModalOverlay(overlay);restoreModalTrigger();expect(document.activeElement).toBe(launcher);
});
it('does not offer a nested history control as the outside modal initiator',()=>{
 const overlay=document.getElementById('overlay')!;overlay.id='modal-overlay';overlay.classList.add('show');
 const launcher=document.getElementById('launcher')!;launcher.focus();rememberModalTrigger(launcher);openModalOverlay(overlay,{autoFocus:false});
 const nested=document.createElement('button');nested.dataset.markerDetailAction='show-detail-modal';nested.dataset.markerDetailId='categoryPilot_sparse';nested.textContent='More history';overlay.appendChild(nested);nested.focus();
 let captured:MarkerDetailOptions|undefined;installMarkerDetailActionDelegates({showDetailModal:(_id,options)=>{captured=options;}},overlay);
 nested.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true}));expect(captured).toBeDefined();expect(captured?.returnFocus).toBeUndefined();
 openModalOverlay(overlay,{returnFocus:nested,autoFocus:false});closeModalOverlay(overlay);restoreModalTrigger();expect(document.activeElement).toBe(launcher);
});
it.each(['disconnected','non-element','omitted'] as const)('preserves active-element trigger fallback for %s explicit owners',kind=>{
 const launcher=document.getElementById('launcher')!;launcher.focus();
 if(kind==='omitted')rememberModalTrigger();else rememberModalTrigger(kind==='disconnected'?document.createElement('button'):{});
 document.getElementById('draft')!.focus();restoreModalTrigger();expect(document.activeElement).toBe(launcher);
});
it('does not restore a detached explicit trigger or keep it for a later close',()=>{
 const launcher=document.getElementById('launcher')!;rememberModalTrigger(launcher);launcher.remove();
 const draft=document.getElementById('draft')!;draft.focus();restoreModalTrigger();expect(document.activeElement).toBe(draft);
 const replacement=document.createElement('button');replacement.id='launcher';document.body.prepend(replacement);restoreModalTrigger();expect(document.activeElement).toBe(draft);
});
