import { describe, expect, it } from 'vitest';
import { projectProfileButton } from '../js/profile-button-presentation.js';
import type { StoredProfileRecord } from '../js/profile-list-store.js';

// Adversarial values are the unchanged public original contract's runtime boundary.
const profile = (value: unknown): StoredProfileRecord => value as StoredProfileRecord;

describe('compact profile projection native coercion boundary', () => {
  it.each(['', null, undefined])('preserves nullish/empty name fallback (%s)', name => {
    const calls: string[] = [];
    const view = projectProfileButton(profile({ id: 'synthetic', name }), id => { calls.push(id); return '#4f8cff'; });
    expect(calls).toEqual(['synthetic']);
    expect(view).toEqual({ badge: { kind: 'initial', background: '#4f8cff', initial: '?' }, name: '' });
  });

  it('reads shared color before initial conversion, then final name conversion', () => {
    const trace: string[] = [];
    const source = profile({ id: 'synthetic', avatar: null, name: {
      get 0() { trace.push('index'); return { toUpperCase() { trace.push('upper'); return { toString() { trace.push('initial:String'); return '<'; } }; } }; },
      toString() { trace.push('name:String'); return 'Complete &'; },
    } });
    const view = projectProfileButton(source, () => { trace.push('color'); return '#4f8cff'; });
    expect(trace).toEqual(['color', 'index', 'upper', 'initial:String', 'name:String']);
    expect(view).toEqual({ badge: { kind: 'initial', background: '#4f8cff', initial: '<' }, name: 'Complete &' });
  });

  it('reads avatar truth/serialization separately and never indexes image-branch names', () => {
    const trace: string[] = [];
    const source = profile({ id: 'synthetic', get avatar() { trace.push('avatar:get'); return { toString() { trace.push('avatar:String'); return 'https://synthetic.invalid/"&'; } }; },
      name: { get 0() { throw new Error('image branch indexed name'); }, toString() { trace.push('name:String'); return 'Image'; } },
    });
    const view = projectProfileButton(source, () => { throw new Error('image branch computed color'); });
    expect(trace).toEqual(['avatar:get', 'avatar:get', 'avatar:String', 'name:String']);
    expect(view).toEqual({ badge: { kind: 'image', source: 'https://synthetic.invalid/"&' }, name: 'Image' });
  });

  it.each([7, new String('')])('retains truthy non-indexable native name failure (%s)', name => {
    let colorReads = 0;
    expect(() => projectProfileButton(profile({ id: 'synthetic', name }), () => { colorReads++; return '#4f8cff'; })).toThrow(TypeError);
    expect(colorReads).toBe(1);
  });

  it('escapes a numeric image-branch name without invoking the initial branch', () => {
    expect(projectProfileButton(profile({ id: 'synthetic', name: 7, avatar: 'synthetic-avatar' }), () => { throw new Error('unexpected color'); }))
      .toEqual({ badge: { kind: 'image', source: 'synthetic-avatar' }, name: '7' });
  });

  it('propagates original object coercion failure before later fields', () => {
    const fault = new Error('synthetic-avatar-fault'); const trace: string[] = [];
    const source = profile({ id: 'synthetic', avatar: { toString() { trace.push('avatar:String'); throw fault; } },
      name: { toString() { trace.push('name:String'); return 'unexpected'; } },
    });
    expect(() => projectProfileButton(source, () => { throw new Error('unexpected color'); })).toThrow(fault);
    expect(trace).toEqual(['avatar:String']);
  });

  it('completes the initial before propagating final-name failure', () => {
    const fault = new Error('synthetic-name-fault'); const trace: string[] = [];
    const source = profile({ id: 'synthetic', name: { 0: { toUpperCase() { trace.push('upper'); return 'N'; } },
      toString() { trace.push('name:String'); throw fault; },
    } });
    expect(() => projectProfileButton(source, () => '#4f8cff')).toThrow(fault);
    expect(trace).toEqual(['upper', 'name:String']);
  });
});
