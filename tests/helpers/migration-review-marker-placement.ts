import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
import {createHash} from 'node:crypto';
import * as ts from 'typescript/unstable/ast';
import {withParsedSource} from '../../scripts/native-typescript-ast.js';
import {escapeAttr, escapeHTML} from '../../js/utils.js';
import {markerDetailActionAttrs} from '../../js/marker-detail-actions.js';
import type {PlacementFormInput} from '../../js/marker-placement-presentation.js';
import pins from '../fixtures/migration-review-marker-placement/source-pins.json' with {type: 'json'};
const archive = path.join(import.meta.dirname, '../fixtures/migration-review-marker-placement');
const sha = (value: string) => createHash('sha256').update(value).digest('hex');
function pinned(name: string, hash: string): string {const text = fs.readFileSync(path.join(archive, name), 'utf8'); assert.equal(sha(text), hash); return text;}
/** Fixed recovered compiler outputs are evidence data, never application modules.
 * AST removal changes ESM syntax only; every original codec statement executes. */
function executable(source: string): {code: string; exported: string | null} {
  return withParsedSource(source, 'historical-marker-placement.js', file => {
    const edits: {start: number; end: number}[] = []; let exported: string | null = null;
    for (const node of file.statements) {
      if (ts.isImportDeclaration(node)) edits.push({start: node.getStart(file), end: node.end});
      else if (ts.isExportDeclaration(node)) {
        if (node.exportClause && ts.isNamedExports(node.exportClause)) for (const entry of node.exportClause.elements)
          if (entry.name.text === 'renderHTML') exported = (entry.propertyName ?? entry.name).text;
        edits.push({start: node.getStart(file), end: node.end});
      } else if (ts.isFunctionDeclaration(node) || ts.isVariableStatement(node)) for (const modifier of node.modifiers ?? [])
        if (modifier.kind === ts.SyntaxKind.ExportKeyword) edits.push({start: modifier.getStart(file), end: modifier.end});
    }
    for (const edit of edits.reverse()) source = source.slice(0, edit.start) + source.slice(edit.end);
    return {code: source, exported};
  });
}
export function historicalPlacement(alter: (owner: string, html: string) => string) {
  const renderers: Record<string, (props: unknown) => string> = {};
  for (const [owner, pin] of Object.entries(pins.historical)) {
    pinned(owner + '.svelte.txt', pin.ownerSHA256);
    const parsed = executable(pinned(owner + '.svelte.html.js.txt', pin.compiledSHA256));
    assert(parsed.exported); const render = new vm.Script(parsed.code + '\n' + parsed.exported).runInNewContext() as (props: unknown) => string;
    renderers[owner] = props => alter(owner === 'MarkerPlacementForm' ? 'form' : owner === 'MarkerPlacementSummary' ? 'summary' : 'options', render(props));
  }
  const controller = pinned('marker-placement-presentation.ts.txt', pins.controllerSHA256);
  const parsed = executable(stripTypeScriptTypes(controller));
  return new vm.Script(parsed.code + '\n({renderPlacementSummary,renderPlacementOptions,renderPlacementForm})').runInNewContext({
    escapeAttr, escapeHTML, markerDetailActionAttrs,
    renderSummaryHTML: renderers.MarkerPlacementSummary, renderOptionsHTML: renderers.MarkerPlacementOptions, renderFormHTML: renderers.MarkerPlacementForm,
  }) as {renderPlacementForm(id: string, input: PlacementFormInput, current: unknown, native: unknown, moved: boolean): string};
}
export function requireCurrentPlacementSource(file: string, source: string): void {
  const hash = (pins.current as Record<string, string>)[file]; assert(hash, 'Known reviewed placement source');
  assert.equal(sha(source), hash, 'Reviewed current placement source: ' + file);
}
export function qualifyCurrentPlacementSources(): void {
  assert.equal(sha(fs.readFileSync('tests/fixtures/marker-placement-original.json', 'utf8')), pins.originalFixtureSHA256);
  for (const file of Object.keys(pins.current)) requireCurrentPlacementSource(file, fs.readFileSync(file, 'utf8'));
  for (const owner of ['MarkerPlacementForm', 'MarkerPlacementOptions', 'MarkerPlacementSummary']) {
    const source = fs.readFileSync('js/components/' + owner + '.svelte', 'utf8');
    const map = JSON.parse(fs.readFileSync('js/components/' + owner + '.svelte.html.js.map', 'utf8')) as {sources: string[]; sourcesContent: string[]};
    const matches = map.sources.flatMap((file, index) => file.endsWith('/' + owner + '.svelte') || file === owner + '.svelte' ? [map.sourcesContent[index]] : []);
    assert.deepEqual(matches, [source], 'Current compiled SDK facade binds its exact authored owner');
  }
}
function coordinate(source: string, before: string, after: string, count = 1): string {
  assert.equal(source.split(before).length - 1, count, 'Exact source-qualified SDK coordinate');
  return source.split(before).join(after);
}
function root(source: string): string {
  assert(source.startsWith('<!--[-->') && source.endsWith('<!--]-->'), 'Exact Svelte render envelope');
  return source.slice(8, -8);
}
function options(source: string, groups: readonly {label: string}[]): string {
  if (!groups.length) return coordinate(source, '<!--[--><!--]-->', '');
  source = coordinate(source, '<!--[--><optgroup', '<optgroup');
  source = coordinate(source, '</optgroup><!--]-->', '</optgroup>');
  for (const group of groups) {
    const open = '<optgroup label="' + escapeAttr(group.label) + '">\n      ';
    source = coordinate(source, open + '<!--[-->', open);
  }
  return coordinate(source, '</option><!--]-->\n    </optgroup>', '</option>\n    </optgroup>', groups.length);
}
/** Reverse only literal SDK boundaries qualified by the exact authored source.
 * Data stays escaped; any extra or misplaced comment survives and fails native
 * DOM comparison or the exact coordinate check. No comment filtering exists. */
export function nativePlacementFragment(kind: 'summary' | 'options' | 'form', html: string, moved: boolean, groups: readonly {label: string}[] = []): string {
  let source = root(html);
  if (kind === 'summary') {
    if (moved) {
      source = coordinate(source, '<!--[0--><span class="gb-detail-category-origin">', '<span class="gb-detail-category-origin">');
      source = coordinate(source, '>Restore</button><!--]-->\n  </div>', '>Restore</button>\n  </div>');
    } else source = coordinate(source, '\n    <!--[-1--><!--]-->\n  </div>', '\n    \n  </div>');
  } else if (kind === 'options') source = options(source, groups);
  else {
    const open = '<select id="marker-placement-category" aria-describedby="marker-placement-help">\n            ';
    const start = source.indexOf(open); assert(start >= 0 && source.indexOf(open, start + open.length) === -1);
    const end = source.indexOf('<!---->\n          <!></select>', start); assert(end > start);
    const child = source.slice(start + open.length, end);
    source = source.slice(0, start + open.length) + options(child, groups) + '\n          </select>' + source.slice(end + '<!---->\n          <!></select>'.length);
    if (moved) {
      source = coordinate(source, '<!--[0--><button type="button" class="import-btn import-btn-secondary marker-placement-restore"', '<button type="button" class="import-btn import-btn-secondary marker-placement-restore"');
      source = coordinate(source, '>Restore original</button><!--]-->', '>Restore original</button>');
    } else source = coordinate(source, '\n          <!--[-1--><!--]-->\n          <button', '\n          \n          <button');
  }
  assert(!source.includes('<!--') && !source.includes('<!>'), 'No unqualified remaining SDK marker');
  return source;
}
