import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it, vi } from 'vitest';
import { projectOwnedVendorFiles, projectOwnedVendorSources } from '../scripts/project-owned-vendor.mjs';
import { matchingFiles } from '../scripts/supply-chain.mjs';
import { coverageIncludes, COVERAGE_INCLUDE, coverageFeature, isProductionSource, productionSources } from '../scripts/coverage-source.mjs';
import { createTestPlan, planningSourceFiles } from '../scripts/pr-test-scope.mjs';

const manifest = (projectFiles: string[]) => JSON.stringify({
  components: [{ name: 'external', files: ['vendor/external.js'] }], projectFiles,
});

function withRoot(operation: (root: string, write: (file: string, source: string) => void) => void) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'owned-vendor-ci-'));
  try {
    operation(root, (file, source) => {
      fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      fs.writeFileSync(path.join(root, file), source);
    });
  } finally { fs.rmSync(root, { recursive: true }); }
}

describe('shared first-party vendor ownership', () => {
  it('keeps exact migration inventory distinct from executable runtime aliases', () => {
    const metadata = manifest(['vendor/owned.js', 'vendor/types.d.ts']);
    const files = ['vendor/owned.ts', 'vendor/owned.js', 'vendor/types.d.ts', 'vendor/external.js'];
    expect([...projectOwnedVendorFiles(metadata, files)]).toEqual(['vendor/owned.js', 'vendor/types.d.ts']);
    expect(projectOwnedVendorSources(metadata, files)).toEqual(['vendor/owned.js', 'vendor/owned.ts']);
    expect(projectOwnedVendorSources(metadata, ['vendor/owned.ts'])).toEqual(['vendor/owned.ts']);
  });

  it('uses supply-chain wildcards without making them recursive or treating punctuation as regex', () => {
    const files = ['vendor/owned-adapter.ts', 'vendor/nested/owned-adapter.ts', 'vendor/name[1]+.ts', 'vendor/name1.ts'];
    expect(projectOwnedVendorSources(manifest(['vendor/owned*.js', 'vendor/name[1]+.js']), files))
      .toEqual(['vendor/name[1]+.ts', 'vendor/owned-adapter.ts']);
    expect(projectOwnedVendorSources(manifest(['vendor/nested/owned*.js']), files)).toEqual(['vendor/nested/owned-adapter.ts']);
  });

  it.each(['vendor/../outside.ts', '../outside.ts', 'vendor//owned.ts', 'vendor/owned/', 'vendor\\owned.ts', 'vendor/owned\0.ts'])
    ('rejects unsafe metadata path %j', file => {
      expect(() => projectOwnedVendorSources(manifest([file]), [])).toThrow('canonical paths inside vendor/');
    });

  it('fails closed on malformed metadata even if the source inventory is empty', () => {
    expect(() => projectOwnedVendorSources('{', [])).toThrow(SyntaxError);
    expect(() => projectOwnedVendorSources('{}', [])).toThrow('projectFiles array');
    expect(() => projectOwnedVendorSources('{"projectFiles":[null]}', [])).toThrow('canonical paths inside vendor/');
    expect(projectOwnedVendorSources(undefined, [])).toEqual([]);
  });
});

describe('owned-vendor coverage collection and denominator', () => {
  it('counts canonical owned sources once, includes only their executable URLs and excludes external/declaration files', () => {
    withRoot((root, write) => {
      write('vendor/components.json', manifest(['vendor/owned*.js', 'vendor/types.d.ts']));
      for (const file of ['vendor/owned-adapter.ts', 'vendor/owned-adapter.js', 'vendor/types.d.ts', 'vendor/external.js', 'js/app.ts', 'js/app.js']) {
        write(file, 'export function run() { return 1; }');
      }
      expect(productionSources(root)).toEqual(['js/app.ts', 'vendor/owned-adapter.ts']);
      expect(productionSources(root, { runtime: true })).toEqual(['js/app.js', 'vendor/owned-adapter.js']);
      expect(coverageIncludes(root)).toContain('vendor/owned-adapter.js');
      expect(coverageIncludes(root)).not.toContain('vendor/external.js');
      expect(isProductionSource('vendor/owned-adapter.js', root)).toBe(true);
      expect(isProductionSource('vendor/owned-adapter.ts', root)).toBe(true);
      expect(isProductionSource('vendor/external.js', root)).toBe(false);
      expect(isProductionSource('vendor/types.d.ts', root)).toBe(false);
    });
  });

  it('requires emitted owned runtimes instead of silently shrinking the coverage denominator', () => {
    withRoot((root, write) => {
      write('vendor/components.json', manifest(['vendor/owned.js']));
      write('vendor/owned.ts', 'export function neverCalled() {}');
      expect(productionSources(root)).toEqual(['vendor/owned.ts']);
      expect(() => productionSources(root, { runtime: true })).toThrow('Missing emitted runtime');
    });
  });

  it.each([
    ['vendor/ppq-private-tee.js', 'Wallet and providers'],
    ['vendor/bip39-minimal.js', 'Profile and storage'],
    ['vendor/chartjs-adapter-native.js', 'Labs and markers'],
  ])('collects %s in its existing feature group', (file, feature) => {
    expect(COVERAGE_INCLUDE).toContain(file);
    expect(isProductionSource(file!)).toBe(true);
    expect(coverageFeature(file!)).toBe(feature);
  });
});

describe('owned-vendor PR planning', () => {
  it('loads only owned executable vendor sources and ownership metadata into the source graph', () => {
    const files = ['vendor/components.json', 'vendor/owned.ts', 'vendor/types.d.ts', 'vendor/external.js', 'tests/owned.test.ts'];
    expect(planningSourceFiles(files, manifest(['vendor/owned.js', 'vendor/types.d.ts'])))
      .toEqual(['vendor/components.json', 'vendor/owned.ts', 'tests/owned.test.ts']);
  });

  it('selects transitive native unit and browser consumers through unchanged runtime URL imports', () => {
    const sources = new Map([
      ['vendor/components.json', manifest(['vendor/owned.js'])],
      ['vendor/owned.ts', 'export const value = 1;'],
      ['js/consumer.ts', "export { value } from '../vendor/owned.js';"],
      ['tests/owned.test.ts', "import { value } from '../js/consumer.js';"],
      ['tests/playwright/owned.spec.ts', "await import('/vendor/owned.js?fresh=1');"],
      ['tests/unrelated.test.ts', ''],
    ]);
    const plan = createTestPlan(sources, ['vendor/owned.ts']);
    expect(plan.unit).toEqual(['tests/owned.test.ts']);
    expect(plan.browser).toEqual(['tests/playwright/owned.spec.ts']);
    expect(plan.uncovered).toEqual([]);
  });

  it('fails closed on a new declared owned module even alongside an unrelated selected test', () => {
    const sources = new Map([
      ['vendor/components.json', manifest(['vendor/owned*.js'])],
      ['vendor/owned-new.ts', 'export const untested = 1;'],
      ['tests/unrelated.test.ts', ''],
    ]);
    const plan = createTestPlan(sources, ['vendor/owned-new.ts', 'tests/unrelated.test.ts']);
    expect(plan.unit).toEqual(['tests/unrelated.test.ts']);
    expect(plan.uncovered).toEqual(['vendor/owned-new.ts']);
    expect(createTestPlan(sources, ['vendor/external.js']).uncovered).toEqual([]);
  });

  it('retains recovery of test scope for removed owned native sources', () => {
    const sources = new Map([
      ['vendor/components.json', manifest(['vendor/owned.js'])],
      ['tests/owned.test.ts', "import '../vendor/owned.js';"],
    ]);
    const plan = createTestPlan(sources, ['vendor/owned.ts']);
    expect(plan.unit).toEqual(['tests/owned.test.ts']);
    expect(plan.uncovered).toEqual([]);
  });
});

describe('fresh-checkout CI ownership gates', () => {
  it('requires migration completion unconditionally after installation and before scoped planning', () => {
    const workflow = fs.readFileSync('.github/workflows/test.yml', 'utf8');
    const step = workflow.match(/      - name: Require complete authored TypeScript migration\n([\s\S]*?)(?=      - |$)/)?.[1];
    expect(step).toContain('run: npm run migration:check');
    expect(step).not.toMatch(/\bif:/);
    expect(workflow.indexOf('run: npm ci')).toBeLessThan(workflow.indexOf('run: npm run migration:check'));
    expect(workflow.indexOf('run: npm run migration:check')).toBeLessThan(workflow.indexOf('- name: Select affected PR tests'));
  });

  it('excludes every inventoried external CodeQL bundle while scanning each owned runtime source', () => {
    const metadata: { components: { files: string[] }[]; projectFiles: string[] } = JSON.parse(fs.readFileSync('vendor/components.json', 'utf8'));
    const workflow = fs.readFileSync('.github/workflows/codeql.yml', 'utf8');
    const ignores = [...workflow.matchAll(/^              - (vendor\/.*)$/gm)].map(match => match[1]!);
    expect(ignores).not.toContain('vendor/**');
    for (const file of metadata.components.flatMap(component => component.files)) expect(ignores).toContain(file);
    const owned = projectOwnedVendorSources(JSON.stringify(metadata), metadata.projectFiles);
    expect(owned).toHaveLength(6);
    for (const pattern of ignores) expect(matchingFiles(pattern, owned)).toEqual([]);
    const config = fs.readFileSync('vitest.config.ts', 'utf8').split('    coverage:')[1]!;
    expect(config).not.toContain("'vendor/**'");
  });
});


describe('isolated build-tool entrypoint contracts', () => {
  it('runs the actual catalog fallback, rejects missing fixtures and never requires private fetch credentials', () => {
    withRoot((root, write) => {
      write('scripts/fetch-catalog.mjs', fs.readFileSync(new URL('../scripts/fetch-catalog.mjs', import.meta.url), 'utf8'));
      const stub = JSON.stringify({ slots: {}, products: [{ id: 'synthetic-product' }] });
      write('data/recommendations.example.json', stub);
      const env = { ...process.env, CATALOG_FETCH_URL: '', CATALOG_FETCH_TOKEN: '', CATALOG_FETCH_HEADER_NAME: '', CATALOG_FETCH_HEADER_VALUE: '' };
      const run = () => spawnSync(process.execPath, ['--import', 'data:text/javascript,globalThis.fetch%3Dasync()%3D%3E%7Bthrow%20new%20Error(%22No%20network%20in%20catalog%20fixture%22)%7D', path.join(root, 'scripts/fetch-catalog.mjs')], { env, encoding: 'utf8' });
      const copied = run();
      expect(copied.status).toBe(0);
      expect(fs.readFileSync(path.join(root, 'data/recommendations.json'), 'utf8')).toBe(stub);
      env.CATALOG_FETCH_URL = 'https://example.invalid/must-not-fetch';
      expect(run().status).toBe(0);
      expect(fs.readFileSync(path.join(root, 'data/recommendations.json'), 'utf8')).toBe(stub);
      fs.rmSync(path.join(root, 'data/recommendations.json'));
      fs.rmSync(path.join(root, 'data/recommendations.example.json'));
      env.CATALOG_FETCH_URL = '';
      const failed = run();
      expect(failed.status).toBe(1);
      expect(failed.stderr).toContain('Aborting.');
    });
  });

  it('validates fetched catalog bytes before replacing the constant output path', () => {
    withRoot((root, write) => {
      write('scripts/fetch-catalog.mjs', fs.readFileSync(new URL('../scripts/fetch-catalog.mjs', import.meta.url), 'utf8'));
      const original = JSON.stringify({ slots: { original: {} }, products: {} });
      write('data/recommendations.json', original);
      const env = { ...process.env, CATALOG_FETCH_URL: 'https://catalog-fixture.invalid/source', CATALOG_FETCH_TOKEN: 'synthetic-fixture-token', CATALOG_FETCH_HEADER_NAME: '', CATALOG_FETCH_HEADER_VALUE: '' };
      const run = (body: string, status = 200) => {
        const fixture = `globalThis.fetch = async () => new Response(${JSON.stringify(body)}, {status:${status}})`;
        return spawnSync(process.execPath, ['--import', `data:text/javascript,${encodeURIComponent(fixture)}`, path.join(root, 'scripts/fetch-catalog.mjs')], { env, encoding: 'utf8' });
      };
      for (const [body, status] of [['{invalid', 200], ['{"unrelated":"shape"}', 200], ['denied', 403]] as const) {
        const result = run(body, status);
        expect(result.status).toBe(1);
        expect(fs.readFileSync(path.join(root, 'data/recommendations.json'), 'utf8')).toBe(original);
      }
      const accepted = JSON.stringify({ slots: {}, products: {}, vendors: {} });
      expect(run(accepted).status).toBe(0);
      expect(fs.readFileSync(path.join(root, 'data/recommendations.json'), 'utf8')).toBe(accepted);
    });
  });

  it('runs the actual demo upgrader on isolated inputs and preserves completed output on a second run', () => {
    withRoot((root, write) => {
      write('scripts/upgrade-demos.mjs', fs.readFileSync(new URL('../scripts/upgrade-demos.mjs', import.meta.url), 'utf8'));
      for (const sex of ['female', 'male']) write(`data/demo-${sex}.json`, JSON.stringify({ entries: [], customMarkers: {} }));
      const run = () => spawnSync(process.execPath, [path.join(root, 'scripts/upgrade-demos.mjs')], { encoding: 'utf8' });
      const first = run();
      expect(first.status, first.stderr).toBe(0);
      const outputs = ['female', 'male'].map(sex => fs.readFileSync(path.join(root, `data/demo-${sex}.json`), 'utf8'));
      for (const output of outputs) {
        const data: { version: unknown; demoUpgradedAt: unknown; sunSessions: unknown; lightDevices: unknown } = JSON.parse(output);
        expect(data.version).toBe(3);
        expect(data.demoUpgradedAt).toBe('2026-05-09-v9');
        expect(Array.isArray(data.sunSessions)).toBe(true);
        expect(Array.isArray(data.lightDevices)).toBe(true);
      }
      const second = run();
      expect(second.status, second.stderr).toBe(0);
      expect(second.stdout).toContain('Upgraded 0/2 demos.');
      expect(['female', 'male'].map(sex => fs.readFileSync(path.join(root, `data/demo-${sex}.json`), 'utf8'))).toEqual(outputs);
    });
  });

  it('executes the actual PDF generator with inert browser operations and verifies escaped gold-marker rendering', async () => {
    const fixture = { expected: { markers: [
      { page: 1, section: '<Clinical & markers>', rawName: '<img src=x onerror=alert(1)>', value: 1, unit: '<unit>', refMin: 2, refMax: 4 },
      { page: 2, section: 'Second', rawName: 'High', value: 10, unit: 'mmol/L', refMin: 2, refMax: 4 },
      { page: 3, section: 'Third', rawName: 'Within', value: 3, unit: null, refMin: 2, refMax: 4 },
    ] } };
    const setContent = vi.fn(async (_html: string, _options: Parameters<import('@playwright/test').Page['setContent']>[1]) => {});
    const pdf = vi.fn(async (_options: Parameters<import('@playwright/test').Page['pdf']>[0]) => Buffer.from('inert'));
    const close = vi.fn(async () => {});
    const launch = vi.fn(async (_options: Parameters<typeof import('@playwright/test')['chromium']['launch']>[0]) => ({ newPage: async () => ({ setContent, pdf }), close }));
    vi.doMock('node:fs/promises', () => ({ default: { readFile: async (file: string, encoding: string) => {
      expect(file).toMatch(/import-benchmark-reference-us-v2\.gold\.json$/);
      expect(encoding).toBe('utf8');
      return JSON.stringify(fixture);
    } } }));
    vi.doMock('@playwright/test', () => ({ chromium: { launch } }));
    try {
      await import('../scripts/generate-import-reference-pdf.mjs');
      expect(launch).toHaveBeenCalledExactlyOnceWith({ headless: true, args: ['--no-sandbox'] });
      const html = setContent.mock.calls[0]![0];
      expect(html).toContain('&lt;Clinical &amp; markers&gt;');
      expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
      expect(html).not.toContain('<img src=x');
      expect(html).toContain('LOW');
      expect(html).toContain('HIGH');
      expect(html).toContain('Page 3 of 3');
      expect(pdf.mock.calls[0]![0]).toMatchObject({ format: 'Letter', printBackground: true, preferCSSPageSize: true });
      expect(close).toHaveBeenCalledOnce();
    } finally {
      vi.doUnmock('node:fs/promises');
      vi.doUnmock('@playwright/test');
    }
  });
});
