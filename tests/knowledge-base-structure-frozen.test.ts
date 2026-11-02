import { beforeAll, expect, it } from 'vitest';
import {
  captureCurrent,
  originalRevision,
  readFrozen,
} from './helpers/knowledge-base-current-capture.mjs';
import {
  equalOriginalDOM,
  type StructuralSample,
} from './helpers/knowledge-base-frozen-contract.js';

const original = readFrozen<{ revision: string; samples: StructuralSample[] }>('candidate-original.json');
let current: StructuralSample[];
beforeAll(() => {
  current = captureCurrent<{ samples: StructuralSample[] }>('candidate-capture').samples;
  expect(originalRevision).toBe('2ab846c9fda65ce2afb6415f647dc92b2f8efb67');
  expect(original.revision).toBe(originalRevision);
  expect(original.samples).toHaveLength(64);
  expect(current).toHaveLength(64);
}, 60000);

for (const kind of ['panel', 'status-toggle', 'modal', 'library-options', 'library-create'] as const) {
  it.each(original.samples.filter(sample => sample.kind === kind))(
    `retains original ${kind}: $name`,
    expected => {
      const observed = current.find(sample => sample.kind === expected.kind && sample.name === expected.name);
      expect(observed).toBeDefined();
      equalOriginalDOM(observed!.html, expected.html);
      // Approved native contract: only the toggle's checked property follows
      // the completed save. Every other original control property stays exact.
      const expectedControls = expected.controls.map(control => {
        const originalControl = control as { id?: string };
        if (expected.kind !== 'status-toggle' || originalControl.id !== 'lens-enabled-toggle') return control;
        const seed = expected.input as { config: { enabled: boolean } };
        expect(typeof seed.config.enabled).toBe('boolean');
        return { ...originalControl, checked: !seed.config.enabled };
      });
      if (expected.kind === 'status-toggle') {
        expect(expected.controls.filter(control => (control as { id?: string }).id === 'lens-enabled-toggle')).toHaveLength(1);
      }
      expect(observed!.controls).toEqual(expectedControls);
      expect(observed!.trace).toEqual(expected.trace);
      expect(observed!.scheduledFrames).toBe(expected.scheduledFrames);
      expect(observed!.selected).toBe(expected.selected);
      expect(observed!.input).toEqual(expected.input);
    },
  );
}
