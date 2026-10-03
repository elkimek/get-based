#!/usr/bin/env node
// Plan from tracked files only. Planning is read-only; execution is CI-only.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import ts from 'typescript-api';
import { runtimePath, sourcePath } from './source-files.js';

type BrowserSuite = 'browser' | 'firefox' | 'pwa';
export interface TestPlan {
  changedFiles: string[]; reasons: string[]; unit: string[]; legacy: string[];
  browser: string[]; firefox: string[]; pwa: string[]; sync: boolean; uncovered: string[];
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LEGACY = 'tests/_vitest-legacy.test.js';
const SOURCE = /\.(?:[cm]?[jt]s|json|html|css|yml|yaml)$/;
const isUnit = (file: string) => file.startsWith('tests/') && /\.test\.[jt]s$/.test(file) && runtimePath(file) !== LEGACY;
const isBrowser = (file: string) => /^tests\/playwright\/.*\.spec\.[jt]s$/.test(file);
const isFirefox = (file: string) => /^tests\/firefox\/.*\.spec\.[jt]s$/.test(file);
const isPwa = (file: string) => /^tests\/pwa\/.*\.spec\.[jt]s$/.test(file);
const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Explicit edges cover UI-only tests that exercise these catalogs through DOM
// controls rather than importing their implementation directly.
const MODEL_SOURCES = new Set(['js/api-models.js', 'js/api-ppq.js', 'js/api-routstr.js']);
const MODEL_TESTS = /(?:api-provider|provider-model|provider-coverage|provider-polling|private-tee-provider|chat-model|nutrition-module|nutrition-ai-settings|openrouter-settings|test-openrouter|test-ppq-provider)/;

export function fileReferences(file: string, source: string, knownFiles: Set<string>): Set<string> {
  const refs = new Set<string>();
  const add = (raw: string) => {
    const clean = raw.split(/[?#]/, 1)[0]!;
    const candidates = [
      clean.replace(/^\//, ''),
      path.posix.normalize(path.posix.join(path.posix.dirname(file), clean)),
    ];
    for (const candidate of candidates.flatMap(candidate => [candidate.replace(/\.mjs$/, '.mts').replace(/\.cjs$/, '.cts').replace(/\.js$/, '.ts'), candidate])) {
      if (candidate !== file && knownFiles.has(candidate)) refs.add(candidate);
    }
  };
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true,  /\.[cm]?ts$/.test(file) ? ts.ScriptKind.TS : ts.ScriptKind.JS);
  const visit = (node: ts.Node): void => {
    if (ts.isStringLiteralLike(node)) add(node.text);
    ts.forEachChild(node, visit);
  };
  visit(parsed);
  // Also handle HTML script/link attributes and paths embedded in HTML strings.
  for (const match of source.matchAll(/(?:src|href)=["']([^"']+)["']/g)) add(match[1]!);
  return refs;
}

export function createTestPlan(sources: Map<string, string>, changedFiles: string[]): TestPlan {
  const known = new Set([...sources.keys(), ...changedFiles]);
  const reverse = new Map<string, Set<string>>();
  for (const [file, source] of sources) {
    if (!SOURCE.test(file)) continue;
    for (const dependency of fileReferences(file, source, known)) {
      if (!reverse.has(dependency)) reverse.set(dependency, new Set());
      reverse.get(dependency)!.add(file);
    }
  }
  const affected = new Set(changedFiles);
  // These catalog modules have an explicit feature boundary: following their
  // api.js barrel into app startup would otherwise select almost every UI test.
  const queue = changedFiles.filter(file => !MODEL_SOURCES.has(runtimePath(file)));
  for (const file of changedFiles.filter(file => MODEL_SOURCES.has(runtimePath(file)))) {
    for (const consumer of reverse.get(file) || []) {
      if (consumer.startsWith('tests/')) {
        affected.add(consumer);
        queue.push(consumer);
      }
    }
  }
  while (queue.length) {
    for (const consumer of reverse.get(queue.pop()!) || []) {
      // The legacy harness lists every script; select its individual cases below.
      if (runtimePath(consumer) === LEGACY || affected.has(consumer)) continue;
      affected.add(consumer);
      queue.push(consumer);
    }
  }
  const all = [...sources.keys()];
  const legacyHarness = all.find(file => runtimePath(file) === LEGACY) || LEGACY;
  const legacyScripts = [...fileReferences(legacyHarness, sources.get(legacyHarness) || '', known)]
    .filter(file => /^tests\/test-.*\.[jt]s$/.test(file));
  const reasons: string[] = [];
  const addMatching = (predicate: (file: string) => boolean, reason: string): void => {
    all.filter(predicate).forEach(file => affected.add(file));
    reasons.push(reason);
  };
  if (changedFiles.some(file => MODEL_SOURCES.has(runtimePath(file)))) {
    addMatching(file => file.startsWith('tests/') && MODEL_TESTS.test(file), 'Provider model catalogs: include DOM model selectors and routing contracts.');
  }
  if (changedFiles.some(file => /^(package(?:-lock)?\.json|vitest.*\.js|tests\/_vitest.*\.js)$/.test(runtimePath(file)))) {
    addMatching(file => isUnit(file) || legacyScripts.includes(file), 'Shared unit dependencies or harness changed: all unit cases are affected.');
  }
  if (changedFiles.some(file => /^(package(?:-lock)?\.json|playwright\.config\.js|dev-server\.js|index\.html|css\/|js\/(?:main|startup[^/]*|state|utils)\.js|tests\/playwright\/.*(?:fixture|helper).*\.js)/.test(runtimePath(file)))) {
    addMatching(isBrowser, 'Shared browser runtime, styling, dependencies, or harness changed: all Chromium specs are affected.');
  }
  if (changedFiles.some(file => /^(package(?:-lock)?\.json|service-worker[^/]*\.js|version\.js|index\.html|manifest.*\.json|playwright(?:\.pwa)?\.config\.js|tests\/pwa\/)/.test(runtimePath(file)))) {
    addMatching(isPwa, 'Offline lifecycle or PWA harness changed.');
  }
  if (changedFiles.some(file => /^(playwright(?:\.firefox)?\.config\.js|tests\/firefox\/|package(?:-lock)?\.json)/.test(runtimePath(file)))) {
    addMatching(isFirefox, 'Firefox harness or shared dependencies changed.');
  }
  if (changedFiles.some(file => file.startsWith('.github/workflows/') || runtimePath(file) === 'scripts/pr-test-scope.mjs')) {
    affected.add(all.find(file => runtimePath(file) === 'tests/pr-test-scope.test.js') || 'tests/pr-test-scope.test.js');
  }
  const select = (predicate: (file: string) => boolean) => all.filter(file => affected.has(file) && predicate(file)).sort();
  const plan: Omit<TestPlan, 'uncovered'> & Partial<Pick<TestPlan, 'uncovered'>> = {
    changedFiles: [...changedFiles].sort(), reasons,
    unit: select(isUnit), legacy: legacyScripts.filter(file => affected.has(file)).sort(),
    browser: select(isBrowser), firefox: select(isFirefox), pwa: select(isPwa),
    sync: all.some(file => affected.has(file) && (/^tests\/evolu8-browser\//.test(file) || runtimePath(file) === 'tests/playwright/sync-relay-transport-e2e.spec.js'))
      || changedFiles.some(file => /^(package(?:-lock)?\.json|playwright(?:\.evolu8)?\.config\.js|\.github\/workflows\/sync-compat\.yml)$/.test(runtimePath(file))),
  };
  // An unknown runtime change must never silently produce an empty green check.
  const selected = new Set([...plan.unit, ...plan.legacy, ...plan.browser, ...plan.firefox, ...plan.pwa]);
  plan.uncovered = changedFiles.filter(file => {
    if (!/^(js\/|lib\/|api\/|server\/|scripts\/).*\.[cm]?[jt]s$/.test(file)) return false;
    if (MODEL_SOURCES.has(runtimePath(file))) return ![...selected].some(test => MODEL_TESTS.test(test));
    const visited = new Set([file]);
    const pending = [file];
    while (pending.length) {
      const current = pending.pop()!;
      if (selected.has(current)) return false;
      for (const consumer of reverse.get(current) || []) {
        if (runtimePath(consumer) === LEGACY || visited.has(consumer)) continue;
        visited.add(consumer);
        pending.push(consumer);
      }
    }
    return true;
  });
  return plan as TestPlan;
}

export function testCommands(plan: TestPlan, suite: string | undefined, resolvePath: (file: string) => string = file => file): string[][] {
  const commands = [];
  if (suite === 'unit') {
    if (plan.unit.length) commands.push(['vitest', 'run', ...plan.unit]);
    if (plan.legacy.length) commands.push(['vitest', 'run', resolvePath(LEGACY), '-t', plan.legacy.map(file => {
      const name = path.posix.basename(file);
      return /\.[cm]?ts$/.test(name)
        ? `^(?:${escapeRegex(name)}|${escapeRegex(path.posix.basename(runtimePath(file)))})$`
        : `^${escapeRegex(name)}$`;
    }).join('|')]);
  } else if ((['browser', 'firefox', 'pwa'] as readonly (string | undefined)[]).includes(suite)) {
    if (plan[suite as BrowserSuite].length) commands.push(['playwright', 'test', ...plan[suite as BrowserSuite], ...(suite === 'browser' ? [] : [`--config=playwright.${suite}.config.js`]), '--workers=2']);
  } else throw new Error(`Unknown test suite: ${suite}`);
  return commands;
}

function git(...args: string[]): string {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' });
}

function main(): void {
  const args = process.argv.slice(2);
  const value = (flag: string) => args[args.indexOf(flag) + 1];
  const output = value('--output');
  if (!args.includes('--output') || !output) throw new Error('--output is required');
  if (args.includes('--run')) {
    if (process.env.GITHUB_ACTIONS !== 'true') throw new Error('Automatic test execution is GitHub Actions-only. Run explicit relevant tests locally.');
    const plan = JSON.parse(fs.readFileSync(output, 'utf8')) as TestPlan;
    if (plan.uncovered.length) throw new Error(`Add test scope for: ${plan.uncovered.join(', ')}`);
    for (const command of testCommands(plan, value('--run'), sourcePath)) {
      console.log(JSON.stringify(command));
      const result = spawnSync('npx', ['--no-install', ...command], { cwd: ROOT, stdio: 'inherit', env: process.env });
      if (result.error) throw result.error;
      if (result.status !== 0) process.exit(result.status || 1);
    }
    return;
  }
  const base = value('--base');
  if (!args.includes('--base') || !/^[a-f0-9]{40}$/.test(base || '')) throw new Error('--base must be a full Git SHA');
  const changedFiles = git('diff', '--name-only', '-z', `${base}...HEAD`).split('\0').filter(Boolean);
  const files = git('ls-files', '-z').split('\0').filter(Boolean);
  const sources = new Map(files.filter(file => SOURCE.test(file) && !/^(vendor|docs|dist-docs)\//.test(file) && fs.existsSync(path.join(ROOT, file)))
    .map(file => [file, fs.readFileSync(path.join(ROOT, file), 'utf8')]));
  const plan = createTestPlan(sources, changedFiles);
  fs.writeFileSync(output, JSON.stringify(plan, null, 2) + '\n');
  const summary = ['## Affected PR tests', ...['unit', 'legacy', 'browser', 'firefox', 'pwa'].map(suite => `- ${suite}: ${plan[suite as BrowserSuite].length}`), ...plan.reasons.map(reason => `- ${reason}`), '\nFull coverage runs on main, manual dispatch, and explicit release verification.'].join('\n');
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + '\n');
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, ['browser', 'firefox', 'pwa'].map(suite => `${suite}=${Boolean(plan[suite as BrowserSuite].length)}\n`).join('') + `sync=${plan.sync}\n`);
  if (plan.uncovered.length) throw new Error(`No tests selected. Add explicit scope for: ${plan.uncovered.join(', ')}`);
}

if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) main();
