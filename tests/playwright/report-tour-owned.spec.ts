import fs from 'node:fs';
import postcss from 'postcss';
import type {Page} from '@playwright/test';
import {expect, test} from './coverage-fixture.js';
import {prepareDemoProfile} from './biology-score-fixture.js';
import {installDiscussionFixture} from '../helpers/chat-discussion-fixture.js';

interface ReportInput {
  presetId: string;
  aiAvailable: boolean;
  rangeMode: string;
  categoryOptions: Array<{key: string; label: string; markerCount: number; flaggedCount: number}>;
  contextSections: Array<{title: string}>;
  notes: Array<{date: string; text: string}>;
}
interface TourInput {title: string; text: string; index: number; total: number}
type Sample = {kind: 'report'; name: string; input: ReportInput; html: string}
  | {kind: 'tour'; name: string; input: TourInput; html: string};
interface PairHost extends HTMLElement {pairs: HTMLElement[]}
const frozen = JSON.parse(fs.readFileSync('tests/fixtures/report-tour-original.json', 'utf8')) as {
  samples: Sample[];
  styleBlocks: Array<{css: string; atRules: Array<{name: string; params: string}>}>;
};
const originalCSS = frozen.styleBlocks.map(block => {
  const tree = postcss.parse(block.css);
  tree.walkRules(rule => { rule.selector = rule.selectors.map(selector => `:where([data-original]) ${selector}`).join(','); });
  return block.atRules.reduceRight((css, at) => `@${at.name} ${at.params}{${css}}`, tree.toString());
}).join('\n');
const widths = [320, 480, 481, 720, 721, 1440];
const themes = ['default', 'dark', 'light', 'glass', 'synth-sunrise', 'neuromancer', 'cyberterm'];
const properties = [
  'display', 'position', 'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height',
  'font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing', 'text-transform',
  'color', 'background-color', 'background-image', 'border-top-width', 'border-right-width',
  'border-bottom-width', 'border-left-width', 'border-top-color', 'border-top-style', 'border-radius',
  'padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'margin-top', 'margin-right',
  'margin-bottom', 'margin-left', 'gap', 'grid-template-columns', 'align-items', 'justify-content',
  'flex-direction', 'flex-basis', 'flex-grow', 'flex-shrink', 'flex-wrap', 'overflow-x', 'overflow-y',
  'white-space', 'overflow-wrap', 'text-overflow', 'box-shadow', 'backdrop-filter', 'overscroll-behavior',
  'scrollbar-gutter', 'text-align', 'text-decoration', 'cursor',
];

async function mountPairs(page: Page, samples: Sample[]) {
  await installDiscussionFixture(page.context());
  await prepareDemoProfile(page);
  await page.emulateMedia({reducedMotion: 'reduce'});
  await page.evaluate(async ({samples, css}) => {
    const [report, reportProject, definitions, tour, tourProject, tourStyle] = await Promise.all([
      import('/js/components/ReportBuilderPresentation.svelte.html.js'),
      import('/js/report-builder-presentation.js'),
      import('/js/export-report.js'),
      import('/js/components/TourPresentation.svelte.html.js'),
      import('/js/tour-presentation.js'),
      import('/js/tour-classes.js'),
    ]);
    const style = document.createElement('style');
    style.textContent = css + '\n#report-tour-parity *,#report-tour-parity *::before,#report-tour-parity *::after{transition:none!important;animation:none!important}';
    document.head.append(style);
    const host: PairHost = Object.assign(document.createElement('div'), {pairs: [] as HTMLElement[]});
    host.id = 'report-tour-parity';
    host.style.cssText = 'position:fixed;inset:0;background:var(--bg-primary);z-index:20000';
    document.body.append(host);
    const sectionLabels: Record<string, string> = {
      categories: 'Lab results', genetics: 'Genome', context: 'Personal context',
      nutrition: 'Nutrition and hydration', wearables: 'Body and wearables', light: 'Sun and light sessions',
      environment: 'Environment', notes: 'Timeline notes',
    };
    for (const sample of samples) {
      let current: string;
      if (sample.kind === 'report') {
        const input = sample.input;
        const view = reportProject.projectReportBuilder({
          overlayId: definitions.REPORT_BUILDER_OVERLAY_ID,
          presetId: input.presetId,
          preset: definitions.getReportPreset(input.presetId),
          presets: Object.entries(definitions.REPORT_PRESETS).map(([id, preset]) => ({id, label: preset.label, subtitle: preset.subtitle})),
          dateOptions: definitions.REPORT_DATE_RANGE_OPTIONS,
          rangeOptions: definitions.REPORT_RANGE_MODE_OPTIONS,
          rangeMode: input.rangeMode,
          sections: definitions.REPORT_SECTION_DEFS.filter(section => !['flagged', 'summary', 'trends'].includes(section.id))
            .map(section => ({...section, label: sectionLabels[section.id] || section.label})),
          categories: input.categoryOptions,
          selectedCategoryKeys: input.categoryOptions.map(category => category.key),
          contextTitles: input.contextSections.map(section => section.title),
          notes: input.notes,
          aiAvailable: input.aiAvailable,
        });
        current = report.renderHTML({view});
      } else {
        current = tour.renderHTML(tourProject.projectTourPresentation(sample.input, sample.input.index, sample.input.total));
      }
      const pair = document.createElement('div');
      pair.dataset.name = sample.name;
      pair.dataset.kind = sample.kind;
      pair.style.cssText = 'position:absolute;inset:0';
      for (const [kind, html] of [['original', sample.html], ['current', current]]) {
        const side = document.createElement('section');
        side.dataset[kind!] = '';
        side.style.cssText = 'position:absolute;inset:0';
        // Separate form owners preserve both copies' checked radio defaults.
        const form = document.createElement('form');
        form.style.display = 'contents';
        if (sample.kind === 'report') {
          form.innerHTML = html!;
          form.querySelector('.modal-overlay')!.classList.add('show');
        } else {
          const tooltip = document.createElement('div');
          tooltip.id = 'tour-tooltip';
          if (kind === 'current') tooltip.className = tourStyle.tourClasses('tour-tooltip');
          tooltip.style.cssText = 'left:16px;top:20px';
          tooltip.innerHTML = html!;
          form.append(tooltip);
        }
        side.append(form);
        pair.append(side);
      }
      host.pairs.push(pair);
    }
    await document.fonts.ready;
  }, {samples, css: originalCSS});
}

async function setTheme(page: Page, theme: string) {
  await page.evaluate(async theme => {
    const themes = await import('/js/theme.js');
    // Default is the original absent-attribute state, using the app's dark fallback.
    const requested = theme === 'default' ? 'dark' : theme;
    if (await themes.setTheme(requested) !== true) throw new Error('Requested theme failed to load: ' + theme);
    if (theme === 'default') document.documentElement.removeAttribute('data-theme');
    if (themes.getTheme() !== requested || document.documentElement.getAttribute('data-theme') !== (requested === 'dark' ? null : requested)) throw new Error('Requested theme did not become current: ' + theme);
    await document.fonts.ready;
  }, theme);
}

async function compareAll(page: Page, detailsOpen: boolean, unchecked: boolean) {
  return page.locator('#report-tour-parity').evaluate((element, {properties, detailsOpen, unchecked}) => {
    const host = element as PairHost;
    const problems: string[] = [];
    for (const pair of host.pairs) {
      host.replaceChildren(pair);
      for (const detail of pair.querySelectorAll('details')) detail.open = detailsOpen;
      for (const box of pair.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')) {
        box.checked = unchecked ? false : box.hasAttribute('checked');
      }
      const original = [...pair.querySelector('[data-original]')!.querySelectorAll('*')];
      const current = [...pair.querySelector('[data-current]')!.querySelectorAll('*')];
      if (original.length !== current.length) {
        problems.push(`${pair.dataset.name}: element count ${current.length} != ${original.length}`);
        continue;
      }
      // Closed details defer descendant layout. Force every rectangle before
      // reading styles, then copy CSS values: CSSStyleDeclaration is live and
      // rereading it while the peer lays out can change a previous observation.
      const originalRects = original.map(node => node.getBoundingClientRect());
      const currentRects = current.map(node => node.getBoundingClientRect());
      const snapshot = (node: Element) => {
        const style = getComputedStyle(node);
        return Object.fromEntries(properties.map(property => [property, style.getPropertyValue(property)]));
      };
      const beforeStyles = original.map(snapshot), afterStyles = current.map(snapshot);
      original.forEach((node, index) => {
        const next = current[index]!;
        if (node.tagName !== next.tagName) problems.push(`${pair.dataset.name}/${index}: tag ${next.tagName} != ${node.tagName}`);
        const before = beforeStyles[index]!, after = afterStyles[index]!;
        for (const property of properties) {
          if (before[property] !== after[property]) {
            problems.push(`${pair.dataset.name}/${index}/${node.tagName}/${property}: ${after[property]} != ${before[property]}`);
          }
        }
        const a = originalRects[index]!, b = currentRects[index]!;
        if (a.x !== b.x || a.y !== b.y || a.width !== b.width || a.height !== b.height) {
          problems.push(`${pair.dataset.name}/${index}/bounds: (${b.x},${b.y}) ${b.width}x${b.height} != (${a.x},${a.y}) ${a.width}x${a.height}`);
        }
      });
    }
    return problems;
  }, {properties, detailsOpen, unchecked});
}

async function hoverChecks(page: Page) {
  const checks: Array<{sample: string; selector: string}> = [
    {sample: 'full-local', selector: '.report-preset-btn.active'},
    {sample: 'full-local', selector: '.report-preset-btn:not(.active)'},
    {sample: 'full-local', selector: '.report-mini-btn'},
    {sample: 'full-local', selector: '.report-builder-preview-btn'},
    {sample: 'app-0', selector: '.tour-btn-primary'},
    {sample: 'app-0', selector: '.tour-btn-secondary'},
  ];
  for (const check of checks) {
    await page.locator('#report-tour-parity').evaluate((element, name) => {
      const host = element as PairHost;
      host.replaceChildren(host.pairs.find(pair => pair.dataset.name === name)!);
      for (const details of host.querySelectorAll('details')) details.open = true;
      (host.querySelector('[data-current]') as HTMLElement).style.visibility = 'hidden';
    }, check.sample);
    const original = page.locator('#report-tour-parity [data-original]').locator(check.selector).first();
    await original.hover();
    const before = await original.evaluate((node, properties) => {
      const style = getComputedStyle(node);
      return Object.fromEntries(properties.map(property => [property, style.getPropertyValue(property)]));
    }, properties);
    await page.locator('#report-tour-parity').evaluate(host => {
      (host.querySelector('[data-original]') as HTMLElement).style.visibility = 'hidden';
      (host.querySelector('[data-current]') as HTMLElement).style.visibility = 'visible';
    });
    const current = page.locator('#report-tour-parity [data-current]').locator(check.selector).first();
    await current.hover();
    expect(await current.evaluate((node, properties) => {
      const style = getComputedStyle(node);
      return Object.fromEntries(properties.map(property => [property, style.getPropertyValue(property)]));
    }, properties), `${check.sample}/${check.selector} hover parity`).toEqual(before);
    await page.locator('#report-tour-parity').evaluate(host => {
      (host.querySelector('[data-original]') as HTMLElement).style.visibility = 'visible';
    });
  }
  return checks.length;
}

async function focusChecks(page: Page) {
  await page.keyboard.press('Tab');
  return page.locator('#report-tour-parity').evaluate(element => {
    const host = element as PairHost;
    let count = 0;
    for (const pair of host.pairs) {
      host.replaceChildren(pair);
      (pair.querySelector('[data-original]') as HTMLElement).style.visibility = 'hidden';
      (pair.querySelector('[data-current]') as HTMLElement).style.visibility = 'visible';
      for (const details of pair.querySelectorAll('details')) details.open = true;
      for (const control of pair.querySelectorAll<HTMLElement>('[data-current] button:not(:disabled),[data-current] input:not(:disabled),[data-current] select,[data-current] textarea,[data-current] summary')) {
        if (!control.getClientRects().length || getComputedStyle(control).display === 'none') continue;
        control.focus();
        if (document.activeElement !== control || parseFloat(getComputedStyle(control).outlineWidth) < 2) {
          throw new Error(`Missing keyboard focus: ${pair.dataset.name}/${control.tagName}/${control.textContent}`);
        }
        count++;
      }
    }
    return count;
  });
}

test('authored report setup and tour content preserve frozen layouts, themes, disclosure states and keyboard focus', async ({page}, info) => {
  test.setTimeout(240000);
  await mountPairs(page, frozen.samples);
  let comparisons = 0;
  for (const width of widths) {
    await page.setViewportSize({width, height: 1000});
    for (const theme of themes) {
      await setTheme(page, theme);
      await page.mouse.move(0, 0);
      for (const [detailsOpen, unchecked] of [[false, false], [true, false], [true, true]] as const) {
        expect(await compareAll(page, detailsOpen, unchecked), `${width}/${theme}/open:${detailsOpen}/unchecked:${unchecked}`).toEqual([]);
        comparisons += frozen.samples.length;
      }
    }
  }
  await page.setViewportSize({width: 1440, height: 1000});
  let hovers = 0;
  for (const theme of themes) { await setTheme(page, theme); hovers += await hoverChecks(page); }
  const focusedControls = await focusChecks(page);
  fs.writeFileSync(info.outputPath('report-tour-parity.json'), JSON.stringify({comparisons, focusedControls, hovers, samples: frozen.samples.length, widths, themes}, null, 2));
});

test('report setup and tour touch controls retain the coarse-pointer desktop layout', async ({browser, page}, info) => {
  test.setTimeout(120000);
  await prepareDemoProfile(page);
  const context = await browser.newContext({
    baseURL: new URL(page.url()).origin,
    viewport: {width: 1440, height: 1000}, hasTouch: true,
    reducedMotion: 'reduce', storageState: await page.context().storageState(),
  });
  try {
    const coarse = await context.newPage();
    await mountPairs(coarse, frozen.samples);
    expect(await coarse.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
    let comparisons = 0, hovers = 0;
    for (const theme of themes) {
      await setTheme(coarse, theme);
      await coarse.mouse.move(0, 0);
      expect(await compareAll(coarse, false, false), `coarse desktop/${theme}`).toEqual([]);
      comparisons += frozen.samples.length;
      hovers += await hoverChecks(coarse);
    }
    const focusedControls = await focusChecks(coarse);
    fs.writeFileSync(info.outputPath('report-tour-coarse.json'), JSON.stringify({comparisons, focusedControls, hovers, samples: frozen.samples.length, viewport: {width: 1440, height: 1000}, themes}, null, 2));
  } finally { await context.close(); }
});

// Keyboard scrolling at phone width; this does not simulate a physical touch swipe.
test('phone report categories retain keyboard scrolling on the modal surface', async ({page}) => {
  await page.setViewportSize({width: 390, height: 844});
  await prepareDemoProfile(page);
  await page.evaluate(async () => (await import('/js/export-report-builder.js')).openReportBuilder('full'));
  try {
    const overlay = page.locator('#report-builder-overlay');
    const modalScroll = overlay.locator('.report-builder-scroll');
    const categoryList = overlay.locator('.report-category-list');
    await expect(overlay).toBeVisible();
    await expect.poll(() => categoryList.locator('.report-category-row').count()).toBeGreaterThan(4);
    await expect(categoryList).toHaveCSS('overflow-y', 'visible');
    await expect(page.locator('body')).toHaveCSS('overflow', 'hidden');
    await overlay.locator('[data-report-for="categories"] summary').click();
    const firstCategory = categoryList.locator('input[type="checkbox"]').first();
    await firstCategory.scrollIntoViewIfNeeded();
    await expect(firstCategory).toBeVisible();
    await page.keyboard.press('Tab');
    await firstCategory.focus();
    await expect(firstCategory).toBeFocused();
    const before = await modalScroll.evaluate(node => node.scrollTop);
    await page.keyboard.press('PageDown');
    await expect.poll(() => modalScroll.evaluate(node => node.scrollTop)).toBeGreaterThan(before);
    await expect(page.locator('body')).toHaveCSS('overflow', 'hidden');
  } finally {
    await page.evaluate(async () => (await import('/js/export-report-builder.js')).closeReportBuilder());
  }
});
