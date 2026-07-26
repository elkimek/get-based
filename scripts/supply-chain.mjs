#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INVENTORY_PATH = 'vendor/components.json';
const MONITORING_MODES = new Set(['github-advisory', 'sbom-only', 'asset-only']);

function repoPath(file) {
  return file.split(path.sep).join('/');
}

function walkFiles(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walkFiles(absolute));
    else if (entry.isFile()) files.push(absolute);
  }
  return files;
}

function patternRegex(pattern) {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escaped.replaceAll('*', '[^/]*')}$`);
}

function matchingFiles(pattern, files) {
  const regex = patternRegex(pattern);
  return files.filter(file => regex.test(file));
}

function componentRef(component) {
  if (component.purl) return component.purl;
  return `vendor:${component.name}${component.version ? `@${component.version}` : ''}`;
}

function licenseEntry(license) {
  if (license === 'Public Domain') return { license: { name: license } };
  return { license: { id: license } };
}

function sortProperties(properties = []) {
  return properties.sort((left, right) => (
    left.name.localeCompare(right.name) || left.value.localeCompare(right.value)
  ));
}

function normalizeSbom(sbom) {
  delete sbom.serialNumber;
  if (sbom.metadata) {
    delete sbom.metadata.timestamp;
    sbom.metadata.tools = {
      components: [{
        type: 'application',
        name: 'getbased-supply-chain',
        version: '1',
      }],
    };
  }
  sbom.components?.sort((left, right) => left['bom-ref'].localeCompare(right['bom-ref']));
  for (const component of sbom.components || []) {
    if (component.properties) sortProperties(component.properties);
  }
  sbom.dependencies?.sort((left, right) => left.ref.localeCompare(right.ref));
  for (const dependency of sbom.dependencies || []) {
    dependency.dependsOn = [...new Set(dependency.dependsOn || [])].sort();
  }
  return sbom;
}

export function loadInventory(root = ROOT) {
  return JSON.parse(fs.readFileSync(path.join(root, INVENTORY_PATH), 'utf8'));
}

export function validateInventory(inventory, root = ROOT) {
  const errors = [];
  if (inventory.schemaVersion !== 1) errors.push('schemaVersion must be 1');
  if (!Array.isArray(inventory.components) || inventory.components.length === 0) {
    errors.push('components must be a non-empty array');
  }

  const vendorRoot = path.join(root, 'vendor');
  const vendorFiles = walkFiles(vendorRoot)
    .map(file => repoPath(path.relative(root, file)))
    .sort();
  const assignments = new Map(vendorFiles.map(file => [file, []]));
  const names = new Set();
  const purls = new Set();

  const assign = (pattern, owner) => {
    if (typeof pattern !== 'string' || !pattern.startsWith('vendor/') || pattern.includes('..')) {
      errors.push(`${owner} has invalid vendor path pattern: ${String(pattern)}`);
      return;
    }
    const matches = matchingFiles(pattern, vendorFiles);
    if (matches.length === 0) {
      errors.push(`${owner} pattern matches no files: ${pattern}`);
      return;
    }
    for (const file of matches) assignments.get(file)?.push(owner);
  };

  for (const component of inventory.components || []) {
    const owner = `component ${component.name || '<unnamed>'}`;
    if (!component.name || names.has(component.name)) errors.push(`${owner} has a missing or duplicate name`);
    else names.add(component.name);
    if (!component.license) errors.push(`${owner} is missing license`);
    if (!component.source) errors.push(`${owner} is missing source`);
    if (!MONITORING_MODES.has(component.monitoring)) {
      errors.push(`${owner} has invalid monitoring mode: ${String(component.monitoring)}`);
    }
    if (component.monitoring === 'github-advisory') {
      if (!component.version) errors.push(`${owner} needs a version for GitHub advisory monitoring`);
      if (!component.purl?.startsWith('pkg:npm/')) errors.push(`${owner} needs an npm purl for GitHub advisory monitoring`);
    }
    if (component.monitoring === 'sbom-only' && (!component.version || !component.purl)) {
      errors.push(`${owner} needs a version and purl for SBOM tracking`);
    }
    if (component.purl) {
      if (purls.has(component.purl)) errors.push(`${owner} has duplicate purl ${component.purl}`);
      purls.add(component.purl);
    }
    if (!Array.isArray(component.files) || component.files.length === 0) {
      errors.push(`${owner} must list at least one file`);
    }
    for (const pattern of component.files || []) assign(pattern, owner);
  }

  for (const pattern of inventory.projectFiles || []) assign(pattern, 'project-owned file');
  for (const pattern of inventory.metadataFiles || []) assign(pattern, 'vendor metadata');

  for (const [file, owners] of assignments) {
    if (owners.length === 0) errors.push(`untracked vendor file: ${file}`);
    if (owners.length > 1) errors.push(`vendor file has multiple owners: ${file} (${owners.join(', ')})`);
  }

  if (errors.length > 0) throw new Error(`Vendor inventory validation failed:\n- ${errors.join('\n- ')}`);

  const fileHashes = new Map();
  for (const file of vendorFiles) {
    const bytes = fs.readFileSync(path.join(root, file));
    fileHashes.set(file, createHash('sha256').update(bytes).digest('hex'));
  }
  return {
    vendorFiles,
    fileHashes,
    monitoredComponents: inventory.components.filter(component => component.monitoring === 'github-advisory'),
  };
}

export function mergeVendorComponents(npmSbom, inventory, validation) {
  const sbom = structuredClone(npmSbom);
  sbom.components ||= [];
  sbom.dependencies ||= [];
  const rootRef = sbom.metadata?.component?.['bom-ref'];
  if (!rootRef) throw new Error('npm SBOM is missing metadata.component.bom-ref');

  let rootDependency = sbom.dependencies.find(dependency => dependency.ref === rootRef);
  if (!rootDependency) {
    rootDependency = { ref: rootRef, dependsOn: [] };
    sbom.dependencies.push(rootDependency);
  }

  for (const inventoryComponent of inventory.components) {
    const matchedFiles = inventoryComponent.files
      .flatMap(pattern => matchingFiles(pattern, validation.vendorFiles))
      .sort();
    let component = inventoryComponent.purl
      ? sbom.components.find(candidate => candidate.purl === inventoryComponent.purl)
      : undefined;
    if (!component) {
      component = {
        'bom-ref': componentRef(inventoryComponent),
        type: 'library',
        name: inventoryComponent.name,
        scope: 'required',
        licenses: [licenseEntry(inventoryComponent.license)],
        externalReferences: [{
          type: 'website',
          url: inventoryComponent.source,
        }],
        properties: [],
      };
      if (inventoryComponent.version) component.version = inventoryComponent.version;
      if (inventoryComponent.purl) component.purl = inventoryComponent.purl;
      sbom.components.push(component);
    }

    component.properties ||= [];
    component.properties.push(
      { name: 'getbased:vendor:monitoring', value: inventoryComponent.monitoring },
      ...matchedFiles.map(file => ({ name: 'getbased:vendor:file', value: file })),
      ...matchedFiles.map(file => ({
        name: 'getbased:vendor:file-sha256',
        value: `${file}:${validation.fileHashes.get(file)}`,
      })),
    );
    rootDependency.dependsOn ||= [];
    rootDependency.dependsOn.push(component['bom-ref']);
    if (!sbom.dependencies.some(dependency => dependency.ref === component['bom-ref'])) {
      sbom.dependencies.push({ ref: component['bom-ref'], dependsOn: [] });
    }
  }

  return normalizeSbom(sbom);
}

export function createDependencySnapshot(inventory, context) {
  const monitored = inventory.components.filter(component => component.monitoring === 'github-advisory');
  const resolved = Object.fromEntries(monitored.map(component => [
    component.name,
    {
      package_url: component.purl,
      relationship: 'direct',
      scope: 'runtime',
    },
  ]));
  return {
    version: 0,
    sha: context.sha,
    ref: context.ref,
    job: {
      correlator: 'supply-chain-vendored-components',
      id: context.jobId,
    },
    detector: {
      name: 'getbased-vendor-inventory',
      version: '1',
      url: context.repositoryUrl,
    },
    scanned: context.scanned,
    manifests: {
      [INVENTORY_PATH]: {
        name: 'Vendored browser components',
        file: {
          source_location: INVENTORY_PATH,
        },
        resolved,
      },
    },
  };
}

function readNpmSbom() {
  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const output = execFileSync(npmCommand, [
    'sbom',
    '--package-lock-only',
    '--sbom-format',
    'cyclonedx',
    '--sbom-type',
    'application',
  ], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  return JSON.parse(output);
}

function requireEnvironment(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required to generate a dependency snapshot`);
  return value;
}

function run() {
  const command = process.argv[2] || '--check';
  const inventory = loadInventory();
  const validation = validateInventory(inventory);

  if (command === '--check') {
    console.log(
      `${inventory.components.length} components cover ${validation.vendorFiles.length} vendor files; `
      + `${validation.monitoredComponents.length} versioned npm components are ready for GitHub advisory monitoring.`,
    );
    return;
  }

  if (command === '--sbom') {
    const output = process.argv[3];
    if (!output) throw new Error('--sbom requires an output path');
    const sbom = mergeVendorComponents(readNpmSbom(), inventory, validation);
    const absoluteOutput = path.resolve(ROOT, output);
    fs.mkdirSync(path.dirname(absoluteOutput), { recursive: true });
    fs.writeFileSync(absoluteOutput, `${JSON.stringify(sbom, null, 2)}\n`);
    console.log(`Wrote combined CycloneDX SBOM to ${repoPath(path.relative(ROOT, absoluteOutput))}`);
    return;
  }

  if (command === '--snapshot') {
    const repository = requireEnvironment('GITHUB_REPOSITORY');
    const serverUrl = process.env.GITHUB_SERVER_URL || 'https://github.com';
    const snapshot = createDependencySnapshot(inventory, {
      sha: requireEnvironment('GITHUB_SHA'),
      ref: requireEnvironment('GITHUB_REF'),
      jobId: `${requireEnvironment('GITHUB_RUN_ID')}.${process.env.GITHUB_RUN_ATTEMPT || '1'}`,
      repositoryUrl: `${serverUrl}/${repository}`,
      scanned: new Date().toISOString(),
    });
    process.stdout.write(`${JSON.stringify(snapshot)}\n`);
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) run();
