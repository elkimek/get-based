// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';

import { getExcludedImportIndices, showImportPreview } from '../js/pdf-import-review.js';

afterEach(() => {
  document.body.replaceChildren();
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
});
