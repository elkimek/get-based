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
    expect(mergeCustomPersonalityState([oldItem], [newItem], {}, {}).personalities[0].name).toBe('New');
    expect(mergeCustomPersonalityState([newItem], [oldItem], {}, {}).personalities[0].name).toBe('New');
  });

  it('uses tombstones to prevent stale resurrection and permits a newer recreation', () => {
    const stale = { id: 'custom_gone', name: 'Stale', updatedAt: '2026-08-08T10:00:00Z' };
    const deletedAt = Date.parse('2026-08-08T10:01:00Z');
    const deleted = mergeCustomPersonalityState([], [stale], { custom_gone: deletedAt }, {});
    expect(deleted.personalities).toEqual([]);
    expect(deleted.tombstones.custom_gone).toBe(deletedAt);

    const recreated = { ...stale, name: 'Recreated', updatedAt: '2026-08-08T10:02:00Z' };
    const restored = mergeCustomPersonalityState([], [recreated], { custom_gone: deletedAt }, {});
    expect(restored.personalities[0].name).toBe('Recreated');
    expect(restored.tombstones).not.toHaveProperty('custom_gone');
  });
});
