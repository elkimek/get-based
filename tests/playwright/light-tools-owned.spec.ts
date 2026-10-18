import fs from 'node:fs';
import { expect, test } from './coverage-fixture.js';
import { installDiscussionFixture } from '../helpers/chat-discussion-fixture.js';
import { scopedFrozenStyles, type FrozenStyleBlock } from '../helpers/frozen-style-scope.js';
import { projectGoldenHourLog } from '../../js/light-tools-presentation.js';
import { classifyDayWindow } from '../../js/light-tools-solar-time.js';
const original = JSON.parse(fs.readFileSync('tests/fixtures/light-tools-original.json', 'utf8')) as {
  launchers: {name: string; now: number; data: {lightMeasurements: {capturedAt?: unknown}[]; lightEnvironment: {rooms?: unknown}}; html: string}[];
  golden: {name: string; now: number; coords: {lat: number; lon: number} | null; html: string}[];
  walkthrough: string; walkthroughStates: {kind: string; html: string}[]; styleBlocks: FrozenStyleBlock[];
};
const launchers = original.launchers.filter(sample => ['empty', 'one-recent', 'old-readings'].includes(sample.name));
// Native solar receipts use Prague local hours; isolate that input from the runner timezone.
function goldenViews() {
  const prior = process.env.TZ;
  try {
    process.env.TZ = 'Europe/Prague';
    expect(new Date('2026-08-07T12:00:00Z').getHours()).toBe(14);
    return original.golden.filter(sample => ['unknown-12', 'solar-06', 'solar-12'].includes(sample.name)).map(sample => ({...sample,
      view: projectGoldenHourLog(classifyDayWindow(sample.coords, new Date(sample.now), date => date.getHours() >= 6 && date.getHours() < 18 ? 70 : 110)),
    }));
  } finally {if(prior === undefined)delete process.env.TZ;else process.env.TZ = prior;}
}

test('authored light tool launchers and logs preserve frozen layouts and native controls', async ({page}, info) => {
  test.setTimeout(120000);
  await installDiscussionFixture(page.context()); await page.goto('/app');
  await expect(page.locator('html[data-app-ready]')).toBeAttached(); await page.emulateMedia({reducedMotion: 'reduce'});
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.evaluate(async ({launchers, golden, walkthrough, states, css}) => {
    localStorage.setItem('labcharts-ai-paused', 'true');
    await (await import('/js/light-sun-loader.js')).loadLightSunUI();
    const {renderHTML} = await import('/js/components/LightToolPresentation.svelte.html.js');
    const {projectLightTools, projectAuditPauseRows} = await import('/js/light-tools-presentation.js');
    const {getAimingGuideView} = await import('/js/light-tool-camera.js');
    const style = document.createElement('style');
    // Explicit improvements: shrinkable room labels and 44px coarse controls.
    style.textContent = css + '[data-original] .audit-room-label-input{min-width:0}' + '@media(pointer:coarse){[data-original] .light-tools-group-head,[data-original] .modal-close,[data-original] .import-btn,[data-original] #sunrise-duration,[data-original] .audit-room-label-input{min-height:44px;min-width:44px}}'; document.head.append(style);
    const host = document.createElement('div'); host.id = 'light-tools-acceptance';
    host.style.cssText = 'position:fixed;inset:0;z-index:20000;overflow:auto;background:var(--bg-primary);padding:12px'; document.body.append(host);
    const pair = (name: string, oldHTML: string, newHTML: string, widget = false) => {
      const element = document.createElement('div'); element.dataset.pair = name;
      for (const [kind, html] of [['original', oldHTML], ['current', newHTML]]) {
        const section = document.createElement('section'); section.dataset[kind!] = '';
        section.innerHTML = widget ? `<div class="light-page"><article class="dashboard-widget" data-widget-id="light-tools"><div class="dashboard-widget-body">${html}</div></article></div>` : html!;
        // Use the real shown overlay state: a bare modal retains its hidden
        // scale(.96) animation state and cannot prove visible touch geometry.
        if (section.querySelector('.modal')) {
          section.className = 'modal-overlay light-tool-overlay show';
          section.style.cssText = 'position:static;display:block;padding:0;background:none;backdrop-filter:none;-webkit-backdrop-filter:none;cursor:default';
        }
        element.append(section);
      }
      host.append(element); return element;
    };
    for (const sample of launchers) {
      const html = renderHTML({kind: 'launcher', view: projectLightTools(sample.data.lightMeasurements, sample.data.lightEnvironment, sample.now)});
      pair(sample.name, sample.html, html); if (sample.name === 'empty') pair('widget', sample.html, html, true);
    }
    for (const sample of golden) pair(sample.name, sample.html, renderHTML({kind: 'golden', view: sample.view}));
    const auditHTML = renderHTML({kind: 'audit', guide: getAimingGuideView('audit')});
    pair('walkthrough', walkthrough, auditHTML);
    for (const state of states) {
      const element = pair(`walkthrough-${state.kind}`, walkthrough, auditHTML);
      if (state.kind === 'rows') {
        element.querySelector('[data-original] #audit-room-list')!.innerHTML = state.html;
        element.querySelector('[data-current] #audit-room-list')!.innerHTML = renderHTML({kind: 'audit-rows', rows: projectAuditPauseRows([{lux: null, levelLabel: 'Medium', label: 'Bedroom "quoted" < &'}, {lux: null, levelLabel: 'Brighter', label: ''}])});
      } else {
        element.querySelector('[data-original] #audit-status')!.innerHTML = state.html;
        element.querySelector('[data-current] #audit-status')!.innerHTML = renderHTML({kind: 'audit-status', state: state.kind as 'manual' | 'auto' | 'denied' | 'no-context'});
      }
    }
    host.querySelectorAll('details').forEach(node => node.open = true);
  }, {launchers, golden: goldenViews(), walkthrough: original.walkthrough, states: original.walkthroughStates, css: scopedFrozenStyles(original.styleBlocks)});
  const host = page.locator('#light-tools-acceptance'); let pairs = 0;
  for (const width of [320, 430, 600, 700, 701, 720, 721, 1100]) for (const theme of ['dark', 'light', 'glass', 'synth-sunrise', 'neuromancer', 'cyberterm']) {
    await page.setViewportSize({width, height: 1000}); await page.mouse.move(0, 0);
    await page.evaluate(async theme => (await import('/js/theme.js')).setTheme(theme), theme);
    await expect.poll(() => host.evaluate(element => {
      const properties = ['display','width','height','fontSize','fontWeight','fontFamily','lineHeight','letterSpacing','paddingTop','paddingRight','paddingBottom','paddingLeft','marginTop','marginRight','marginBottom','marginLeft','gap','gridTemplateColumns','alignItems','borderTopWidth','borderTopStyle','borderTopColor','borderRadius','whiteSpace','overflow','opacity','backgroundColor','backgroundImage','color'] as const;
      const selectors = ['.light-tools-section','.light-section-title','.light-section-hint','.light-tools-status','.light-tools-status span','.light-tools-recommended','.light-tools-recommended-head','.light-tools-recommended-head span','.light-tools-action-grid','.light-tool-action','.light-tool-action-icon','.light-tool-action-copy','.light-tool-action-name','.light-tool-action-desc','.light-tools-drawer','.light-tools-group','.light-tools-group-head','.light-tools-group-time','.light-tools-grid','.light-tool-modal','.modal-header','.modal-header h3','.modal-header h3 span','.modal-close','.modal-body','.modal-body-hint','.modal-body > p:not(.modal-body-hint)','.modal-body > p:not(.modal-body-hint) span','.ctx-label','.ctx-input','.modal-actions','.import-btn','#audit-status','#audit-status span','#audit-room-list','#audit-room-list li','#audit-room-list li > span','.audit-room-label-input','.tool-aiming-guide'];
      const failures: string[] = [];
      for (const pair of element.querySelectorAll('[data-pair]')) for (const selector of selectors) {
        const old = [...pair.querySelector('[data-original]')!.querySelectorAll(selector)], current = [...pair.querySelector('[data-current]')!.querySelectorAll(selector)];
        if (old.length !== current.length) { failures.push(`${pair.getAttribute('data-pair')}/${selector} count ${old.length}/${current.length}`); continue; }
        old.forEach((node, index) => { const a = getComputedStyle(node), b = getComputedStyle(current[index]!);
          for (const property of properties) if (a[property] !== b[property]) failures.push(`${pair.getAttribute('data-pair')}/${selector}/${index}/${property}: ${b[property]} != ${a[property]}`);
        });
      }
      return failures;
    }), {message: `${width}/${theme} frozen tool geometry and palette`}).toEqual([]);
    pairs += await host.locator('[data-pair]').count();
  }
  await host.locator('[data-original]').evaluateAll(elements => elements.forEach(element => element.remove()));
  for (const modal of await host.locator('[data-current] .modal').all()) {
    await expect(modal).toHaveCSS('opacity', '1');
    await expect(modal).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)');
  }
  await page.keyboard.press('Tab'); let controls = 0;
  for (const control of await host.locator('[data-current] button,[data-current] input,[data-current] summary').all()) {
    if (!await control.isVisible()) continue;
    await control.focus(); await expect(control).toBeFocused(); controls++;
    const style = await control.evaluate(node => ({outline: parseFloat(getComputedStyle(node).outlineWidth), width: node.getBoundingClientRect().width, height: node.getBoundingClientRect().height, coarse: matchMedia('(pointer:coarse)').matches}));
    expect(style.outline).toBeGreaterThanOrEqual(2);
    if (style.coarse) { expect(style.width).toBeGreaterThanOrEqual(44); expect(style.height).toBeGreaterThanOrEqual(44); }
  }
  const disclosure = host.locator('[data-pair=empty] summary').first();
  await disclosure.focus(); await page.keyboard.press('Space'); await expect(disclosure.locator('..')).not.toHaveAttribute('open');
  await page.keyboard.press('Enter'); await expect(disclosure.locator('..')).toHaveAttribute('open', '');
  expect(errors).toEqual([]);
  fs.writeFileSync(info.outputPath('light-tools-parity.json'), JSON.stringify({pairs, controls, widths: [320,430,600,700,701,720,721,1100], themes: 6, pageErrors: errors}));
});
