import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VIRTUAL_APP_SHELL_URLS = new Set(['/app']);

function readRepoFile(url) {
  return readFileSync(path.join(REPO_ROOT, url.replace(/^\//, '')), 'utf8');
}

function appShellEntries() {
  const source = readRepoFile('/service-worker.js');
  const body = source.match(/const APP_SHELL = \[([\s\S]*?)\n\];/)?.[1] || '';
  return [...body.matchAll(/'([^']+)'/g)].map((match) => match[1]);
}

function resolveLocalAsset(importerUrl, specifier) {
  const clean = String(specifier || '').split(/[?#]/, 1)[0];
  if (!clean || /^(?:[a-z]+:|\/\/|#)/i.test(clean)) return null;
  if (clean.startsWith('/')) return path.posix.normalize(clean);
  if (!clean.startsWith('.')) return null;
  return path.posix.normalize(path.posix.join(path.posix.dirname(importerUrl), clean));
}

function moduleSpecifiers(source, fileName = 'module.js') {
  const specifiers = new Set();
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, false, ts.ScriptKind.JS);

  function addStringLiteral(node) {
    if (node && ts.isStringLiteralLike(node)) specifiers.add(node.text);
  }

  function isImportMetaUrl(node) {
    return ts.isPropertyAccessExpression(node)
      && node.name.text === 'url'
      && ts.isMetaProperty(node.expression)
      && node.expression.keywordToken === ts.SyntaxKind.ImportKeyword
      && node.expression.name.text === 'meta';
  }

  function visit(node) {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      addStringLiteral(node.moduleSpecifier);
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      addStringLiteral(node.arguments[0]);
    } else if (
      ts.isNewExpression(node)
      && ts.isIdentifier(node.expression)
      && node.expression.text === 'URL'
      && node.arguments?.length === 2
      && isImportMetaUrl(node.arguments[1])
    ) {
      addStringLiteral(node.arguments[0]);
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return [...specifiers];
}

function moduleDependencies(moduleUrl) {
  return moduleSpecifiers(readRepoFile(moduleUrl), moduleUrl)
    .map((specifier) => resolveLocalAsset(moduleUrl, specifier))
    .filter(Boolean);
}

function reachableAppModules() {
  const index = readRepoFile('/index.html');
  const entries = [...index.matchAll(/<script\b[^>]*\btype=['"]module['"][^>]*\bsrc=['"]([^'"]+)['"]/g)]
    .map((match) => path.posix.normalize(`/${match[1].replace(/^\//, '')}`));
  const reachable = new Set();
  const missingFiles = [];

  function visit(moduleUrl) {
    if (reachable.has(moduleUrl)) return;
    reachable.add(moduleUrl);
    const filePath = path.join(REPO_ROOT, moduleUrl.replace(/^\//, ''));
    if (!existsSync(filePath)) {
      missingFiles.push(moduleUrl);
      return;
    }
    for (const dependency of moduleDependencies(moduleUrl)) {
      if (/\.(?:js|mjs)$/.test(dependency)) visit(dependency);
    }
  }

  entries.forEach(visit);
  return { entries, missingFiles, reachable: [...reachable].sort() };
}

function cssDependencies(cssUrl) {
  const source = readRepoFile(cssUrl);
  const dependencies = [];
  const urlPattern = /url\(\s*(?:'([^']+)'|"([^"]+)"|([^)'"\s]+))\s*\)/g;
  for (const match of source.matchAll(urlPattern)) {
    const specifier = match[1] || match[2] || match[3] || '';
    if (specifier.startsWith('data:')) continue;
    const resolved = resolveLocalAsset(cssUrl, specifier);
    if (resolved) dependencies.push(resolved);
  }
  return dependencies;
}

describe('service worker app-shell completeness', () => {
  it('tracks runtime imports without treating JSDoc import types as modules', () => {
    const source = `
      /** @type {import('./types.js').RuntimeContract} */
      const runtime = {};
      import './side-effect.js';
      export { helper } from './helper.js';
      const lazy = import('./lazy.js');
      const worker = new Worker(new URL('./worker.js', import.meta.url));
    `;

    expect(moduleSpecifiers(source).sort()).toEqual([
      './helper.js',
      './lazy.js',
      './side-effect.js',
      './worker.js',
    ]);
  });

  it('lists unique app-shell URLs that all resolve to local files', () => {
    const entries = appShellEntries();
    const duplicates = entries.filter((entry, index) => entries.indexOf(entry) !== index);
    const missing = entries.filter((entry) => {
      if (VIRTUAL_APP_SHELL_URLS.has(entry)) return false;
      return !existsSync(path.join(REPO_ROOT, entry.replace(/^\//, '')));
    });

    expect(entries.length).toBeGreaterThan(0);
    expect(duplicates).toEqual([]);
    expect(missing).toEqual([]);
  });

  it('pre-caches the complete local ES-module and worker dependency graph', () => {
    const cached = new Set(appShellEntries());
    const { entries, missingFiles, reachable } = reachableAppModules();
    const uncached = reachable.filter((moduleUrl) => !cached.has(moduleUrl));

    expect(entries).toEqual(['/js/service-worker-update.js', '/js/main.js']);
    expect(missingFiles).toEqual([]);
    expect(uncached).toEqual([]);
  }, 30_000);

  it('pre-caches local files referenced by cached stylesheets', () => {
    const entries = appShellEntries();
    const cached = new Set(entries);
    const stylesheetDependencies = entries
      .filter((entry) => entry.endsWith('.css'))
      .flatMap(cssDependencies);
    const uncached = [...new Set(stylesheetDependencies)]
      .filter((dependency) => !cached.has(dependency))
      .sort();

    expect(stylesheetDependencies.length).toBeGreaterThan(0);
    expect(uncached).toEqual([]);
  });
});
