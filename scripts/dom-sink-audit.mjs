#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_ROOT = path.join(ROOT, 'js');
const POLICY_PATH = path.join(ROOT, 'scripts', 'dom-sink-policy.json');
const ASSIGNMENT_SINKS = new Set(['innerHTML', 'outerHTML', 'srcdoc']);
const CALL_SINKS = new Set([
  'insertAdjacentHTML',
  'createContextualFragment',
  'setHTMLUnsafe',
]);

function propertyName(node) {
  if (ts.isPropertyAccessExpression(node)) return node.name.text;
  if (
    ts.isElementAccessExpression(node)
    && node.argumentExpression
    && ts.isStringLiteralLike(node.argumentExpression)
  ) {
    return node.argumentExpression.text;
  }
  return '';
}

function normalizedNodeText(node, sourceFile) {
  return node.getText(sourceFile).replace(/\s+/g, ' ').trim();
}

export function scanDomSinks(source, fileName = 'source.js') {
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  const sinks = [];

  function record(kind, node) {
    const location = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    sinks.push({
      kind,
      line: location.line + 1,
      source: normalizedNodeText(node, sourceFile),
    });
  }

  function visit(node) {
    if (
      ts.isBinaryExpression(node)
      && [ts.SyntaxKind.EqualsToken, ts.SyntaxKind.PlusEqualsToken].includes(
        node.operatorToken.kind,
      )
    ) {
      const name = propertyName(node.left);
      if (ASSIGNMENT_SINKS.has(name)) record(name, node);
    }

    if (ts.isCallExpression(node)) {
      const name = propertyName(node.expression);
      if (CALL_SINKS.has(name)) record(name, node);
      if (
        (name === 'write' || name === 'writeln')
        && /(?:^|\.)document$/.test(node.expression.expression?.getText(sourceFile) || '')
      ) {
        record(`document.${name}`, node);
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return sinks;
}

function listJavaScriptFiles(directory = SOURCE_ROOT) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...listJavaScriptFiles(absolute));
    } else if (entry.isFile() && entry.name.endsWith('.js') && !/^bundle-.*\.js$/.test(entry.name)) {
      files.push(absolute);
    }
  }
  return files.sort();
}

function sinkDigest(sinks) {
  const reviewedSurface = sinks
    .map(({ kind, source }) => ({ kind, source }))
    .sort((a, b) => `${a.kind}:${a.source}`.localeCompare(`${b.kind}:${b.source}`));
  return crypto.createHash('sha256').update(JSON.stringify(reviewedSurface)).digest('hex');
}

export function createDomSinkPolicy() {
  const files = listJavaScriptFiles();
  const sinkFiles = {};
  let sinkCount = 0;
  for (const absolute of files) {
    const relative = path.relative(ROOT, absolute).split(path.sep).join('/');
    const sinks = scanDomSinks(fs.readFileSync(absolute, 'utf8'), relative);
    if (!sinks.length) continue;
    sinkCount += sinks.length;
    sinkFiles[relative] = {
      count: sinks.length,
      digest: sinkDigest(sinks),
      kinds: Object.fromEntries(
        [...new Set(sinks.map(sink => sink.kind))]
          .sort()
          .map(kind => [kind, sinks.filter(sink => sink.kind === kind).length]),
      ),
    };
  }
  return {
    schemaVersion: 1,
    scope: 'Every non-generated JavaScript module under js/',
    reviewRule: 'Any added or modified HTML-writing sink requires security review and a policy refresh.',
    scannedFiles: files.length,
    sinkCount,
    files: sinkFiles,
  };
}

export function auditDomSinks(policy = JSON.parse(fs.readFileSync(POLICY_PATH, 'utf8'))) {
  const current = createDomSinkPolicy();
  const failures = [];
  if (current.scannedFiles !== policy.scannedFiles) {
    failures.push(`scanned file count changed: ${policy.scannedFiles} -> ${current.scannedFiles}`);
  }
  if (current.sinkCount !== policy.sinkCount) {
    failures.push(`HTML sink count changed: ${policy.sinkCount} -> ${current.sinkCount}`);
  }

  const allFiles = new Set([
    ...Object.keys(policy.files || {}),
    ...Object.keys(current.files || {}),
  ]);
  for (const file of [...allFiles].sort()) {
    const expected = policy.files?.[file];
    const actual = current.files?.[file];
    if (!expected) {
      failures.push(`new sink-bearing file: ${file}`);
    } else if (!actual) {
      failures.push(`stale sink policy entry: ${file}`);
    } else if (expected.count !== actual.count || expected.digest !== actual.digest) {
      const details = scanDomSinks(fs.readFileSync(path.join(ROOT, file), 'utf8'), file)
        .map(sink => `${sink.kind}@${sink.line}: ${sink.source.slice(0, 140)}`)
        .join('\n    ');
      failures.push(`reviewed sink surface changed in ${file}\n    ${details}`);
    }
  }
  return { current, failures, ok: failures.length === 0 };
}

function writePolicy() {
  fs.writeFileSync(POLICY_PATH, `${JSON.stringify(createDomSinkPolicy(), null, 2)}\n`);
  console.log(`Updated ${path.relative(ROOT, POLICY_PATH)}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--write')) {
    writePolicy();
  } else {
    const report = auditDomSinks();
    if (!report.ok) {
      console.error(report.failures.join('\n'));
      process.exitCode = 1;
    } else {
      console.log(
        `DOM sink audit passed: ${report.current.sinkCount} sinks across `
        + `${Object.keys(report.current.files).length}/${report.current.scannedFiles} modules.`,
      );
    }
  }
}
