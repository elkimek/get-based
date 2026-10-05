// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';

import { showCategory, switchView } from '../js/category-page-view.js';
import { state } from '../js/state.js';

const previousCategoryView = state.categoryView;

afterEach(() => {
  state.categoryView = previousCategoryView;
  document.body.replaceChildren();
});

describe('Category page DOM lifecycle guards', () => {
  it('does not partially switch views after the view container is removed', () => {
    const button = document.createElement('button');

    expect(() => switchView('table', 'biochemistry', button)).not.toThrow();
    expect(state.categoryView).toBe(previousCategoryView);
    expect(button.classList.contains('active')).toBe(false);
  });

  it('does not prepare category data after the main container is removed', () => {
    const unusableData = {};

    expect(() => showCategory('biochemistry', unusableData)).not.toThrow();
  });
});
