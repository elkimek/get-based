// Every actual HTML byte is compared; the finite class substitution is expected-only.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { gunzipSync } from 'node:zlib';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';
import { expect, it } from 'vitest';
import { renderHTML } from '../js/components/LightSetupPresentation.svelte.html.js';
import { projectLightSetup, type LightSetupPresentationProps } from '../js/light-setup-presentation.js';
import { FITZPATRICK_ROMAN, OTT_QUESTIONS } from '../js/sun-defaults-model.js';
import { setupClasses } from '../js/light-setup-classes.js';

const fixtureRoot = new URL('./fixtures/light-setup-owned/', import.meta.url);
const digest = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const compressed = fs.readFileSync(new URL('light-setup-native-html-original.json.gz', fixtureRoot));
assert.equal(digest(compressed), '17b2bf631e04a8bd61f50ae52c4c8d2a9aff88dc0b08d790cb534c7f02ae03fe');
interface NativeHTMLArchive {
  nativeHelperSHA256: string;
  ownerSourcePins: Record<string, string>;
  fixtures: { id: string; surface: LightSetupPresentationProps['surface']; original: string; originalSHA256: string }[];
}
const archive = JSON.parse(gunzipSync(compressed).toString('utf8')) as NativeHTMLArchive;
const helperText = fs.readFileSync(new URL('light-setup-helper-original.json', fixtureRoot), 'utf8');
assert.equal(digest(helperText), '14f0a87d41b77706ca4c1f03070bd799532fdefec202d68552f117638f65cc38');
const helper = JSON.parse(helperText) as { compiledSource: string };
assert.equal(digest(helper.compiledSource), archive.nativeHelperSHA256);
const nativeStyles = vm.runInNewContext(helper.compiledSource.replaceAll('export function ', 'function ')
  + '\nsetupStyles') as Readonly<Record<string, string>>;
const decoderDocument = new JSDOM('').window.document;
const decoder = decoderDocument.createElement('textarea');
const encountered = new Set<string>();
const encode = (value: string) => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
function expectedOnly(nativeHTML: string): string {
  return nativeHTML.replace(/class="([^"]*)"/g, (attribute: string, value: string) => {
    decoder.innerHTML = value;
    let expected = decoder.value;
    if (!expected.includes('gb:light-setup:')) return attribute;
    for (const [hook, utilities] of Object.entries(nativeStyles)) {
      const full = hook + ' ' + utilities;
      if (!expected.includes(full)) continue;
      encountered.add(hook);
      expected = expected.replaceAll(full, hook + ' gb-ls-' + hook);
    }
    assert.ok(!expected.includes('gb:light-setup:'), 'Reject a partial or reordered native expansion');
    return 'class="' + encode(expected) + '"';
  });
}

type Input = Parameters<typeof projectLightSetup>[0] & { skinIndex?: number };
const base: Input = { defaults: null, savedFitzpatrick: null, legacySkin: null, complete: false,
  coords: null, profileLocation: null, ownerTicket: 'synthetic-owner' };
const cases = new Map<string, { surface: LightSetupPresentationProps['surface']; input: Input }>();
function add(id: string, surface: LightSetupPresentationProps['surface'], input: Partial<Input> = {}) {
  assert.ok(!cases.has(id));
  cases.set(id, {surface, input: {...base, ...input}});
}
add('modal-unset', 'modal');
add('prompt-empty', 'card');
add('prompt-deferred', 'card', {defaults: {setupPromptDismissedAt: 1}});
add('summary-skipped', 'card', {complete: true, defaults: {skipped: true}});
add('summary-unset', 'card', {complete: true, defaults: {}});
for (let score = 0; score <= 10; score++) {
  const defaults = {fitzpatrick: 'III', homeLight: 'led-warm', eyewear: 'sunglasses',
    photosensitiveMeds: score % 2 ? 'moderate' : 'none', ottScore: score,
    ott: Object.fromEntries(OTT_QUESTIONS.map((question, index) => [question.key, index < score]))};
  add('modal-score-' + score, 'modal', {complete: true, savedFitzpatrick: 'III', defaults});
  add('summary-score-' + score, 'card', {complete: true, defaults});
}
for (const fitzpatrick of FITZPATRICK_ROMAN) {
  add('skin-' + fitzpatrick, 'modal', {savedFitzpatrick: fitzpatrick, defaults: {fitzpatrick}});
}
for (const homeLight of ['led-warm', 'led-cool', 'natural-only', 'mixed']) {
  add('home-' + homeLight, 'card', {complete: true, defaults: {homeLight, fitzpatrick: 'III', eyewear: 'none'}});
}
for (const source of ['current-device', 'profile-precise', 'home-postal', 'country-band', 'unknown']) {
  add('location-' + source, 'location', {coords: {lat: 50, lon: 14, source}, profileLocation: {country: 'Czechia'}});
}
for (const complete of [false, true]) add('actions-' + complete, 'actions', {complete});
for (let skinIndex = -1; skinIndex <= 5; skinIndex++) add('label-' + skinIndex, 'skin-label', {skinIndex});
add('modal-saving', 'modal', {savedFitzpatrick: 'III', defaults: {fitzpatrick: 'III'}});
assert.equal(cases.size, 52);
assert.deepEqual([...cases.keys()], archive.fixtures.map(fixture => fixture.id));

it('qualifies all nine untouched authored owners and all 86 native class associations', () => {
  expect(Object.keys(archive.ownerSourcePins)).toHaveLength(9);
  for (const [file, sha256] of Object.entries(archive.ownerSourcePins)) {
    expect(digest(fs.readFileSync(new URL('../' + file, import.meta.url)))).toBe(sha256);
  }
  for (const fixture of archive.fixtures) {
    expect(digest(fixture.original)).toBe(fixture.originalSHA256);
    expectedOnly(fixture.original);
  }
  expect([...encountered].sort()).toEqual(Object.keys(nativeStyles).sort());
});
for (const fixture of archive.fixtures) {
  it(`retains every native HTML byte except the qualified owned recipe classes: ${fixture.id}`, () => {
    const witness = cases.get(fixture.id)!;
    expect(witness.surface).toBe(fixture.surface);
    const view = projectLightSetup(witness.input);
    let actual = renderHTML({surface: witness.surface, view, skinIndex: witness.input.skinIndex ?? view.skinIndex});
    if (witness.surface === 'modal') actual = '<div data-light-setup-presentation class="'
      + encode(setupClasses('modal-overlay light-setup-focus-overlay')) + '">' + actual + '</div>';
    if (witness.surface === 'actions' || witness.surface === 'skin-label') {
      actual = '<section data-light-setup-presentation>' + actual + '</section>';
    }
    expect(actual).toBe(expectedOnly(fixture.original));
  });
}

it('rejects partial and reordered immutable native class expectations', () => {
  const fixture = archive.fixtures.find(row => row.id === 'modal-unset')!;
  const hook = 'light-setup-focus-modal';
  const utilities = nativeStyles[hook]!.split(' ');
  const first = utilities[0]!;
  const partial = fixture.original.replace(first, '');
  assert.notEqual(partial, fixture.original);
  expect(() => expectedOnly(partial)).toThrow('partial or reordered');
  const reordered = fixture.original.replace(encode(utilities.join(' ')), encode(utilities.toReversed().join(' ')));
  assert.notEqual(reordered, fixture.original);
  expect(() => expectedOnly(reordered)).toThrow('partial or reordered');
});
