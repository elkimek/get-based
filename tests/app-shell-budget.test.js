import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  enforceAppShellBudget,
  formatAppShellSummary,
  parseAppShellEntries,
  summarizeAppShell,
} from '../scripts/app-shell-budget.mjs';

const temporaryRoots = [];
const BUDGET = {
  maximums: {
    resources: 3,
    decodedBytes: 1000,
  },
};

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map(
    root => fs.rm(root, { recursive: true, force: true }),
  ));
});

async function temporaryRoot() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'getbased-app-shell-budget-'));
  temporaryRoots.push(root);
  return root;
}

describe('PWA app-shell budget', () => {
  it('parses one static, root-relative APP_SHELL declaration', () => {
    expect(parseAppShellEntries(`
      const APP_SHELL = [
        '/app',
        '/styles.css',
      ];
    `)).toEqual(['/app', '/styles.css']);

    expect(() => parseAppShellEntries('const other = [];')).toThrow(
      'Expected exactly one APP_SHELL declaration',
    );
    expect(() => parseAppShellEntries('const APP_SHELL = [')).toThrow(
      'Could not parse service-worker.js',
    );
    expect(() => parseAppShellEntries('const APP_SHELL = getEntries();')).toThrow(
      'APP_SHELL must be an array literal',
    );
    expect(() => parseAppShellEntries("const APP_SHELL = ['/ok', dynamicEntry];")).toThrow(
      'APP_SHELL entries must be static string literals',
    );
    expect(() => parseAppShellEntries("const APP_SHELL = ['relative.js'];")).toThrow(
      'APP_SHELL entry must be root-relative',
    );
    expect(() => parseAppShellEntries("const APP_SHELL = ['/same', '/same'];")).toThrow(
      'APP_SHELL contains duplicate entries',
    );
  });

  it('measures the built app route and falls back to unchanged source assets', async () => {
    const sourceRoot = await temporaryRoot();
    const artifactRoot = await temporaryRoot();
    await fs.writeFile(path.join(artifactRoot, 'index.html'), 'built app');
    await fs.mkdir(path.join(artifactRoot, 'js'));
    await fs.writeFile(path.join(artifactRoot, 'js', 'bundle.js'), 'bundle');
    await fs.writeFile(path.join(sourceRoot, 'styles.css'), 'styles');

    await expect(summarizeAppShell({
      serviceWorkerSource: `
        const APP_SHELL = [
          '/app',
          '/js/bundle.js',
          '/styles.css',
        ];
      `,
      artifactRoot,
      sourceRoot,
    })).resolves.toEqual({
      resources: 3,
      decodedBytes: 21,
    });
  });

  it('rejects missing artifact resources', async () => {
    const root = await temporaryRoot();
    await expect(summarizeAppShell({
      serviceWorkerSource: "const APP_SHELL = ['/missing.js'];",
      artifactRoot: root,
    })).rejects.toThrow('APP_SHELL asset does not exist: /missing.js');
  });

  it('passes at the ceilings and reports remaining margin', () => {
    expect(enforceAppShellBudget({
      resources: 3,
      decodedBytes: 900,
    }, BUDGET)).toEqual({
      resources: { actual: 3, maximum: 3, remaining: 0 },
      decodedBytes: { actual: 900, maximum: 1000, remaining: 100 },
    });
  });

  it('reports every exceeded ceiling and rejects malformed input', () => {
    expect(() => enforceAppShellBudget({
      resources: 4,
      decodedBytes: 1100,
    }, BUDGET)).toThrow(
      'precache resources 4 exceeds 3; precache decoded bytes 1100 exceeds 1000',
    );
    expect(() => enforceAppShellBudget({
      resources: -1,
      decodedBytes: 0,
    }, BUDGET)).toThrow('app-shell resources must be a non-negative number');
    expect(() => enforceAppShellBudget({
      resources: 0,
      decodedBytes: 0,
    }, { maximums: {} })).toThrow('maximums.resources');
  });

  it('formats a compact CI summary', () => {
    expect(formatAppShellSummary({
      resources: 200,
      decodedBytes: 4096,
    })).toBe('200 resources, 4.0 KiB decoded');
  });
});
