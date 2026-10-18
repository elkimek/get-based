// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { closeModalOverlay, openModalOverlay } from '../js/modal-lifecycle.js';
import { showConfirmDialog } from '../js/utils.js';

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = '<button id="launcher">Open</button>';
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

// Scheduling and public-result regression; genuine Tab/pointer coverage is separate.
it.each(['cancel', 'escape', 'ok'] as const)('reuses confirmation after a later parent and settles %s once', async action => {
  const launcher = document.getElementById('launcher')!;
  launcher.focus();
  const first = showConfirmDialog('Keep this message');
  vi.advanceTimersByTime(0);
  const overlay = document.getElementById('confirm-dialog-overlay')!;
  const originalHTML = overlay.innerHTML;
  expect(document.activeElement).toBe(overlay.querySelector('#confirm-cancel'));
  (overlay.querySelector('#confirm-cancel') as HTMLButtonElement).click();
  expect(await first).toBe(false);
  expect(document.activeElement).toBe(launcher);

  const parent = document.createElement('div');
  parent.className = 'modal-overlay';
  parent.innerHTML = '<div class="modal"><button id="parent-launcher">Open nested confirmation</button></div>';
  document.body.appendChild(parent);
  openModalOverlay(parent, { initialFocus: '#parent-launcher', focusDelay: 30 });
  vi.advanceTimersByTime(30);
  const parentLauncher = document.getElementById('parent-launcher')!;
  expect(document.activeElement).toBe(parentLauncher);
  const previousClick = vi.fn();
  overlay.onclick = previousClick;
  const result = showConfirmDialog('Keep this message');
  vi.advanceTimersByTime(0);
  expect(document.getElementById('confirm-dialog-overlay')).toBe(overlay);
  expect(overlay.innerHTML).toBe(originalHTML);
  expect(parent.compareDocumentPosition(overlay) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  expect(document.activeElement).toBe(overlay.querySelector('#confirm-cancel'));
  expect(parent.classList.contains('show')).toBe(true);
  if (action === 'escape') document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  else (overlay.querySelector(action === 'ok' ? '#confirm-ok' : '#confirm-cancel') as HTMLButtonElement).click();
  expect(await result).toBe(action === 'ok');
  expect(overlay.classList.contains('show')).toBe(false);
  expect(overlay.onclick).toBe(previousClick);
  expect(overlay.dataset.escapeOwner).toBeUndefined();
  expect(document.activeElement).toBe(parentLauncher);
  expect(parent.classList.contains('show')).toBe(true);
  closeModalOverlay(parent);
  expect(document.activeElement).toBe(launcher);
});
