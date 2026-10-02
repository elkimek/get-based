import { describe, expect, it } from 'vitest';
import { actionAttributes, camelCaseActionAttributes } from '../js/action-attributes.js';

describe('delegated action serialization', () => {
  it('escapes actions, attribute names and values while retaining false and zero', () => {
    expect(actionAttributes('lens', 'a"b', { 'x"y': '<&', missing: null, absent: undefined, empty: '', disabled: false, count: 0 }))
      .toBe('data-lens-action="a&quot;b" data-lens-x&quot;y="&lt;&amp;" data-lens-disabled="false" data-lens-count="0"');
    expect(actionAttributes('chat-onboarding', 'open', { provider: 'local' }, 'chat'))
      .toBe('data-chat-onboarding-action="open" data-chat-provider="local"');
  });
  it('preserves camel-case keys and empty or false values in the nullish-only contract', () => {
    expect(camelCaseActionAttributes('data-note-action', 'note', 'a"b', { profileId: 'x"y', empty: '', disabled: false, count: 0, missing: null, absent: undefined }))
      .toBe('data-note-action="a&quot;b" data-note-profile-id="x&quot;y" data-note-empty="" data-note-disabled="false" data-note-count="0"');
  });
  it('coerces the action before reading all own attributes and then their values', () => {
    for (const serialize of [
      (action: unknown, attrs: Record<string, unknown>) => actionAttributes('dna', action, attrs),
      (action: unknown, attrs: Record<string, unknown>) => camelCaseActionAttributes('data-note-action', 'note', action, attrs),
    ]) {
      const calls: string[] = [];
      const action = { toString() { calls.push('action'); return 'open'; } };
      const attrs = Object.create({ inherited: 'omit' }) as Record<string, unknown>;
      for (const name of ['first', 'second']) Object.defineProperty(attrs, name, {
        enumerable: true, get() { calls.push(`read-${name}`); return { toString() { calls.push(name); return name; } }; },
      });
      expect(serialize(action, attrs)).not.toContain('inherited');
      expect(calls).toEqual(['action', 'read-first', 'read-second', 'first', 'second']);
    }
  });
  it('retains undefined defaults and rejects null attribute bags', () => {
    expect(actionAttributes('dna', 'open', undefined)).toBe('data-dna-action="open"');
    expect(camelCaseActionAttributes('data-note-action', 'note', 'open', undefined)).toBe('data-note-action="open"');
    const invalid = null as unknown as Record<string, unknown>;
    expect(() => actionAttributes('dna', 'open', invalid)).toThrow(TypeError);
    expect(() => camelCaseActionAttributes('data-note-action', 'note', 'open', invalid)).toThrow(TypeError);
  });
});
