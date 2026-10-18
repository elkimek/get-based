import fs from 'node:fs';
import { expect, test } from './coverage-fixture.js';
import { installDiscussionFixture } from '../helpers/chat-discussion-fixture.js';
import {prepareDemoProfile} from './biology-score-fixture.js';
const original = JSON.parse(fs.readFileSync('tests/fixtures/light-channel-section-original.json', 'utf8')) as { css: string; location: string[] };
test('channel sections preserve container and location styles, keyboard actions and accessible narrow layouts', async ({ page }, info) => {
  test.setTimeout(120000);
  await installDiscussionFixture(page.context(),{paused:true});
  await prepareDemoProfile(page); await expect(page.locator('html[data-app-ready]')).toBeAttached();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.evaluate(async original => {
    await (await import('/js/light-sun-loader.js')).loadLightSunUI();
    const sheet = new CSSStyleSheet(); sheet.replaceSync(original.css);
    const scope = (rules: CSSRuleList): string => [...rules].map(rule => {
      if (rule instanceof CSSMediaRule) return `@media ${rule.conditionText}{${scope(rule.cssRules)}}`;
      const style = rule as CSSStyleRule; return `:where([data-original]) ${style.selectorText}{${style.style.cssText}}`;
    }).join('\n');
    const style = document.createElement('style'); style.textContent = scope(sheet.cssRules) + '@media(pointer:coarse),(max-width:480px){[data-original] [data-light-page-action="request-precise-location"]{min-height:44px;min-width:44px}}'; document.head.append(style);
    const host = document.createElement('div'); host.id = 'channel-section-acceptance'; host.style.cssText = 'position:fixed;inset:0;z-index:20000;overflow:auto;background:var(--bg-primary);padding:12px'; document.body.append(host);
    const { renderHTML } = await import('/js/components/LightPagePresentation.svelte.html.js');
    const channel = await import('/js/light-channel-view.js'); const page = await import('/js/light-page-view.js');
    channel.configureLightChannelView({ channelDisplay: {}, dailyChannelBreakdown: null });
    page.configureLightPageView({ channelDisplay: {}, rollingChannelTotals: () => ({}), rollingDeviceTotals: () => ({}) });
    const channelPills = channel.getChannelPillsView({}, {});
    const dashboardHTML = page.renderDashboardLightChannelPills();
    const pairs: { old: string; current: string; dashboard: boolean }[] = [];
    for (const location of [null, { country: false }, { country: true, latitude: '50' }]) {
      pairs.push({ old: `<div class="light-channels-section" data-light-page-presentation><p class="light-section-hint gb:light-page:text-secondary">Channel lead</p>${channel.renderChannelPills({})}${location ? original.location[location.country ? 1 : 0] : ''}</div>`, current: renderHTML({ kind: 'channels', lead: 'Channel lead', pills: channelPills, location }), dashboard: false });
    }
    for (const total of [0, 1]) {
      const lead = total === 0 ? 'No light sessions yet. Log sunlight or a device session to see which pathways may have received a signal.' : 'Seven-day light rhythm, with sunlight and device signals kept separate.';
      pairs.push({ old: `<div class="light-channels-section light-channels-section-dashboard"><p class="light-section-hint">${lead}</p>${dashboardHTML}<button type="button" class="dashboard-action-btn dashboard-action-btn-primary light-dashboard-open-btn" data-dashboard-widget-action="navigate" data-dashboard-widget-route="light">Open Light &amp; Sun</button></div>`, current: page.renderDashboardLightChannelsWidget(total), dashboard: true });
    }
    host.innerHTML = pairs.map((pair, i) => `<div data-pair="${i}"><section data-original><div class="${pair.dashboard ? 'dashboard-widget' : ''}" data-widget-id="light-channels">${pair.old}</div></section><section data-current><div class="${pair.dashboard ? 'dashboard-widget' : ''}" data-widget-id="light-channels">${pair.current}</div></section></div>`).join('');
  }, original);
  const host = page.locator('#channel-section-acceptance'); let pairs = 0;
  for (const width of [320, 375, 600, 1100]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const theme of ['dark', 'light', 'glass', 'synth-sunrise', 'neuromancer', 'cyberterm']) {
      await page.evaluate(async theme => (await import('/js/theme.js')).setTheme(theme), theme);
      await expect.poll(() => host.evaluate(element => element.getAnimations({ subtree: true }).filter(animation => animation instanceof CSSTransition && animation.playState === 'running').length)).toBe(0);
      const result = await host.evaluate(element => {
        const properties = ['display', 'width', 'height', 'minWidth', 'maxWidth', 'gridTemplateColumns', 'alignItems', 'marginTop', 'marginBottom', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'borderTopWidth', 'borderTopStyle', 'borderTopColor', 'borderRadius', 'backgroundColor', 'boxShadow', 'gap', 'justifySelf', 'color', 'fontSize', 'lineHeight'] as const;
        const errors: string[] = [];
        for (const pair of element.querySelectorAll('[data-pair]')) {
          const old = pair.querySelector('[data-original]')!.querySelectorAll('*');
          const current = pair.querySelector('[data-current]')!.querySelectorAll('*');
          if (old.length !== current.length) { errors.push(`nodes ${pair.getAttribute('data-pair')}: ${old.length}/${current.length}`); continue; }
          old.forEach((node, i) => { for (const property of properties) { const a = getComputedStyle(node)[property], b = getComputedStyle(current[i]!)[property]; if (a !== b) errors.push(`${pair.getAttribute('data-pair')}/${i}/${property}: ${b} != ${a}`); } });
        }
        return { errors, overflow: element.scrollWidth - element.clientWidth };
      });
      expect(result.errors, `${width}/${theme} original styles`).toEqual([]); expect(result.overflow).toBeLessThanOrEqual(1); pairs += 5;
    }
  }
  await host.locator('[data-original]').evaluateAll(elements => elements.forEach(element => element.remove()));
  for (const theme of ['dark', 'light', 'glass', 'synth-sunrise', 'neuromancer', 'cyberterm']) {
    await page.evaluate(async theme => (await import('/js/theme.js')).setTheme(theme), theme);
    await host.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expect.poll(() => host.evaluate(element => element.getAnimations({ subtree: true }).filter(animation => animation instanceof CSSTransition && animation.playState === 'running').length)).toBe(0);
    const violations = await host.evaluate(async element => (await (window as unknown as { axe: typeof import('axe-core') }).axe.run(element, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.map(item => ({id:item.id,nodes:item.nodes.map(node=>({target:node.target,summary:node.failureSummary}))})));
    expect(violations, `${theme} accessibility`).toEqual([]);
  }
  const prepared=await page.evaluate(async()=>{const result=await(await import('/js/views.js')).navigate('dashboard');return{completed:result!==false,route:(await import('/js/state.js')).state.currentView,widgets:!!document.querySelector('#main-content .dashboard-widgets')};});
  expect(prepared,'Actual Dashboard route prepares rendered widget actions').toEqual({completed:true,route:'dashboard',widgets:true});
  await page.evaluate(async () => {
    const calls: string[] = []; Object.assign(window, { channelSectionCalls: calls });
    (await import('/js/light-page-view.js')).configureLightPageView({ requestPreciseLocation: () => calls.push('location') });
    (await import('/js/dashboard-widget-runtime.js')).configureDashboardWidgetRuntimeDeps({ navigate: (route: string) => calls.push(route) });
  });
  await host.locator('[data-current] [data-light-page-action="request-precise-location"]').first().focus(); await page.keyboard.press('Enter');
  await host.locator('[data-current] [data-dashboard-widget-action="navigate"]').first().focus(); await page.keyboard.press('Space');
  expect(await page.evaluate(() => (window as unknown as { channelSectionCalls: string[] }).channelSectionCalls)).toEqual(['location', 'light']);
  expect(errors).toEqual([]); expect(pairs).toBe(120);
  await fs.promises.writeFile(info.outputPath('section-style-pairs.json'), JSON.stringify({ pairs, themes: 6, widths: [320, 375, 600, 1100], placements: 5 }));
});
