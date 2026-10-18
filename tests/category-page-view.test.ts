// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';

import { showCategory, switchView } from '../js/category-page-view.js';
import { state } from '../js/state.js';
import { createDefaultProfileData } from '../js/profile.js';
import { invalidateActiveDataCache } from '../js/data.js';

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


describe('Category tab selection preserves foreign native controls', () => {
  it('keeps Layers keyboard reachable across repeated chart, table and heatmap switches', () => {
    const imported = state.importedData;
    const charts = state.chartInstances;
    const seed = createDefaultProfileData();
    state.importedData = seed;
    state.chartInstances = {};
    invalidateActiveDataCache();
    document.body.innerHTML = `<div class="view-toggle" role="tablist">
      <button class="view-btn active" role="tab" aria-selected="true" tabindex="0">Charts</button>
      <button class="view-btn" role="tab" aria-selected="false" tabindex="-1">Table</button>
      <button class="view-btn" role="tab" aria-selected="false" tabindex="-1">Heatmap</button>
    </div>
    <button class="view-btn chart-layers-trigger" type="button" aria-haspopup="true" aria-expanded="false" aria-controls="chart-layers-dropdown" data-lab-data-action="toggle-chart-layers">Layers ▾</button>
    <button class="view-btn active" type="button" aria-label="Foreign control">Foreign</button>
    <div id="view-content"></div>`;
    const tabs = [...document.querySelectorAll<HTMLElement>('.view-toggle [role="tab"]')];
    const layers = document.querySelector<HTMLButtonElement>('.chart-layers-trigger')!;
    const foreign = document.querySelector<HTMLButtonElement>('[aria-label="Foreign control"]')!;
    const attributes = (element:Element) => [...element.attributes].map(attribute => [attribute.name, attribute.value]);
    const layersBefore = attributes(layers), foreignBefore = attributes(foreign);
    try {
      for (const view of ['charts', 'table', 'heatmap', 'charts', 'charts', 'table', 'charts'] as const) {
        const selected = ['charts', 'table', 'heatmap'].indexOf(view);
        switchView(view, 'biochemistry', tabs[selected]!);
        expect(state.categoryView).toBe(view);
        expect(tabs.map(tab => [tab.classList.contains('active'), tab.getAttribute('aria-selected'), tab.getAttribute('tabindex')]))
          .toEqual(tabs.map((_, index) => index === selected ? [true, 'true', '0'] : [false, 'false', '-1']));
        expect(attributes(layers)).toEqual(layersBefore);
        expect(layers.tagName).toBe('BUTTON');
        expect(layers.type).toBe('button');
        expect(layers.getAttribute('aria-selected')).toBeNull();
        expect(layers.getAttribute('tabindex')).toBeNull();
        expect(layers.tabIndex).toBe(0);
        expect(attributes(foreign)).toEqual(foreignBefore);
        expect(state.importedData).toEqual(seed);
      }
    } finally {
      state.importedData = imported;
      state.chartInstances = charts;
      invalidateActiveDataCache();
    }
  });
});
