import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { expect, test as base } from '@playwright/test';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const coverageDir = process.env.PLAYWRIGHT_COVERAGE_DIR ||
  path.join(repoRoot, 'tests', '.playwright-coverage');
const startedPages = new WeakSet();

function isCoverageEnabled() {
  return process.env.PLAYWRIGHT_SUITE_COVERAGE === '1' ||
    process.env.PLAYWRIGHT_SUITE_COVERAGE === 'true';
}

function safeName(value) {
  return String(value || 'test')
    .replace(/[^a-z0-9_.-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 140) || 'test';
}

function titlePathFor(testInfo) {
  if (typeof testInfo.titlePath === 'function') return testInfo.titlePath();
  if (Array.isArray(testInfo.titlePath)) return testInfo.titlePath;
  return [testInfo.title];
}

function coverageFile(testInfo, label) {
  const title = safeName(titlePathFor(testInfo).join(' '));
  const suffix = [
    safeName(label),
    `w${testInfo.workerIndex}`,
    `r${testInfo.repeatEachIndex}`,
    process.pid,
    Date.now(),
    Math.random().toString(36).slice(2, 8),
  ].join('-');
  return path.join(coverageDir, `${title}-${suffix}.json`);
}

function shrinkEntry(entry) {
  return {
    url: entry.url,
    ranges: entry.ranges,
    functions: entry.functions,
    rawScriptCoverage: entry.rawScriptCoverage
      ? { functions: entry.rawScriptCoverage.functions }
      : undefined,
  };
}

export async function startPageCoverage(page) {
  if (!isCoverageEnabled() || startedPages.has(page)) return;
  await page.coverage.startJSCoverage({
    resetOnNavigation: false,
    reportAnonymousScripts: false,
    includeRawScriptCoverage: true,
  });
  startedPages.add(page);
}

export async function stopPageCoverage(page, testInfo, label = 'page') {
  if (!isCoverageEnabled() || !startedPages.has(page)) return;
  let entries = [];
  try {
    entries = await page.coverage.stopJSCoverage();
  } finally {
    startedPages.delete(page);
  }
  fs.mkdirSync(coverageDir, { recursive: true });
  fs.writeFileSync(coverageFile(testInfo, label), JSON.stringify({
    title: testInfo.title,
    titlePath: titlePathFor(testInfo),
    file: path.relative(repoRoot, testInfo.file).split(path.sep).join('/'),
    label,
    generatedAt: new Date().toISOString(),
    entries: entries.map(shrinkEntry),
  }));
}

export const test = base.extend({
  page: async ({ page }, use, testInfo) => {
    if (!isCoverageEnabled()) {
      await use(page);
      return;
    }

    await startPageCoverage(page);
    try {
      await use(page);
    } finally {
      await stopPageCoverage(page, testInfo);
    }
  },
});

export { expect };
