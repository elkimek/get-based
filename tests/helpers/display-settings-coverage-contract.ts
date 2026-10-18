import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {SourceMap, type SourceMapPayload} from 'node:module';
import {parse} from 'svelte/compiler';

// Independent C6 authored owners, qualified against the immutable application's
// complete sourcesContent. Expected roles never come from collected coverage.
export const displayCoverageOwnerSHA256 = {
  'DisplaySettings.svelte': 'e681767fa04581f44fb70ca8ba042201b5cc96f522069e1934d5e0b846f896e8',
  'SettingsToggle.svelte': '0580c5198f1f8f6b67d2de09daf197e082656b46dfb8686852e698de0897dbe5',
};
export const expectedDisplayCoverageRoles = {
  'display:component': true,
  'display:initial': true,
  'display:refresh': false,
  'display:product-recs': true,
  'display:debug-mode': true,
  'display:effect': true,
  'toggle:component': true,
  'toggle:change': false,
  'toggle:click': false,
  'toggle:effect': true,
};
interface Span {start: number; end: number; name: string}
export interface DisplayCoverageRole extends Span {role: string; expectedCalled: boolean}
interface AuthoredNode {
  type: string; start: number; end: number; name?: string;
  id?: {name: string}; attributes?: Array<{name: string; value?: unknown}>;
  [key: string]: unknown;
}
function nodes(source: string): AuthoredNode[] {
  const result: AuthoredNode[] = [];
  const visit = (value: unknown): void => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {value.forEach(visit); return;}
    const node = value as AuthoredNode;
    if (typeof node.type === 'string') result.push(node);
    for (const [key, child] of Object.entries(node)) if (key !== 'loc') visit(child);
  };
  visit(parse(source, {modern: true}));
  return result;
}
function only<Node>(values: Node[], description: string): Node {
  assert.equal(values.length, 1, description);
  return values[0]!;
}
function lineStarts(source: string): number[] {
  const starts = [0];
  for (let offset = 0; offset < source.length; offset++) if (source[offset] === '\n') starts.push(offset + 1);
  return starts;
}
export function qualifyDisplayCoverageRoles(
  source: string, payload: SourceMapPayload, owned: Span[], authored: Record<string, string>,
): DisplayCoverageRole[] {
  const authoredNodes: Record<string, AuthoredNode[]> = {};
  const authoredLines: Record<string, number[]> = {};
  for (const [owner, expectedSHA] of Object.entries(displayCoverageOwnerSHA256)) {
    const text = authored[owner];
    assert.equal(typeof text, 'string', 'Complete authored owner required');
    assert.equal(createHash('sha256').update(text!).digest('hex'), expectedSHA, 'Independent C6 authored owner');
    const index = only(payload.sources.map((name, index) => ({name, index})).filter(row => row.name === owner), owner).index;
    assert.equal(payload.sourcesContent?.[index], text, 'Complete exact map source owner');
    authoredNodes[owner] = nodes(text!);
    authoredLines[owner] = lineStarts(text!);
  }
  const display = authoredNodes['DisplaySettings.svelte']!;
  const toggle = authoredNodes['SettingsToggle.svelte']!;
  const initial = only(display.filter(node => node.type === 'ArrowFunctionExpression'), 'One initial untrack callback');
  const initialCall = only(display.filter(node => node.type === 'CallExpression'
    && (node.callee as {name?: string})?.name === 'untrack'
    && (node.arguments as AuthoredNode[])?.includes(initial)), 'Untrack call owns the initial callback mapping');
  const refresh = only(display.filter(node => node.type === 'FunctionDeclaration' && node.id?.name === 'refresh'), 'Public refresh');
  const change = only(toggle.filter(node => node.type === 'FunctionDeclaration' && node.id?.name === 'handleChange'), 'Toggle change handler');
  const click = only(toggle.filter(node => node.type === 'ArrowFunctionExpression'), 'Inline propagation handler');
  const input = only(toggle.filter(node => node.type === 'RegularElement' && node.name === 'input'), 'Toggle input');
  const footer = only(display.filter(node => node.type === 'RegularElement' && node.name === 'div'
    && authored['DisplaySettings.svelte']!.slice(node.start, node.end).includes('v{preferences.version}')), 'Version footer effect anchor');
  const controls = display.filter(node => node.type === 'Component' && node.name === 'SettingsToggle');
  assert.equal(controls.length, 2, 'Two genuine child toggles');
  function control(id: string): AuthoredNode {
    return only(controls.filter(node => authored['DisplaySettings.svelte']!.slice(node.start, node.end).includes(`id="${id}"`)), id);
  }
  const product = control('settings-product-recs'), debug = control('debug-mode-toggle');
  const compiledLines = lineStarts(source), map = new SourceMap(payload);
  const origin = (offset: number): {owner: string; offset: number} => {
    let line = 0;
    while (compiledLines[line + 1] !== undefined && compiledLines[line + 1]! <= offset) line++;
    const entry = map.findEntry(line, offset - compiledLines[line]!);
    assert('originalSource' in entry && typeof entry.originalSource === 'string', 'Owned function needs qualified original source');
    const starts = authoredLines[entry.originalSource];
    assert(starts && typeof entry.originalLine === 'number' && typeof entry.originalColumn === 'number', 'Unknown/unmapped owned function must not disappear');
    return {owner: entry.originalSource, offset: starts[entry.originalLine]! + entry.originalColumn};
  };
  const inside = (offset: number, node: AuthoredNode): boolean => offset >= node.start && offset < node.end;
  const result = owned.map(fn => {
    const start = origin(fn.start), end = origin(fn.end - 1);
    assert.equal(start.owner, end.owner, 'Entire function belongs to one exact authored owner');
    let role: string | undefined;
    if (start.owner === 'DisplaySettings.svelte') {
      if (start.offset === 0) role = 'display:component';
      else if (inside(start.offset, initialCall)) role = 'display:initial';
      else if (inside(start.offset, refresh)) role = 'display:refresh';
      else if (fn.name === 'checked' && inside(start.offset, product) && inside(end.offset, product)) role = 'display:product-recs';
      else if (fn.name === 'checked' && inside(start.offset, debug) && inside(end.offset, debug)) role = 'display:debug-mode';
      else if (fn.name === '(anonymous)' && inside(start.offset, footer) && inside(end.offset, footer)) role = 'display:effect';
    } else if (start.owner === 'SettingsToggle.svelte') {
      if (start.offset === 0) role = 'toggle:component';
      else if (inside(start.offset, change)) role = 'toggle:change';
      else if (inside(start.offset, click)) role = 'toggle:click';
      else if (fn.name === '(anonymous)' && inside(start.offset, input)) role = 'toggle:effect';
    }
    assert(role && Object.hasOwn(expectedDisplayCoverageRoles, role), `Unexpected owned function role ${start.owner}:${start.offset}-${end.offset}`);
    return {...fn, role, expectedCalled: expectedDisplayCoverageRoles[role as keyof typeof expectedDisplayCoverageRoles]};
  });
  assert.deepEqual(result.map(row => row.role).sort(), Object.keys(expectedDisplayCoverageRoles).sort(), 'Complete ten-role owned inventory, including both child handlers');
  return result;
}
export function assertDisplayCoverageCalls(roles: DisplayCoverageRole[], called: ReadonlySet<number>): void {
  assert([...called].every(start => roles.some(role => role.start === start)), 'Unknown called span');
  assert.deepEqual(roles.filter(role => called.has(role.start)).map(role => role.role).sort(),
    Object.entries(expectedDisplayCoverageRoles).filter(([, called]) => called).map(([role]) => role).sort(), 'Exact independently expected called roles');
  assert.deepEqual(roles.filter(role => !called.has(role.start)).map(role => role.role).sort(),
    ['display:refresh', 'toggle:change', 'toggle:click'], 'Public refresh and both real event handlers remain uncalled');
}
