import { describe, expect, it } from 'vitest';
import { encodeStaticCss, verifyStaticCss } from '../scripts/static-css-encoding.mjs';

describe('static CSS production encoding', () => {
  it('strips ordinary comments and redundant whitespace while preserving semantic spacing and legal notices', () => {
    const source = [
      '/*! MIT License */',
      '/* Strip ordinary comment */',
      '.parent :where(.child) {',
      '  width: calc(100% - 16px);',
      '  color: var(--text-primary);',
      '  --tw-shadow: ;',
      '}',
      '@media (max-width: 768px) {',
      '  .a, .b { display: grid; }',
      '}',
    ].join('\n');
    const output = encodeStaticCss('/css/sample.css', source);
    expect(output).toContain('/*! MIT License */');
    expect(output).not.toContain('Strip ordinary comment');
    expect(output).toContain('.parent :where(.child){');
    expect(output).toContain('calc(100% - 16px)');
    expect(output).toContain('--tw-shadow: ;');
    expect(Buffer.byteLength(output)).toBeLessThan(Buffer.byteLength(source));
    expect(() => verifyStaticCss('/css/sample.css', source, output)).not.toThrow();
  });

  it('retains a non-empty body for comment-only stylesheets so responses never shrink to 0 bytes', () => {
    const source = '/* Placeholder stylesheet kept for cascade order */\n';
    expect(encodeStaticCss('/css/placeholder.css', source)).toBe(source);
  });

  it('rejects altered CSS output during verification', () => {
    const source = '.a { color: red; }\n';
    const output = encodeStaticCss('/css/sample.css', source);
    expect(() => verifyStaticCss('/css/sample.css', source, output.replace('red', 'blue')))
      .toThrow('Exact current static CSS encoding');
  });
});
