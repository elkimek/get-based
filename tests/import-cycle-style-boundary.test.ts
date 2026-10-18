// @vitest-environment jsdom
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import postcss, {type Root, type AtRule, type Document} from 'postcss';
import {afterAll, beforeAll, expect, it, vi} from 'vitest';

const root = path.resolve('.');
let directory: string;
interface RuleReceipt {selector: string; ancestors: [string, string][]; body: string[]}
function rules(tree: Root): RuleReceipt[] {
  const result: RuleReceipt[] = [];
  tree.walkRules(rule => {
    const ancestors: [string, string][] = [];
    for (let node: AtRule['parent'] | Document = rule.parent; node; node = node.parent) {
      if (node.type === 'atrule') {
        const group = node as AtRule; ancestors.unshift([group.name, group.params]);
      }
    }
    result.push({selector: rule.selector, ancestors, body: rule.nodes.map(node => node.toString())});
  });
  return result;
}
function descriptors(tree: Root, omitCycle = false): string[] {
  const result: string[] = [];
  tree.walkAtRules(node => {
    if (omitCycle) {
      for (let parent: AtRule['parent'] | Document = node.parent; parent; parent = parent.parent) {
        if (parent.type === 'rule' && 'selector' in parent
          && typeof parent.selector === 'string' && parent.selector.includes('.gb\\:cycle-')) return;
      }
    }
    if (!node.nodes || node.nodes.some(child => child.type === 'decl')) result.push(node.toString());
  });
  return result;
}
const isCycle = (rule: RuleReceipt) => rule.selector.includes('.gb\\:cycle-');
let original: Root, current: Root, cycle: Root;
function compile(input: string, name: string): Root {
  const output = path.join(directory, name + '.css');
  execFileSync(process.execPath, [path.join(root, 'node_modules/@tailwindcss/cli/dist/index.mjs'),
    '--input', '-', '--output', output], {cwd: path.join(root, 'css'), input, stdio: ['pipe', 'ignore', 'pipe']});
  return postcss.parse(fs.readFileSync(output, 'utf8'));
}
beforeAll(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'getbased-import-style-boundary-'));
  const input = fs.readFileSync('css/import-marker-map.tailwind.css', 'utf8');
  const boundary = '/* Cycle previews await their dedicated stylesheet before rendering. */';
  expect(input.split(boundary)).toHaveLength(2);
  expect(input).not.toContain('@import "./cycle-import.tailwind.css"');
  original = compile(input.replace(boundary, '@import "./cycle-import.tailwind.css";'), 'original');
  current = compile(input, 'current');
  cycle = compile(fs.readFileSync('css/cycle-import.tailwind.css', 'utf8'), 'cycle');
});
afterAll(() => {fs.rmSync(directory, {recursive: true, force: true});});

it('retains every Import selector, condition, declaration, priority and relative order', () => {
  expect(rules(current)).toEqual(rules(original).filter(rule => !isCycle(rule)));
  expect(rules(current).length).toBeGreaterThan(400);
  expect(descriptors(current)).toEqual(descriptors(original, true));
});
it('removes only complete Cycle rules supplied identically by the dedicated owner', () => {
  const removed = rules(original).filter(isCycle);
  expect(removed.length).toBeGreaterThan(500);
  expect(removed).toEqual(rules(cycle).filter(isCycle));
  expect(rules(current).some(isCycle)).toBe(false);
  for (const family of ['cycle-shared-ui', 'cycle-import-ui', 'cycle-editor-ui', 'cycle-overview-ui']) {
    expect(removed.some(rule => rule.selector.includes('.gb\\:' + family + '\\:'))).toBe(true);
  }
});
it.each(['selector', 'condition', 'declaration', 'missing'] as const)('detects a %s corruption in the dedicated replacement', kind => {
  const expected = rules(original).filter(isCycle);
  const altered = structuredClone(rules(cycle).filter(isCycle));
  if (kind === 'selector') altered[0]!.selector += ':not(*)';
  else if (kind === 'condition') altered[0]!.ancestors.push(['media', '(min-width: 99999px)']);
  else if (kind === 'declaration') altered[0]!.body.push('display: none !important');
  else altered.splice(0, 1);
  expect(altered).not.toEqual(expected);
});

function deferred() {
  let resolve: ((value: unknown) => void) | undefined;
  let reject: ((reason: unknown) => void) | undefined;
  const promise = new Promise<unknown>((yes, no) => {resolve = yes; reject = no;});
  return {
    promise,
    resolve(value: unknown) {if (!resolve) throw new Error('Missing deferred resolver'); resolve(value);},
    reject(reason: unknown) {if (!reject) throw new Error('Missing deferred rejecter'); reject(reason);},
  };
}

async function coldRuntime() {
  vi.resetModules();
  document.head.innerHTML = '<meta data-import-stylesheet-anchor><meta data-cycle-stylesheet-anchor>';
  return import('../js/cycle-runtime.js');
}
function cycleLink(): HTMLLinkElement {
  const link = document.querySelector<HTMLLinkElement>('link[data-cycle-stylesheet]');
  if (!link) throw new Error('Cycle stylesheet was not requested');
  return link;
}
it('holds a cold preview boundary until both stylesheets are ready', async () => {
  const runtime = await coldRuntime();
  const importing = deferred();
  runtime.configureCycleRuntimeDeps({loadImportStylesheet: () => importing.promise});
  let ready = false;
  const pending = runtime.loadCycleImportStylesheetRuntime().then(() => {ready = true;});
  cycleLink().dispatchEvent(new Event('load'));
  await Promise.resolve(); await Promise.resolve();
  expect(ready).toBe(false);
  importing.resolve(undefined);
  await pending;
  expect(ready).toBe(true);
});
it.each(['cycle', 'import'] as const)('rejects a failed %s stylesheet and permits a successful retry', async failure => {
  const runtime = await coldRuntime();
  const importing = deferred();
  runtime.configureCycleRuntimeDeps({loadImportStylesheet: () => importing.promise});
  const pending = runtime.loadCycleImportStylesheetRuntime();
  const rejection = expect(pending).rejects.toThrow(failure === 'cycle' ? 'Cycle stylesheet could not be loaded' : 'Import unavailable');
  if (failure === 'cycle') {cycleLink().dispatchEvent(new Event('error')); importing.resolve(undefined);}
  else {cycleLink().dispatchEvent(new Event('load')); importing.reject(new Error('Import unavailable'));}
  await rejection;
  runtime.configureCycleRuntimeDeps({loadImportStylesheet: async () => undefined});
  const retry = runtime.loadCycleImportStylesheetRuntime();
  if (failure === 'cycle') expect(cycleLink().href).toContain('lazy-retry=1');
  cycleLink().dispatchEvent(new Event('load'));
  await retry;
});
