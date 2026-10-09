import fs from 'node:fs';
import type {Page} from '@playwright/test';
import {expect, test} from './coverage-fixture.js';
import {installDiscussionFixture} from '../helpers/chat-discussion-fixture.js';
import {scopedFrozenStyles} from '../helpers/frozen-style-scope.js';
import {prepareDemoProfile} from './biology-score-fixture.js';
import {createDefaultProfileData} from '../../js/profile.js';
import type {BiologyContextReviewInput} from '../../js/biology-context-presentation.js';
import type {getBiologyProfileContext} from '../../js/profile-context.js';

const original = JSON.parse(fs.readFileSync('tests/fixtures/biology-context-original.json', 'utf8')) as {
  classes: string[];
  samples: {sex: string | null; name: string; input: BiologyContextReviewInput; profileContext: ReturnType<typeof getBiologyProfileContext>; section: string}[];
  styleBlocks: {selector: string; declarations: string; atRules: {name: string; params: string}[]}[];
};
const samples = original.samples.filter(sample => sample.sex === 'male'
  ? ['none', 'current', 'stale', 'suggestions', 'active', 'escaped', 'legacy-values'].includes(sample.name)
  : sample.sex === 'female' ? ['none', 'manual', 'suggestions'].includes(sample.name) : sample.name === 'filtered')
  .map(sample => ({...sample, section: sample.section.replace(/class="@(\d+)"/g, (_, index: string) => `class="${original.classes[Number(index)]}"`)}));
const frozenCSS = original.styleBlocks.map(block => {
  let rule = scopedFrozenStyles([{selector: block.selector, declarations: block.declarations, media: null}]);
  for (const wrapper of [...block.atRules].reverse()) rule = `@${wrapper.name} ${wrapper.params}{${rule}}`;
  return rule;
}).join('\n');

test('authored Biology context preserves frozen section geometry themes and keyboard focus', async ({page}, info) => {
  test.setTimeout(180000); await installDiscussionFixture(page.context()); await prepareDemoProfile(page);
  await page.evaluate(async () => (await import('/js/views.js')).navigate('biology-scores'));
  await expect(page.locator('[data-biology-context-view].biology-context-review-details')).toBeVisible();
  await page.emulateMedia({reducedMotion: 'reduce'});
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.evaluate(async ({samples, css}) => {
    const {renderHTML} = await import('/js/components/BiologyContextPresentation.svelte.html.js');
    const {projectBiologyContextReview, projectBiologyContextLabels} = await import('/js/biology-context-presentation.js');
    const style = document.createElement('style'); style.textContent = css; document.head.append(style);
    const host = document.createElement('div'); host.id = 'biology-context-acceptance';
    host.style.cssText = 'position:fixed;inset:0;z-index:20000;overflow:auto;background:var(--bg-primary);padding:12px';
    document.body.append(host);
    for (const sample of samples) {
      const current = renderHTML({kind: 'section', view: {review: projectBiologyContextReview(sample.input), labels: projectBiologyContextLabels(sample.profileContext)}});
      const pair = document.createElement('div'); pair.dataset.pair = `${sample.sex}-${sample.name}`;
      for (const [key, html] of [['original', sample.section], ['current', current]]) {
        const side = document.createElement('section'); side.dataset[key!] = '';
        const context = document.createElement('div'); context.className = 'biology-scores-page'; context.innerHTML = html!;
        side.append(context); pair.append(side);
      }
      host.append(pair);
    }
  }, {samples, css: frozenCSS});
  const host = page.locator('#biology-context-acceptance'); let pairs = 0;
  for (const width of [320, 390, 600, 650, 651, 900, 1200]) for (const theme of ['dark', 'light', 'glass', 'synth-sunrise', 'neuromancer', 'cyberterm']) for (const open of [false, true]) {
    await page.setViewportSize({width, height: 1000}); await page.mouse.move(0, 0);
    await page.evaluate(async ({theme, open}) => {
      (await import('/js/theme.js')).setTheme(theme);
      document.querySelectorAll('#biology-context-acceptance details').forEach(node => node.toggleAttribute('open', open));
    }, {theme, open});
    await expect.poll(() => host.evaluate(element => {
      const properties = ['display','position','width','height','fontSize','fontWeight','fontFamily','lineHeight','letterSpacing','paddingTop','paddingRight','paddingBottom','paddingLeft','marginTop','marginRight','marginBottom','marginLeft','gap','gridTemplateColumns','gridTemplateRows','alignItems','justifyContent','borderTopWidth','borderTopColor','borderRadius','whiteSpace','overflow','backgroundColor','backgroundImage','color','outlineWidth','outlineColor','outlineOffset'] as const;
      const failures: string[] = [];
      for (const pair of element.querySelectorAll('[data-pair]')) {
        const before = [...pair.querySelector('[data-original]')!.querySelectorAll('*')];
        const after = [...pair.querySelector('[data-current]')!.querySelectorAll('*')];
        if (before.length !== after.length) {failures.push(`${pair.getAttribute('data-pair')}: ${before.length}/${after.length}`); continue;}
        before.forEach((node, index) => {
          const a = getComputedStyle(node), b = getComputedStyle(after[index]!);
          for (const property of properties) if (a[property] !== b[property]) failures.push(`${pair.getAttribute('data-pair')}/${node.tagName}.${node.classList[0]}/${property}: ${b[property]} != ${a[property]}`);
        });
      }
      return failures;
    }), {message: `${width}/${theme}/${open ? 'open' : 'closed'} frozen context palette and geometry`}).toEqual([]);
    pairs += samples.length;
  }
  await host.locator('[data-original]').evaluateAll(nodes => nodes.forEach(node => node.remove()));
  await host.locator('details').evaluateAll(nodes => nodes.forEach(node => node.setAttribute('open', '')));
  await page.keyboard.press('Tab'); let controls = 0;
  for (const control of await host.locator('[data-current] input,[data-current] button,[data-current] summary').all()) {
    await control.focus(); await expect(control).toBeFocused();
    expect(await control.evaluate(node => parseFloat(getComputedStyle(node).outlineWidth))).toBeGreaterThanOrEqual(2); controls++;
  }
  expect(errors).toEqual([]);
  fs.writeFileSync(info.outputPath('biology-context-parity.json'), JSON.stringify({pairs, controls, widths: [320,390,600,650,651,900,1200], themes: 6, states: ['closed','open'], pageErrors: errors}));
});

interface StoredProfile {
  diagnoses?: {conditions?: unknown[]; familyHistory?: unknown[]; note?: string; flags?: Record<string, boolean>};
  biologyScoreContextAI?: {summary?: string; suggestions?: {flag: string}[]; dismissed?: string[]};
  [key: string]: unknown;
}
async function storedProfile(page: Page): Promise<StoredProfile> {
  return page.evaluate(async () => {
    const [{state}, store, profile] = await Promise.all([import('/js/state.js'), import('/js/crypto.js'), import('/js/profile.js')]);
    const raw = await store.encryptedGetItem(profile.profileStorageKey(state.currentProfile, 'imported'));
    if (!raw) throw new Error('Missing committed Biology profile');
    return JSON.parse(raw) as StoredProfile;
  });
}
async function openContext(page: Page) {
  const section = page.locator('.biology-context-review-details[data-biology-context-view]');
  if (await section.getAttribute('open') === null) {await section.locator(':scope > summary').focus(); await page.keyboard.press('Enter');}
  await expect(section).toHaveAttribute('open', ''); return section;
}
test('authored context delegates recover a failed IndexedDB flag write and persist keyboard apply dismiss and reload', async ({page}) => {
  test.setTimeout(60000); await installDiscussionFixture(page.context());
  await page.context().addInitScript(({defaults, demo}) => {
    if (!['http:', 'https:'].includes(location.protocol) || localStorage.getItem('biology-context-write-seeded')) return;
    localStorage.setItem('biology-context-write-seeded', '1');
    localStorage.setItem('labcharts-ai-paused', 'true');
    localStorage.setItem('labcharts-profiles', JSON.stringify([{id: 'default', name: 'Alex', sex: 'male', dob: '1987-11-22', createdAt: 1}]));
    localStorage.setItem('labcharts-active-profile', 'default');
    for (const key of ['tour', 'emptyTour']) localStorage.setItem(`labcharts-default-${key}`, 'completed');
    // Seed lab records through normal boot instead of installing obsolete demo
    // device sessions that trigger unrelated asynchronous recalculation writes.
    localStorage.setItem('labcharts-default-imported', JSON.stringify({...defaults, entries: demo.entries, refOverrides: demo.refOverrides,
      profile: {firstName: 'Alex', age: 38}, markerNotes: {'thyroid.tsh': 'Preserve unrelated note'}, contextNotes: 'Preserve unrelated context'}));
  }, {defaults: createDefaultProfileData(), demo: JSON.parse(fs.readFileSync('data/demo-male.json', 'utf8')) as Record<string, unknown>});
  await prepareDemoProfile(page);
  await page.evaluate(async () => {
    const [{state}, data, views] = await Promise.all([import('/js/state.js'), import('/js/data.js'), import('/js/views.js')]);
    state.importedData!.diagnoses = {conditions: [], familyHistory: [], note: 'Keep diagnosis note', flags: {}};
    state.importedData!.biologyScoreContextAI = {...state.importedData!.biologyScoreContextAI, summary: 'Stored context review.', suggestions: [
      {flag: 'lowMuscleMass', confidence: 'high', reason: 'Stored literal <evidence>.'},
      {flag: 'hormoneTherapy', confidence: 'medium', reason: 'Keep profile context.'},
      {flag: 'acuteIllnessNearDraw', confidence: 'low', reason: 'Keep remaining suggestion.'},
    ]};
    if (!await data.saveImportedData()) throw new Error('Could not seed committed context');
    data.invalidateActiveDataCache(); views.navigate('biology-scores');
  });
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put; let attempts = 0;
    IDBObjectStore.prototype.put = function(value, key) {
      if (String(key).endsWith('-imported')) {
        Reflect.set(window, 'biologyContextWriteAttempts', ++attempts);
        if (attempts === 1) throw new DOMException('Synthetic context storage quota', 'QuotaExceededError');
      }
      return put.call(this, value, key);
    };
  });
  const before = await storedProfile(page); let section = await openContext(page);
  let manual = section.locator('[data-biology-context-flag="intenseTrainingRecent"]');
  await manual.focus(); await page.keyboard.press('Space');
  await expect.poll(() => page.evaluate(() => Reflect.get(window, 'biologyContextWriteAttempts'))).toBe(1);
  await expect(manual).toBeEnabled(); await expect(manual).not.toBeChecked();
  expect(await storedProfile(page)).toEqual(before);
  expect(await page.evaluate(async () => (await import('/js/state.js')).state.importedData)).toEqual(before);
  await manual.focus(); await page.keyboard.press('Space');
  await expect.poll(async () => (await storedProfile(page)).diagnoses?.flags?.intenseTrainingRecent).toBe(true);
  section = await openContext(page);
  const apply = section.locator('[data-biology-score-action="apply-context-ai"][data-context-flag="lowMuscleMass"]');
  await apply.focus(); await page.keyboard.press('Enter');
  await expect.poll(async () => (await storedProfile(page)).diagnoses?.flags?.lowMuscleMass).toBe(true);
  section = await openContext(page);
  const dismiss = section.locator('[data-biology-score-action="dismiss-context-ai"][data-context-flag="hormoneTherapy"]');
  await dismiss.focus(); await page.keyboard.press('Enter');
  await expect.poll(async () => (await storedProfile(page)).biologyScoreContextAI?.dismissed).toEqual(['hormoneTherapy']);
  const saved = await storedProfile(page);
  expect(saved.diagnoses).toEqual({...before.diagnoses, flags: {intenseTrainingRecent: true, lowMuscleMass: true}});
  expect(saved.biologyScoreContextAI?.suggestions?.map(item => item.flag)).toEqual(['acuteIllnessNearDraw']);
  expect(saved.biologyScoreContextAI?.summary).toBe('Stored context review.');
  const unrelated = ({diagnoses: _flags, biologyScoreContextAI: _review, ...rest}: StoredProfile) => rest;
  expect(unrelated(saved)).toEqual(unrelated(before));
  await page.reload(); await page.locator('html[data-app-ready]').waitFor({state: 'attached'});
  await page.evaluate(async () => (await import('/js/views.js')).navigate('biology-scores'));
  section = await openContext(page);
  await expect(section.locator('[data-biology-context-flag="lowMuscleMass"]')).toBeChecked();
  await expect(section.locator('[data-biology-context-flag="intenseTrainingRecent"]')).toBeChecked();
  await expect(section.locator('[data-context-flag="hormoneTherapy"]')).toHaveCount(0);
  expect(await storedProfile(page)).toEqual(saved);
});
