import {describe, expect, it} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import postcss from 'postcss';
import {compileDashboardLabMarkerWidgetStyles as compileDashboardAIWidgetStyles} from '../scripts/dashboard-lab-markers-style-ownership.mjs';
import {restoreReviewedStyleBodies} from './helpers/style-owner-body-correspondence.js';
import {dashboardAIDataOwnership, dashboardAIWidgetOwnership} from '../scripts/dashboard-ai-cta-style-ownership.mjs';
import {compileLegacyDashboardDataStyles as compileDashboardAIDataStyles} from './helpers/dashboard-insights-style-inverse.js';
import {restoreDashboardBiometricBodies} from './helpers/dashboard-biometric-style-inverse.js';

const root = process.cwd();
function signature(css: string) {
  const rows: unknown[] = [];
  postcss.parse(css).walk(node => {
    if (node.type === 'rule') rows.push(['rule', node.selector]);
    else if (node.type === 'decl') rows.push(['decl', node.prop, node.value, node.important === true]);
    else if (node.type === 'atrule') rows.push(['at', node.name, node.params]);
    else if (node.type === 'comment') rows.push(['comment', node.text]);
  });
  return rows;
}
function foreign(css: string, receivers: readonly (readonly [string, string, string | null])[]) {
  const edits: Array<{start: number; end: number}> = [];
  postcss.parse(css).walkRules(rule => {
    const condition = rule.parent?.type === 'atrule' ? rule.parent.params : null;
    if (!receivers.some(([, selector, media]) => rule.selector === selector && media === condition)) return;
    const start = rule.source?.start?.offset, end = rule.source?.end?.offset;
    if (typeof start !== 'number' || typeof end !== 'number') throw new Error('Native source coordinates required');
    const open = start + rule.selector.length + (rule.raws.between || '').length;
    expect(css.slice(start, end)).toBe(rule.toString()); expect(css[open]).toBe('{'); expect(css[end - 1]).toBe('}');
    edits.push({start: open + 1, end: end - 1});
  });
  expect(edits).toHaveLength(receivers.length);
  let result = css;
  for (const edit of edits.sort((left, right) => right.start - left.start)) result = result.slice(0, edit.start) + '<owned-body>' + result.slice(edit.end);
  return result;
}
let rawIndex = 0;
for (const [name, compile, ownership, fixture] of [
  ['dashboard-data.base.css', compileDashboardAIDataStyles, dashboardAIDataOwnership, 'dashboard-ai-data-original.css'],
  ['dashboard-widgets.base.css', compileDashboardAIWidgetStyles, dashboardAIWidgetOwnership, 'dashboard-ai-widget-original.css'],
] as const) describe(name + ' native CTA recipes', () => {
  const inputPath = path.join(root, 'css', name);
  const input = fs.readFileSync(inputPath, 'utf8');
  const original = fs.readFileSync(new URL('./fixtures/' + fixture, import.meta.url), 'utf8');
  async function exact(source: string) {
    const compiled = await compile(source, inputPath, root);
    const output = name === 'dashboard-data.base.css'
      ? {...compiled, css: restoreDashboardBiometricBodies(compiled.css, original)}
      : {...compiled, css: restoreReviewedStyleBodies(compiled.css, original, [
          {selector: '.dashboard-widgets.is-adaptive .db-spotlight .db-spark', media: null},
          {selector: '.db-quick-marker-grid', media: '(max-width: 1100px)'},
          {selector: '.db-quick-marker-grid', media: '(max-width: 640px)'},
        ])};
    const originalForeign = foreign(original, ownership.receivers), currentForeign = foreign(output.css, ownership.receivers);
    const directory = process.env['GETBASED_DASHBOARD_AI_CSS_RAW'];
    if (directory) fs.writeFileSync(`${directory}/${rawIndex++}.json`, JSON.stringify({name, original, authored: source, current: output.css, originalForeign, currentForeign}, null, 2), {flag: 'wx'});
    expect(signature(output.css)).toEqual(signature(original)); expect(currentForeign).toBe(originalForeign);
    return output;
  }
  it('preserves whole CSS AST/declaration/cascade and foreign bytes', async () => {await exact(input);});
  for (const [label, mutate] of [
    ['owned value', (css: string) => css.replace('font-size: 13px;', 'font-size: 14px;')],
    ['missing receiver', (css: string) => css.replace(/@apply gb:dashboard-ai-[a-z-]+;/, 'display: block;')],
    ['missing recipe', (css: string) => css.replace(/@utility dashboard-ai-[a-z-]+/, '@utility foreign')],
    ['foreign value', (css: string) => css.replace('grid-template-columns: repeat(12, minmax(0, 1fr));', 'grid-template-columns: none;').replace('/* Trend Alert Cards */', '/* foreign text */')],
    ['extra rule', (css: string) => css + '\n.foreign { color: red; }'],
  ] as const) it('rejects ' + label, async () => {await expect(exact(mutate(input))).rejects.toThrow();});
  if(name==='dashboard-widgets.base.css') it.each([
    'dashboard-lab-markers-dashboard-widgets-is-adaptive-db-spotlight-db-spark',
    'dashboard-quick-markers-widget-grid-tablet',
    'dashboard-quick-markers-widget-grid-phone',
  ])('finite foreign correspondence rejects changed declaration: %s',async utility=>{
    await exact(input);
    const tree=postcss.parse(input),found:postcss.AtRule[]=[];
    tree.walkAtRules('utility',node=>{if(node.params===utility)found.push(node);});
    expect(found).toHaveLength(1);const declaration=found[0]!.nodes?.[0];
    expect(declaration?.type).toBe('decl');if(declaration?.type!=='decl')throw new Error('Expected finite Widget declaration');
    declaration.value+='__changed';const changed=tree.toString();expect(changed).not.toBe(input);
    await expect(exact(changed)).rejects.toThrow();
  });
});
