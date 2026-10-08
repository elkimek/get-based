// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { renderHTML } from '../js/components/SunBodyPicker.svelte.html.js';
import { projectBodyPicker, type BodyPickerInput } from '../js/sun-body-picker-presentation.js';
import { BODY_REGIONS, renderBodySilhouette, resetBodySilhouetteState } from '../js/sun-body-silhouette.js';
import { configureSunBodySilhouetteRuntimeDeps } from '../js/sun-body-silhouette-runtime.js';

for (const sex of ['female', 'male'] as const) it(`preserves ${sex} anatomy, independent front/back regions, SVG namespaces and keyboard metadata`, () => {
  const previous = configureSunBodySilhouetteRuntimeDeps({ getActiveProfileId: () => 'profile', getProfiles: () => [{ id: 'profile', sex, name: 'Profile', dob: null, location: { country: '', zip: '' }, tags: [], notes: '', status: 'active', avatar: null, height: null, heightUnit: 'cm', createdAt: 1, lastUpdated: 1, pinned: false }] });
  try {
    resetBodySilhouetteState();
    const selected = new Set(['face', 'arms-back']);
    const host = document.createElement('div'); host.innerHTML = renderBodySilhouette(selected);
    const svg = host.querySelector('svg')!;
    expect(svg.getAttribute('viewBox')).toBe('0 0 200 220'); expect(svg.dataset.sex).toBe(sex); expect(svg.dataset.selectionOverlay).toBe('pending');
    expect(host.querySelectorAll('[role="button"]')).toHaveLength(16);
    expect([...host.querySelectorAll('[data-region]')].map(path => path.getAttribute('data-region')).sort()).toEqual(BODY_REGIONS.map(region => region.key).sort());
    for (const path of host.querySelectorAll('[data-region]')) {
      expect(path.namespaceURI).toBe('http://www.w3.org/2000/svg'); expect(path.getAttribute('tabindex')).toBe('0');
      expect(path.getAttribute('aria-pressed')).toBe(String(selected.has(path.getAttribute('data-region')!)));
    }
    expect(host.querySelector('[data-region="arms-back"]')?.getAttribute('aria-label')).toBe('Arms (back)');
    expect(host.querySelector('[data-region="face"]')?.getAttribute('aria-label')).toBe('Face (front)');
    expect(host.querySelector('[data-region="face"] title')?.textContent).toBe('Face (selected)');
    expect(host.querySelector('.sun-silhouette-back')?.getAttribute('transform')).toBe('translate(100 0)');
    expect(host.querySelector('#sun-fig-mask-front')?.getAttribute('mask-type')).toBe('alpha');
    expect(host.querySelectorAll('image[href="/er.svg"]')).toHaveLength(2); expect(host.querySelectorAll('image[href="/er-mask.png"]')).toHaveLength(2);
    expect([...selected]).toEqual(['face', 'arms-back']);
  } finally { resetBodySilhouetteState(); configureSunBodySilhouetteRuntimeDeps(previous); }
});

for (const stock of [true, false]) it(`renders ${stock ? 'stock overlay' : 'parametric fallback'} geometry and literal region metadata`, () => {
  const literal = '<img src=x onerror=alert(1)> & "';
  const input: BodyPickerInput = { sex: 'female', stock, source: '/er.svg', mask: '/er-mask.png', overlay: 'blob:selection', overlayState: 'ready', selected: new Set(['face']), labels: [{ key: 'face', label: literal }],
    views: [{ side: 'front', outline: 'M 0 0 Z', landmarks: ['M 1 2 Z'], details: ['M 3 4 Z'], regions: { face: 'M 5 6 Z', unknown: 'M 7 8 Z' }, placement: { imgX: -1.234, imgY: -2.345, fullW: 123.456, fullH: 456.789 } }] };
  const view = projectBodyPicker(input); const host = document.createElement('div'); host.innerHTML = renderHTML({ view });
  expect(host.querySelector('[data-region="face"]')?.getAttribute('aria-label')).toBe(literal + ' (front)');
  expect(host.querySelector('title')?.textContent).toBe(literal + ' (selected)'); expect(host.querySelector('[data-region="unknown"]')?.getAttribute('aria-label')).toBe('unknown (front)');
  expect(host.querySelector('img,script,[onerror]')).toBeNull();
  expect(view.views[0]?.placement).toEqual({ x: '-1.23', y: '-2.35', width: '123.46', height: '456.79' });
  if (stock) {
    expect(host.querySelector('image[href="blob:selection"]')?.getAttribute('x')).toBe('-1.23');
    expect(host.querySelector('.sun-silhouette-outline')).toBeNull(); expect(host.querySelector('[data-click-view="front"]')).not.toBeNull();
  } else {
    expect(host.querySelector('image,mask,[data-click-view]')).toBeNull();
    expect(host.querySelector('.sun-silhouette-outline')?.getAttribute('d')).toBe('M 0 0 Z');
    expect(host.querySelector('.sun-silhouette-landmark')?.getAttribute('d')).toBe('M 1 2 Z');
    expect(host.querySelector('.sun-silhouette-detail')?.getAttribute('d')).toBe('M 3 4 Z');
  }
});
