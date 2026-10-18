import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  enforceSvelteKitResourceBudget,
  measureSvelteKitResources,
  parseSvelteKitResourceBudget,
  type SvelteKitResourceBudget,
  type SvelteKitResourceMetrics,
} from '../scripts/sveltekit-resource-budget.mjs';

const directories: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(directories.splice(0).map(directory => fs.rm(directory, { recursive: true, force: true })));
});
async function directory() {
  const result = await fs.mkdtemp(path.join(os.tmpdir(), 'getbased-kit-budget-'));
  directories.push(result);
  return result;
}
function policy(): SvelteKitResourceBudget {
  return {
    schemaVersion: 1,
    scenario: 'Independent synthetic budget boundary',
    maximumDecodedBytes: 22000,
    maximumReferenceGrowthPercent: 5,
    resourceCountWarning: 550,
    reference: {
      version: 'independent-fixture-v1',
      buildId: 'a'.repeat(64),
      measuredAt: '2026-10-17',
      resources: 40,
      decodedBytes: 10000,
    },
  };
}
function metrics(decodedBytes: number, resources = 40): SvelteKitResourceMetrics {
  return {
    offlinePrecache: { resources, decodedBytes },
    generatedJavaScript: { files: 2, decodedBytes: 100, gzipBytes: 80, brotliBytes: 70 },
  };
}
const shell = (urls: string[]) => `const APP_SHELL = ${JSON.stringify(urls)};`;

describe('SvelteKit resource policy', () => {
  it('pins the documented C7 measurement and independent 22MiB/5% policy', async () => {
    const actual = parseSvelteKitResourceBudget(JSON.parse(await fs.readFile('scripts/sveltekit-resource-budget.json', 'utf8')));
    expect(actual).toEqual({
      schemaVersion: 1,
      scenario: 'Complete SvelteKit production offline precache for one build',
      maximumDecodedBytes: 22 * 1024 * 1024,
      maximumReferenceGrowthPercent: 5,
      resourceCountWarning: 550,
      reference: {
        version: 'migration-candidate-7',
        buildId: '2ce34ac3a293aca6c224df2f35dd193740d6c4cfafe619d93bc553c86feb90d1',
        measuredAt: '2026-10-17',
        resources: 493,
        decodedBytes: 19172377,
      },
    });
    const accepted = enforceSvelteKitResourceBudget(metrics(20130995), actual);
    expect(accepted.checks.effectiveMaximumDecodedBytes).toBe(20130995);
    expect(accepted.checks.remainingDecodedBytes).toBe(0);
    expect(() => enforceSvelteKitResourceBudget(metrics(20130996), actual))
      .toThrow('5% reference-growth maximum 20130995');
  });

  it('passes the exact growth boundary and rejects the next decoded byte', () => {
    expect(enforceSvelteKitResourceBudget(metrics(10500), policy()).checks.remainingDecodedBytes).toBe(0);
    expect(() => enforceSvelteKitResourceBudget(metrics(10501), policy()))
      .toThrow('5% reference-growth maximum 10500');
  });

  it('separately enforces the absolute limit even when reference growth allows more', () => {
    const budget = policy();
    budget.maximumDecodedBytes = 10000;
    budget.reference.decodedBytes = 20000;
    expect(enforceSvelteKitResourceBudget(metrics(10000), budget).checks.remainingDecodedBytes).toBe(0);
    expect(() => enforceSvelteKitResourceBudget(metrics(10001), budget))
      .toThrow('hard maximum 10000');
    expect(() => enforceSvelteKitResourceBudget(metrics(22001), budget))
      .toThrow(/hard maximum 10000.*reference-growth maximum 21000/);
  });

  it('floors fractional growth to the last permitted integer byte', () => {
    const budget = policy();
    budget.reference.decodedBytes = 10001;
    expect(enforceSvelteKitResourceBudget(metrics(10501), budget).checks.remainingDecodedBytes).toBe(0);
    expect(() => enforceSvelteKitResourceBudget(metrics(10502), budget)).toThrow('maximum 10501');
  });

  it('warns above 550 resources while retaining a passing decoded-size build', () => {
    expect(enforceSvelteKitResourceBudget(metrics(10000, 550), policy()).warnings).toEqual([]);
    expect(enforceSvelteKitResourceBudget(metrics(10000, 551), policy()).warnings)
      .toEqual(['SvelteKit offline precache has 551 resources; warning threshold is 550.']);
    expect(enforceSvelteKitResourceBudget(metrics(10000, 1000), policy()).metrics.offlinePrecache.resources).toBe(1000);
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1, '22000', true, null])(
    'rejects invalid numeric limits without coercion: %s', value => {
      for (const field of ['maximumDecodedBytes', 'maximumReferenceGrowthPercent', 'resourceCountWarning']) {
        expect(() => parseSvelteKitResourceBudget({ ...policy(), [field]: value })).toThrow();
      }
      for (const field of ['resources', 'decodedBytes']) {
        expect(() => parseSvelteKitResourceBudget({ ...policy(), reference: { ...policy().reference, [field]: value } })).toThrow();
      }
    },
  );

  it.each([
    null,
    [],
    { ...policy(), schemaVersion: 2 },
    { ...policy(), extraLimit: 1 },
    { ...policy(), maximumDecodedBytes: undefined },
    { ...policy(), reference: null },
    { ...policy(), reference: { ...policy().reference, unknown: 1 } },
    { ...policy(), reference: { ...policy().reference, version: '../latest' } },
    { ...policy(), reference: { ...policy().reference, buildId: 'not-an-immutable-build' } },
    { ...policy(), reference: { ...policy().reference, measuredAt: '2026-02-30' } },
    { ...policy(), maximumReferenceGrowthPercent: 101 },
    { ...policy(), reference: { ...policy().reference, decodedBytes: Number.MAX_SAFE_INTEGER } },
  ])('rejects malformed or unsupported policy identities: %j', value => {
    expect(() => parseSvelteKitResourceBudget(value)).toThrow();
  });

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, '10000'])('rejects unqualified runtime measurement values: %s', value => {
    for (const field of ['resources', 'decodedBytes']) {
      const actual = metrics(10000);
      Reflect.set(actual.offlinePrecache, field, value);
      expect(() => enforceSvelteKitResourceBudget(actual, policy())).toThrow();
    }
    for (const field of ['files', 'decodedBytes', 'gzipBytes', 'brotliBytes']) {
      const actual = metrics(10000);
      Reflect.set(actual.generatedJavaScript, field, value);
      expect(() => enforceSvelteKitResourceBudget(actual, policy())).toThrow();
    }
  });
});

describe('exact assembled artifact measurement', () => {
  it('counts every precache URL/body and sums individually compressed generated scripts', async () => {
    const root = await directory();
    await fs.mkdir(path.join(root, 'js'));
    await fs.mkdir(path.join(root, 'css'));
    const html = '<!doctype html><html><body>Exact document 🌤</body></html>\n';
    const script = 'export const message = "žluťoučký 🌤";\n'.repeat(32);
    const css = '.ui{color:red}\n';
    await fs.writeFile(path.join(root, 'index.html'), html);
    await fs.writeFile(path.join(root, 'js/a.js'), script);
    await fs.writeFile(path.join(root, 'js/b.js'), script);
    await fs.writeFile(path.join(root, 'css/ui.css'), css);
    const actual = await measureSvelteKitResources({
      artifactRoot: root,
      serviceWorkerSource: shell(['/app', '/index.html', '/js/a.js', '/js/b.js', '/css/ui.css']),
      generatedJavaScriptUrls: ['/js/a.js', '/js/b.js'],
    });
    expect(actual).toEqual({
      offlinePrecache: {
        resources: 5,
        decodedBytes: 2 * Buffer.byteLength(html) + 2 * Buffer.byteLength(script) + Buffer.byteLength(css),
      },
      generatedJavaScript: {
        files: 2,
        decodedBytes: 2 * Buffer.byteLength(script),
        gzipBytes: 2 * gzipSync(script, { level: 9 }).length,
        brotliBytes: 2 * brotliCompressSync(script, { params: { [constants.BROTLI_PARAM_QUALITY]: 9 } }).length,
      },
    });
    expect(actual.generatedJavaScript.gzipBytes).not.toBe(gzipSync(script + script, { level: 9 }).length);
    expect(enforceSvelteKitResourceBudget(actual, policy()).generatedJavaScriptCompression.aggregation)
      .toContain('not startup transfer');
    expect(await fs.readFile(path.join(root, 'index.html'), 'utf8')).toBe(html);
    expect(await fs.readFile(path.join(root, 'js/a.js'), 'utf8')).toBe(script);
  });

  it.each(['/../outside.js', '/css/../../outside.js', '/%2e%2e/outside.js', '//outside.test/x.js', '/css\\outside.js', '/x.js?cache=1', '/x.js#fragment', '/x%2foutside.js', '/x.js\n'])('rejects unqualified URL paths: %s', async url => {
    await expect(measureSvelteKitResources({ artifactRoot: await directory(), serviceWorkerSource: shell([url]), generatedJavaScriptUrls: [] })).rejects.toThrow();
  });

  it('rejects a duplicate URL, dynamic precache, empty shell or missing resource instead of undercounting', async () => {
    const root = await directory();
    for (const source of [shell(['/missing.js']), shell(['/missing.js', '/missing.js']), 'const APP_SHELL = [runtime];', shell([])]) {
      await expect(measureSvelteKitResources({ artifactRoot: root, serviceWorkerSource: source, generatedJavaScriptUrls: [] })).rejects.toThrow();
    }
  });

  it('rejects symlink escape without reading a file from outside the artifact', async () => {
    const root = await directory(), outside = await directory();
    await fs.writeFile(path.join(outside, 'private.js'), 'outside artifact');
    await fs.symlink(path.join(outside, 'private.js'), path.join(root, 'public.js'));
    await expect(measureSvelteKitResources({ artifactRoot: root, serviceWorkerSource: shell(['/public.js']), generatedJavaScriptUrls: [] }))
      .rejects.toThrow('escapes artifact');
  });

  it('rejects linked files inside the artifact and linked ancestor directories', async () => {
    const root = await directory();
    await fs.mkdir(path.join(root, 'real'));
    await fs.writeFile(path.join(root, 'real/a.js'), 'export {};');
    await fs.symlink(path.join(root, 'real/a.js'), path.join(root, 'alias.js'));
    await fs.symlink(path.join(root, 'real'), path.join(root, 'linked'), 'dir');
    for (const url of ['/alias.js', '/linked/a.js']) {
      await expect(measureSvelteKitResources({artifactRoot: root, serviceWorkerSource: shell([url]), generatedJavaScriptUrls: []})).rejects.toThrow('escapes artifact');
    }
  });

  it('rejects non-regular precache resources', async () => {
    const root = await directory(); await fs.mkdir(path.join(root, 'directory.js'));
    await expect(measureSvelteKitResources({artifactRoot: root, serviceWorkerSource: shell(['/directory.js']), generatedJavaScriptUrls: []})).rejects.toThrow('not a file');
  });

  it('rejects replaced file identities after opening and closes the rejected descriptor', async () => {
    const root = await directory(), target = path.join(root, 'a.js');
    await fs.writeFile(target, 'original script');
    const realpath = fs.realpath.bind(fs), open = fs.open.bind(fs);
    let descriptor: Awaited<ReturnType<typeof fs.open>> | undefined, replaced = false;
    vi.spyOn(fs, 'open').mockImplementation(async (...args) => { const handle = await open(...args); descriptor = handle; return handle; });
    vi.spyOn(fs, 'realpath').mockImplementation(async (...args) => {
      const result = await realpath(...args);
      if (args[0] === target && !replaced) {
        replaced = true; await fs.rename(target, target + '.original'); await fs.writeFile(target, 'replacement script');
      }
      return result;
    });
    await expect(measureSvelteKitResources({artifactRoot: root, serviceWorkerSource: shell(['/a.js']), generatedJavaScriptUrls: []})).rejects.toThrow('changed during measurement');
    expect(replaced).toBe(true); expect(descriptor?.fd).toBe(-1);
  });

  it('reads the same descriptor when the qualified path is replaced just before the read', async () => {
    const root = await directory(), target = path.join(root, 'a.js'), body = 'original script';
    await fs.writeFile(target, body);
    const stat = fs.stat.bind(fs), open = fs.open.bind(fs);
    let descriptor: Awaited<ReturnType<typeof fs.open>> | undefined, replaced = false;
    vi.spyOn(fs, 'open').mockImplementation(async (...args) => { const handle = await open(...args); descriptor = handle; return handle; });
    vi.spyOn(fs, 'stat').mockImplementation(async (...args) => {
      const result = await stat(...args);
      if (args[0] === target && !replaced) {
        replaced = true; await fs.rename(target, target + '.original'); await fs.writeFile(target, 'different replacement script');
      }
      return result;
    });
    const actual = await measureSvelteKitResources({artifactRoot: root, serviceWorkerSource: shell(['/a.js']), generatedJavaScriptUrls: ['/a.js']});
    expect(actual.offlinePrecache.decodedBytes).toBe(Buffer.byteLength(body));
    expect(actual.generatedJavaScript.decodedBytes).toBe(Buffer.byteLength(body));
    expect(replaced).toBe(true); expect(descriptor?.fd).toBe(-1);
  });

  it.each([
    { generatedJavaScriptUrls: ['/a.js', '/a.js'] },
    { generatedJavaScriptUrls: ['/missing.js'] },
    { generatedJavaScriptUrls: ['/a.css'] },
    { generatedJavaScriptUrls: ['/a.js?query=1'] },
  ])('rejects an incomplete or duplicated generated-script inventory: %j', async ({ generatedJavaScriptUrls }) => {
    const root = await directory();
    await fs.writeFile(path.join(root, 'a.js'), 'export {};');
    await fs.writeFile(path.join(root, 'a.css'), 'body{}');
    await expect(measureSvelteKitResources({ artifactRoot: root, serviceWorkerSource: shell(['/a.js', '/a.css']), generatedJavaScriptUrls }))
      .rejects.toThrow();
  });
});
