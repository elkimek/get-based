// @vitest-environment node

import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildCompanionBundle } from '../scripts/build-companion-bundle.mjs';

const roots = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('companion distribution bundle', () => {
  it('builds one executable, dependency-free Node entry point', async () => {
    const outputRoot = mkdtempSync(join(tmpdir(), 'getbased-companion-bundle-'));
    roots.push(outputRoot);
    const result = await buildCompanionBundle({ outputRoot });
    const source = readFileSync(result.outputPath, 'utf8');

    expect(source.startsWith('#!/usr/bin/env node\n')).toBe(true);
    expect(result.bytes).toBeLessThan(250_000);
    expect(source).toContain('getbased Companion');
    expect(source).toContain('getbased-companion install');
    expect(source).toContain('health.getbased.companion');
    expect(source).toContain('schtasks.exe');
    expect(source).not.toMatch(/from\s+['"]\.\.?\//);
  });
});
