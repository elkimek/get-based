#!/usr/bin/env node
// Plan from tracked files only. Planning is read-only; execution is CI-only.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LEGACY = 'tests/_vitest-legacy.test.js';
const SOURCE = /\.(?:[cm]?js|ts|json|html|css|yml|yaml)$/;
const isUnit = file => file.startsWith('tests/') && file.endsWith('.test.js') && file !== LEGACY;
const isBrowser = file => /^tests\/playwright\/.*\.spec\.js$/.test(file);
const isFirefox = file => /^tests\/firefox\/.*\.spec\.js$/.test(file);
const isPwa = file => /^tests\/pwa\/.*\.spec\.js$/.test(file);
const escapeRegex = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Explicit edges cover UI-only tests that exercise these catalogs through DOM
// controls rather than importing their implementation directly.
const MODEL_SOURCES = new Set(['js/api-models.js', 'js/api-ppq.js', 'js/api-routstr.js']);
const MODEL_TESTS = /(?:api-provider|provider-model|provider-coverage|provider-polling|private-tee-provider|chat-model|nutrition-module|nutrition-ai-settings|openrouter-settings|test-openrouter|test-ppq-provider)/;

export function fileReferences(file, source, knownFiles) {
  const refs = new Set();
  const add = raw => {
    const clean = raw.split(/[?#]/, 1)[0];
    const candidates = [
      clean.replace(/^\//, ''),
      path.posix.normalize(path.posix.join(path.posix.dirname(file), clean)),
    ];
    for (const candidate of candidates) {
      if (candidate !== file && knownFiles.has(candidate)) refs.add(candidate);
    }
  };
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const visit = node => {
    if (ts.isStringLiteralLike(node)) add(node.text);
    ts.forEachChild(node, visit);
  };
  visit(parsed);
  // Also handle HTML script/link attributes and paths embedded in HTML strings.
  for (const match of source.matchAll(/(?:src|href)=["']([^"']+)["']/g)) add(match[1]);
  return refs;
}

export function createTestPlan(sources, changedFiles) {
  const known = new Set([...sources.keys(), ...changedFiles]);
  const reverse = new Map();
  for (const [file, source] of sources) {
    if (!SOURCE.test(file)) continue;
    for (const dependency of fileReferences(file, source, known)) {
      if (!reverse.has(dependency)) reverse.set(dependency, new Set());
      reverse.get(dependency).add(file);
    }
  }
  const affected = new Set(changedFiles);
  // These catalog modules have an explicit feature boundary: following their
  // api.js barrel into app startup would otherwise select almost every UI test.
  const queue = changedFiles.filter(file => !MODEL_SOURCES.has(file));
  for (const file of changedFiles.filter(file => MODEL_SOURCES.has(file))) {
    for (const consumer of reverse.get(file) || []) {
      if (consumer.startsWith('tests/')) {
        affected.add(consumer);
        queue.push(consumer);
      }
    }
  }
  while (queue.length) {
    for (const consumer of reverse.get(queue.pop()) || []) {
      // The legacy harness lists every script; select its individual cases below.
      if (consumer === LEGACY || affected.has(consumer)) continue;
      affected.add(consumer);
      queue.push(consumer);
    }
  }
  const all = [...sources.keys()];
  const legacyScripts = [...fileReferences(LEGACY, sources.get(LEGACY) || '', known)]
    .filter(file => /^tests\/test-.*\.js$/.test(file));
  const reasons = [];
  const addMatching = (predicate, reason) => {
    all.filter(predicate).forEach(file => affected.add(file));
    reasons.push(reason);
  };
  if (changedFiles.some(file => MODEL_SOURCES.has(file))) {
    addMatching(file => file.startsWith('tests/') && MODEL_TESTS.test(file), 'Provider model catalogs: include DOM model selectors and routing contracts.');
  }
  if (changedFiles.some(file => /^(package(?:-lock)?\.json|vitest.*\.js|tests\/_vitest.*\.js)$/.test(file))) {
    addMatching(file => isUnit(file) || legacyScripts.includes(file), 'Shared unit dependencies or harness changed: all unit cases are affected.');
  }
  if (changedFiles.some(file => /^(package(?:-lock)?\.json|playwright\.config\.js|dev-server\.js|index\.html|css\/|js\/(?:main|startup[^/]*|state|utils)\.js|tests\/playwright\/.*(?:fixture|helper).*\.js)/.test(file))) {
    addMatching(isBrowser, 'Shared browser runtime, styling, dependencies, or harness changed: all Chromium specs are affected.');
  }
  if (changedFiles.some(file => /^(package(?:-lock)?\.json|service-worker[^/]*\.js|version\.js|index\.html|manifest.*\.json|playwright(?:\.pwa)?\.config\.js|tests\/pwa\/)/.test(file))) {
    addMatching(isPwa, 'Offline lifecycle or PWA harness changed.');
  }
  if (changedFiles.some(file => /^(playwright(?:\.firefox)?\.config\.js|tests\/firefox\/|package(?:-lock)?\.json)/.test(file))) {
    addMatching(isFirefox, 'Firefox harness or shared dependencies changed.');
  }
  if (changedFiles.some(file => file.startsWith('.github/workflows/') || file === 'scripts/pr-test-scope.mjs')) {
    affected.add('tests/pr-test-scope.test.js');
  }
  const select = predicate => all.filter(file => affected.has(file) && predicate(file)).sort();
  const plan = {
    changedFiles: [...changedFiles].sort(), reasons,
    unit: select(isUnit), legacy: legacyScripts.filter(file => affected.has(file)).sort(),
    browser: select(isBrowser), firefox: select(isFirefox), pwa: select(isPwa),
    sync: all.some(file => affected.has(file) && (/^tests\/evolu8-browser\//.test(file) || file === 'tests/playwright/sync-relay-transport-e2e.spec.js'))
      || changedFiles.some(file => /^(package(?:-lock)?\.json|playwright(?:\.evolu8)?\.config\.js|\.github\/workflows\/sync-compat\.yml)$/.test(file)),
  };
  // An unknown runtime change must never silently produce an empty green check.
  const selected = new Set([...plan.unit, ...plan.legacy, ...plan.browser, ...plan.firefox, ...plan.pwa]);
  plan.uncovered = changedFiles.filter(file => {
    if (!/^(js\/|lib\/|api\/|server\/|scripts\/).*\.[cm]?js$/.test(file)) return false;
    if (MODEL_SOURCES.has(file)) return ![...selected].some(test => MODEL_TESTS.test(test));
    const visited = new Set([file]);
    const pending = [file];
    while (pending.length) {
      const current = pending.pop();
      if (selected.has(current)) return false;
      for (const consumer of reverse.get(current) || []) {
        if (consumer === LEGACY || visited.has(consumer)) continue;
        visited.add(consumer);
        pending.push(consumer);
      }
    }
    return true;
  });
  return plan;
}

export function testCommands(plan, suite) {
  const commands = [];
  if (suite === 'unit') {
    if (plan.unit.length) commands.push(['vitest', 'run', ...plan.unit]);
    if (plan.legacy.length) commands.push(['vitest', 'run', LEGACY, '-t', plan.legacy.map(file => `^${escapeRegex(path.posix.basename(file))}$`).join('|')]);
  } else if (['browser', 'firefox', 'pwa'].includes(suite)) {
    if (plan[suite].length) commands.push(['playwright', 'test', ...plan[suite], ...(suite === 'browser' ? [] : [`--config=playwright.${suite}.config.js`]), '--workers=2']);
  } else throw new Error(`Unknown test suite: ${suite}`);
  return commands;
}

function git(...args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' });
}

function main() {
  const args = process.argv.slice(2);
  const value = flag => args[args.indexOf(flag) + 1];
  const output = value('--output');
  if (!args.includes('--output') || !output) throw new Error('--output is required');
  if (args.includes('--run')) {
    if (process.env.GITHUB_ACTIONS !== 'true') throw new Error('Automatic test execution is GitHub Actions-only. Run explicit relevant tests locally.');
    const plan = JSON.parse(fs.readFileSync(output, 'utf8'));
    if (plan.uncovered.length) throw new Error(`Add test scope for: ${plan.uncovered.join(', ')}`);
    for (const command of testCommands(plan, value('--run'))) {
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
  const summary = ['## Affected PR tests', ...['unit', 'legacy', 'browser', 'firefox', 'pwa'].map(suite => `- ${suite}: ${plan[suite].length}`), ...plan.reasons.map(reason => `- ${reason}`), '\nFull coverage runs on main, manual dispatch, and explicit release verification.'].join('\n');
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + '\n');
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, ['browser', 'firefox', 'pwa'].map(suite => `${suite}=${Boolean(plan[suite].length)}\n`).join('') + `sync=${plan.sync}\n`);
  if (plan.uncovered.length) throw new Error(`No tests selected. Add explicit scope for: ${plan.uncovered.join(', ')}`);
}

if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) main();
