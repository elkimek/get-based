import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import postcss from 'postcss';
import {assertNoLightSetupAtomicConsumers} from '../scripts/light-setup-source-qualification.mjs';
import vm from 'node:vm';
import {expect, it} from 'vitest';
import {escapedClass} from './helpers/legacy-light-chat-contracts.js';
import {factorLightSetupStyles, verifyLightSetupSelectorEdits} from '../scripts/light-setup-owned-recipes.mjs';
import {lightSetupUtilityRecipes} from '../scripts/style-recipes/light-setup.mjs';
import {buildLightSetupStyles} from '../scripts/build-styles.mjs';

interface Api {
  setupStyles: Readonly<Record<string, string>>;
  setupClasses(value: string): string;
  setupChipClasses(value: {kind: unknown; accent?: unknown; tier?: unknown}): string;
}
const fixtureRoot = new URL('./fixtures/light-setup-owned/', import.meta.url);
const pins = {
  "nativeCSSSHA256": "1174400461b41ada59b6df6a18596993cd7307d6404a47d317fae5ca55001670",
  "nativeHelperFixtureSHA256": "14f0a87d41b77706ca4c1f03070bd799532fdefec202d68552f117638f65cc38",
  "semanticCSSExpectedSHA256": "fa8de3d0afd361f69fcdee22fd60701c83c3c75213c50e35c2b8c685448a28ea"
} as const;
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const nativeFixtureText = fs.readFileSync(new URL('light-setup-helper-original.json', fixtureRoot), 'utf8');
assert.equal(digest(nativeFixtureText), pins.nativeHelperFixtureSHA256);
const nativeFixture = JSON.parse(nativeFixtureText) as {compiledSource: string; compiledSourceSHA256: string};
assert.equal(digest(nativeFixture.compiledSource), nativeFixture.compiledSourceSHA256);
const nativeCSS = fs.readFileSync(new URL('light-setup-native.css', fixtureRoot), 'utf8');
assert.equal(digest(nativeCSS), pins.nativeCSSSHA256);

function load(source: string) {
  assert.equal((source.match(/export function /g) || []).length, 2);
  const context = vm.createContext({});
  const api = vm.runInContext(source.replaceAll('export function ', 'function ')
    + '\n({setupStyles, setupClasses, setupChipClasses})', context) as Api;
  return {api, context};
}
const native = load(nativeFixture.compiledSource);
const actualSource = fs.readFileSync(new URL('../js/light-setup-classes.js', import.meta.url), 'utf8');
const current = load(actualSource);
const hooks = Object.keys(native.api.setupStyles);
// This independently pinned original catalog remains the native parity oracle.
const originalRecipes = native.api.setupStyles;
const glassCaptionUtility = "gb:light-setup:[[data-theme='glass']_&]:text-ink";
const setupScope = ':is([data-light-setup-presentation],[data-light-setup-presentation] *)';
const glassCaptionNativeRule = '[data-theme=glass] ' + escapedClass(glassCaptionUtility)
  + setupScope + '{color:var(--text-primary)}';
const glassCaptionRecipeRule = '[data-theme=glass] .gb-ls-light-setup-chip-sub'
  + setupScope + '{color:var(--text-primary)}';
function withExpectedGlassCaption(css: string, rule: string): string {
  // Tailwind orders the new color utility before the two existing Glass backdrop rules.
  // Change expected bytes only; no current CSS, HTML or DOM is normalized.
  const anchor = '[data-theme=glass] ';
  const position = css.indexOf(anchor);
  assert.ok(position >= 0, 'Pinned original Glass rules are required');
  return css.slice(0, position) + rule + css.slice(position);
}
const accessibleNativeCSS = withExpectedGlassCaption(nativeCSS, glassCaptionNativeRule);

/** Expected-only finite substitution. Actual HTML, classes and DOM are never normalized. */
function recipeExpected(nativeClass: string, selected: readonly string[]): string {
  let expected = nativeClass;
  for (const hook of selected) {
    assert.ok(Object.hasOwn(native.api.setupStyles, hook), 'Explicit original hook witness');
    const expansion = hook + ' ' + native.api.setupStyles[hook];
    assert.ok(expected.includes(expansion), 'Complete original expansion, including its exact utility order');
    expected = expected.replace(expansion, hook + ' gb-ls-' + hook);
  }
  return expected;
}

it('retains the exact algorithms, all86 own recipe shadows, and one build-only readable catalog', () => {
  expect(hooks).toHaveLength(86);
  expect(Object.keys(current.api.setupStyles)).toEqual(hooks);
  for (const hook of hooks) {
    expect(Object.hasOwn(current.api.setupStyles, hook)).toBe(true);
    expect(current.api.setupStyles[hook]).toBe('gb-ls-' + hook);
    const expectedRecipe = native.api.setupStyles[hook]
      + (hook === 'light-setup-chip-sub' ? ' ' + glassCaptionUtility : '');
    expect(lightSetupUtilityRecipes[hook as keyof typeof lightSetupUtilityRecipes]).toBe(expectedRecipe);
  }
  expect(actualSource.slice(actualSource.indexOf('export function setupClasses')))
    .toBe(nativeFixture.compiledSource.slice(nativeFixture.compiledSource.indexOf('export function setupClasses')));
  expect(actualSource).not.toContain('gb:light-setup:');
  expect(Object.keys(lightSetupUtilityRecipes)).toEqual(hooks);
});

for (const hook of hooks) it(`preserves whitespace and the exact owned class witness for ${hook}`, () => {
  const input = `\tunknown-a  ${hook}\nunknown-b `;
  expect(current.api.setupClasses(input)).toBe(recipeExpected(native.api.setupClasses(input), [hook]));
});

// Preserve every witness from the independently reviewed native recipe pilot:
// 86 hook cases plus four original string inputs, then 4 × 3 × 4 chip inputs.
const originalClassInputs = [...hooks, '', 'unknown', 'unknown light-setup-chip unknown',
  '\t light-setup-summary-edit\nlight-setup-chip  '];
const originalChipInputs = ['am', 'outdoors', 'home', 'unknown'].flatMap(kind =>
  [undefined, 'amber', 'unknown'].flatMap(accent => [undefined, 0, 2, 4].map(tier =>
    ({kind, accent, tier}))));
assert.equal(originalClassInputs.length, 90);
assert.equal(originalChipInputs.length, 48);
assert.equal(originalClassInputs.length + originalChipInputs.length, 138);
function selectedOriginalHooks(input: string): string[] {
  return input.split(/\s+/).filter(hook => Object.hasOwn(native.api.setupStyles, hook));
}
for (const [index, input] of originalClassInputs.entries()) {
  it(`retains original helper witness ${index + 1}/138`, () => {
    const expected = recipeExpected(native.api.setupClasses(input), selectedOriginalHooks(input));
    expect(current.api.setupClasses(input)).toBe(expected);
  });
}
for (const [index, chip] of originalChipInputs.entries()) {
  it(`retains original chip witness ${index + 91}/138`, () => {
    const input = ['light-setup-chip', `light-setup-chip-${chip.kind}`,
      chip.accent ? `light-setup-chip-home-${chip.accent}` : '',
      chip.tier !== undefined ? `light-setup-chip-tier-${chip.tier}` : ''].join(' ');
    const expected = recipeExpected(native.api.setupChipClasses(chip), selectedOriginalHooks(input));
    expect(current.api.setupChipClasses(chip)).toBe(expected);
  });
}

it('preserves unknown prototype hooks and shadows a hostile inherited getter for every known hook', () => {
  for (const value of ['', 'constructor', 'toString', '__proto__', 'gb:light-setup:unknown-hook', 'unknown  toString\tconstructor']) {
    expect(current.api.setupClasses(value)).toBe(native.api.setupClasses(value));
  }
  for (const hook of hooks) {
    for (const owner of [native, current]) {
      vm.runInContext(`Object.defineProperty(Object.prototype, ${JSON.stringify(hook)}, {
        configurable: true, get() { throw new Error('inherited known hook was read'); }
      })`, owner.context);
    }
    expect(current.api.setupClasses(hook)).toBe(hook + ' gb-ls-' + hook);
    expect(native.api.setupClasses(hook)).toBe(hook + ' ' + native.api.setupStyles[hook]);
    for (const owner of [native, current]) vm.runInContext(`delete Object.prototype[${JSON.stringify(hook)}]`, owner.context);
  }
});

it('rejects partial, reordered and wrong-hook expected expansions rather than normalizing actual output', () => {
  const hook = 'light-setup-summary-edit';
  const original = native.api.setupClasses(hook);
  const tokens = native.api.setupStyles[hook]!.split(' ');
  expect(() => recipeExpected(original.replace(tokens[0]!, ''), [hook])).toThrow();
  expect(() => recipeExpected(original.replace(tokens.join(' '), tokens.toReversed().join(' ')), [hook])).toThrow();
  expect(() => recipeExpected(original, ['ctx-skin-range'])).toThrow();
});

it('keeps the pinned complete CSS, ordered atomic edit set and independently reviewed per-hook recipe proposal', () => {
  const result = factorLightSetupStyles(nativeCSS, originalRecipes);
  expect(result.utilities).toBe(497);
  expect(result.rules).toBe(563);
  expect(result.edits).toHaveLength(571);
  expect(digest(result.css)).toBe(pins.semanticCSSExpectedSHA256);
  verifyLightSetupSelectorEdits(nativeCSS, result.css, result.edits);
  for (const edit of result.edits) {
    expect(edit.hooks.every(hook => Object.hasOwn(native.api.setupStyles, hook))).toBe(true);
    expect(edit.after).toContain('.gb-ls-');
  }
});

it('adds only the explicit readable Glass caption foreground to the unchanged native stylesheet', () => {
  const original = factorLightSetupStyles(nativeCSS, originalRecipes);
  expect(digest(original.css)).toBe(pins.semanticCSSExpectedSHA256);
  const expected = withExpectedGlassCaption(original.css, glassCaptionRecipeRule);
  const accessible = factorLightSetupStyles(accessibleNativeCSS, lightSetupUtilityRecipes);
  expect(accessible.css).toBe(expected);
  expect(accessible.utilities).toBe(498);
  expect(accessible.rules).toBe(564);
  expect(accessible.edits).toHaveLength(572);
  verifyLightSetupSelectorEdits(accessibleNativeCSS, accessible.css, accessible.edits);
  const rule = postcss.parse(glassCaptionRecipeRule).first;
  expect(rule?.type).toBe('rule');
  if (rule?.type !== 'rule') throw new Error('The one approved rule must be a rule');
  expect(rule.selector).toBe('[data-theme=glass] .gb-ls-light-setup-chip-sub' + setupScope);
  expect(rule.nodes.map(node => {
    if (node.type !== 'decl') throw new Error('No other approved rule children');
    return [node.prop, node.value, !!node.important];
  })).toEqual([['color', 'var(--text-primary)', false]]);
});

it('uses a foreground that passes the observed Glass caption contrast without geometry changes', () => {
  const variables = new Map<string, string>();
  postcss.parse(fs.readFileSync(new URL('../themes-extra.css', import.meta.url), 'utf8')).walkRules(rule => {
    if (rule.selector === '[data-theme="glass"]') rule.walkDecls(declaration => {
      variables.set(declaration.prop, declaration.value);
    });
  });
  function luminance(hex: string): number {
    assert.match(hex, /^#[0-9a-f]{6}$/i);
    const channels = [1, 3, 5].map(start => parseInt(hex.slice(start, start + 2), 16) / 255)
      .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
  }
  function contrast(foreground: string): number {
    // Preserved genuine 320px/Glass/saved-0 axe receipt: highlighted translucent surface.
    const values = [luminance(foreground), luminance('#66468e')].sort((a, b) => a - b);
    return (values[1]! + 0.05) / (values[0]! + 0.05);
  }
  expect(contrast(variables.get('--text-muted')!)).toBeLessThan(4.5);
  expect(contrast(variables.get('--text-secondary')!)).toBeLessThan(4.5);
  expect(contrast(variables.get('--text-primary')!)).toBeGreaterThanOrEqual(4.5);
});

it('independently rejects candidate declaration, importance, scope, media, rule-order and hook corruption', () => {
  const result = factorLightSetupStyles(nativeCSS, originalRecipes);
  expect(result.css).toContain('.gb-ls-ctx-skin-face');
  expect(result.css).toContain('.gb-ls-ctx-skin-range');
  let pair: readonly [postcss.Rule, postcss.Rule] | undefined;
  postcss.parse(result.css).walkRules(rule => {
    if (pair || !rule.selector.includes('.gb-ls-')) return;
    const sibling = rule.next();
    if (sibling?.type === 'rule' && sibling.selector.includes('.gb-ls-')) pair = [rule, sibling];
  });
  assert.ok(pair, 'Two adjacent genuine recipe rules are required for the order mutation');
  const [firstRule, secondRule] = pair;
  assert.ok(firstRule.parent === secondRule.parent, 'The exact rule swap stays within one parent');
  const firstStart = firstRule.source?.start?.offset;
  const secondStart = secondRule.source?.start?.offset;
  assert.ok(typeof firstStart === 'number' && typeof secondStart === 'number');
  const firstBytes = firstRule.toString(), secondBytes = secondRule.toString();
  const firstEnd = firstStart + firstBytes.length, secondEnd = secondStart + secondBytes.length;
  expect(result.css.slice(firstStart, firstEnd)).toBe(firstBytes);
  expect(result.css.slice(secondStart, secondEnd)).toBe(secondBytes);
  assert.ok(firstEnd <= secondStart, 'Only disjoint adjacent rule bodies may exchange positions');
  const swapped = result.css.slice(0, firstStart) + secondBytes
    + result.css.slice(firstEnd, secondStart) + firstBytes + result.css.slice(secondEnd);
  const mutations = [
    ['declaration property', result.css.replace('padding:', 'margin:')],
    ['important priority', result.css.replace('!important', '')],
    ['owner scope', result.css.replace('[data-light-setup-presentation]', '[data-wrong-owner]')],
    ['media condition', result.css.replace('prefers-reduced-motion:reduce', 'prefers-reduced-motion:no-preference')],
    ['recipe association', result.css.replace('.gb-ls-ctx-skin-face', '.gb-ls-ctx-skin-range')],
    ['adjacent rule order', swapped],
    ['additional bytes', result.css + '/* unapproved extra bytes */'],
  ] as const;
  for (const [name, mutation] of mutations) {
    expect(mutation, name + ' must change genuine input bytes').not.toBe(result.css);
    expect(() => verifyLightSetupSelectorEdits(nativeCSS, mutation, result.edits), name).toThrow();
  }
  const first = result.edits[0]!;
  const wrongAssociation = {...first, after: '.ctx-skin-range'};
  expect(() => verifyLightSetupSelectorEdits(nativeCSS, result.css, [wrongAssociation, ...result.edits.slice(1)])).toThrow();
});

it('fails closed on an unscoped, unknown, missing or wrongly associated compiled utility', () => {
  const result = factorLightSetupStyles(nativeCSS, originalRecipes);
  expect(() => factorLightSetupStyles(nativeCSS.replaceAll('[data-light-setup-presentation]', '[data-wrong-owner]'), originalRecipes)).toThrow();
  const wrong = {...originalRecipes, 'light-setup-summary-edit': 'gb:other-owner:block'};
  expect(() => factorLightSetupStyles(nativeCSS, wrong)).toThrow();
  const absent = {...originalRecipes, 'never-rendered': 'gb:light-setup:[never-present:1]'};
  expect(() => factorLightSetupStyles(nativeCSS, absent)).toThrow();
  expect(() => factorLightSetupStyles(nativeCSS.replaceAll(result.edits[0]!.before, '.missing-setup-utility'), originalRecipes)).toThrow();
});

it('preserves chip getter, coercion and failure chronology with exact expected-only utility removal', () => {
  function witness(api: Api) {
    const trace: string[] = [];
    const chip = {
      get kind() { trace.push('kind'); return 'skin'; },
      get accent() { trace.push('accent'); return {toString() {trace.push('accent:coerce'); return 'warm';}}; },
      get tier() { trace.push('tier'); return {toString() {trace.push('tier:coerce'); return '0';}}; },
    };
    return {result: api.setupChipClasses(chip), trace};
  }
  const old = witness(native.api);
  const actual = witness(current.api);
  expect(actual.trace).toEqual(old.trace);
  expect(actual.result).toBe(recipeExpected(old.result,
    ['light-setup-chip', 'light-setup-chip-skin', 'light-setup-chip-home-warm']));
  for (const api of [native.api, current.api]) {
    const trace: string[] = [];
    expect(() => api.setupChipClasses({get kind() {trace.push('kind'); throw new Error('original kind fault');},
      get accent() {trace.push('accent'); return 'warm';}})).toThrow('original kind fault');
    expect(trace).toEqual(['kind']);
  }
});

it('qualifies decoded runtime syntax, including escaped literals, rather than raw source substrings', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'getbased-light-setup-source-proof-'));
  fs.mkdirSync(path.join(root, 'js'));
  const source = path.join(root, 'js', 'consumer.ts');
  try {
    fs.writeFileSync(source, "export const hook = 'ctx-label';");
    await assertNoLightSetupAtomicConsumers(root);
    for (const value of ["export const value = 'gb:light-setup:block';",
      "export const value = '\\u0067b:light-setup:block';",
      "export const value = `gb:light-setup:${'block'}`;"]) {
      fs.writeFileSync(source, value);
      await expect(assertNoLightSetupAtomicConsumers(root)).rejects.toThrow('atomic runtime consumers');
    }
    fs.unlinkSync(source);
    fs.writeFileSync(path.join(root, 'js', 'Consumer.svelte'), '<div class="gb:light-setup:block"></div>');
    await expect(assertNoLightSetupAtomicConsumers(root)).rejects.toThrow('atomic runtime consumers');
  } finally { fs.rmSync(root, {recursive: true, force: true}); }
});

// These integrations each start the real Tailwind CLI and qualify every
// authored runtime TS/Svelte consumer. Hosted runs take 5-7s under coverage;
// bound compilation separately from unchanged CSS and shipping budgets.
const LIGHT_SETUP_INTEGRATION_TIMEOUT_MS = 30_000;
it('connects the genuine production style builder to this exact ordered owned recipe stylesheet', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'getbased-light-setup-built-proof-'));
  const outputPath = path.join(directory, 'light-setup.css');
  try {
    await buildLightSetupStyles({outputPath});
    const actual = fs.readFileSync(outputPath, 'utf8');
    const original = factorLightSetupStyles(nativeCSS, originalRecipes);
    expect(digest(original.css)).toBe(pins.semanticCSSExpectedSHA256);
    const expected = withExpectedGlassCaption(original.css, glassCaptionRecipeRule);
    expect(actual).toBe(expected);
    expect(actual).toBe(factorLightSetupStyles(accessibleNativeCSS, lightSetupUtilityRecipes).css);
  } finally {fs.rmSync(directory, {recursive: true, force: true});}
}, LIGHT_SETUP_INTEGRATION_TIMEOUT_MS);

for (const stale of [false, true]) it(`checks the complete independent Light setup recipe output (${stale ? 'stale' : 'current'})`, async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'getbased-light-setup-recipe-check-'));
  const outputPath = path.join(directory, 'light-setup.css');
  try {
    const original = factorLightSetupStyles(nativeCSS, originalRecipes);
    expect(digest(original.css)).toBe(pins.semanticCSSExpectedSHA256);
    const expected = withExpectedGlassCaption(original.css, glassCaptionRecipeRule) + (stale ? '/* stale */' : '');
    fs.writeFileSync(outputPath, expected);
    if (stale) await expect(buildLightSetupStyles({outputPath, check: true})).rejects.toThrow('Light setup CSS is stale');
    else await buildLightSetupStyles({outputPath, check: true});
    expect(fs.readFileSync(outputPath, 'utf8')).toBe(expected);
  } finally {fs.rmSync(directory, {recursive: true, force: true});}
}, LIGHT_SETUP_INTEGRATION_TIMEOUT_MS);
