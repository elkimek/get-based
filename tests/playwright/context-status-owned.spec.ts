import { expect, test } from './coverage-fixture.js';
import { createRequire } from 'node:module';
const axeScriptPath = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
test('shared context status owners synchronize literal assessments with unique IDs and themed responsive styles', async ({ page }) => {
  await page.addInitScript({ path: axeScriptPath });
  await page.goto('/app', { waitUntil: 'load' });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const result = await page.evaluate(async () => {
    const [{ state }, profile, cards, health, status, view, recs] = await Promise.all([
      import('/js/state.js'), import('/js/profile.js'), import('/js/context-cards.js'), import('/js/context-card-health-dots.js'),
      import('/js/context-card-status.js'), import('/js/context-card-status-view.js'), import('/js/recommendations-runtime.js'),
    ]);
    localStorage.setItem('labcharts-ai-paused', 'true');
    state.currentProfile = 'status-browser'; state.importedData = profile.createDefaultProfileData(); state.importedData.diet = { breakfast: 'Reported eggs' };
    const extra = document.createElement('link'); extra.rel = 'stylesheet'; extra.href = '/themes-extra.css'; document.head.append(extra);
    await new Promise<void>((resolve, reject) => { extra.onload = () => resolve(); extra.onerror = () => reject(new Error('Theme stylesheet unavailable')); });
    const reset = document.createElement('style'); reset.textContent = '[data-status-test] *{transition:none!important}'; document.head.append(reset);
    const render = () => { const host = document.createElement('div'); host.dataset.statusTest = ''; host.innerHTML = cards.renderProfileContextCards(); document.body.append(host); view.ensureContextCardStatus(); return host; };
    const first = render(), second = render();
    const slot = (host: HTMLElement, name: string) => host.querySelector<HTMLElement>(`[data-context-card-key="diet"] .${name}`)!;
    health.applyAIProfileSummary('diet', '<Reported & literal>'); cards.applyAISummary('diet', '<img src=x onerror=evil> & tip', 'yellow');
    const synchronized = [first, second].every(host => slot(host, 'context-card-body').textContent === '<Reported & literal>'
      && slot(host, 'ctx-ai-summary').textContent!.includes('<img src=x onerror=evil> & tip') && !host.querySelector('img, script'));
    const allIds = [first, second].flatMap(host => [...host.querySelectorAll<HTMLElement>('[id]')].map(el => el.id));
    const unique = new Set(allIds).size === allIds.length;
    recs.configureRecommendationModuleBridge({ isProductRecsEnabled: () => true, loadCatalog: async () => {}, getCardSlotKeys: (key: string) => key === 'diet' ? ['protein'] : [] });
    await cards.loadContextCardTips();
    const tipsButtons = [first, second].every(host => host.querySelector<HTMLButtonElement>('.ctx-tips-badge')?.getAttribute('aria-label') === 'Lifestyle tips for Diet & Digestion');
    const failures: string[] = []; let states = 0;
    const probe = document.createElement('span'); first.append(probe);
    for (const theme of ['dark', 'light', 'cyberterm', 'glass', 'neuromancer', 'synth-sunrise']) {
      document.documentElement.dataset.theme = theme;
      for (const width of [320, 860]) {
        first.style.width = `${width}px`;
        for (const color of ['green', 'yellow', 'red', 'gray']) {
          cards.applyDotColor('diet', color); cards.applyAISummary('diet', 'Current assessment', color);
          const dot = getComputedStyle(slot(first, 'ctx-health-dot')), insight = getComputedStyle(slot(first, 'ctx-ai-summary'));
          probe.style.backgroundColor = `var(${color === 'gray' ? '--text-muted' : '--' + color})`;
          const notes = getComputedStyle(first.querySelector('textarea')!);
          const tip = getComputedStyle(first.querySelector('.ctx-tips-badge')!);
          if (dot.width !== '10px' || dot.height !== '10px' || dot.backgroundColor !== getComputedStyle(probe).backgroundColor
            || dot.opacity !== (color === 'gray' ? '0.4' : '1') || insight.maxHeight !== '52px' || insight.paddingTop !== '8px'
            || tip.fontSize !== '9px' || tip.paddingTop !== '1px' || tip.paddingLeft !== '5px'
            || notes.minHeight !== '76px' || notes.paddingTop !== '11px' || notes.paddingLeft !== '13px' || notes.fontSize !== '13px'
            || first.scrollWidth > first.clientWidth + 1) failures.push(`${theme}/${width}/${color}: ${dot.width},${dot.height},${dot.opacity},${insight.maxHeight},${insight.paddingTop},notes:${notes.minHeight}/${notes.paddingTop}/${notes.paddingLeft}/${notes.fontSize},overflow:${first.scrollWidth}/${first.clientWidth}`);
          states++;
        }
      }
    }
    status.publishContextCardStatus('diet', { loading: true, label: 'Assessing', visible: true });
    const loading = getComputedStyle(slot(first, 'ctx-health-dot'));
    const reducedMotion = loading.animationName === 'none' && loading.opacity === '1';
    const accessibility = (await (window as unknown as { axe: typeof import('axe-core') }).axe.run(first, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.map(item => item.id);
    const oldTicket = status.contextCardStatusTicket(); state.currentProfile = 'status-replacement'; state.importedData = profile.createDefaultProfileData();
    const replacement = render(); cards.applyAISummary('diet', 'Replacement only', 'green');
    const retired = !status.publishContextCardStatus('diet', { insight: 'Retired response' }, oldTicket)
      && !first.textContent!.includes('Replacement only') && slot(replacement, 'ctx-ai-summary').textContent!.includes('Replacement only');
    return { synchronized, unique, tipsButtons, states, failures, reducedMotion, accessibility, retired };
  });
  expect(result).toEqual({ synchronized: true, unique: true, tipsButtons: true, states: 48, failures: [], reducedMotion: true, accessibility: [], retired: true });
});

for (const retirement of ['view removal', 'profile replacement']) test(`context tips keyboard actions retire after ${retirement} across a delayed stylesheet and work in the current catalog`, async ({ page }) => {
  let release!: (route: import('@playwright/test').Route) => void;
  const request = new Promise<import('@playwright/test').Route>(resolve => { release = resolve; });
  await page.route('**/css/context-editor.css', route => { release(route); });
  await page.goto('/app', { waitUntil: 'load' });
  await page.evaluate(async () => {
    const [{ state }, profile, cards, view, recs] = await Promise.all([import('/js/state.js'), import('/js/profile.js'), import('/js/context-cards.js'), import('/js/context-card-status-view.js'), import('/js/recommendations-runtime.js')]);
    localStorage.setItem('labcharts-ai-paused', 'true'); state.currentProfile = 'tips-origin'; state.importedData = profile.createDefaultProfileData();
    Reflect.set(window, 'ownedTipsRendered', 0);
    recs.configureRecommendationModuleBridge({ isProductRecsEnabled: () => true, loadCatalog: async () => {}, getCardSlotKeys: (key: string) => key === 'diet' ? ['protein'] : [],
      renderCardTipsModal: () => { Reflect.set(window, 'ownedTipsRendered', Number(Reflect.get(window, 'ownedTipsRendered')) + 1); return '<div data-owned-tips-modal>Current diet tips</div>'; } });
    const host = document.createElement('div'); host.id = 'tips-origin-host'; host.innerHTML = cards.renderProfileContextCards(); document.body.append(host); view.ensureContextCardStatus(); await cards.loadContextCardTips();
  });
  await page.locator('#tips-origin-host .ctx-tips-badge').focus(); await page.keyboard.press('Enter');
  const held = await request;
  await page.evaluate(async retirement => {
    const [{ state }, profile, cards, view] = await Promise.all([import('/js/state.js'), import('/js/profile.js'), import('/js/context-cards.js'), import('/js/context-card-status-view.js')]);
    if (retirement === 'view removal') document.getElementById('tips-origin-host')!.remove();
    else { state.currentProfile = 'tips-current'; state.importedData = profile.createDefaultProfileData(); }
    const host = document.createElement('div'); host.id = 'tips-current-host'; host.innerHTML = cards.renderProfileContextCards(); document.body.append(host); view.ensureContextCardStatus(); await cards.loadContextCardTips();
  }, retirement);
  await held.continue();
  await page.waitForFunction(() => [...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')].some(link => link.href.endsWith('/css/context-editor.css') && link.sheet));
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  expect(await page.evaluate(() => Number(Reflect.get(window, 'ownedTipsRendered')))).toBe(0);
  await expect(page.locator('[data-owned-tips-modal]')).toHaveCount(0);
  await page.locator('#tips-current-host .ctx-tips-badge').focus(); await page.keyboard.press('Enter');
  await expect(page.locator('#detail-modal [data-owned-tips-modal]')).toBeVisible();
  expect(await page.evaluate(() => Number(Reflect.get(window, 'ownedTipsRendered')))).toBe(1);
});
