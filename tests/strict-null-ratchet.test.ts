import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { collectStrictNullDiagnostics, findRegressions, validateBaseline } from '../scripts/strict-null-ratchet.mjs';

describe('strict-null debt ratchet', () => {
  const baseline = {
    totalDiagnostics: 3,
    files: {
      'js/existing-a.js': 2,
      'js/existing-b.js': 1,
    },
  };

  it('accepts matching and reduced per-file debt', () => {
    expect(findRegressions({
      total: 2,
      files: new Map([
        ['js/existing-a.js', 1],
        ['js/existing-b.js', 1],
      ]),
    }, baseline)).toEqual([]);
  });

  it('rejects per-file growth even when total debt falls', () => {
    expect(findRegressions({
      total: 2,
      files: new Map([['js/existing-b.js', 2]]),
    }, baseline)).toContain('js/existing-b.js: 2 diagnostics exceed baseline 1');
  });

  it('rejects strict-null debt in a previously clean file', () => {
    expect(findRegressions({
      total: 1,
      files: new Map([['js/new-file.js', 1]]),
    }, baseline)).toContain('js/new-file.js: 1 new diagnostic');
  });

  it('rejects inconsistent baseline totals', () => {
    expect(validateBaseline({
      totalDiagnostics: 4,
      files: baseline.files,
    })).toContain('does not match');
  });
});

function nativeDiagnostics(source: string, noUnusedLocals = false, files: readonly string[] = ['source.ts']) {
  const root = mkdtempSync(path.join(tmpdir(), 'getbased-native-null-'));
  try {
    writeFileSync(path.join(root, 'source.ts'), source);
    writeFileSync(path.join(root, 'tsconfig.json'), `{
  // Native JSONC inheritance retains the original configuration.
  "compilerOptions": ${JSON.stringify({ target: 'ES2022', types: [], strictNullChecks: false, noUnusedLocals })},
  "files": ${JSON.stringify(files)},
}
`);
    return collectStrictNullDiagnostics(path.join(root, 'tsconfig.json'));
  } finally { rmSync(root, { recursive: true, force: true }); }
}

describe('native strict-null diagnostics', () => {
  it('enforces the inherited null-check override without emitting files', () => {
    const diagnostics = nativeDiagnostics('export const value: string = null;');
    expect(diagnostics.configErrors).toEqual([]);
    expect(diagnostics.unscoped).toEqual([]);
    expect(diagnostics.total).toBe(1);
    expect([...diagnostics.files]).toEqual([['source.ts', 1]]);
  });

  it('counts native binding diagnostics once through semantic diagnostics', () => {
    const diagnostics = nativeDiagnostics('const value = 1; const value = 2; export {};', true);
    expect(diagnostics.configErrors).toEqual([]);
    expect(diagnostics.unscoped).toEqual([]);
    expect(diagnostics.total).toBe(3);
    expect([...diagnostics.files]).toEqual([['source.ts', 3]]);
  });
  it('counts an identical program/global diagnostic only once', () => {
    const diagnostics = nativeDiagnostics('', false, ['missing.ts']);
    expect(diagnostics.configErrors).toEqual([]);
    expect(diagnostics.unscoped).toHaveLength(1);
    expect(diagnostics.unscoped[0]?.code).toBe(6053);
    expect(diagnostics.total).toBe(0);
    expect([...diagnostics.files]).toEqual([]);
  });

});
