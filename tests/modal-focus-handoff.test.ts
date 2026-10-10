// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { closeModalOverlay, openModalOverlay } from '../js/modal-lifecycle.js';

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
