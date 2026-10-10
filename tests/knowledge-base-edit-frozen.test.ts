import { beforeAll, expect, it } from 'vitest';
import { captureCurrent, readFrozen } from './helpers/knowledge-base-current-capture.mjs';
import { equalOriginalDOM, type StatusEditReceipt } from './helpers/knowledge-base-frozen-contract.js';

const original = readFrozen<{ receipts: StatusEditReceipt[] }>('candidate-status-edit-original.json');
let current: StatusEditReceipt[];
beforeAll(() => {
  current = captureCurrent<{ receipts: StatusEditReceipt[] }>('candidate-status-edit').receipts;
  expect(original.receipts).toHaveLength(2);
  expect(current).toHaveLength(2);
});

it.each(original.receipts.map((receipt, index) => ({ ...receipt, index })))(
  'keeps dirty inputs, same nodes and caret across actual delegated enabled=$enabled',
  expected => {
    const observed = current[expected.index]!;
    equalOriginalDOM(observed.beforeStatusHTML, expected.beforeStatusHTML);
    equalOriginalDOM(observed.statusHTML, expected.statusHTML);
    expect(observed.fields).toEqual(expected.fields);
    expect(observed.fields.every(field => field.sameNode)).toBe(true);
    expect(observed.samePanel).toBe(true);
    expect(observed.sameChip).toBe(true);
    expect(observed.activeElement).toBe(expected.activeElement);
    expect(observed.caret).toEqual(expected.caret);
    expect(observed.cfg).toEqual(expected.cfg);
    expect(observed.trace).toEqual(expected.trace);
    expect(observed.scheduledFrames).toBe(0);
  },
);
