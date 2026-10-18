import fs from 'node:fs';
import postcss from 'postcss';
import {expect, test} from './coverage-fixture.js';
import {installDiscussionFixture} from '../helpers/chat-discussion-fixture.js';
import {prepareDemoProfile} from './biology-score-fixture.js';
import type * as Shell from '../../js/lens-page-shell.js';
type Sample = {name: string; available: string[]; hidden: string[]; order: string[]; html: string} & (
  | {method: 'header'; args: Parameters<typeof Shell.renderLensHeader>}
  | {method: 'widget'; args: Parameters<typeof Shell.renderLensWidget>}
  | {method: 'grid'; args: Parameters<typeof Shell.renderLensPageWidgets>});
const original = JSON.parse(fs.readFileSync('tests/fixtures/lens-shell-original.json', 'utf8')) as {samples: Sample[]; styleBlocks: string[]};
let headerCSS = '';
postcss.parse(original.styleBlocks.join('\n')).walkRules(rule => {
  if (rule.selector === '.lens-page-header .dashboard-widget-inline-controls') headerCSS += `:where([data-original]) ${rule.toString()}`;
});
test('shared lens chrome preserves frozen geometry and themes with independently focusable tools', async ({page}, info) => {
  test.setTimeout(180000); await installDiscussionFixture(page.context()); await prepareDemoProfile(page);
  // Real lens navigation loads category/header CSS before rendering the shell.
  await page.evaluate(async () => (await import('/js/views.js')).navigate('biology-scores'));
  await page.emulateMedia({reducedMotion: 'reduce'});
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.evaluate(async ({samples, css}) => {
    const shell = await import('/js/lens-page-shell.js');
    const fixtureShell=await import('/tests/helpers/lens-chrome-fixture.js');
    const {state} = await import('/js/state.js'); const {profileStorageKey} = await import('/js/profile.js');
    const prior = shell.configureLensPageShell(); state.currentProfile = 'lens-shell-fixture';
    const style = document.createElement('style'); style.textContent = css; document.head.append(style);
    const host = document.createElement('div'); host.id = 'lens-shell-acceptance';
    host.style.cssText = 'position:fixed;inset:0;z-index:20000;overflow:auto;background:var(--bg-primary);padding:12px'; document.body.append(host);
    for (const sample of samples) {
      const key = profileStorageKey('lens-shell-fixture', 'lensPageOrder-biology-scores-baseline-v1');
      localStorage.removeItem(key); if (sample.order.length) localStorage.setItem(key, JSON.stringify(sample.order));
      shell.configureLensPageShell({getAvailableDashboardFixedWidgetIds: () => sample.available, getDashboardWidgetPrefs: () => ({hidden: sample.hidden})});
      const html = sample.method === 'header' ? fixtureShell.renderLensHeaderChromeFixture(...sample.args)
        : sample.method === 'widget' ? fixtureShell.renderLensWidgetChromeFixture(...sample.args) : fixtureShell.renderLensPageWidgetsChromeFixture(...sample.args);
      const pair = document.createElement('div'); pair.dataset.pair = `${sample.method}-${sample.name}`;
      for (const [kind, markup] of [['original',sample.html],['current',html]]) {
        const side = document.createElement('section'); side.dataset[kind!] = ''; side.innerHTML = markup!; pair.append(side);
      }
      host.append(pair);
    }
    shell.configureLensPageShell(prior);
  }, {samples: original.samples, css: headerCSS});
  const host = page.locator('#lens-shell-acceptance'); let pairs = 0;
  const widths = [320,640,641,650,900,1100,1101,1400];
  for (const width of widths) for (const theme of ['dark','light','glass','synth-sunrise','neuromancer','cyberterm']) {
    await page.setViewportSize({width, height: 1000}); await page.mouse.move(0,0);
    await page.evaluate(async theme => (await import('/js/theme.js')).setTheme(theme), theme);
    await expect.poll(() => host.evaluate(element => {
      const properties = ['display','position','width','height','fontSize','fontWeight','fontFamily','fontStyle','lineHeight','letterSpacing','paddingTop','paddingRight','paddingBottom','paddingLeft','marginTop','marginRight','marginBottom','marginLeft','gap','gridColumn','gridTemplateColumns','gridTemplateRows','gridAutoFlow','alignItems','justifyContent','borderTopWidth','borderTopStyle','borderTopColor','borderRadius','backgroundColor','boxShadow','color','overflow','whiteSpace','opacity','cursor'] as const;
      const failures: string[] = [];
      for (const pair of element.querySelectorAll('[data-pair]')) {
        const before = [...pair.querySelector('[data-original]')!.querySelectorAll('*')], after = [...pair.querySelector('[data-current]')!.querySelectorAll('*')];
        if (before.length !== after.length) {failures.push(`${pair.getAttribute('data-pair')}: ${before.length}/${after.length}`); continue;}
        before.forEach((node,index) => {
          const a = getComputedStyle(node), b = getComputedStyle(after[index]!);
          for (const property of properties) if (a[property] !== b[property]) failures.push(`${pair.getAttribute('data-pair')}/${node.tagName}/${property}: ${b[property]} != ${a[property]}`);
        });
      }
      return failures;
    }), {message: `${width}/${theme} shared lens frozen geometry`}).toEqual([]);
    pairs += original.samples.length;
  }
  await host.locator('[data-original]').evaluateAll(nodes => nodes.forEach(node => node.remove()));
  await page.keyboard.press('Tab'); let controls = 0;
  for (const button of await host.locator('[data-current] .dashboard-widget-tool:not(:disabled)').all()) {
    await button.focus(); await expect(button).toBeFocused();
    expect(await button.evaluate(node => parseFloat(getComputedStyle(node).outlineWidth))).toBeGreaterThanOrEqual(2); controls++;
  }
  expect(errors).toEqual([]);
  fs.writeFileSync(info.outputPath('lens-shell-parity.json'), JSON.stringify({pairs,controls,widths,themes:6,pageErrors:errors}));
});
