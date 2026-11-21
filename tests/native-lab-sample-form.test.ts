// @vitest-environment jsdom
import {createRequire} from 'node:module';
import {expect, it} from 'vitest';
import {renderHTML} from '../js/components/LabSampleEditor.svelte.html.js';
import type {LabSampleRecord} from '../js/lab-sample-proposals.js';
import {expectNativeReview} from './helpers/native-review-dom.js';

const load = createRequire(import.meta.url);
const resultName = 'Recorded <em>measurement</em>';
const specimen = 'Recorded <b>specimen</b>';

it.each([
  {label: 'unknown context', fasting: null, record: '', phase: '', detail: '', expanded: false},
  {label: 'reported context', fasting: true, record: 'yes', phase: 'follicular', detail: '', expanded: true},
  {label: 'preserved legacy context', fasting: false, record: 'no', phase: 'legacy-phase', detail: 'legacy-detail', expanded: true},
] as const)('mounts $label without recasting saved lab collection details', async sample => {
  const view: LabSampleRecord = {
    id: 'synthetic-sample', date: '2026-06-01', specimen, sampleTime: '08:15',
    fasting: sample.fasting, collectionEdited: [],
    ...(sample.expanded ? {cycle: {
      cycleDay: 4, cyclePhase: sample.phase, cyclePhaseDetail: sample.detail || null, cyclePhaseSource: 'Recorded',
    }} : {}),
    results: [['fixture.value', 5, 'mmol/L', resultName, 'synthetic-source'], ['fixture.missing', null, '', 'Unrecorded', 'synthetic-source']],
  };
  const before = structuredClone(view);
  const component = load('../js/components/LabSampleEditor.svelte.native.js') as typeof import('../js/components/LabSampleEditor.svelte.native.js');
  await expectNativeReview(renderHTML({view}), root => {
    const mounted = component.mount(component.default, {target: root, props: {view}});
    component.flushSync();
    return () => component.unmount(mounted);
  }, root => {
    const form = root.querySelector<HTMLFormElement>('#lab-sample-form')!;
    const data = new FormData(form);
    expect(data.get('date')).toBe('2026-06-01');
    expect(data.get('sampleTime')).toBe('08:15');
    expect(data.get('specimen')).toBe(specimen);
    expect(data.get('fasting')).toBe(sample.record || 'unknown');
    expect(data.get('cyclePhase')).toBe(sample.phase);
    expect(data.get('cyclePhaseDetail')).toBe(sample.detail);
    expect(root.querySelector<HTMLDetailsElement>('details')?.open).toBe(sample.expanded);
    expect(root.querySelectorAll('[data-lab-sample-back]')).toHaveLength(2);
    expect(root.querySelector('li')?.textContent).toBe(resultName + ': 5 mmol/L');
    expect(root.textContent).toContain('Unrecorded: Not recorded');
    expect(root.querySelector('em, b, script')).toBeNull();
    expect(root.querySelector('[role="status"]')?.textContent).toBe('');
    expect(document.activeElement?.id).toBe('lab-sample-date');
  }, '#lab-sample-date');
  expect(view).toEqual(before);
});
