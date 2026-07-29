#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SCRIPT_PATH), '..');
const RULES_PATH = path.join(ROOT, 'scripts', 'architecture-rules.json');
const BASELINE_PATH = path.join(ROOT, 'scripts', 'architecture-cycle-baseline.json');
const MAP_PATH = path.join(ROOT, 'MODULE_MAP.md');
const SOURCE_EXTENSIONS = new Set(['.js', '.mjs']);

function repoRelative(file) {
  return path.relative(ROOT, file).replaceAll(path.sep, '/');
}

function walkSourceFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  if (fs.statSync(directory).isFile()) {
    return SOURCE_EXTENSIONS.has(path.extname(directory)) ? [directory] : [];
  }
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walkSourceFiles(fullPath));
    else if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name))) files.push(fullPath);
  }
  return files;
}

/**
 * Return literal ESM and classic-worker dependencies without matching comments
 * or string content. Computed import() and importScripts() specifiers are
 * reported separately because their targets cannot be checked statically.
 *
 * @param {string} source
 * @param {string} fileName
 */
export function parseModuleSpecifiers(source, fileName = 'module.js') {
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  const dependencies = [];
  const nonLiteralDynamicImports = [];

  const addLiteral = (node, kind) => {
    if (node && ts.isStringLiteralLike(node)) {
      dependencies.push({ specifier: node.text, kind });
      return true;
    }
    return false;
  };

  const visit = node => {
    if (ts.isImportDeclaration(node)) {
      addLiteral(node.moduleSpecifier, 'static');
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
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
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  return { dependencies, nonLiteralDynamicImports };
}

function resolveRelativeImport(fromFile, specifier, moduleFiles) {
  const cleanSpecifier = specifier.split(/[?#]/, 1)[0];
  const rawTarget = cleanSpecifier.startsWith('/')
    ? path.join(ROOT, cleanSpecifier.slice(1))
    : path.resolve(path.dirname(fromFile), cleanSpecifier);
  const candidates = path.extname(rawTarget)
    ? [rawTarget]
    : [rawTarget, `${rawTarget}.js`, `${rawTarget}.mjs`, path.join(rawTarget, 'index.js')];
  const target = candidates.find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
  if (!target) return { unresolved: repoRelative(rawTarget) };

  const targetPath = repoRelative(target);
  if (moduleFiles.has(targetPath)) return { module: targetPath };
  return { repositoryFile: targetPath };
}

function groupForFile(file, rules) {
  return rules.groups.find(group => group.roots.some(root => file === root || file.startsWith(`${root}/`)))?.name || null;
}

/**
 * Tarjan strongly connected components, exported for focused tests.
 *
 * @param {Map<string, Set<string>>} graph
 */
export function stronglyConnectedComponents(graph) {
  let nextIndex = 0;
  const indices = new Map();
  const lowLinks = new Map();
  const stack = [];
  const onStack = new Set();
  const components = [];

  const connect = node => {
    indices.set(node, nextIndex);
    lowLinks.set(node, nextIndex);
    nextIndex++;
    stack.push(node);
    onStack.add(node);

    for (const neighbor of graph.get(node) || []) {
      if (!indices.has(neighbor)) {
        connect(neighbor);
        lowLinks.set(node, Math.min(lowLinks.get(node), lowLinks.get(neighbor)));
      } else if (onStack.has(neighbor)) {
        lowLinks.set(node, Math.min(lowLinks.get(node), indices.get(neighbor)));
      }
    }

    if (lowLinks.get(node) !== indices.get(node)) return;
    const component = [];
    let member;
    do {
      member = stack.pop();
      onStack.delete(member);
      component.push(member);
    } while (member !== node);
    components.push(component.sort());
  };

  for (const node of [...graph.keys()].sort()) {
    if (!indices.has(node)) connect(node);
  }
  return components.sort((a, b) => b.length - a.length || a[0].localeCompare(b[0]));
}

function collectArchitecture(rules) {
  const absoluteFiles = rules.groups
    .flatMap(group => group.roots.flatMap(root => walkSourceFiles(path.join(ROOT, root))))
    .sort();
  const moduleFiles = new Set(absoluteFiles.map(repoRelative));
  const modules = new Map();
  const unresolvedImports = [];
  const computedDynamicImports = [];
  const externalSpecifiers = new Set();

  for (const absoluteFile of absoluteFiles) {
    const file = repoRelative(absoluteFile);
    const source = fs.readFileSync(absoluteFile, 'utf8');
    const parsed = parseModuleSpecifiers(source, file);
    const edgeKinds = new Map();
    const repositoryFiles = new Set();

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
    return graph.get(component[0])?.has(component[0]);
  });
  const cyclicModules = [...new Set(cyclicComponents.flat())].sort();
  const importedBy = new Map([...modules.keys()].map(file => [file, new Set()]));
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

/**
 * @param {ReturnType<typeof collectArchitecture>} architecture
 * @param {any} rules
 */
export function findBoundaryViolations(architecture, rules) {
  const groupRules = new Map(rules.groups.map(group => [group.name, new Set(group.mayImport)]));
  const violations = [];
  for (const module of architecture.modules.values()) {
    const allowed = groupRules.get(module.group) || new Set();
    for (const edge of module.imports) {
      const targetGroup = architecture.modules.get(edge.target)?.group;
      if (!allowed.has(targetGroup)) {
        violations.push({ from: module.file, fromGroup: module.group, to: edge.target, toGroup: targetGroup });
      }
    }
  }
  return violations;
}

export function findRestrictedImportViolations(architecture, rules) {
  const violations = [];
  for (const restriction of rules.restrictedImports || []) {
    const allowed = new Set(restriction.allowedImporters || []);
    for (const importer of architecture.importedBy.get(restriction.target) || []) {
      if (!allowed.has(importer)) {
        violations.push({ from: importer, to: restriction.target });
      }
    }
  }
  return violations.sort((a, b) => (
    a.to.localeCompare(b.to) || a.from.localeCompare(b.from)
  ));
}

function moduleLink(file) {
  return `[\`${file}\`](${file})`;
}

function moduleFamily(file) {
  return path.basename(file).replace(/\.(?:m?js)$/, '').split('-')[0];
}

function renderModuleIndex(architecture, rules) {
  const lines = [];
  for (const group of rules.groups) {
    const groupModules = [...architecture.modules.values()].filter(module => module.group === group.name);
    lines.push(`## ${group.name} modules`, '', group.description, '');
    const families = new Map();
    for (const module of groupModules) {
      const family = moduleFamily(module.file);
      if (!families.has(family)) families.set(family, []);
      families.get(family).push(module);
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

function renderMap(architecture, rules) {
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
    'The human-maintained architecture contract is in [`ARCHITECTURE.md`](ARCHITECTURE.md). This map covers first-party browser, worker, serverless, shared-server, and local-server JavaScript; tests, tooling, vendored code, CSS, and data assets are outside the graph.',
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
    ...fanIn.map((item, index) => `| ${moduleLink(item.file)} | ${item.count} | ${moduleLink(fanOut[index].file)} | ${fanOut[index].count} |`),
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

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeCycleBaseline(architecture) {
  const baseline = {
    schemaVersion: 1,
    maxCyclicModules: architecture.cyclicModules.length,
    maxLargestCyclicComponent: architecture.cyclicComponents[0]?.length || 0,
    allowedCyclicModules: architecture.cyclicModules,
    allowedComputedDynamicImports: architecture.computedDynamicImports,
  };
  fs.writeFileSync(BASELINE_PATH, `${JSON.stringify(baseline, null, 2)}\n`);
}

export function validateArchitecture(architecture, rules, baseline) {
  const failures = [];
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
    if (!architecture.modules.has(entryPoint)) failures.push(`configured entry point is missing: ${entryPoint}`);
  }
  for (const module of architecture.modules.values()) {
    for (const repositoryFile of module.repositoryFiles) {
      const forbiddenRoot = (rules.forbiddenRepositoryImportRoots || [])
        .find(root => repositoryFile === root || repositoryFile.startsWith(`${root}/`));
      if (forbiddenRoot) failures.push(`${module.file} may not import ${repositoryFile} from ${forbiddenRoot}/`);
    }
  }

  const allowedCyclicModules = new Set(baseline.allowedCyclicModules || []);
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
    .map(item => `${item.file}\n${item.expression}`));
  const newComputedImports = architecture.computedDynamicImports
    .filter(item => !allowedComputedImports.has(`${item.file}\n${item.expression}`));
  for (const item of newComputedImports) {
    failures.push(`new computed dynamic import cannot be checked statically: ${item.file}: ${item.expression}`);
  }
  return failures;
}

function printFailures(failures) {
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

  const rules = readJson(RULES_PATH);
  const architecture = collectArchitecture(rules);
  if (updateBaseline) writeCycleBaseline(architecture);
  if (!fs.existsSync(BASELINE_PATH)) {
    console.error('Missing architecture cycle baseline. Run once with --update-cycle-baseline and review the result.');
    process.exit(1);
  }
  const baseline = readJson(BASELINE_PATH);
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
