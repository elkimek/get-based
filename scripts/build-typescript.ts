#!/usr/bin/env node
// Emit JavaScript at the existing runtime URLs. TypeScript is the only authored
// source for migrated modules; generated siblings are ignored by Git.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { API } from 'typescript/unstable/sync';
import * as ts from 'typescript/unstable/ast';

// The build runs before emitted siblings exist. Node24 loads this actual owned
// TypeScript source synchronously; its namespace is checked against that source.
const { withParsedSource, withParsedSources }: typeof import('./native-typescript-ast.js')
  = createRequire(import.meta.url)('./native-typescript-ast.ts');

const script = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(script), '..');

function isTypeOnlyImport(statement: ts.Statement): boolean {
  if (!ts.isImportDeclaration(statement) || !statement.importClause) return false;
  const clause = statement.importClause;
  if (clause.phaseModifier === ts.SyntaxKind.TypeKeyword) return true;
  return !clause.name && !!clause.namedBindings && ts.isNamedImports(clause.namedBindings)
    && clause.namedBindings.elements.length > 0
    && clause.namedBindings.elements.every(binding => binding.isTypeOnly);
}

function fixtureFunction(source: string, fileName: string, emitted: boolean): { start: number; end: number } {
  return withParsedSource(source, emitted ? fileName.replace(/\.mts$/, '.mjs').replace(/\.ts$/, '.js') : fileName, (file) => {
    let entry: ts.FunctionDeclaration | undefined;
    let compilerDirective = false;
    for (const statement of file.statements) {
      if (!emitted && (isTypeOnlyImport(statement) || ts.isTypeAliasDeclaration(statement) || ts.isInterfaceDeclaration(statement))) continue;
      if (emitted && !entry && !compilerDirective && ts.isExpressionStatement(statement)
        && ts.isStringLiteral(statement.expression) && statement.expression.text === 'use strict') {
        compilerDirective = true;
        continue;
      }
      if (!ts.isFunctionDeclaration(statement) || entry || statement.name?.text !== 'runBrowserFixture'
        || !statement.body || statement.parameters.length || statement.typeParameters?.length || statement.asteriskToken
        || statement.modifiers?.length !== 1 || statement.modifiers[0]?.kind !== ts.SyntaxKind.ExportKeyword) {
        throw new Error(`${fileName}: expected only one exported, synchronous runBrowserFixture() and erased types`);
      }
      entry = statement;
    }
    if (!entry?.body) throw new Error(`${fileName}: missing runBrowserFixture() body`);
    if (source[entry.body.getStart(file)] !== '{' || source[entry.body.end - 1] !== '}') {
      throw new Error(`${fileName}: incomplete runBrowserFixture() body`);
    }
    return { start: entry.body.getStart(file), end: entry.body.end };
  });
}

/** Preserve Function-body directives, synchronous errors and returned promise identity. */
export function extractClassicBrowserFixtureBody(source: string, fileName = 'browser-fixture.js'): string {
  const { start, end } = fixtureFunction(source, fileName, true);
  return source.slice(start + 1, end - 1);
}

function classicBrowserFixtureEntries(rootDir: string): string[] {
  const manifest: unknown = JSON.parse(readFileSync(path.join(rootDir, 'scripts/classic-browser-fixture-entries.json'), 'utf8'));
  if (!Array.isArray(manifest)) throw new Error('Classic browser fixture manifest must be an explicit array');
  const entries: string[] = [];
  for (const value of manifest) {
    if (typeof value !== 'string' || !/^tests\/test-[a-z0-9-]+\.ts$/.test(value) || entries.includes(value)) {
      throw new Error('Classic browser fixture manifest contains an invalid or duplicate entry');
    }
    entries.push(value);
  }
  return entries;
}

/** Reduce emitted indentation while preserving literal text and all line boundaries. */
export function compactRuntimeIndentation(source: string): string {
  return withParsedSource(source, 'runtime.js', (file) => compactParsedRuntimeIndentation(source, file));
}

function compactParsedRuntimeIndentation(source: string, file: ts.SourceFile): string {
  const protectedRanges: Array<{ start: number; end: number }> = [];
  function protect(node: ts.Node): void {
    if (ts.isStringLiteralLikeNode(node) || ts.isTemplateLiteralToken(node) || ts.isRegularExpressionLiteral(node)) {
      protectedRanges.push({ start: node.getStart(file), end: node.end });
    }
    node.forEachChild(protect);
  }
  protect(file);
  const scanner = ts.createScanner(false, ts.LanguageVariant.Standard, source);
  for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFile; token = scanner.scan()) {
    // Raw template text can expose a lone hash after a substitution. The
    // genuine scanner's explicit rescan advances this otherwise empty token.
    if (token === ts.SyntaxKind.PrivateIdentifier && scanner.getTokenStart() === scanner.getTokenEnd()) {
      scanner.reScanHashToken();
    }
    if (scanner.getTokenStart() === scanner.getTokenEnd()) throw new Error('Native runtime scanner made no progress');
    if (token === ts.SyntaxKind.SingleLineCommentTrivia || token === ts.SyntaxKind.MultiLineCommentTrivia) {
      protectedRanges.push({ start: scanner.getTokenStart(), end: scanner.getTokenEnd() });
    }
  }
  protectedRanges.sort((a, b) => a.start - b.start);
  let rangeIndex = 0;
  return source.replace(/^ {4,}/gm, (indent: string, offset: number) => {
    while (protectedRanges[rangeIndex] && protectedRanges[rangeIndex]!.end <= offset) rangeIndex++;
    const range = protectedRanges[rangeIndex];
    return range && range.start <= offset ? indent : ' '.repeat(Math.ceil(indent.length / 2));
  });
}

export function buildTypeScript(rootDir = root): void {
  const manifest = classicBrowserFixtureEntries(rootDir);
  const fixtures = manifest.filter(name => existsSync(path.join(rootDir, name)));
  const testSources = new Map(readdirSync(path.join(rootDir, 'tests'))
    .filter(name => /^test-.*\.ts$/.test(name))
    .map(name => [name, readFileSync(path.join(rootDir, 'tests', name), 'utf8')]));
  if (testSources.size) withParsedSources(testSources, files => {
    for (const [name, file] of files) {
      if (file.statements.some(statement => ts.isFunctionDeclaration(statement) && statement.name?.text === 'runBrowserFixture')
        && !manifest.includes('tests/' + name)) throw new Error(`${name}: classic browser fixture is not registered`);
    }
  });
  // Reject accidental module payload before any compilation overwrites an existing URL.
  for (const name of fixtures) fixtureFunction(readFileSync(path.join(rootDir, name), 'utf8'), name, false);
  const outputs = new Set<string>();
  const api = new API({ cwd: rootDir });
  try {
    for (const config of ['tsconfig.migration.json', 'tsconfig.worker-migration.json', 'tsconfig.fixture-migration.json', 'tsconfig.bootstrap-migration.json']) {
      const configFile = path.join(rootDir, config);
      for (const source of api.parseConfigFile(configFile).fileNames) {
        if (/\.(?:ts|mts)$/.test(source) && !source.endsWith('.d.ts')) {
          outputs.add(source.replace(/\.mts$/, '.mjs').replace(/\.ts$/, '.js'));
        }
      }
      execFileSync(process.execPath, [
        path.join(rootDir, 'node_modules/typescript/bin/tsc'),
        '-p', configFile,
      ], { cwd: rootDir, stdio: 'inherit' });
    }
  } finally { api.close(); }
  const runtimeSources = new Map([...outputs].map(output => [output, readFileSync(output, 'utf8')]));
  if (runtimeSources.size) {
    const compacted = withParsedSources(runtimeSources, files => new Map([...files].map(([output, file]) =>
      [output, compactParsedRuntimeIndentation(runtimeSources.get(output)!, file)])));
    for (const [output, source] of compacted) writeFileSync(output, source);
  }
  // Validate every compiled wrapper before replacing any wrapper with its body.
  const bodies = fixtures.map(name => {
    const output = path.join(rootDir, name.replace(/\.ts$/, '.js'));
    return { output, body: extractClassicBrowserFixtureBody(readFileSync(output, 'utf8'), name) };
  });
  for (const { output, body } of bodies) writeFileSync(output, body);
  // TS7 always emits strict mode. Classic scripts retain their original execution
  // mode; this affects emission only, and every source still passes strict checks.
  for (const name of ['service-worker', 'service-worker-runtime', 'service-worker-assets', 'version', 'js/theme-bootstrap', 'js/extra-theme-bootstrap', 'js/legal-consent-bootstrap', 'js/analytics-bootstrap', 'js/app-extension-bootstrap', 'vendor/bip39-minimal']) {
    const output = path.join(rootDir, name + '.js');
    writeFileSync(output, readFileSync(output, 'utf8').replace(/^"use strict";\r?\n/, ''));
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === script) buildTypeScript();
