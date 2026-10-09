// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';

import { closeImportModal, getExcludedImportIndices, showImportPreview } from '../js/pdf-import-review.js';
import { closeModalOverlay, openAppendedModalOverlay, openModalOverlay, removeModalOverlay } from '../js/modal-lifecycle.js';

const ownedOverlays: HTMLElement[] = [];

afterEach(async () => {
  closeImportModal();
  for (const overlay of ownedOverlays.splice(0)) removeModalOverlay(overlay);
  // Let detached child traps release their independent locks before removing the remaining DOM.
  await Promise.resolve();
  document.body.replaceChildren();
  document.body.style.overflow = '';
  localStorage.clear();
});

describe('PDF import review boundaries', () => {
  it('keeps repeated review and nested modal scroll locks until each owner closes', async () => {
    document.body.style.overflow = 'scroll';
    document.body.innerHTML = '<div id="import-modal-overlay"><div id="import-modal"></div></div>';
    const preview = {date: '2026-07-31', fileName: 'safe.pdf', markers: []};
    showImportPreview(preview);
    showImportPreview(preview);
    const review = document.getElementById('import-modal-overlay')!;
    expect(review.classList.contains('show')).toBe(true);
    expect(document.body.style.overflow).toBe('hidden');

    const child = document.createElement('div');
    child.className = 'modal-overlay';
    child.innerHTML = '<div role="dialog"><button type="button">Close nested picker</button></div>';
    ownedOverlays.push(child);
    openAppendedModalOverlay(child, () => removeModalOverlay(child), {
      autoFocus: false, focusTrapOptions: {autoFocus: false},
    });
    expect(document.body.style.overflow).toBe('hidden');
    removeModalOverlay(child);
    await Promise.resolve();
    expect(child.isConnected).toBe(false);
    expect(review.classList.contains('show')).toBe(true);
    expect(document.body.style.overflow).toBe('hidden');

    const other = document.createElement('div');
    other.className = 'modal-overlay';
    document.body.append(other);
    ownedOverlays.push(other);
    openModalOverlay(other, {scrollLock: true, autoFocus: false});
    closeImportModal();
    expect(review.classList.contains('show')).toBe(false);
    expect(other.classList.contains('show')).toBe(true);
    expect(document.body.style.overflow).toBe('hidden');
    closeModalOverlay(other);
    expect(document.body.style.overflow).toBe('scroll');
  });

  it('ignores malformed excluded-row indices', () => {
    document.body.innerHTML = `
      <table class="import-table">
        <tbody>
          <tr class="import-excluded" data-import-idx="2"></tr>
          <tr class="import-excluded" data-import-idx="3x"></tr>
          <tr class="import-excluded" data-import-idx="-1"></tr>
        </tbody>
      </table>`;

    expect([...getExcludedImportIndices()]).toEqual([2]);
  });

  it('does not prepare a preview after its modal DOM is removed', () => {
    const unusableResult = { markers: null };

    expect(() => (showImportPreview as (result: unknown) => ReturnType<typeof showImportPreview>)(unusableResult)).not.toThrow();
  });

  it('renders configurable debug model labels as text instead of markup', () => {
    localStorage.setItem('labcharts-debug', 'true');
    localStorage.setItem('labcharts-ollama-model', '<img src=x onerror=alert(1)>');
    document.body.innerHTML = `
      <div id="import-modal-overlay">
        <div id="import-modal"></div>
      </div>`;

    showImportPreview({
      date: '2026-07-31',
      fileName: 'safe.pdf',
      markers: [],
      privacyMethod: 'ollama',
      timings: { pii: 1, analysis: 2 },
    });

    const debugNote = document.querySelector('.import-debug-note');
    expect(debugNote?.querySelector('img')).toBeNull();
    expect(debugNote?.textContent).toContain('<img src=x onerror=alert(1)>');
  });
});
