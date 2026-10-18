// @vitest-environment node
import {expect,it} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import postcss from 'postcss';
import {dashboardBiometricOwnership} from '../scripts/dashboard-biometric-style-ownership.mjs';
import {compileLegacyDashboardDataStyles as compileDashboardBiometricStyles} from './helpers/dashboard-insights-style-inverse.js';
import {restoreDashboardBiometricBodies, restoreReadableBiometricCtaSource, restoreReadableBiometricCtaCss, restoreManualBiometricRemoveSource, restoreManualBiometricRemoveCss} from './helpers/dashboard-biometric-style-inverse.js';
const root=process.cwd(),inputPath=path.join(root,'css/dashboard-data.base.css'),input=fs.readFileSync(inputPath,'utf8'),original=fs.readFileSync(new URL('./fixtures/dashboard-biometric-styles-original.css',import.meta.url),'utf8');
function signature(css:string){const rows:unknown[]=[];postcss.parse(css).walk(n=>{const ancestry:unknown[]=[];for(let p:postcss.Node|undefined=n.parent;p;p=p.parent)if(p.type==='atrule')ancestry.unshift([(p as postcss.AtRule).name,(p as postcss.AtRule).params]);else if(p.type==='rule')ancestry.unshift(['rule',(p as postcss.Rule).selector]);if(n.type==='decl')rows.push(['decl',n.prop,n.value,!!n.important,ancestry]);else if(n.type==='comment')rows.push(['comment',n.text,ancestry]);});return rows;}
async function exact(source:string){const result=await compileDashboardBiometricStyles(source,inputPath,root);expect(result.receivers).toHaveLength(150);expect(dashboardBiometricOwnership.declarationCount).toBe(548);expect(signature(result.css)).toEqual(signature(original));expect(restoreDashboardBiometricBodies(result.css,original)).toBe(original);return result;}
it('preserves complete ordered declarations/comments/full ancestry and every foreign byte',async()=>{await exact(input);});
it('preserves shared wearable/native grid/mobile/comment lanes',async()=>{const result=await exact(input);expect(result.css).toContain('.db-wearable-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; }');expect(result.css).toContain('.db-wearable-tile strong {');expect(result.css).toContain('/* Dashboard data widgets, biometric/genome/correlation cards, and theme tweaks. */');});
for(const [name,change]of [
 ['owned value',(s:string)=>s.replace('right: 8px;','right: 9px;')],
 ['owned priority',(s:string)=>s.replace('right: 8px;','right: 8px !important;')],
 ['owned order',(s:string)=>s.replace('top: 8px;\n  right: 8px;','right: 8px;\n  top: 8px;')],
 ['missing recipe',(s:string)=>s.replace('@utility dashboard-biometric-db-biometric-overview-bar','@utility foreign')],
 ['missing receiver',(s:string)=>s.replace('@apply gb:dashboard-biometric-db-biometric-overview-bar;','display: block;')],
 ['shared grid value',(s:string)=>s.replace('repeat(auto-fit, minmax(140px, 1fr))','repeat(auto-fit, minmax(141px, 1fr))')],
 ['foreign comment',(s:string)=>s.replace('/* Trend Alert Cards */','/* foreign comment */')],
 ['coarse-pointer scope',(s:string)=>s.replace('@media (pointer: coarse)','@media (pointer: fine)')],
 ['extra foreign rule',(s:string)=>s+'\n.foreign { color: red; }'],
]as const)it('rejects '+name,async()=>{const changed=change(input);expect(changed).not.toBe(input);await expect(exact(changed)).rejects.toThrow();});
for(const [name,change]of [
 ['changed declaration',(s:string)=>s.replace('right: 8px;','right: 9px;')],
 ['changed priority',(s:string)=>s.replace('right: 8px;','right: 8px !important;')],
 ['reordered declarations',(s:string)=>s.replace('top: 8px;\n  right: 8px;','right: 8px;\n  top: 8px;')],
]as const)it('inverse rejects '+name,()=>{const changed=change(original);expect(changed).not.toBe(original);expect(()=>restoreDashboardBiometricBodies(changed,original)).toThrow();});

it('qualifies exactly one readable CTA foreground before frozen legacy contracts', async () => {
  const utility = '@utility dashboard-biometric-db-biometric-manual-empty-wearable-empty-cta {\n  color: var(--text-primary);';
  expect(input.split(utility)).toHaveLength(2);
  const legacy = restoreReadableBiometricCtaSource(input);
  expect(legacy).toBe(input.replace(utility, utility.replace('var(--text-primary)', 'var(--accent)')));
  await exact(input);
  expect(() => restoreReadableBiometricCtaSource(legacy)).toThrow();
  const start = input.indexOf(utility), end = input.indexOf('}', start) + 1;
  expect(() => restoreReadableBiometricCtaSource(input + '\n' + input.slice(start, end))).toThrow();
  expect(() => restoreReadableBiometricCtaSource(input.replace(utility, utility.replace('dashboard-biometric-', 'foreign-')))).toThrow();
  const currentCss = '.db-biometric-manual-empty .wearable-empty-cta { color: var(--text-primary); font-size: 11px; font-weight: 600; letter-spacing: 0.02em; }';
  expect(restoreReadableBiometricCtaCss(currentCss)).toBe(currentCss.replace('var(--text-primary)', 'var(--accent)'));
  for (const changed of [
    currentCss.replace('var(--text-primary)', 'var(--accent)'),
    currentCss.replace('11px', '12px'),
    currentCss.replace('var(--text-primary);', 'var(--text-primary) !important;'),
    currentCss.replace('font-size: 11px; font-weight: 600;', 'font-weight: 600; font-size: 11px;'),
    currentCss + currentCss,
    '@media (max-width: 700px) {' + currentCss + '}',
  ]) expect(() => restoreReadableBiometricCtaCss(changed)).toThrow();
});

it.each([
  ['old accent', (css: string) => css.replace('color: var(--text-primary);', 'color: var(--accent);')],
  ['font geometry', (css: string) => css.replace('font-size: 11px;', 'font-size: 12px;')],
  ['priority', (css: string) => css.replace('color: var(--text-primary);', 'color: var(--text-primary) !important;')],
] as const)('rejects readable CTA source corruption: %s', (_, mutate) => {
  const legacy = restoreReadableBiometricCtaSource(input);
  // Isolate the exact reviewed owner so these faults cannot target another recipe.
  const start = input.indexOf('@utility dashboard-biometric-db-biometric-manual-empty-wearable-empty-cta {');
  const end = input.indexOf('}', start) + 1;
  const body = input.slice(start, end), changed = input.slice(0, start) + mutate(body) + input.slice(end);
  expect(changed).not.toBe(input); expect(legacy).not.toBe(input);
  expect(() => restoreReadableBiometricCtaSource(changed)).toThrow();
});

it('qualifies only manual-empty sibling positioning while preserving generic and coarse Remove geometry', async () => {
  const utility = '@utility dashboard-biometric-manual-empty-remove-placement {\n  top: auto;\n  bottom: 8px;\n}\n';
  const receiver = '.db-biometric-manual-empty + .db-biometric-remove { @apply gb:dashboard-biometric-manual-empty-remove-placement; }\n';
  const prior = restoreManualBiometricRemoveSource(input);
  expect(input.split(utility)).toHaveLength(2); expect(input.split(receiver)).toHaveLength(2);
  expect(prior).toBe(input.replace(utility, '').replace(receiver, ''));
  expect(prior).toContain('top: 8px;\n  right: 8px;\n  width: 30px;\n  height: 30px;');
  expect(prior).toContain('@utility dashboard-biometric-db-biometric-remove-pointer-coarse {\n  width: 44px;\n  height: 44px;\n  opacity: 1;');
  expect(() => restoreManualBiometricRemoveSource(prior)).toThrow();
  const current = '.foreign { color: red; }\n.db-biometric-manual-empty + .db-biometric-remove { top: auto; bottom: 8px; }\n.tail { color: blue; }';
  expect(restoreManualBiometricRemoveCss(current)).toBe('.foreign { color: red; }\n.tail { color: blue; }');
  await exact(input);
});

it.each([
  ['top', (s: string) => s.replace('top: auto;', 'top: 8px;')],
  ['bottom', (s: string) => s.replace('bottom: 8px;', 'bottom: 9px;')],
  ['priority', (s: string) => s.replace('top: auto;', 'top: auto !important;')],
  ['order', (s: string) => s.replace('top: auto; bottom: 8px;', 'bottom: 8px; top: auto;')],
  ['broader selector', (s: string) => s.replace('.db-biometric-manual-empty + ', '')],
  ['duplicate', (s: string) => s + s],
  ['media ancestry', (s: string) => '@media (pointer: coarse) {' + s + '}\n'],
] as const)('rejects manual-empty remove compiled corruption: %s', (_, mutate) => {
  const current = '.db-biometric-manual-empty + .db-biometric-remove { top: auto; bottom: 8px; }\n';
  const changed = mutate(current); expect(changed).not.toBe(current);
  expect(() => restoreManualBiometricRemoveCss(changed)).toThrow();
});

it.each([
  ['declaration', (s: string) => s.replace('@utility dashboard-biometric-manual-empty-remove-placement {\n  top: auto;', '@utility dashboard-biometric-manual-empty-remove-placement {\n  top: initial;')],
  ['priority', (s: string) => s.replace('@utility dashboard-biometric-manual-empty-remove-placement {\n  top: auto;', '@utility dashboard-biometric-manual-empty-remove-placement {\n  top: auto !important;')],
  ['order', (s: string) => s.replace('top: auto;\n  bottom: 8px;', 'bottom: 8px;\n  top: auto;')],
  ['missing receiver', (s: string) => s.replace('.db-biometric-manual-empty + .db-biometric-remove', '.foreign-remove')],
  ['duplicate receiver', (s: string) => s + '\n.db-biometric-manual-empty + .db-biometric-remove { @apply gb:dashboard-biometric-manual-empty-remove-placement; }\n'],
  ['duplicate utility', (s: string) => s + '\n@utility dashboard-biometric-manual-empty-remove-placement { top: auto; bottom: 8px; }\n'],
] as const)('rejects manual-empty remove source corruption: %s', (_, mutate) => {
  const changed = mutate(input); expect(changed).not.toBe(input);
  expect(() => restoreManualBiometricRemoveSource(changed)).toThrow();
});
