import fs from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript-api';

type AppShellMetric = 'resources' | 'decodedBytes';
type RawAppShellMetrics = Partial<Record<AppShellMetric, unknown>>;
const METRICS: ReadonlyArray<readonly [AppShellMetric, string]> = [
  ['resources', 'precache resources'],
  ['decodedBytes', 'precache decoded bytes'],
];

function requireNonNegativeNumber(value: unknown, label: string) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new Error(`${label} must be a non-negative number.`);
  }
  return number;
}

function requirePositiveNumber(value: unknown, label: string) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw new Error(`${label} must be a number greater than zero.`);
  }
  return number;
}

export function parseAppShellEntries(source: unknown) {
  const sourceFile = ts.createSourceFile(
    'service-worker.js',
    String(source),
    ts.ScriptTarget.Latest,
    false,
    ts.ScriptKind.JS,
  );
  if ((sourceFile as typeof sourceFile & { parseDiagnostics: readonly ts.Diagnostic[] }).parseDiagnostics.length) {
    throw new Error('Could not parse service-worker.js while reading APP_SHELL.');
  }
  const declarations: ts.VariableDeclaration[] = [];

  function visit(node: ts.Node) {
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
  const initializer = declarations[0]!.initializer;
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

function relativeAssetPath(entry: string) {
  const route = entry === '/app' ? '/index.html' : entry;
  const relative = path.posix.normalize(route).replace(/^\/+/, '');
  if (!relative || relative === '..' || relative.startsWith('../')) {
    throw new Error(`APP_SHELL entry escapes the artifact root: ${entry}`);
  }
  return relative;
}

async function fileSizeFromRoots(relative: string, roots: string[]) {
  for (const root of roots) {
    try {
      const stat = await fs.stat(path.join(root, ...relative.split('/')));
      if (stat.isFile()) return stat.size;
    } catch (error) {
      if ((error as { code?: unknown } | null | undefined)?.code !== 'ENOENT') throw error;
    }
  }
  throw new Error(`APP_SHELL asset does not exist: /${relative}`);
}

export async function summarizeAppShell({
  serviceWorkerSource,
  artifactRoot,
  sourceRoot = artifactRoot,
}: { serviceWorkerSource: unknown; artifactRoot: string; sourceRoot?: string }) {
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

export function enforceAppShellBudget(metrics: RawAppShellMetrics | null | undefined, budget: { maximums?: RawAppShellMetrics | null } | null | undefined) {
  const maximums = budget?.maximums;
  const failures: string[] = [];
  const result: Partial<Record<AppShellMetric, { actual: number; maximum: number; remaining: number }>> = {};

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
  return result as Record<AppShellMetric, { actual: number; maximum: number; remaining: number }>;
}

export function formatAppShellSummary(metrics: RawAppShellMetrics) {
  return [
    `${metrics.resources} resources`,
    `${((metrics.decodedBytes as number) / 1024).toFixed(1)} KiB decoded`,
  ].join(', ');
}
