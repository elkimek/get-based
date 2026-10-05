#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as ts from 'typescript/unstable/ast';
import { withParsedSource, withParsedSources } from './native-typescript-ast.js';
import { sourcePath, runtimePath, walkSourceFiles } from './source-files.js';
import { scriptSource, syntaxFile } from './svelte-source.mjs';

type ImportKind = 'static' | 'dynamic';
export interface ModuleEdge { target: string; kind: ImportKind }
export interface ArchitectureModule {
  file: string; group: string | null; imports: ModuleEdge[]; repositoryFiles: string[];
}
export interface SourceGroup { name: string; description: string; roots: string[]; mayImport: string[] }
export interface ImportRestriction { target: string; allowedImporters: string[] }
export interface BoundaryRules { groups: Array<Pick<SourceGroup, 'name' | 'mayImport'>> }
export interface ValidationRules extends BoundaryRules {
  entryPoints: string[]; restrictedImports?: ImportRestriction[]; forbiddenRepositoryImportRoots?: string[];
}
export interface ArchitectureRules extends ValidationRules { groups: SourceGroup[] }
export interface ComputedImport { file: string; expression: string }
export interface Architecture {
  modules: Map<string, ArchitectureModule>; graph: Map<string, Set<string>>;
  importedBy: Map<string, Set<string>>; cyclicComponents: string[][]; cyclicModules: string[];
  unresolvedImports: Array<{ from: string; specifier: string; target: string }>;
  computedDynamicImports: ComputedImport[]; externalSpecifiers: string[];
}
export interface CycleBaseline {
  maxCyclicModules: number; maxLargestCyclicComponent: number;
  allowedCyclicModules?: string[]; allowedComputedDynamicImports?: ComputedImport[];
}
type BoundaryArchitecture = { modules: ReadonlyMap<string, Pick<ArchitectureModule, 'file' | 'group' | 'imports'>> };
type ValidationArchitecture = Pick<Architecture, 'modules' | 'unresolvedImports' | 'computedDynamicImports' | 'cyclicModules' | 'cyclicComponents'> & Partial<Pick<Architecture, 'importedBy'>>;
interface ImportResolution { unresolved?: string; module?: string; repositoryFile?: string }

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SCRIPT_PATH), '..');
const RULES_PATH = path.join(ROOT, 'scripts', 'architecture-rules.json');
const BASELINE_PATH = path.join(ROOT, 'scripts', 'architecture-cycle-baseline.json');
const MAP_PATH = path.join(ROOT, 'MODULE_MAP.md');
function repoRelative(file: string) {
  return path.relative(ROOT, file).replaceAll(path.sep, '/');
}

function authoredPath(file: string) {
  return repoRelative(sourcePath(path.join(ROOT, file)));
}

/**
 * Return literal ESM and classic-worker dependencies without matching comments
 * or string content. Computed import() and importScripts() specifiers are
 * reported separately because their targets cannot be checked statically.
 *
 * @param {string} source
 * @param {string} fileName
 */
export function parseModuleSpecifiers(source: string, fileName = 'module.js') {
  return withParsedSource(scriptSource(fileName, source), syntaxFile(fileName), moduleSpecifiersFromFile);
}

function moduleSpecifiersFromFile(sourceFile: ts.SourceFile) {
  const dependencies: Array<{ specifier: string; kind: ImportKind }> = [];
  const nonLiteralDynamicImports: string[] = [];

  const addLiteral = (node: ts.Node | undefined, kind: ImportKind) => {
    // These TypeScript/parenthesis wrappers disappear before runtime evaluation.
    while (node && (ts.isAsExpression(node) || ts.isTypeAssertion(node)
      || ts.isSatisfiesExpression(node) || ts.isNonNullExpression(node)
      || ts.isParenthesizedExpression(node))) node = node.expression;
    if (node && ts.isStringLiteralLikeNode(node)) {
      dependencies.push({ specifier: node.text, kind });
      return true;
    }
    return false;
  };

  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) && node.importClause?.phaseModifier !== ts.SyntaxKind.TypeKeyword) {
      addLiteral(node.moduleSpecifier, 'static');
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && !node.isTypeOnly) {
      addLiteral(node.moduleSpecifier, 'static');
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      if (!addLiteral(node.arguments[0], 'dynamic')) {
        nonLiteralDynamicImports.push(node.getText(sourceFile));
      }
    } else if (
      ts.isCallExpression(node)
      && ts.isIdentifier(node.expression)
      && node.expression.text === 'importScripts'
    ) {
      let hasComputedSpecifier = false;
      node.arguments.forEach((argument) => {
        if (!addLiteral(argument, 'static')) hasComputedSpecifier = true;
      });
      if (hasComputedSpecifier) nonLiteralDynamicImports.push(node.getText(sourceFile));
    }
    node.forEachChild(visit);
  };
  visit(sourceFile);

  return { dependencies, nonLiteralDynamicImports };
}

function resolveRelativeImport(fromFile: string, specifier: string, moduleFiles: ReadonlySet<string>): ImportResolution {
  const cleanSpecifier = specifier.split(/[?#]/, 1)[0]!;
  const rawTarget = cleanSpecifier.startsWith('/')
    ? path.join(ROOT, cleanSpecifier.slice(1))
    : path.resolve(path.dirname(fromFile), cleanSpecifier);
  const candidates = path.extname(rawTarget)
    ? [sourcePath(rawTarget)]
    : [rawTarget, `${rawTarget}.ts`, `${rawTarget}.mts`, `${rawTarget}.js`, `${rawTarget}.mjs`, sourcePath(path.join(rawTarget, 'index.js'))];
  const target = candidates.find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
  if (!target) return { unresolved: repoRelative(rawTarget) };

  const targetPath = repoRelative(target);
  if (moduleFiles.has(targetPath)) return { module: targetPath };
  return { repositoryFile: targetPath };
}

function groupForFile(file: string, rules: ArchitectureRules) {
  return rules.groups.find(group => group.roots.some(root => runtimePath(file) === runtimePath(root) || file.startsWith(`${root}/`)))?.name || null;
}

// Tarjan strongly connected components, exported for focused tests.
export function stronglyConnectedComponents(graph: ReadonlyMap<string, ReadonlySet<string>>): string[][] {
  let nextIndex = 0;
  const indices = new Map<string, number>();
  const lowLinks = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const components: string[][] = [];

  const connect = (node: string): void => {
    indices.set(node, nextIndex);
    lowLinks.set(node, nextIndex);
    nextIndex++;
    stack.push(node);
    onStack.add(node);

    for (const neighbor of graph.get(node) || []) {
      if (!indices.has(neighbor)) {
        connect(neighbor);
        lowLinks.set(node, Math.min(lowLinks.get(node)!, lowLinks.get(neighbor)!));
      } else if (onStack.has(neighbor)) {
        lowLinks.set(node, Math.min(lowLinks.get(node)!, indices.get(neighbor)!));
      }
    }

    if (lowLinks.get(node)! !== indices.get(node)) return;
    const component: string[] = [];
    let member: string;
    do {
      member = stack.pop()!;
      onStack.delete(member);
      component.push(member);
    } while (member !== node);
    components.push(component.sort());
  };

  for (const node of [...graph.keys()].sort()) {
    if (!indices.has(node)) connect(node);
  }
  return components.sort((a, b) => b.length - a.length || a[0]!.localeCompare(b[0]!));
}

function collectArchitecture(rules: ArchitectureRules): Architecture {
  const absoluteFiles = rules.groups
    .flatMap(group => group.roots.flatMap(root => walkSourceFiles(path.join(ROOT, root))))
    .sort();
  const moduleFiles = new Set(absoluteFiles.map(repoRelative));
  const modules = new Map<string, ArchitectureModule>();
  const unresolvedImports: Architecture['unresolvedImports'] = [];
  const computedDynamicImports: ComputedImport[] = [];
  const externalSpecifiers = new Set<string>();

  const parsedSources = absoluteFiles.length ? withParsedSources(
    new Map(absoluteFiles.map(file => [syntaxFile(repoRelative(file)), scriptSource(file, fs.readFileSync(file, 'utf8'))])),
    files => new Map(absoluteFiles.map(file => [repoRelative(file), moduleSpecifiersFromFile(files.get(syntaxFile(repoRelative(file)))!)])),
  ) : new Map<string, ReturnType<typeof parseModuleSpecifiers>>();

  for (const absoluteFile of absoluteFiles) {
    const file = repoRelative(absoluteFile);
    const parsed = parsedSources.get(file)!;
    const edgeKinds = new Map<string, ImportKind>();
    const repositoryFiles = new Set<string>();

    for (const dependency of parsed.dependencies) {
      if (!dependency.specifier.startsWith('.') && !dependency.specifier.startsWith('/')) {
        externalSpecifiers.add(dependency.specifier);
        continue;
      }
      const resolved = resolveRelativeImport(absoluteFile, dependency.specifier, moduleFiles);
      if (resolved.unresolved) {
        unresolvedImports.push({ from: file, specifier: dependency.specifier, target: resolved.unresolved });
      } else if (resolved.module) {
        const previousKind = edgeKinds.get(resolved.module);
        edgeKinds.set(resolved.module, previousKind === 'static' ? 'static' : dependency.kind);
      } else if (resolved.repositoryFile) {
        repositoryFiles.add(resolved.repositoryFile);
      }
    }

    for (const expression of parsed.nonLiteralDynamicImports) {
      computedDynamicImports.push({ file, expression });
    }

    modules.set(file, {
      file,
      group: groupForFile(file, rules),
      imports: [...edgeKinds].map(([target, kind]) => ({ target, kind })).sort((a, b) => a.target.localeCompare(b.target)),
      repositoryFiles: [...repositoryFiles].sort(),
    });
  }

  const graph = new Map([...modules].map(([file, module]) => [file, new Set(module.imports.map(edge => edge.target))]));
  const components = stronglyConnectedComponents(graph);
  const cyclicComponents = components.filter(component => {
    if (component.length > 1) return true;
    return graph.get(component[0]!)?.has(component[0]!);
  });
  const cyclicModules = [...new Set(cyclicComponents.flat())].sort();
  const importedBy = new Map([...modules.keys()].map(file => [file, new Set<string>()]));
  for (const module of modules.values()) {
    for (const edge of module.imports) importedBy.get(edge.target)?.add(module.file);
  }

  return {
    modules,
    graph,
    importedBy,
    cyclicComponents,
    cyclicModules,
    unresolvedImports,
    computedDynamicImports,
    externalSpecifiers: [...externalSpecifiers].sort(),
  };
}

export function findBoundaryViolations(architecture: BoundaryArchitecture, rules: BoundaryRules) {
  const groupRules = new Map<string | null, Set<string | null | undefined>>(rules.groups.map(group => [group.name, new Set<string | null | undefined>(group.mayImport)]));
  const violations = [];
  for (const module of architecture.modules.values()) {
    const allowed = groupRules.get(module.group) || new Set<string | null | undefined>();
    for (const edge of module.imports) {
      const targetGroup = architecture.modules.get(edge.target)?.group;
      if (!allowed.has(targetGroup)) {
        violations.push({ from: module.file, fromGroup: module.group, to: edge.target, toGroup: targetGroup });
      }
    }
  }
  return violations;
}

export function findRestrictedImportViolations(architecture: Partial<Pick<Architecture, 'importedBy'>>, rules: Pick<ValidationRules, 'restrictedImports'>) {
  const violations = [];
  // The reverse index is read only when facade restrictions are configured.
  for (const restriction of rules.restrictedImports || []) {
    const allowed = new Set((restriction.allowedImporters || []).map(authoredPath));
    for (const importer of architecture.importedBy!.get(authoredPath(restriction.target)) || []) {
      if (!allowed.has(importer)) {
        violations.push({ from: importer, to: restriction.target });
      }
    }
  }
  return violations.sort((a, b) => (
    a.to.localeCompare(b.to) || a.from.localeCompare(b.from)
  ));
}

function moduleLink(file: string) {
  return `[\`${file}\`](${file})`;
}

function moduleFamily(file: string) {
  return path.basename(file).replace(/\.(?:[cm]?[jt]s)$/, '').split('-')[0]!;
}

function renderModuleIndex(architecture: Architecture, rules: ArchitectureRules) {
  const lines: string[] = [];
  for (const group of rules.groups) {
    const groupModules = [...architecture.modules.values()].filter(module => module.group === group.name);
    lines.push(`## ${group.name} modules`, '', group.description, '');
    const families = new Map<string, ArchitectureModule[]>();
    for (const module of groupModules) {
      const family = moduleFamily(module.file);
      if (!families.has(family)) families.set(family, []);
      families.get(family)!.push(module);
    }
    for (const [family, modules] of [...families].sort(([a], [b]) => a.localeCompare(b))) {
      lines.push(`<details><summary><code>${family}</code> family — ${modules.length} module${modules.length === 1 ? '' : 's'}</summary>`, '');
      for (const module of modules.sort((a, b) => a.file.localeCompare(b.file))) {
        const dependencies = module.imports.length
          ? module.imports.map(edge => `${moduleLink(edge.target)}${edge.kind === 'dynamic' ? ' *(dynamic)*' : ''}`).join(', ')
          : 'no in-scope imports';
        lines.push(`- ${moduleLink(module.file)} → ${dependencies}`);
      }
      lines.push('', '</details>', '');
    }
  }
  return lines;
}

function renderMap(architecture: Architecture, rules: ArchitectureRules) {
  const moduleCount = architecture.modules.size;
  const edgeCount = [...architecture.graph.values()].reduce((sum, edges) => sum + edges.size, 0);
  const dynamicEdgeCount = [...architecture.modules.values()]
    .flatMap(module => module.imports)
    .filter(edge => edge.kind === 'dynamic').length;
  const largestCycle = architecture.cyclicComponents[0]?.length || 0;
  const fanIn = [...architecture.modules.values()]
    .map(module => ({ file: module.file, count: architecture.importedBy.get(module.file)?.size || 0 }))
    .sort((a, b) => b.count - a.count || a.file.localeCompare(b.file))
    .slice(0, 15);
  const fanOut = [...architecture.modules.values()]
    .map(module => ({ file: module.file, count: module.imports.length }))
    .sort((a, b) => b.count - a.count || a.file.localeCompare(b.file))
    .slice(0, 15);
  const lines = [
    '# Generated module map',
    '',
    '> Generated by `npm run architecture:build`. Do not edit this file by hand.',
    '> `npm run architecture:check` verifies freshness, import boundaries, and the cycle baseline.',
    '',
    'The human-maintained architecture contract is in [`ARCHITECTURE.md`](ARCHITECTURE.md). This map covers first-party browser, worker, serverless, shared-server, and local-server JavaScript, TypeScript, and Svelte components; tests, tooling, vendored code, CSS, and data assets are outside the graph.',
    '',
    '## Snapshot',
    '',
    '| Metric | Current |',
    '| --- | ---: |',
    `| Modules | ${moduleCount} |`,
    `| Internal import edges | ${edgeCount} |`,
    `| Dynamic internal edges | ${dynamicEdgeCount} |`,
    `| Modules participating in cycles | ${architecture.cyclicModules.length} |`,
    `| Cyclic components | ${architecture.cyclicComponents.length} |`,
    `| Largest cyclic component | ${largestCycle} |`,
    `| Computed dynamic imports | ${architecture.computedDynamicImports.length} |`,
    '',
    '## Enforced source boundaries',
    '',
    '| Source group | Roots | May import |',
    '| --- | --- | --- |',
    ...rules.groups.map(group => `| ${group.name} | ${group.roots.map(root => `\`${root}${path.extname(root) ? '' : '/'}\``).join(', ')} | ${group.mayImport.join(', ')} |`),
    '',
    '### Facade-only implementation modules',
    '',
    'These implementation modules may only be imported by their public facade.',
    '',
    '| Implementation | Allowed importer(s) |',
    '| --- | --- |',
    ...(rules.restrictedImports || []).map(restriction => (
      `| ${moduleLink(restriction.target)} | ${restriction.allowedImporters.map(moduleLink).join(', ')} |`
    )),
    '',
    '## Runtime entry points',
    '',
    ...rules.entryPoints.map(file => `- ${moduleLink(file)}`),
    '',
    '## Coupling hotspots',
    '',
    'High fan-in modules have many dependants; high fan-out modules coordinate many dependencies. Both deserve extra care during refactors.',
    '',
    '| High fan-in | Dependants | High fan-out | Imports |',
    '| --- | ---: | --- | ---: |',
    ...fanIn.map((item, index) => `| ${moduleLink(item.file)} | ${item.count} | ${moduleLink(fanOut[index]!.file)} | ${fanOut[index]!.count} |`),
    '',
    '## Existing cyclic components',
    '',
    'These are existing debt, not approved architecture. CI prevents new modules from joining a cycle and prevents the cycle budgets from increasing.',
    '',
  ];

  if (architecture.cyclicComponents.length === 0) {
    lines.push('No cyclic components.', '');
  } else {
    architecture.cyclicComponents.forEach((component, index) => {
      lines.push(`<details><summary>Component ${index + 1} — ${component.length} modules</summary>`, '', component.map(moduleLink).join(', '), '', '</details>', '');
    });
  }

  if (architecture.computedDynamicImports.length > 0) {
    lines.push('## Computed dynamic imports', '', 'These expressions cannot be resolved statically and require manual review when changed.', '');
    for (const item of architecture.computedDynamicImports) {
      lines.push(`- ${moduleLink(item.file)}: \`${item.expression.replaceAll('`', '\\`')}\``);
    }
    lines.push('');
  }

  lines.push(...renderModuleIndex(architecture, rules));
  return `${lines.join('\n').trim()}\n`;
}

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
}

function writeCycleBaseline(architecture: Architecture) {
  const baseline = {
    schemaVersion: 1,
    maxCyclicModules: architecture.cyclicModules.length,
    maxLargestCyclicComponent: architecture.cyclicComponents[0]?.length || 0,
    allowedCyclicModules: architecture.cyclicModules,
    allowedComputedDynamicImports: architecture.computedDynamicImports,
  };
  fs.writeFileSync(BASELINE_PATH, `${JSON.stringify(baseline, null, 2)}\n`);
}

export function validateArchitecture(architecture: ValidationArchitecture, rules: ValidationRules, baseline: CycleBaseline) {
  const failures: string[] = [];
  const boundaryViolations = findBoundaryViolations(architecture, rules);
  for (const violation of boundaryViolations) {
    failures.push(`${violation.from} (${violation.fromGroup}) may not import ${violation.to} (${violation.toGroup})`);
  }
  for (const violation of findRestrictedImportViolations(architecture, rules)) {
    failures.push(`${violation.from} may not bypass the facade for ${violation.to}`);
  }
  for (const unresolved of architecture.unresolvedImports) {
    failures.push(`${unresolved.from} has unresolved relative import ${unresolved.specifier}`);
  }
  for (const entryPoint of rules.entryPoints) {
    if (!architecture.modules.has(authoredPath(entryPoint))) failures.push(`configured entry point is missing: ${entryPoint}`);
  }
  for (const module of architecture.modules.values()) {
    for (const repositoryFile of module.repositoryFiles) {
      const forbiddenRoot = (rules.forbiddenRepositoryImportRoots || [])
        .find(root => repositoryFile === root || repositoryFile.startsWith(`${root}/`));
      if (forbiddenRoot) failures.push(`${module.file} may not import ${repositoryFile} from ${forbiddenRoot}/`);
    }
  }

  const allowedCyclicModules = new Set((baseline.allowedCyclicModules || []).map(authoredPath));
  const newCyclicModules = architecture.cyclicModules.filter(file => !allowedCyclicModules.has(file));
  if (newCyclicModules.length > 0) failures.push(`new modules entered dependency cycles: ${newCyclicModules.join(', ')}`);
  if (architecture.cyclicModules.length > baseline.maxCyclicModules) {
    failures.push(`cyclic module count increased: ${architecture.cyclicModules.length} > ${baseline.maxCyclicModules}`);
  }
  const largestCycle = architecture.cyclicComponents[0]?.length || 0;
  if (largestCycle > baseline.maxLargestCyclicComponent) {
    failures.push(`largest cyclic component increased: ${largestCycle} > ${baseline.maxLargestCyclicComponent}`);
  }
  const allowedComputedImports = new Set((baseline.allowedComputedDynamicImports || [])
    .map(item => `${authoredPath(item.file)}\n${item.expression}`));
  const newComputedImports = architecture.computedDynamicImports
    .filter(item => !allowedComputedImports.has(`${authoredPath(item.file)}\n${item.expression}`));
  for (const item of newComputedImports) {
    failures.push(`new computed dynamic import cannot be checked statically: ${item.file}: ${item.expression}`);
  }
  return failures;
}

function printFailures(failures: string[]) {
  for (const failure of failures) console.error(`  FAIL: ${failure}`);
}

function main() {
  const args = new Set(process.argv.slice(2));
  const writeMap = args.has('--write');
  const checkMap = args.has('--check');
  const updateBaseline = args.has('--update-cycle-baseline');
  if (!writeMap && !checkMap && !updateBaseline) {
    console.error('Usage: node scripts/architecture-map.mjs --write|--check [--update-cycle-baseline]');
    process.exit(2);
  }

  const rules = readJson<ArchitectureRules>(RULES_PATH);
  const architecture = collectArchitecture(rules);
  if (updateBaseline) writeCycleBaseline(architecture);
  if (!fs.existsSync(BASELINE_PATH)) {
    console.error('Missing architecture cycle baseline. Run once with --update-cycle-baseline and review the result.');
    process.exit(1);
  }
  const baseline = readJson<CycleBaseline>(BASELINE_PATH);
  const failures = validateArchitecture(architecture, rules, baseline);
  const renderedMap = renderMap(architecture, rules);

  if (writeMap) {
    fs.writeFileSync(MAP_PATH, renderedMap);
    console.log(`Wrote ${repoRelative(MAP_PATH)} (${architecture.modules.size} modules)`);
  }
  if (checkMap) {
    const currentMap = fs.existsSync(MAP_PATH) ? fs.readFileSync(MAP_PATH, 'utf8') : '';
    if (currentMap !== renderedMap) failures.push('MODULE_MAP.md is stale; run npm run architecture:build');
  }

  if (failures.length > 0) {
    printFailures(failures);
    process.exit(1);
  }
  console.log(`Architecture checks passed: ${architecture.modules.size} modules, ${architecture.cyclicModules.length} cyclic, ${architecture.cyclicComponents[0]?.length || 0} in the largest cycle.`);
}

if (path.resolve(process.argv[1] || '') === SCRIPT_PATH) main();
