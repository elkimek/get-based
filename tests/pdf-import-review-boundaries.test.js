// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';

import { getExcludedImportIndices, showImportPreview } from '../js/pdf-import-review.js';

afterEach(() => {
  document.body.replaceChildren();
  localStorage.clear();
});

describe('PDF import review boundaries', () => {
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

    expect(() => showImportPreview(unusableResult)).not.toThrow();
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
