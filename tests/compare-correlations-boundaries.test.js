// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';

import { showCompare, showCorrelations } from '../js/compare-correlations.js';

afterEach(() => {
  document.body.replaceChildren();
});

describe('Compare and correlations DOM boundaries', () => {
  it('does not prepare compare data after the main container is removed', () => {
    expect(() => showCompare({ dates: null })).not.toThrow();
  });

  it('does not prepare correlation data after the main container is removed', () => {
    expect(() => showCorrelations({ categories: null })).not.toThrow();
  });
});
