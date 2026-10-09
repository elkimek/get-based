import fs from 'node:fs';
import {expect, test} from './coverage-fixture.js';
import {installDiscussionFixture} from '../helpers/chat-discussion-fixture.js';
import {scopedFrozenStyles} from '../helpers/frozen-style-scope.js';
import {prepareDemoProfile} from './biology-score-fixture.js';
import type {BiologyCompatibilityScore} from '../../js/biology-summary-presentation.js';
import type {getBiologyProfileContext} from '../../js/profile-context.js';
interface Sample {kind: 'widget' | 'lens'; name: string; records: (BiologyCompatibilityScore & {nonFiniteScore?: boolean})[]; profileContext: ReturnType<typeof getBiologyProfileContext>; html: string}
const original = JSON.parse(fs.readFileSync('tests/fixtures/biology-summary-original.json', 'utf8')) as {
  classes: string[]; samples: Sample[]; styleBlocks: {selector: string; declarations: string; atRules: {name: string; params: string}[]}[];
};
const samples = original.samples.filter(sample => sample.kind === 'widget'
  ? ['zero','partial','directional','stale','snapshot','escaped','waiting','empty'].includes(sample.name) : ['empty','zero','escaped'].includes(sample.name))
  .map(sample => ({...sample, html: sample.html.replace(/class="@(\d+)"/g, (_, index: string) => `class="${original.classes[Number(index)]}"`)}));
// Scope without increasing native selector specificity: composed children already
// use scoped Tailwind rules, which must keep their original cascade precedence.
const frozenCSS = original.styleBlocks.map(block => {
  let rule = scopedFrozenStyles([{selector: block.selector, declarations: block.declarations, media: null}]).replaceAll('[data-original]', ':where([data-original])');
  for (const wrapper of [...block.atRules].reverse()) rule = `@${wrapper.name} ${wrapper.params}{${rule}}`;
  return rule;
}).join('\n');

test('authored Biology summary and compatibility lens preserve frozen geometry themes and independent keyboard controls', async ({page}, info) => {
  test.setTimeout(240000); await installDiscussionFixture(page.context()); await prepareDemoProfile(page);
  await page.evaluate(async () => (await import('/js/views.js')).navigate('biology-scores'));
  await page.emulateMedia({reducedMotion: 'reduce'});
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.evaluate(async ({samples, css}) => {
    const {renderHTML} = await import('/js/components/BiologySummaryPresentation.svelte.html.js');
    const {projectBiologySummaryWidget, projectBiologyCompatibilityLens} = await import('/js/biology-summary-presentation.js');
    const {projectBiologyContextLabels} = await import('/js/biology-context-presentation.js');
    const style = document.createElement('style'); style.textContent = css; document.head.append(style);
    const host = document.createElement('div'); host.id = 'biology-summary-acceptance';
    host.style.cssText = 'position:fixed;inset:0;z-index:20000;overflow:auto;background:var(--bg-primary);padding:12px'; document.body.append(host);
    for (const sample of samples) {
      const records = sample.records.map(record => ({...record, score: record.nonFiniteScore ? {...record.score, score: NaN} : record.score}));
      const current = sample.kind === 'widget' ? renderHTML({kind: 'widget', view: projectBiologySummaryWidget(records.map(record => record.score))})
        : renderHTML({kind: 'lens', view: projectBiologyCompatibilityLens(records, projectBiologyContextLabels(sample.profileContext))});
      const pair = document.createElement('div'); pair.dataset.pair = `${sample.kind}-${sample.name}`;
      for (const [key, html] of [['original', sample.html], ['current', current]]) {
        const side = document.createElement('section'); side.dataset[key!] = '';
        const body = document.createElement('div'); body.innerHTML = html!; side.append(body); pair.append(side);
      }
      host.append(pair);
    }
  }, {samples, css: frozenCSS});
  const host = page.locator('#biology-summary-acceptance'); let pairs = 0;
  const widths = [320,560,561,600,601,900,901,1200];
  for (const width of widths) for (const theme of ['dark','light','glass','synth-sunrise','neuromancer','cyberterm']) for (const open of [false,true]) {
    await page.setViewportSize({width, height: 1000}); await page.mouse.move(0, 0);
    await page.evaluate(async ({theme, open}) => {
      (await import('/js/theme.js')).setTheme(theme);
      document.querySelectorAll('#biology-summary-acceptance details').forEach(node => node.toggleAttribute('open', open));
    }, {theme, open});
    await expect.poll(() => host.evaluate(element => {
      const properties = ['display','position','width','height','fontSize','fontWeight','fontFamily','fontStyle','lineHeight','letterSpacing','paddingTop','paddingRight','paddingBottom','paddingLeft','marginTop','marginRight','marginBottom','marginLeft','gap','gridTemplateColumns','gridTemplateRows','alignItems','alignContent','justifyContent','borderTopWidth','borderTopStyle','borderTopColor','borderLeftWidth','borderLeftColor','borderRadius','whiteSpace','overflow','opacity','backgroundColor','backgroundImage','color','outlineWidth','outlineColor','outlineOffset','transform'] as const;
      const failures: string[] = [];
      // The new native title button adds a control box without changing the h4.
      const nodes = (side: Element) => [...side.querySelectorAll('*')].filter(node => !node.matches('button.biology-summary-jump'));
      for (const pair of element.querySelectorAll('[data-pair]')) {
        const before = nodes(pair.querySelector('[data-original]')!), after = nodes(pair.querySelector('[data-current]')!);
        if (before.length !== after.length) {failures.push(`${pair.getAttribute('data-pair')}: ${before.length}/${after.length}`); continue;}
        before.forEach((node, index) => {
          const a = getComputedStyle(node), b = getComputedStyle(after[index]!);
          for (const property of properties) if (a[property] !== b[property]) failures.push(`${pair.getAttribute('data-pair')}/${node.tagName}.${node.classList[0]}/${property}: ${b[property]} != ${a[property]}`);
          if (node.matches('.biology-score-token')) for (const property of ['content','color','marginRight'] as const) {
            const a = getComputedStyle(node, '::before'), b = getComputedStyle(after[index]!, '::before');
            if (a[property] !== b[property]) failures.push(`${pair.getAttribute('data-pair')}/token::before/${property}: ${b[property]} != ${a[property]}`);
          }
        });
      }
      return failures;
    }), {message: `${width}/${theme}/${open ? 'open' : 'closed'} frozen summary palette and geometry`}).toEqual([]);
    pairs += samples.length;
  }
  await host.locator('[data-original]').evaluateAll(nodes => nodes.forEach(node => node.remove()));
  await page.keyboard.press('Tab'); let controls = 0;
  for (const button of await host.locator('.biology-summary-jump,button.biology-summary-marker').all()) {
    await button.focus(); await expect(button).toBeFocused();
    expect(await button.evaluate(node => parseFloat(getComputedStyle(node).outlineWidth))).toBeGreaterThanOrEqual(2); controls++;
  }
  await expect(host.locator('.biology-score-card[role="button"],.biology-score-card[tabindex],[role="button"] button')).toHaveCount(0);
  expect(errors).toEqual([]);
  fs.writeFileSync(info.outputPath('biology-summary-parity.json'), JSON.stringify({pairs, controls, widths, themes: 6, states: ['closed','open'], pageErrors: errors}));
});

test('summary marker keyboard actions stay independent from card navigation through the real delegates', async ({page}) => {
  await installDiscussionFixture(page.context()); await prepareDemoProfile(page);
  async function mountWidget() {
    await page.evaluate(async () => {
      const [biology, data, {state}] = await Promise.all([import('/js/biology-scores.js'), import('/js/data.js'), import('/js/state.js')]);
      state.currentView = 'dashboard';
      document.getElementById('main-content')!.innerHTML = biology.renderBiologyScoresWidget({data: data.getActiveData()});
    });
  }
  await mountWidget();
  const marker = page.locator('button.biology-summary-marker').filter({hasText: /Glucose/i}).first();
  const markerId = await marker.getAttribute('data-biology-marker-id'); expect(markerId).toBeTruthy();
  await marker.focus(); await page.keyboard.press('Enter');
  await expect(page.locator('#modal-overlay')).toBeVisible();
  expect(await page.evaluate(async () => (await import('/js/state.js')).state.currentView)).toBe('dashboard');
  await page.keyboard.press('Escape'); await expect(page.locator('#modal-overlay')).not.toBeVisible();
  const title = page.locator('.biology-summary-jump[data-biology-score-id="metabolicFlexibility"]');
  await title.focus(); await page.keyboard.press('Enter');
  await expect(page.locator('#biology-score-metabolicFlexibility')).toBeVisible();
  expect(await page.evaluate(async () => (await import('/js/state.js')).state.currentView)).toBe('biology-scores');
  await mountWidget();
  await page.locator('.biology-score-card[data-biology-score-id="metabolicFlexibility"] .biology-score-summary').click();
  await expect(page.locator('#biology-score-metabolicFlexibility')).toBeVisible();
});
