import { describe, expect, it } from 'vitest';
import { hasSerializedEventAttribute } from './helpers/supplement-event-attribute-contract.js';

describe('delegated supplement event attribute contract', () => {
  it('permits the real ongoing parameter without confusing identifiers with HTML', () => {
    expect(hasSerializedEventAttribute('export function bar(ongoing = false) { return `<i class="bar">text</i>`; }', 'javascript')).toBe(false);
  });
  it.each([
    `const html = '<button onclick="run()">';`,
    'const html = `<button onchange="${action}">`;',
    `const fragment = ' onclick=';`,
  ])('rejects serialized event attributes in literals and template parts: %s', source => {
    expect(hasSerializedEventAttribute(source, 'javascript')).toBe(true);
  });
  it('checks authored Svelte attributes rather than script parameter spelling', () => {
    const safe = '<script>function bar(ongoing = false) { return ongoing; }</script><button data-supp-action="save">Save</button>';
    expect(hasSerializedEventAttribute(safe, 'svelte')).toBe(false);
    expect(hasSerializedEventAttribute(safe.replace('data-supp-action="save"', 'onclick={() => bar()}'), 'svelte')).toBe(true);
    expect(hasSerializedEventAttribute(safe.replace('data-supp-action="save"', 'on:click={() => bar()}'), 'svelte')).toBe(true);
  });
  it('fails closed when either source cannot be parsed', () => {
    expect(() => hasSerializedEventAttribute('function broken(', 'javascript')).toThrow();
    expect(() => hasSerializedEventAttribute('<script>function broken(</script>', 'svelte')).toThrow();
  });
});
