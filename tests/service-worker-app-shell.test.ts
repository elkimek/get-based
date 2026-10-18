import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as ts from 'typescript/unstable/ast';
import { withParsedSource, withParsedSources } from '../scripts/native-typescript-ast.js';
import { describe, expect, it } from 'vitest';
import { BRAND_ASSETS } from '../js/brand-assets.js';
import { parseAppShellEntries } from '../scripts/app-shell-budget.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VIRTUAL_APP_SHELL_URLS = new Set(['/app']);

function readRepoFile(url: string) {
  return readFileSync(path.join(REPO_ROOT, url.replace(/^\//, '')), 'utf8');
}

function appShellEntries() {
  const bootstrap = readRepoFile('/service-worker.js');
  expect(bootstrap).toContain("importScripts('/service-worker-assets.js');");
  const source = readRepoFile('/service-worker-assets.js');
  return parseAppShellEntries(source);
}

function resolveLocalAsset(importerUrl: string, specifier: string) {
  const clean = String(specifier || '').split(/[?#]/, 1)[0]!;
  if (!clean || /^(?:[a-z]+:|\/\/|#)/i.test(clean)) return null;
  if (clean.startsWith('/')) return path.posix.normalize(clean);
  if (!clean.startsWith('.')) return null;
  return path.posix.normalize(path.posix.join(path.posix.dirname(importerUrl), clean));
}

function collectModuleSpecifiers(sourceFile: ts.SourceFile) {
    const specifiers = new Set<string>();

    function addStringLiteral(node: ts.Node | undefined) {
      if (node && ts.isStringLiteralLikeNode(node)) specifiers.add(node.text);
    }

    function isImportMetaUrl(node: ts.Node) {
      return ts.isPropertyAccessExpression(node)
        && node.name.text === 'url'
        && ts.isMetaProperty(node.expression)
        && node.expression.keywordToken === ts.SyntaxKind.ImportKeyword
        && node.expression.name.text === 'meta';
    }

    function visit(node: ts.Node) {
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
        addStringLiteral(node.moduleSpecifier);
      } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        addStringLiteral(node.arguments[0]);
      } else if (
        ts.isNewExpression(node)
        && ts.isIdentifier(node.expression)
        && node.expression.text === 'URL'
        && node.arguments?.length === 2
        && isImportMetaUrl(node.arguments[1]!)
      ) {
        addStringLiteral(node.arguments[0]);
      }
      node.forEachChild(visit);
    }
    visit(sourceFile);
    return [...specifiers];
}

function moduleSpecifiers(source: string, fileName = 'module.js') {
  return withParsedSource(source, fileName, collectModuleSpecifiers);
}

function reachableAppModules() {
  const index = readRepoFile('/index.html');
  const entries = [...index.matchAll(/<script\b[^>]*\btype=['"]module['"][^>]*\bsrc=['"]([^'"]+)['"]/g)]
    .map((match) => path.posix.normalize(`/${match[1]!.replace(/^\//, '')}`));
  const reachable = new Set<string>();
  const missingFiles: string[] = [];

  let pending = entries;
  while (pending.length) {
    const sources = new Map<string, string>();
    for (const moduleUrl of pending) {
      if (reachable.has(moduleUrl)) continue;
      reachable.add(moduleUrl);
      const filePath = path.join(REPO_ROOT, moduleUrl.replace(/^\//, ''));
      if (!existsSync(filePath)) {missingFiles.push(moduleUrl); continue;}
      sources.set(moduleUrl, readRepoFile(moduleUrl));
    }
    pending = [];
    if (!sources.size) continue;
    // One genuine syntax project per frontier, rather than one process/project
    // per module. Only strings leave the synchronous native AST callback.
    const dependencies = withParsedSources(sources, files => [...files].flatMap(([moduleUrl, file]) =>
      collectModuleSpecifiers(file).map(specifier => resolveLocalAsset(moduleUrl, specifier))
        .filter((dependency): dependency is string => dependency !== null && /\.(?:js|mjs)$/.test(dependency))));
    pending = [...new Set(dependencies)].filter(dependency => !reachable.has(dependency));
  }

  return { entries, missingFiles, reachable: [...reachable].sort() };
}

function cssDependencies(cssUrl: string) {
  const source = readRepoFile(cssUrl);
  const dependencies: string[] = [];
  const urlPattern = /url\(\s*(?:'([^']+)'|"([^"]+)"|([^)'"\s]+))\s*\)/g;
  for (const match of source.matchAll(urlPattern)) {
    const specifier = match[1]! || match[2] || match[3] || '';
    if (specifier.startsWith('data:')) continue;
    const resolved = resolveLocalAsset(cssUrl, specifier);
    if (resolved) dependencies.push(resolved);
  }
  return dependencies;
}

describe('service worker app-shell completeness', () => {
  it('reads mixed-quote URLs with the production parser and rejects duplicate spellings', () => {
    expect(parseAppShellEntries(`const APP_SHELL = ['/app', "/js/quoted.js", '/styles.css'];`))
      .toEqual(['/app', '/js/quoted.js', '/styles.css']);
    expect(() => parseAppShellEntries(`const APP_SHELL = ['/app', "/app"];`))
      .toThrow('APP_SHELL contains duplicate entries: /app');
    expect(() => parseAppShellEntries(`const APP_SHELL = ['/app', dynamicURL];`))
      .toThrow('APP_SHELL entries must be static string literals.');
  });

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

  it('pre-caches the production body-picker illustration and alpha mask', () => {
    const stock = readRepoFile('/js/sun-body-silhouette.js').match(/const STOCK_IMG = \{([\s\S]*?)cells:/)?.[1] || '';
    const assets = [...stock.matchAll(/\b(?:src|mask):\s*'([^']+)'/g)].map(match => match[1]!);
    expect(assets).toEqual(['/er.svg', '/er-mask.png']);
    const cached = new Set(appShellEntries());
    expect(assets.filter(asset => !cached.has(asset))).toEqual([]);
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

  it('pre-caches provider logos used by offline settings', () => {
    const cached = new Set(appShellEntries());
    const sources = ['/js/settings.js', '/js/cli-agent-brand-assets.js'].map(readRepoFile).join('\n');
    const logos = [...sources.matchAll(/['"](\/brands\/[^'"\s]+\.svg)['"]/g)].map(match => match[1]!);
    logos.push(...Object.values(BRAND_ASSETS).flatMap(Object.values)
      .filter(value => typeof value === 'string' && value.startsWith('/brands/')));
    expect(logos.length).toBeGreaterThan(0);
    expect(logos.filter(url => !cached.has(url))).toEqual([]);
  });
});
