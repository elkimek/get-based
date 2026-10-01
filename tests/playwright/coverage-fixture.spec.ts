import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { sourceFingerprint } from '../../scripts/coverage-model-helpers.mjs';
import { routeHtml, routeJavaScript } from '../helpers/browser-static-routes.js';
import { startPageCoverage, stopPageCoverage, waitForWorkerCoverage } from './coverage-fixture.js';

test('native collector retains page source fingerprints and live worker functions', async ({ page }, testInfo) => {
  const previous = process.env.PLAYWRIGHT_SUITE_COVERAGE;
  process.env.PLAYWRIGHT_SUITE_COVERAGE = '1';
  const label = `native-collector-${process.pid}-${Date.now()}`;
  const script = 'function fixtureDouble(value) { return value * 2; } document.documentElement.dataset.result = String(fixtureDouble(21));';
  const worker = 'function fixtureWorkerSquare(value) { return value * value; } onmessage = event => postMessage(fixtureWorkerSquare(event.data));';
  await routeHtml(page, '**/fixture-coverage', '<!doctype html><script type="module" src="/tests/fixture-coverage.js"></script>');
  await routeJavaScript(page, '**/tests/fixture-coverage.js', script);
  await routeJavaScript(page, '**/tests/fixture-coverage-worker.js', worker);
  try {
    await startPageCoverage(page);
    await startPageCoverage(page); // Repeated starts must keep the original collector.
    await page.goto('/fixture-coverage');
    await expect(page.locator('html')).toHaveAttribute('data-result', '42');
    expect(await page.evaluate(() => new Promise(resolve => {
      const worker = new Worker('/tests/fixture-coverage-worker.js');
      worker.onmessage = event => resolve(event.data);
      worker.postMessage(7);
      // Keep this worker alive while the CDP collector takes its snapshot.
    }))).toBe(49);
    await waitForWorkerCoverage(page);
    expect(await page.workers()[0]!.evaluate(() => {
      const scope = globalThis as typeof globalThis & { fixtureWorkerSquare(value: number): number };
      return scope.fixtureWorkerSquare(7);
    })).toBe(49);
    await stopPageCoverage(page, testInfo, label);
    await stopPageCoverage(page, testInfo, label);
    const dir = process.env.PLAYWRIGHT_COVERAGE_DIR || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '.playwright-coverage');
    const files = fs.readdirSync(dir).filter(file => file.includes(label));
    expect(files).toHaveLength(1);
    const shard = JSON.parse(fs.readFileSync(path.join(dir, files[0]!), 'utf8')) as {
      entries: Array<{ url: string; sourceHash: string | null; sourceLength: number; functions: Array<{ functionName: string; ranges: Array<{ count: number }> }> }>;
    };
    const pageEntry = shard.entries.find(entry => entry.url.endsWith('/tests/fixture-coverage.js'));
    expect(pageEntry).toMatchObject(sourceFingerprint(script));
    expect(pageEntry?.functions.find(fn => fn.functionName === 'fixtureDouble')?.ranges[0]?.count).toBeGreaterThan(0);
    const workerEntry = shard.entries.find(entry => entry.url.endsWith('/tests/fixture-coverage-worker.js'));
    expect(workerEntry?.functions.find(fn => fn.functionName === 'fixtureWorkerSquare')?.ranges[0]?.count).toBeGreaterThan(0);
  } finally {
    await stopPageCoverage(page, testInfo, label);
    if (previous === undefined) delete process.env.PLAYWRIGHT_SUITE_COVERAGE;
    else process.env.PLAYWRIGHT_SUITE_COVERAGE = previous;
  }
});
