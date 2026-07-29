import fs from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';

const METRICS = [
  ['resources', 'precache resources'],
  ['decodedBytes', 'precache decoded bytes'],
];

function requireNonNegativeNumber(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new Error(`${label} must be a non-negative number.`);
  }
  return number;
}

function requirePositiveNumber(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw new Error(`${label} must be a number greater than zero.`);
  }
  return number;
}

export function parseAppShellEntries(source) {
  const sourceFile = ts.createSourceFile(
    'service-worker.js',
    String(source),
    ts.ScriptTarget.Latest,
    false,
    ts.ScriptKind.JS,
  );
  if (sourceFile.parseDiagnostics.length) {
    throw new Error('Could not parse service-worker.js while reading APP_SHELL.');
  }
  const declarations = [];

  function visit(node) {
    if (
      ts.isVariableDeclaration(node)
      && ts.isIdentifier(node.name)
      && node.name.text === 'APP_SHELL'
    ) {
      declarations.push(node);
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);

  if (declarations.length !== 1) {
    throw new Error(`Expected exactly one APP_SHELL declaration; found ${declarations.length}.`);
  }
  const initializer = declarations[0].initializer;
  if (!initializer || !ts.isArrayLiteralExpression(initializer)) {
    throw new Error('APP_SHELL must be an array literal.');
  }

  const entries = initializer.elements.map((element) => {
    if (!ts.isStringLiteralLike(element)) {
      throw new Error('APP_SHELL entries must be static string literals.');
    }
    if (!element.text.startsWith('/')) {
      throw new Error(`APP_SHELL entry must be root-relative: ${element.text}`);
    }
    return element.text;
  });
  const duplicates = entries.filter((entry, index) => entries.indexOf(entry) !== index);
  if (duplicates.length) {
    throw new Error(`APP_SHELL contains duplicate entries: ${[...new Set(duplicates)].join(', ')}`);
  }
  return entries;
}

function relativeAssetPath(entry) {
  const route = entry === '/app' ? '/index.html' : entry;
  const relative = path.posix.normalize(route).replace(/^\/+/, '');
  if (!relative || relative === '..' || relative.startsWith('../')) {
    throw new Error(`APP_SHELL entry escapes the artifact root: ${entry}`);
  }
  return relative;
}

async function fileSizeFromRoots(relative, roots) {
  for (const root of roots) {
    try {
      const stat = await fs.stat(path.join(root, ...relative.split('/')));
      if (stat.isFile()) return stat.size;
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
  throw new Error(`APP_SHELL asset does not exist: /${relative}`);
}

export async function summarizeAppShell({
  serviceWorkerSource,
  artifactRoot,
  sourceRoot = artifactRoot,
}) {
  const entries = parseAppShellEntries(serviceWorkerSource);
  const roots = [...new Set([path.resolve(artifactRoot), path.resolve(sourceRoot)])];
  const sizes = await Promise.all(
    entries.map((entry) => fileSizeFromRoots(relativeAssetPath(entry), roots)),
  );
  return {
    resources: entries.length,
    decodedBytes: sizes.reduce((total, size) => total + size, 0),
  };
}

export function enforceAppShellBudget(metrics, budget) {
  const maximums = budget?.maximums;
  const failures = [];
  const result = {};

  for (const [key, label] of METRICS) {
    const actual = requireNonNegativeNumber(metrics?.[key], `app-shell ${key}`);
    const maximum = requirePositiveNumber(maximums?.[key], `app-shell maximums.${key}`);
    result[key] = {
      actual,
      maximum,
      remaining: maximum - actual,
    };
    if (actual > maximum) failures.push(`${label} ${actual} exceeds ${maximum}`);
  }

  if (failures.length) {
    throw new Error(`App-shell budget exceeded: ${failures.join('; ')}.`);
  }
  return result;
}

export function formatAppShellSummary(metrics) {
  return [
    `${metrics.resources} resources`,
    `${(metrics.decodedBytes / 1024).toFixed(1)} KiB decoded`,
  ].join(', ');
}
