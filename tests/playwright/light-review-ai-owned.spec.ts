import fs from 'node:fs';
import { JSDOM } from 'jsdom';
import { expect, test } from './coverage-fixture.js';
import { installDiscussionFixture } from '../helpers/chat-discussion-fixture.js';
import { scopedFrozenStyles, type FrozenStyleBlock } from '../helpers/frozen-style-scope.js';
import { projectReviewAI, type ReviewAIKind, type ReviewAIVariant, type ReviewPresentation } from '../../js/light-review-ai-presentation.js';
import type { AIVerdictStatus } from '../../js/ai-verdict-engine.js';
interface OriginalCase {
  kind: ReviewAIKind; status: AIVerdictStatus; analysis: Record<string, unknown> | null;
  provider: boolean; hasData: boolean; stale: boolean; trends: string[];
  fallbackHTML: string; heuristic: string; html: string;
}
const original = JSON.parse(fs.readFileSync('tests/fixtures/light-review-ai-original.json', 'utf8')) as {
  dashboardFallbackHTML: string; cases: OriginalCase[]; styleBlocks: FrozenStyleBlock[]; summaryCases: { html: string }[];
};
interface Example { kind: string; html: string; view: ReviewPresentation }
function summaryView(html: string): Extract<ReviewPresentation, {kind: 'weekly-fallback'}> {
  const document = new JSDOM(html).window.document;
  return { kind: 'weekly-fallback', headline: document.querySelector('.light-weekly-summary-text')!.textContent!,
    comparison: document.querySelector('.light-weekly-comparison')!.textContent!,
    nextStep: document.querySelector('.light-weekly-next-step')!.textContent!, empty: !!document.querySelector('button') };
}
const examples: Example[] = [];
const seen = new Set<string>();
const fallback = original.summaryCases[0]!;
for (const sample of original.cases) {
  if (!sample.html || sample.kind === 'weekly' && !sample.provider && !sample.html.includes('light-weekly-ai-review')) continue;
  const key = sample.kind + sample.html;
  if (seen.has(key)) continue;
  seen.add(key);
  const stale = sample.stale && !!sample.analysis;
  let variant: ReviewAIVariant = sample.status;
  if (sample.kind === 'weekly' || sample.kind === 'burden') {
    variant = !sample.hasData ? sample.kind === 'weekly' ? 'unavailable' : 'heuristic'
      : !sample.provider ? sample.kind === 'weekly' || sample.html.includes('sun-detail-ai') ? 'cached' : 'heuristic'
      : sample.status === 'analyzing' || sample.status === 'error' ? sample.status
      : sample.status === 'ok' && !stale ? 'ok' : stale ? 'stale' : 'idle';
  }
  const status = variant === 'cached' ? 'ok' : sample.status;
  // The caller owns the deterministic fallback. Use its captured original tree
  // and actual authored renderer instead of the semantic fixture's placeholder.
  const html = sample.kind === 'weekly' ? sample.html.replace(sample.fallbackHTML, fallback.html) : sample.html;
  examples.push({ kind: sample.kind, html,
    view: projectReviewAI({ ...sample, fallback: summaryView(fallback.html), status, variant, actionOwner: 'unused-visual-owner' }) });
}
for (const sample of original.summaryCases) {
  examples.push({ kind: 'weekly', html: sample.html, view: summaryView(sample.html) });
}
examples.push({kind:'dashboard', html:original.dashboardFallbackHTML, view:{kind:'dashboard-fallback'}});
for (const kind of ['today', 'dashboard', 'weekly', 'burden'] as const) test(`authored ${kind} review preserves original geometry, accessible themes and touch targets`, async ({ page }, info) => {
  test.setTimeout(120000); await installDiscussionFixture(page.context()); await page.goto('/app');
  await expect(page.locator('html[data-app-ready]')).toBeAttached();
  const samples = examples.filter(example => example.kind === kind);
  await page.evaluate(async originalCSS => {
    const style = document.createElement('style'); style.textContent = originalCSS;
    // Declared improvement: every review action is at least 44px on coarse pointers.
    style.textContent += '@media (pointer:coarse) { [data-original] button {min-height:44px;min-width:44px;} }';
    // Declared improvement: a narrow fallback puts its navigation button below
    // the text; the original one-line flex row overflowed in WebKit monospace themes.
    style.textContent += '@media(max-width:640px){[data-original] .light-today-hero-dashboard-fallback .sun-detail-ai{display:grid;grid-template-columns:8px minmax(0,1fr);align-items:start;}[data-original] .light-today-hero-dashboard-fallback button{grid-column:span 2;justify-self:start;}}';
    document.head.append(style); localStorage.setItem('labcharts-ai-paused','true');
    await (await import('/js/light-sun-loader.js')).loadLightSunUI();
    const host = document.createElement('div'); host.id = 'review-ai-acceptance';
    host.style.cssText = 'position:fixed;inset:16px;overflow:auto;z-index:20000;background:var(--bg-primary);padding:12px'; document.body.append(host);
  }, scopedFrozenStyles(original.styleBlocks));
  const host = page.locator('#review-ai-acceptance'); await page.emulateMedia({ reducedMotion: 'reduce' });
  let pairs = 0;
  for (const width of [320,1100]) {
    await page.setViewportSize({width,height:1000});
    for (const theme of ['dark','light','glass','synth-sunrise','neuromancer','cyberterm']) {
      await page.evaluate(async theme => (await import('/js/theme.js')).setTheme(theme),theme);
      const result = await host.evaluate(async (element,{samples,theme}) => {
        const {renderHTML} = await import('/js/components/LightReviewAI.svelte.html.js');
        element.innerHTML = samples.map((sample,index) => `<div data-pair="${index}"><section data-original inert aria-hidden="true">${sample.html}</section><section data-current>${renderHTML({view:sample.view})}</section></div>`).join('');
        const properties = ['display','gridTemplateColumns','marginLeft','letterSpacing','fontFamily','borderTopStyle','borderTopColor','width','height','fontSize','fontWeight','lineHeight','marginTop','marginBottom','paddingTop','paddingRight','paddingBottom','paddingLeft','gap','alignItems','flexGrow','flexShrink','minWidth','borderTopWidth','borderLeftWidth','borderLeftColor','backgroundColor','borderRadius','whiteSpace','textOverflow','color'] as const;
        const errors: string[] = []; let pairs = 0;
        const probe = document.createElement('span'); probe.style.transition = 'none'; element.append(probe);
        const color = (name: string) => { probe.style.color = name.startsWith('--') ? `var(${name})` : name; return getComputedStyle(probe).color; };
        const foreground = (node: Element, oldColor: string) => {
          if (node.matches('.light-ai-kicker') || node.closest('.light-today-dash-ai-cta,.light-env-summary-ai-cta')) return color(theme === 'light' ? 'color-mix(in srgb,var(--accent-light) 90%,var(--text-primary))' : '--accent-light');
          if (!node.matches('button') && ['neuromancer','cyberterm'].includes(theme) && (node.matches('.light-today-hero-label,.light-ai-panel-levels span,.light-weekly-period,.light-weekly-ai-action-status,.light-env-summary-ai-detail,.sun-detail-ai-body,.sun-detail-ai-loading,.sun-detail-ai-error,.sun-detail-ai-idle') || node.closest('.light-today-dash-ai-body,.sun-detail-ai-body,.sun-detail-ai-loading,.sun-detail-ai-error,.sun-detail-ai-idle'))) return color('--text-secondary');
          if (node.matches('.light-env-summary-ai:not(.light-env-summary-ai-green,.light-env-summary-ai-yellow,.light-env-summary-ai-red),.light-env-summary-ai > .sun-detail-ai:not(.sun-detail-ai-loading)')) return color('--text-primary');
          if (node.closest('.light-env-summary-ai-gray') && !node.matches('button,.light-env-summary-ai-detail')) return color('--text-primary');
          const tone = ['green','yellow','red'].find(tone => node.closest(`.light-env-summary-ai-${tone}`));
          if (tone && !node.matches('button,.light-env-summary-ai-detail')) return color(tone === 'green' ? '--success-ink' : tone === 'yellow' ? '--warning-ink' : '--danger-ink');
          return oldColor;
        };
        for (const pair of element.querySelectorAll('[data-pair]')) {
          const original = pair.querySelector('[data-original]')!,current = pair.querySelector('[data-current]')!;
          const oldNodes = [...original.querySelectorAll('*')],newNodes = [...current.querySelectorAll('*')];
          if (oldNodes.length !== newNodes.length) {errors.push(`nodes ${pair.getAttribute('data-pair')}: ${oldNodes.length}/${newNodes.length}`);continue;}
          for (let index=0;index<oldNodes.length;index++) {
            const oldStyle = getComputedStyle(oldNodes[index]!),node = newNodes[index]!,next = getComputedStyle(node);
            for (const property of properties) {
              let expected = oldStyle[property];
              if (property === 'color' || property === 'borderLeftColor' && oldStyle.borderLeftWidth === '0px' && expected === oldStyle.color || property === 'borderTopColor' && oldStyle.borderTopWidth === '0px' && expected === oldStyle.color) expected = foreground(node,expected);
              if (next[property] !== expected) errors.push(`${pair.getAttribute('data-pair')}/${index}/${property}: ${next[property]} != ${expected}`);
            }
          }
          pairs++; original.remove();
        }
        probe.remove(); return {errors,pairs,overflow:element.scrollWidth-element.clientWidth};
      },{samples,theme});
      expect(result.errors,`${kind}/${width}/${theme} style parity`).toEqual([]); pairs+=result.pairs;
      expect(result.overflow,`${kind}/${width}/${theme} overflow`).toBeLessThanOrEqual(1);
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      const accessibility = await host.evaluate(async element => {
        const result = await (window as unknown as {axe:typeof import('axe-core')}).axe.run(element,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}});
        return {theme:document.documentElement.dataset.theme || 'dark', background:getComputedStyle(element).backgroundColor,
          violations:result.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}))};
      });
      if (accessibility.violations.length) await fs.promises.writeFile(info.outputPath(`review-ai-${kind}-${theme}-${width}-accessibility.json`),JSON.stringify(accessibility,null,2));
      expect(accessibility.theme).toBe(theme);
      expect(accessibility.violations,`${kind}/${width}/${theme} accessibility`).toEqual([]);
      for (const button of await host.locator('button').all()) {
        await button.focus(); await expect(button).toBeFocused(); await expect(button).toHaveCSS('outline-width','2px');
        if (await page.evaluate(()=>matchMedia('(pointer:coarse)').matches)) {const box=await button.boundingBox();expect(box!.width).toBeGreaterThanOrEqual(44);expect(box!.height).toBeGreaterThanOrEqual(44);}
      }
    }
  }
  expect(pairs).toBe(samples.length*12);
  await fs.promises.writeFile(info.outputPath('review-ai-style-pairs.json'),JSON.stringify({kind,pairs,examples:samples.length,themes:6,widths:2}));
  await host.evaluate(async (element, kind) => {
    const [{projectReviewAI}, {renderHTML}, actions] = await Promise.all([
      import('/js/light-review-ai-presentation.js'), import('/js/components/LightReviewAI.svelte.html.js'), import('/js/ai-action-delegates.js'),
    ]);
    const view = projectReviewAI({kind, status:'idle', variant:'idle', analysis:null, actionOwner:actions.aiActionOwner()});
    Object.assign(window, {reviewKeyboardCalls: []});
    actions.registerAIActionHandler(view.action, (...args: unknown[]) => {
      (window as unknown as {reviewKeyboardCalls: unknown[][]}).reviewKeyboardCalls.push(args);
    });
    element.innerHTML = renderHTML({view});
  }, kind);
  const action = host.locator('[data-ai-action]');
  await expect(action).toHaveCount(1);
  for (const key of ['Enter','Space']) {await action.focus();await page.keyboard.press(key);}
  const calls = () => page.evaluate(() => (window as unknown as {reviewKeyboardCalls: unknown[][]}).reviewKeyboardCalls);
  expect(await calls()).toEqual([[],[]]);
  await page.evaluate(async () => {const {state}=await import('/js/state.js');state.importedData=structuredClone(state.importedData);});
  await action.click();expect(await calls()).toEqual([[],[]]);
  await host.evaluate(async (element, kind) => {
    const [{projectReviewAI}, {renderHTML}, {aiActionOwner}] = await Promise.all([
      import('/js/light-review-ai-presentation.js'),import('/js/components/LightReviewAI.svelte.html.js'),import('/js/ai-action-delegates.js'),
    ]);
    element.innerHTML=renderHTML({view:projectReviewAI({kind,status:'analyzing',variant:'analyzing',analysis:null,actionOwner:aiActionOwner()})});
  },kind);
  const shimmer=host.locator('.sun-session-ai-dot-shimmer');
  await expect(shimmer).toHaveCSS('animation-name','none');
  expect(await shimmer.evaluate(element => element.getAnimations().length)).toBe(0);
  await page.emulateMedia({reducedMotion:'no-preference'});
  await expect(shimmer).toHaveCSS('animation-name','shimmer');
  expect(await shimmer.evaluate(element => element.getAnimations().filter(animation => animation instanceof CSSAnimation && animation.animationName==='shimmer').length)).toBe(1);

});
