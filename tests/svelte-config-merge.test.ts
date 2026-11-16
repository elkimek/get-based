import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { realpathSync } from 'node:fs';
import merge from '../scripts/vendor-packages/svelte-config-merge/index.js';

function assertSafe(value: unknown): asserts value is Record<PropertyKey, unknown> {
  expect(value).not.toBeNull();
  expect(typeof value).toBe('object');
  expect(Object.getPrototypeOf(value)).toBe(Object.prototype);
  for (const key of ['__proto__', 'constructor', 'prototype', 'poisoned']) expect(Object.hasOwn(value as object, key)).toBe(false);
  expect((value as Record<string, unknown>)['poisoned']).toBeUndefined();
  expect(({} as Record<string, unknown>)['poisoned']).toBeUndefined();
}

describe('Svelte build config merge security', () => {
  const payload = () => JSON.parse('{"__proto__":{"poisoned":true},"constructor":{"prototype":{"poisoned":true}},"prototype":{"poisoned":true},"safe":1}') as Record<string, unknown>;

  it.each(['ordinary', 'null-prototype', 'own-proto'])('blocks prototype keys for a %s target', kind => {
    const target = kind === 'null-prototype' ? Object.create(null) as object : kind === 'own-proto' ? payload() : {};
    const result = merge(target, payload());
    assertSafe(result);
    expect(result['safe']).toBe(1);
  });

  it('filters target keys as well as source keys during nested and array clones', () => {
    const result = merge({ nested: payload(), values: [payload()] }, { additional: { child: payload() } });
    assertSafe(result);
    assertSafe(result['nested']);
    assertSafe((result['values'] as unknown[])[0]);
    const additional = result['additional'] as Record<string, unknown>;
    assertSafe(additional['child']);
  });

  it('blocks a nested payload merged into a null placeholder', () => {
    const result = merge({ session: null }, { session: payload() }) as Record<string, unknown>;
    assertSafe(result['session']);
    expect(result['session']).toEqual({ safe: 1 });
  });

  it.each([null, undefined, false, 0, 'default'])('retains valid settings when replacing scalar default %s', target => {
    expect(merge(target, { compilerOptions: { dev: true } })).toEqual({ compilerOptions: { dev: true } });
  });

  it('fails closed when a target proxy throws during property inspection', () => {
    const target = new Proxy({}, { has() { throw new Error('untrusted object trap'); } });
    expect(merge(target, { safe: 1 })).toEqual({});
  });

  it('is the actual transitive replacement resolved by the Svelte plugin', () => {
    const require = createRequire(import.meta.resolve('@sveltejs/vite-plugin-svelte'));
    expect(realpathSync(require.resolve('deepmerge'))).toBe(realpathSync(new URL('../scripts/vendor-packages/svelte-config-merge/index.js', import.meta.url)));
  });
});

describe('Svelte config merge compatibility', () => {
  it('merges nested compiler options and preserves functions and special objects', () => {
    const onwarn = () => {}, date = new Date(0), filter = /\.svelte$/;
    const result = merge({ compilerOptions: { dev: false, css: 'external' } }, { compilerOptions: { dev: true }, onwarn, date, filter });
    expect(result).toEqual({ compilerOptions: { dev: true, css: 'external' }, onwarn, date, filter });
    expect((result as Record<string, unknown>)['onwarn']).toBe(onwarn);
    expect((result as Record<string, unknown>)['date']).toBe(date);
    expect((result as Record<string, unknown>)['filter']).toBe(filter);
  });

  it('replaces arrays using the plugin callback and clones default concatenated values', () => {
    const target = { preprocess: [{ name: 'old' }] }, source = { preprocess: [{ name: 'new' }] };
    const replaced = merge(target, source, { arrayMerge: (_target, values) => values }) as typeof source;
    expect(replaced.preprocess).toBe(source.preprocess);
    const combined = merge(target, source) as typeof source;
    expect(combined.preprocess).toEqual([{ name: 'old' }, { name: 'new' }]);
    expect(combined.preprocess[0]).not.toBe(target.preprocess[0]);
    expect(target.preprocess).toEqual([{ name: 'old' }]);
  });

  it('preserves enumerable symbols, custom merging, all and explicit clone settings', () => {
    const symbol = Symbol('compiler-option'), nested = { value: 1 };
    const result = merge({ [symbol]: { old: true }, nested }, { [symbol]: { added: true } }, { clone: false }) as Record<PropertyKey, unknown>;
    expect(result[symbol]).toEqual({ old: true, added: true });
    expect(result['nested']).toBe(nested);
    expect(merge({ options: {} }, { options: { value: 1 } }, { customMerge: key => key === 'options' ? () => 'custom' : undefined })).toEqual({ options: 'custom' });
    expect(merge.all([{ a: 1 }, { b: 2 }])).toEqual({ a: 1, b: 2 });
    expect(() => merge.all({})).toThrow('first argument should be an array');
  });

  it('requests a custom merger only for existing mergeable properties', () => {
    const requested: PropertyKey[] = [];
    expect(merge({ nested: {}, scalar: 1 }, { nested: { value: 2 }, scalar: 3, added: 4 }, {
      customMerge: key => { requested.push(key); return undefined; },
    })).toEqual({ nested: { value: 2 }, scalar: 3, added: 4 });
    expect(requested).toEqual(['nested']);
  });
});
