import { describe, expect, it } from 'vitest';

import { mergeCustomPersonalityState } from '../js/chat-personality-merge.js';

describe('custom personality sync merge', () => {
  it('preserves unrelated personas created on separate devices', () => {
    const merged = mergeCustomPersonalityState(
      [{ id: 'custom_a', name: 'A', updatedAt: '2026-08-08T10:00:00Z' }],
      [{ id: 'custom_b', name: 'B', updatedAt: '2026-08-08T10:01:00Z' }],
      {},
      {},
    );
    expect(merged.personalities.map(item => item.id)).toEqual(['custom_a', 'custom_b']);
  });

  it('keeps legacy personas that predate per-item timestamps when no deletion exists', () => {
    const merged = mergeCustomPersonalityState(
      [{ id: 'custom_legacy_a', name: 'Legacy A' }],
      [{ id: 'custom_legacy_b', name: 'Legacy B' }],
      {},
      {},
    );
    expect(merged.personalities.map(item => item.id)).toEqual(['custom_legacy_a', 'custom_legacy_b']);
  });

  it('keeps the newer edit for each persona independent of merge direction', () => {
    const oldItem = { id: 'custom_shared', name: 'Old', updatedAt: '2026-08-08T10:00:00Z' };
    const newItem = { id: 'custom_shared', name: 'New', updatedAt: '2026-08-08T10:02:00Z' };
    expect(mergeCustomPersonalityState([oldItem], [newItem], {}, {}).personalities[0]!.name).toBe('New');
    expect(mergeCustomPersonalityState([newItem], [oldItem], {}, {}).personalities[0]!.name).toBe('New');
  });

  it('uses tombstones to prevent stale resurrection and permits a newer recreation', () => {
    const stale = { id: 'custom_gone', name: 'Stale', updatedAt: '2026-08-08T10:00:00Z' };
    const deletedAt = Date.parse('2026-08-08T10:01:00Z');
    const deleted = mergeCustomPersonalityState([], [stale], { custom_gone: deletedAt }, {});
    expect(deleted.personalities).toEqual([]);
    expect(deleted.tombstones.custom_gone).toBe(deletedAt);

    const recreated = { ...stale, name: 'Recreated', updatedAt: '2026-08-08T10:02:00Z' };
    const restored = mergeCustomPersonalityState([], [recreated], { custom_gone: deletedAt }, {});
    expect(restored.personalities[0]!.name).toBe('Recreated');
    expect(restored.tombstones).not.toHaveProperty('custom_gone');
  });
  it('retains opaque fields and exact legacy metadata rather than reconstructing records', () => {
    const local = { id: 'custom_legacy', createdAt: null, promptText: 'Private legacy instructions', future: { list: [1, null] } };
    const incoming = { id: 'custom_new', updatedAt: '2090-01-01', future: ['remote'] };
    expect(mergeCustomPersonalityState([local], [incoming], {}, {}).personalities).toEqual([local, incoming]);
  });
  it('resolves timestamp ties independently of object key ordering', () => {
    const left = { id: 'custom_same', name: 'A', future: { b: 2, a: 1 } }, right = { future: { a: 1, b: 2 }, name: 'Z', id: 'custom_same' };
    expect(mergeCustomPersonalityState([left], [right], {}, {}).personalities).toEqual([right]);
    expect(mergeCustomPersonalityState([right], [left], {}, {}).personalities).toEqual([right]);
  });
  it('retains extension fields omitted by a newer replica without reviving omitted known fields', () => {
    const local = { id: 'custom_shared', updatedAt: '2090-01-01', name: 'Old', createdAt: '2020-01-01', nativeExtension: { keep: true } };
    const remote = { id: 'custom_shared', updatedAt: '2091-01-01', name: 'New', remoteExtension: ['keep'] };
    const expected = { ...remote, nativeExtension: local.nativeExtension };
    expect(mergeCustomPersonalityState([local], [remote], {}, {}).personalities).toEqual([expected]);
    expect(mergeCustomPersonalityState([remote], [local], {}, {}).personalities).toEqual([expected]);
    expect(mergeCustomPersonalityState([expected], [remote], {}, {}).personalities).toEqual([expected]);
  });
  it('normalizes portable known fields while preserving unknown imported fields', () => {
    const incoming = { id: 'custom_import', name: 'Portable', icon: '<img>', future: { keep: true } };
    expect(mergeCustomPersonalityState([], [incoming], {}, {}, { normalizeIncoming: true }).personalities[0]).toMatchObject({ name: 'Portable', icon: 'img', future: incoming.future });
  });
  it.each([{ custom_x: '100' }, { unsafe: 100 }, Object.fromEntries(Array.from({ length: 201 }, (_, i) => [`custom_${i}`, i + 1]))])('rejects malformed or oversized supplied deletion histories without truncating %j', value => {
    expect(() => mergeCustomPersonalityState([], [], {}, value)).toThrow('native review');
  });
  it.each([[{ id: 'custom_duplicate' }, { id: 'custom_duplicate' }], [{ id: ' default ' }], { malformed: true }])('rejects invalid catalog identities instead of dropping records %j', value => {
    expect(() => mergeCustomPersonalityState([], value, {}, {})).toThrow('native review');
  });
  it('rejects an oversized union rather than silently dropping unrelated personas or deletion evidence', () => {
    const records = Array.from({ length: 50 }, (_, i) => ({ id: `custom_${i}` }));
    expect(() => mergeCustomPersonalityState(records, [{ id: 'custom_extra' }], {}, {})).toThrow('native review');
    const deleted = Object.fromEntries(Array.from({ length: 200 }, (_, i) => [`custom_${i}`, i + 1]));
    expect(() => mergeCustomPersonalityState([], [], deleted, { custom_extra: 500 })).toThrow('native review');
  });
});
