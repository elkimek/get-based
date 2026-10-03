#!/usr/bin/env node
// Emit JavaScript at the existing runtime URLs. TypeScript is the only authored
// source for migrated modules; generated siblings are ignored by Git.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript-api';

const script = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(script), '..');

function isTypeOnlyImport(statement: ts.Statement): boolean {
  if (!ts.isImportDeclaration(statement) || !statement.importClause) return false;
  const clause = statement.importClause;
  if (clause.isTypeOnly) return true;
  return !clause.name && !!clause.namedBindings && ts.isNamedImports(clause.namedBindings)
    && clause.namedBindings.elements.length > 0
    && clause.namedBindings.elements.every(binding => binding.isTypeOnly);
}

function fixtureFunction(source: string, fileName: string, emitted: boolean): ts.FunctionDeclaration {
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.ES2022, true, emitted ? ts.ScriptKind.JS : ts.ScriptKind.TS);
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
  return entry;
}

/** Preserve Function-body directives, synchronous errors and returned promise identity. */
export function extractClassicBrowserFixtureBody(source: string, fileName = 'browser-fixture.js'): string {
  const entry = fixtureFunction(source, fileName, true);
  const body = entry.body!;
  return source.slice(body.getStart(entry.getSourceFile()) + 1, body.end - 1);
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

export function buildTypeScript(rootDir = root): void {
  const manifest = classicBrowserFixtureEntries(rootDir);
  const fixtures = manifest.filter(name => existsSync(path.join(rootDir, name)));
  for (const name of readdirSync(path.join(rootDir, 'tests'))) {
    if (!/^test-.*\.ts$/.test(name)) continue;
    const file = ts.createSourceFile(name, readFileSync(path.join(rootDir, 'tests', name), 'utf8'), ts.ScriptTarget.ES2022, true);
    if (file.statements.some(statement => ts.isFunctionDeclaration(statement) && statement.name?.text === 'runBrowserFixture')
      && !manifest.includes('tests/' + name)) throw new Error(`${name}: classic browser fixture is not registered`);
  }
  // Reject accidental module payload before any compilation overwrites an existing URL.
  for (const name of fixtures) fixtureFunction(readFileSync(path.join(rootDir, name), 'utf8'), name, false);
  for (const config of ['tsconfig.migration.json', 'tsconfig.worker-migration.json', 'tsconfig.fixture-migration.json', 'tsconfig.bootstrap-migration.json']) {
    execFileSync(process.execPath, [
      path.join(rootDir, 'node_modules/typescript/bin/tsc'),
      '-p', path.join(rootDir, config),
    ], { cwd: rootDir, stdio: 'inherit' });
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
