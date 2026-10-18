#!/usr/bin/env node
// Guard against window.prompt() / window.confirm() / window.alert() regressions.
// Native blocking dialogs are a UX liability (they freeze the tab, can't be
// styled, don't fit dark mode) and flat-out unavailable in several common
// contexts — sandboxed iframes, file:// PWAs, cross-origin workers, some
// enterprise browser configurations. We replaced all three with custom
// Promise-based dialogs (`showConfirmDialog`, `showPromptDialog`, and
// `showNotification`) and this test pins the replacement: any new call site
// with a raw window.prompt/confirm/alert breaks CI before it reaches users.
//
// Allowed references (docstrings only, never active calls):
//   - js/utils.js   — docstring for the showPromptDialog replacement
//   - js/lens.js    — comment referencing the native API in passing

import fs from 'node:fs';
import {parseAst} from 'rolldown/parseAst';
import {JSDOM} from 'jsdom';
import {renderUtilsPrompt} from '../js/utils-dialog-rendering.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const JS_DIR = path.join(ROOT, 'js');

let passed = 0;
let failed = 0;

function assert(name: string, cond: unknown, detail?: unknown) {
  if (cond) { console.log(`  PASS: ${name}`); passed++; }
  else { console.log(`  FAIL: ${name}${detail ? ' — ' + detail : ''}`); failed++; }
}

type DialogName = 'prompt' | 'alert' | 'confirm';
interface DialogCall {line: number; text: string}
const dialogNames = ['prompt', 'alert', 'confirm'] as const;
const isDialogName = (value: unknown): value is DialogName =>
  value === 'prompt' || value === 'alert' || value === 'confirm';

/** Rule out names only after conservatively decoding every relevant JS escape.
 * Backslash parity is deliberately ignored: false positives still reach the AST.
 * The full compiler owns syntax; malformed escapes here also reach the parser.
 */
function mayContainNativeDialogName(source: string): boolean {
  const containsName = (value: string) => dialogNames.some(name => value.includes(name));
  if (containsName(source)) return true;
  if (!source.includes('\\')) return false;
  let malformed = false;
  const decoded = source.replace(/\\(?:u(?:\{[^}]*\}|[^\r\n\u2028\u2029]{0,4})|x[^\r\n\u2028\u2029]{0,2}|[0-3][0-7]{0,2}|[4-7][0-7]?)/g, escape => {
    const kind = escape[1];
    if (kind !== 'u' && kind !== 'x') return String.fromCharCode(parseInt(escape.slice(1), 8));
    const braced = kind === 'u' && escape[2] === '{';
    const digits = braced ? escape.slice(3, -1) : escape.slice(2);
    const valid = braced ? /^\{[0-9a-f]+\}$/i.test(escape.slice(2))
      : (kind === 'u' ? /^[0-9a-f]{4}$/i : /^[0-9a-f]{2}$/i).test(digits);
    const point = valid ? parseInt(digits, 16) : NaN;
    if (!Number.isFinite(point) || point > 0x10ffff) {
      malformed = true;
      return escape;
    }
    return String.fromCodePoint(point);
  });
  if (malformed) return true;
  // Actual JS continuations contribute no string characters. Other backslashes
  // may be identity escapes; removing them can only overaccept ASCII names.
  const conservative = decoded.replace(/\\(?:\r\n|[\n\r\u2028\u2029])/g, '').replaceAll('\\', '');
  return containsName(conservative);
}

/** Inspect every file; parse and traverse each possible callee source once. */
function findAllCalls(source: string): Record<DialogName, DialogCall[]> {
  const hits: Record<DialogName, DialogCall[]> = {prompt: [], alert: [], confirm: []};
  if (!mayContainNativeDialogName(source)) return hits;
  const program = parseAst(source);
  const owned = new Set<DialogName>();
  // A module-owned callable is not the native global. Explicit global calls
  // remain candidates regardless of any local declaration with the same name.
  for (const item of program.body) {
    const node = item.type === 'ExportNamedDeclaration' ? item.declaration : item;
    if (node?.type === 'FunctionDeclaration' && node.id && isDialogName(node.id.name)) owned.add(node.id.name);
    if (node?.type === 'VariableDeclaration') for (const value of node.declarations) {
      if (value.id.type === 'Identifier' && isDialogName(value.id.name) && value.init
        && ['ArrowFunctionExpression', 'FunctionExpression'].includes(value.init.type)) owned.add(value.id.name);
    }
  }
  const bindings = new Map<DialogName, number>();
  const writes = new Set<DialogName>();
  const candidates: {name: DialogName; global: boolean; offset: number}[] = [];
  // Binding patterns are small subtrees; their defaults are still visited by
  // the full traversal so executable calls inside them cannot be skipped.
  const bind = (value: unknown): void => {
    if (!value || typeof value !== 'object') return;
    const node = value as Record<string, unknown>;
    if (node.type === 'Identifier' && isDialogName(node.name)) {
      bindings.set(node.name, (bindings.get(node.name) ?? 0) + 1);
    } else if (node.type === 'AssignmentPattern') bind(node.left);
    else if (node.type === 'RestElement') bind(node.argument);
    else if (node.type === 'ArrayPattern' && Array.isArray(node.elements)) node.elements.forEach(bind);
    else if (node.type === 'ObjectPattern' && Array.isArray(node.properties)) {
      for (const property of node.properties as Record<string, unknown>[]) {
        bind(property.type === 'RestElement' ? property.argument : property.value);
      }
    }
  };
  const written = (value: unknown): void => {
    if (!value || typeof value !== 'object') return;
    const node = value as Record<string, unknown>;
    if (node.type === 'Identifier' && isDialogName(node.name)) writes.add(node.name);
    else if (node.type === 'AssignmentPattern') written(node.left);
    else if (node.type === 'RestElement') written(node.argument);
    else if (node.type === 'ArrayPattern' && Array.isArray(node.elements)) node.elements.forEach(written);
    else if (node.type === 'ObjectPattern' && Array.isArray(node.properties)) {
      for (const property of node.properties as Record<string, unknown>[]) {
        written(property.type === 'RestElement' ? property.argument : property.value);
      }
    }
  };
  function visit(value: unknown): void {
    if (Array.isArray(value)) {
      for (const child of value) visit(child);
      return;
    }
    if (!value || typeof value !== 'object') return;
    const node = value as Record<string, unknown>;
    // Parser metadata has no executable descendants. These true leaf kinds
    // likewise contain no calls; their bindings are handled at their parent.
    if (typeof node.type !== 'string') return;
    switch (node.type) {
      case 'Identifier':
      case 'Literal':
      case 'PrivateIdentifier':
      case 'ThisExpression':
      case 'Super':
      case 'TemplateElement':
        return;
      case 'VariableDeclarator':
      case 'ClassDeclaration':
      case 'ClassExpression':
        bind(node.id);
        break;
      case 'FunctionDeclaration':
      case 'FunctionExpression':
        bind(node.id);
        if (Array.isArray(node.params)) node.params.forEach(bind);
        break;
      case 'ArrowFunctionExpression':
        if (Array.isArray(node.params)) node.params.forEach(bind);
        break;
      case 'CatchClause':
        bind(node.param);
        break;
      case 'ImportSpecifier':
      case 'ImportDefaultSpecifier':
      case 'ImportNamespaceSpecifier':
        bind(node.local);
        break;
      case 'AssignmentExpression':
      case 'ForOfStatement':
      case 'ForInStatement':
        written(node.left);
        break;
      case 'UpdateExpression':
        written(node.argument);
        break;
      case 'CallExpression': {
        const callee = node.callee as Record<string, unknown>;
        if (callee.type === 'Identifier' && isDialogName(callee.name)) {
          candidates.push({name: callee.name, global: false, offset: node.start as number});
        } else if (callee.type === 'MemberExpression') {
          const object = callee.object as Record<string, unknown> | undefined;
          const property = callee.property as Record<string, unknown> | undefined;
          const name = callee.computed ? property?.type === 'Literal' ? property.value : undefined
            : property?.type === 'Identifier' ? property.name : undefined;
          if (object?.type === 'Identifier' && ['window', 'globalThis', 'self'].includes(String(object.name))
            && isDialogName(name)) candidates.push({name, global: true, offset: node.start as number});
        }
        break;
      }
    }
    // AST objects have own enumerable children. Avoid allocating an array of
    // every field for every node in the complete generated-source census.
    for (const key in node) {
      const child = node[key];
      if (child && typeof child === 'object' && Object.hasOwn(node, key)) visit(child);
    }
  }
  visit(program);
  let lines: string[] | undefined;
  for (const candidate of candidates) {
    if (!candidate.global && owned.has(candidate.name)
      && bindings.get(candidate.name) === 1 && !writes.has(candidate.name)) continue;
    lines ??= source.split('\n');
    const line = source.slice(0, candidate.offset).split('\n').length;
    hits[candidate.name].push({line, text: lines[line - 1]!.trim()});
  }
  return hits;
}

// Keep the focused corruption controls on exactly the same analysis as the census.
function findCalls(source: string, fnName: DialogName): DialogCall[] {
  return findAllCalls(source)[fnName];
}

function* walk(dir: string): Generator<string, void, unknown> {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(p);
    else if (entry.isFile() && p.endsWith('.js')) yield p;
  }
}

function main() {
  console.log('=== test-no-native-dialogs ===\n');
  const offenders: Record<'prompt' | 'alert' | 'confirm', {file: string; line: number; text: string}[]> = { prompt: [], alert: [], confirm: [] };
  for (const file of walk(JS_DIR)) {
    const rel = path.relative(ROOT, file);
    const src = fs.readFileSync(file, 'utf8');
    const calls = findAllCalls(src);
    for (const fn of dialogNames) {
      for (const hit of calls[fn]) {
        offenders[fn].push({ file: rel, ...hit });
      }
    }
  }

  for (const fn of (['prompt', 'alert', 'confirm'] as const)) {
    const hits = offenders[fn];
    if (hits.length === 0) {
      assert(`no window.${fn}() call sites in js/`, true);
    } else {
      const detail = hits.map((h) => `${h.file}:${h.line}: ${h.text}`).join('\n    ');
      assert(`no window.${fn}() call sites in js/`, false,
        `${hits.length} hit(s):\n    ${detail}\n  Use showPromptDialog / showConfirmDialog / showNotification instead.`);
    }
  }

  // Sanity check: the showPromptDialog export exists.
  const utils = fs.readFileSync(path.join(JS_DIR, 'utils.js'), 'utf8');
  assert('utils.js exports showPromptDialog',
    /export function showPromptDialog/.test(utils));
  assert('showPromptDialog stays module-only',
    !/Object\.assign\(window,[^)]*showPromptDialog/.test(utils));
  const promptDocument = new JSDOM(renderUtilsPrompt({message: 'Synthetic prompt', inputType: 'text',
    defaultValue: '', placeholder: '', cancelLabel: 'Cancel', okLabel: 'OK'})).window.document;
  const input = promptDocument.querySelector('#prompt-dialog-input');
  const ok = promptDocument.querySelector('#prompt-ok');
  assert('showPromptDialog uses a normal text control',
    /export function showPromptDialog[^\n]*inputType = 'text'/.test(utils)
      && utils.includes('renderUtilsPrompt({ message, inputType, defaultValue, placeholder, cancelLabel, okLabel })')
      && input?.tagName === 'INPUT' && input.getAttribute('type') === 'text' && input.classList.contains('confirm-input'));
  assert('showPromptDialog uses a primary, non-destructive action',
    ok?.tagName === 'BUTTON' && ok.classList.contains('confirm-btn')
      && ok.classList.contains('confirm-btn-primary') && !ok.classList.contains('confirm-btn-danger'));
  assert('native-dialog scanner rejects global calls including optional and computed APIs',
    findCalls("prompt('x'); window.prompt('x'); globalThis['prompt']('x'); self?.prompt?.('x');", 'prompt').length === 4);
  assert('native-dialog scanner retains explicit global checks alongside owned callable declarations',
    findCalls("const prompt = () => ({action:'use-prompt'}); prompt('x'); window.prompt('x');", 'prompt').length === 1);
  assert('native-dialog scanner ignores literal/comment text without hiding executable calls',
    findCalls("const text = 'window.prompt()'; /* prompt() */ window.prompt(text);", 'prompt').length === 1);
  assert('native-dialog scanner retains bare calls unless a genuine local callable is declared',
    findCalls('const prompt = unknownCallable; prompt();', 'prompt').length === 1
      && findCalls('function prompt() {} prompt();', 'prompt').length === 0
      && findCalls('let prompt = () => {}; prompt = window.prompt; prompt();', 'prompt').length === 1
      && findCalls('let prompt = () => {}; ({prompt} = window); prompt();', 'prompt').length === 1
      && findCalls('let prompt = () => {}; [prompt] = [window.prompt]; prompt();', 'prompt').length === 1);
  assert('native-dialog scanner rejects calls through shadowed helper names',
    findCalls('const prompt = () => {}; function run(prompt = window.prompt) { prompt(); }', 'prompt').length === 1
      && findCalls('const prompt = () => {}; function run() { const prompt = window.prompt; prompt(); }', 'prompt').length === 1
      && findCalls('const prompt = () => {}; function run({prompt = window.prompt}) { prompt(); }', 'prompt').length === 1
      && findCalls('const prompt = () => {}; try {} catch (prompt) { prompt(); }', 'prompt').length === 1);
  assert('native-dialog prefilter retains escaped bare and computed callee names',
    findCalls(String.raw`\u0070r\u006fmpt('x');`, 'prompt').length === 1
      && findCalls(String.raw`globalThis['\u{61}lert']('x');`, 'alert').length === 1
      && findCalls(String.raw`self['con\x66irm']('x');`, 'confirm').length === 1
      && findCalls(String.raw`window['pro\mpt']('x');`, 'prompt').length === 1);
  assert('native-dialog prefilter retains all five JS string line continuations',
    ['\n', '\r', '\r\n', '\u2028', '\u2029'].every(lineEnd => {
      const source = "window['pr\\" + lineEnd + "ompt']('x');";
      return !source.includes('prompt') && mayContainNativeDialogName(source)
        && findCalls(source, 'prompt').length === 1;
    }));
  assert('native-dialog prefilter rejects a plain script with no candidate name',
    !mayContainNativeDialogName('const value = 42;')
      && dialogNames.every(name => findCalls('const value = 42;', name).length === 0)
      && !mayContainNativeDialogName(String.raw`const value = '\u006fther';`));
  assert('decoded name hints still require an exact executable AST callee',
    mayContainNativeDialogName(String.raw`window['\u0070rompting']('x');`)
      && findCalls(String.raw`window['\u0070rompting']('x');`, 'prompt').length === 0
      && findCalls(String.raw`const text = '\u0070rompt';`, 'prompt').length === 0);
  const parseRejects = (source: string): boolean => {
    try { findAllCalls(source); return false; }
    catch (error) { return error instanceof Error; }
  };
  assert('native-dialog prefilter sends malformed and out-of-range escapes to the AST',
    [String.raw`window['\u{}']();`, String.raw`window['\u{110000}']();`,
      String.raw`window['\u00ZZ']();`, String.raw`window['\xZZ']();`]
      .every(source => mayContainNativeDialogName(source) && parseRejects(source)));
  const octalSource = String.raw`window['\160\162\157\155\160\164']('x');`;
  assert('native-dialog prefilter retains legacy octal callees accepted by the parser',
    mayContainNativeDialogName(octalSource) && findCalls(octalSource, 'prompt').length === 1
      && findCalls("'use strict';\n" + octalSource, 'prompt').length === 1);
  promptDocument.defaultView?.close();

  console.log(`\nTotal: ${passed} passed, ${failed} failed.`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
