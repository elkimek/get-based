import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const directory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../fixtures/knowledge-base');
const marker = '__KB_BRANCH_RESULT__';
const manifestBytes = fs.readFileSync(path.join(directory, 'manifest.json'));
assert.equal(createHash('sha256').update(manifestBytes).digest('hex'), '3df8c9cb5b72d8be887889c87f1241b8644767b37eadb719d9403ef9ea26d83c', 'Immutable original fixture manifest changed');
const manifest = JSON.parse(manifestBytes.toString('utf8')) as {
  revision: string;
  originalCases: number;
  files: Record<string, string>;
};

export function readFrozenBytes(name: string): Buffer {
  const expected = manifest.files[name];
  assert(expected, `Unregistered immutable original fixture: ${name}`);
  const bytes = fs.readFileSync(path.join(directory, name));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), expected, `Original fixture bytes changed: ${name}`);
  return bytes;
}

export function readFrozen<T>(name: string): T {
  return JSON.parse(readFrozenBytes(name).toString('utf8')) as T;
}

export const originalRevision = manifest.revision;
export const originalCaseCount = manifest.originalCases;
export const reviewedUtilities = JSON.parse(
  fs.readFileSync(path.join(directory, 'appended-utilities.json'), 'utf8'),
) as string[];
assert(reviewedUtilities.every(value => typeof value === 'string' && value.length > 0 && !/\s/.test(value)), 'Utility allowlist must contain individual explicit class tokens');

function replaceExactly(source: string, needle: string, replacement: string): string {
  assert.equal(source.split(needle).length - 1, 1, `Original capture harness seam changed: ${needle.slice(0, 80)}`);
  return source.replace(needle, replacement);
}

// Keep original dependency pins and explicit reviewed native-safety pins separate.
// Public captures always run the actual current modules and immutable DOM/trace fixtures.
const protectedCanonical = [
  'js/lens-local.ts', 'js/lens-local-protocol.ts', 'js/lens-local-worker.ts',
  'js/lens-local-library-registry.ts', 'js/lens-local-store.ts', 'js/lens-local-ingest.ts',
  'js/lens-local-parsers.ts', 'js/lens-local-utils.ts', 'js/lens-local-embedder-config.ts',
  'js/lens-actions.ts', 'js/modal-lifecycle.ts',
];

// The shared modal UI has its own subsequent accessibility/lifecycle changes.
// Preserve its exact original dependency evidence without claiming the current
// global UI owner is unchanged Knowledge Base domain code. Candidate captures
// still import the actual CURRENT modal-lifecycle.js and retain all DOM/trace
// comparisons; they never substitute this historical module at runtime.
const historicalModalFixtures = {
  'js/modal-lifecycle.ts': 'modal-lifecycle.original.ts.txt',
  'js/modal-lifecycle.js': 'modal-lifecycle.original.js.txt',
} as const;
export function qualifyHistoricalModalDependency(file: keyof typeof historicalModalFixtures, bytes: Uint8Array): string {
  assert(Object.hasOwn(historicalModalFixtures, file), 'Known historical modal dependency');
  const baseline = readFrozen<{originalCanonicalHashes: Record<string, string>; originalRuntimeHashes: Record<string, string>}>('candidate-baseline.json');
  const expected = file.endsWith('.ts') ? baseline.originalCanonicalHashes[file] : baseline.originalRuntimeHashes[file];
  assert(expected, 'Existing original modal dependency pin');
  const actual = createHash('sha256').update(bytes).digest('hex');
  assert.equal(actual, expected, 'Historical modal dependency changed: ' + file);
  return actual;
}
function protectedReadPath(file: string): string {
  if (!Object.hasOwn(historicalModalFixtures, file)) return file;
  const original = file as keyof typeof historicalModalFixtures;
  const snapshot = path.join(directory, historicalModalFixtures[original]);
  qualifyHistoricalModalDependency(original, fs.readFileSync(snapshot));
  return snapshot;
}

const reviewedDomainBytes = fs.readFileSync(path.join(directory, 'reviewed-domain-dependencies.json'));
assert.equal(createHash('sha256').update(reviewedDomainBytes).digest('hex'), 'd9434581e3331f0bdbec3820874ec2a708f4c233beca420194d6b0df15276fd8', 'Reviewed native dependency receipt changed');
const reviewedDomain = JSON.parse(reviewedDomainBytes.toString('utf8')) as {
  version: number;
  dependencies: Record<string, { reason: string; hashes: Record<string, { original: string; reviewed: string }> }>;
};
const reviewedCanonical = protectedCanonical.slice(0, 6).concat('js/lens-local-utils.ts');
assert.equal(reviewedDomain.version, 1);
assert.deepEqual(Object.keys(reviewedDomain.dependencies).sort(), [...reviewedCanonical].sort(), 'Exact reviewed native dependency inventory');
function currentExpectedHash(file: string): string {
  const baseline = readFrozen<{originalCanonicalHashes: Record<string, string>; originalRuntimeHashes: Record<string, string>}>('candidate-baseline.json');
  const canonical = file.replace(/\.js$/, '.ts');
  assert(protectedCanonical.includes(canonical), 'Known protected dependency: ' + file);
  const original = file.endsWith('.ts') ? baseline.originalCanonicalHashes[file] : baseline.originalRuntimeHashes[file];
  assert(original, 'Existing original dependency pin: ' + file);
  const reviewed = reviewedDomain.dependencies[canonical];
  if (!reviewed) return original;
  assert(reviewed.reason.length > 0, 'Explicit native change reason');
  assert.deepEqual(Object.keys(reviewed.hashes).sort(), [canonical, canonical.replace(/\.ts$/, '.js')].sort(), 'Exact canonical and runtime pins');
  const pin = reviewed.hashes[file];
  assert(pin, 'Reviewed dependency pin: ' + file);
  assert.equal(pin.original, original, 'Original dependency provenance: ' + file);
  assert.match(pin.reviewed, /^[0-9a-f]{64}$/, 'Reviewed SHA256 pin');
  return pin.reviewed;
}
export function qualifyCurrentDomainDependency(file: string, bytes: Uint8Array): string {
  const expected = currentExpectedHash(file);
  const actual = createHash('sha256').update(bytes).digest('hex');
  assert.equal(actual, expected, 'Protected domain source changed: ' + file);
  return actual;
}

function currentProtectedGuard(): string {
  const entries = protectedCanonical.flatMap(name => {
    const runtime = name.replace(/\.ts$/, '.js');
    return [[name, currentExpectedHash(name), protectedReadPath(name)], [runtime, currentExpectedHash(runtime), protectedReadPath(runtime)]];
  });
  return `function verifyOriginal() {
    const observed = {};
    for (const [file, expected, source] of ${JSON.stringify(entries)}) {
      const actual = createHash('sha256').update(fs.readFileSync(source)).digest('hex');
      if (actual !== expected) throw new Error('Protected domain source changed: ' + file);
      observed[file] = actual;
    }
    return observed;
  }`;
}

function adaptDriver(name: string): string {
  const fixture = `${name}.mjs.txt`;
  let source = readFrozenBytes(fixture).toString('utf8');
  const fixturePath = path.join(directory, fixture);
  const project = process.cwd();
  source = source.replaceAll('fileURLToPath(import.meta.url)', JSON.stringify(fixturePath));
  for (const relative of ['tests/_node-shim.js', 'js/lens-knowledge-base-ui.js', 'js/lens-library.js']) {
    source = source.replaceAll(`'../../../${relative}'`, JSON.stringify(pathToFileURL(path.join(project, relative)).href));
  }
  const guard = currentProtectedGuard();
  if (name === 'candidate-capture' || name === 'candidate-stats') {
    source = source.split('\n').map(line => {
      if (line.trimStart().startsWith('for(const [file,') && (line.includes('Object.entries(sourceHashes)') || line.includes('Object.entries(identities)'))) return 'verifyOriginal();';
      if (line.startsWith('const revision=execFileSync(')) return `const revision = ${JSON.stringify(originalRevision)};`;
      return line;
    }).join('\n');
    source = guard + '\n' + source;
  } else {
    const pattern = /function verifyOriginal\(\) \{[\s\S]*?\n\}/;
    assert.equal([...source.matchAll(new RegExp(pattern.source, 'g'))].length, 1, 'Exactly one original harness release guard');
    source = source.replace(pattern, guard);
  }
  if (name === 'candidate-status-edit') {
    source = replaceExactly(source, "const base = '.local-notes/full-ui-migration/knowledge-base';", `const base = ${JSON.stringify(directory)};`);
  }
  if (name === 'candidate-ingest-branches') {
    source = replaceExactly(source, "const root = path.resolve(notes, '../../..');", `const root = ${JSON.stringify(project)};`);
  }
  if (name === 'candidate-capture' || name === 'candidate-status-edit') {
    const write = source.indexOf('fs.writeFileSync(');
    const next = source.indexOf('console.log(JSON.stringify(', write);
    assert(write >= 0 && next > write, 'Original capture output-only seam');
    const payload = name === 'candidate-capture' ? '{samples}' : '{receipts}';
    source = source.slice(0, write) + `console.log(${JSON.stringify(marker)} + JSON.stringify(${payload}));\n` + source.slice(next);
  }
  // Settings saves now settle after their native persistence promise. Preserve
  // every original DOM/focus assertion, sampling only after that save completes.
  if (name === 'candidate-capture') {
    source = replaceExactly(source, ' ui.handleToggleLens(!cfg.enabled);', ' await ui.handleToggleLens(!cfg.enabled);');
  }
  if (name === 'candidate-status-edit') {
    source = replaceExactly(source, "  toggle.dispatchEvent(new Event('change', { bubbles: true }));", "  toggle.dispatchEvent(new Event('change', { bubbles: true }));\n  await new Promise(resolve => setImmediate(resolve));");
  }
  if (name === 'candidate-ingest-branches') {
    // A failed ingest no longer poisons the serialized request queue. The final
    // stats read must succeed and still display the retained canonical corpus.
    source = replaceExactly(source, 'terminal = await settle(true);', 'terminal = await settle(false);');
    source = replaceExactly(source,
      "assert.deepEqual(name === 'busy-selection' ? result.focusedBranchWire : result.wireDelta, specification.wireDelta, 'Original public wire branch differs from matrix');",
      "assert.deepEqual(name === 'busy-selection' ? result.focusedBranchWire : result.wireDelta, name === 'worker-ingest-error' ? ['ingest', 'stats'] : specification.wireDelta, 'Reviewed public wire branch differs from matrix');",
    );
    source = replaceExactly(source, "assert(terminal.statsHTML.includes('Synthetic &lt;index&gt; &amp; failure'));", "assert.equal(terminal.statsHTML, result.setup.snapshot.statsHTML);\n        assert.equal(terminal.docListHTML, result.setup.snapshot.docListHTML);\n        assert.deepEqual(terminal.corpus, result.setup.snapshot.corpus);");
  }
  if (name === 'candidate-stats') {
    source = replaceExactly(source,
      "const libraries=[{id:'research',name:recipe.baseConfig.name,model:'all-minilm'}];",
      "const libraries=[{id:'research',name:recipe.baseConfig.name,createdAt:1700000000000,model:'all-minilm'}];",
    );
    source = replaceExactly(source, "console.log(JSON.stringify({kind:'stats-documents'", `console.log(${JSON.stringify(marker)} + JSON.stringify({kind:'stats-documents'`);
  }
  // Child recipes never enter their old parent output branch. Any attempted write
  // is still rejected before app imports; original expected files cannot be touched.
  source = `import fsGuard from 'node:fs'; fsGuard.writeFileSync = () => {throw new Error('Migration capture must not write fixtures');};\n` + source;
  assert(!source.includes("execFileSync('git'"), 'Adapted harness must never invoke Git');
  return source;
}

export function captureCurrent<T>(
  driver: 'candidate-capture' | 'candidate-stats' | 'candidate-status-edit' | 'candidate-ingest-branches',
  parameter?: string,
): T {
  const args = driver === 'candidate-stats'
    ? ['kb-stats-child', parameter!]
    : driver === 'candidate-ingest-branches'
      ? ['--case', parameter!]
      : [];
  const run = spawnSync(process.execPath, ['--input-type=module', '--eval', adaptDriver(driver), '--', ...args], {
    cwd: process.cwd(),
    encoding: 'utf8',
    timeout: 20000,
    maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, TZ: 'UTC' },
  });
  assert.equal(run.error, undefined, run.error?.message ?? 'Public capture child failed to spawn');
  const line = run.stdout.split('\n').find(value => value.startsWith(marker));
  assert(line, `No structured public capture receipt: ${run.stderr}\n${run.stdout.slice(-2000)}`);
  const receipt = JSON.parse(line.slice(marker.length)) as T;
  assert.equal(run.status, 0, `Capture failed: ${run.stderr}\n${JSON.stringify(receipt).slice(-4000)}`);
  return receipt;
}
