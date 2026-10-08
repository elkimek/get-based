// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { openModalOverlay } from '../js/modal-lifecycle.js';

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
