import { expect, test } from './coverage-fixture.js';
import { createRequire } from 'node:module';
const axeScriptPath = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
const catalog = { slots: {
  'diet.food': { card: 'Diet & Digestion', label: 'Food <label>', freeActions: ['Literal <b>food</b> & review'], forms: ['Whole foods'] },
  'environment.emf': { card: 'Environment', freeActions: ['Review your environment'] },
} };

test('authored context tips preserve literal content, themed layout and keyboard modal actions', async ({ page }) => {
  await page.addInitScript({ path: axeScriptPath });
  await page.route('**/data/recommendations.json', route => route.fulfill({ json: catalog }));
  await page.goto('/app', { waitUntil: 'load' });
  await page.evaluate(async () => {
    const [{ state }, profile, recommendations, cards] = await Promise.all([
      import('/js/state.js'), import('/js/profile.js'), import('/js/recommendations.js'), import('/js/context-cards.js'),
    ]);
    state.importedData = profile.createDefaultProfileData();
    state.importedData.genetics = { snps: { rs1: { gene: '<GENE>', genotype: 'AG' }, rs2: { gene: 'GENE2', genotype: 'AG' } } };
    Reflect.set(window, '_snpTableCache', { rs1: { contextCards: ['diet'], genotypes: { AG: { effect: 'mild' } }, snpHints: { AG: { slotKey: 'diet.food', direction: 'avoid', text: 'Literal <tip> & context', ref: 'javascript:evil()' } } }, rs2: { contextCards: ['diet'], genotypes: { AG: { effect: 'mild' } }, snpHints: { AG: { slotKey: 'diet.food', direction: 'form', text: 'Study context', ref: 'https://example.org/study' } } } });
    recommendations.setProductRecsEnabled(true); await recommendations.loadCatalog();
    const themes = document.createElement('link'); themes.rel = 'stylesheet'; themes.href = '/themes-extra.css'; document.head.append(themes);
    await new Promise<void>((resolve, reject) => { themes.onload = () => resolve(); themes.onerror = () => reject(new Error('Theme stylesheet unavailable')); });
    // A preceding editor must not leave its layout or accessible name on tips.
    document.getElementById('detail-modal')!.className = 'modal ctx-editor-modal';
    document.getElementById('detail-modal')!.setAttribute('aria-label', 'Old editor');
    await cards.openCardTipsModal('diet');
  });
  const modal = page.locator('#detail-modal');
  await expect(modal).toHaveAttribute('aria-label', /Diet & Digestion — Tips/);
  await expect(modal).not.toHaveClass(/ctx-editor-modal/);
  await expect(modal.locator('h2')).toHaveText(/Diet & Digestion — Tips/);
  await expect(modal).toContainText('Literal <b>food</b> & review');
  await expect(modal).toContainText('Literal <tip> & context');
  await expect(modal.locator('script, b, tip, gene, a[href^="javascript:"]')).toHaveCount(0);
  await expect(modal.getByRole('link', { name: 'study', exact: true })).toHaveAttribute('href', 'https://example.org/study');
  await expect(modal.getByRole('link', { name: 'study', exact: true })).toHaveAttribute('rel', 'noopener');
  const failures: string[] = [];
  for (const theme of ['dark', 'light', 'cyberterm', 'glass', 'neuromancer', 'synth-sunrise']) {
    await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
    for (const width of [320, 1100]) {
      await page.setViewportSize({ width, height: 900 });
      const result = await modal.evaluate(root => {
        const title = getComputedStyle(root.querySelector('h2')!);
        const item = getComputedStyle(root.querySelector('.ctx-tip-avoid')!);
        const probe = document.createElement('span'); probe.style.color = document.documentElement.dataset.theme === 'light' ? 'var(--warning-ink)' : 'var(--orange)'; root.append(probe);
        // Compare the same CSS value in this engine; WebKit serializes 20.8 as 20.799999px.
        probe.style.fontSize = '13px'; probe.style.lineHeight = '1.6';
        const color = getComputedStyle(probe).color, expectedLineHeight = getComputedStyle(probe).lineHeight; probe.remove();
        return { title: title.fontSize, item: item.fontSize, lineHeight: item.lineHeight, expectedLineHeight, color: item.color === color,
          overflow: root.scrollWidth > root.clientWidth + 1 };
      });
      if (result.title !== '16px' || result.item !== '13px' || result.lineHeight !== result.expectedLineHeight || !result.color || result.overflow) failures.push(`${theme}/${width}: ${JSON.stringify(result)}`);
      const violations = await modal.evaluate(async root => (await (window as unknown as { axe: typeof import('axe-core') }).axe.run(root, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.map(value => ({ id: value.id, nodes: value.nodes.map(node => ({ target: node.target, summary: node.failureSummary })) })));
      expect(violations, `${theme}/${width} accessibility`).toEqual([]);
    }
  }
  expect(failures).toEqual([]);
  await modal.getByRole('button', { name: 'Close', exact: true }).focus(); await page.keyboard.press('Enter');
  await expect(page.locator('#modal-overlay')).not.toHaveClass(/show/);
  await page.evaluate(async () => {
    const runtime = await import('/js/recommendations-runtime.js');
    Reflect.set(window, 'contextTipsEmfActions', 0);
    runtime.configureRecommendationsRuntime({ openEMFAssessmentEditor: () => { Reflect.set(window, 'contextTipsEmfActions', Number(Reflect.get(window, 'contextTipsEmfActions')) + 1); } });
    const cards = await import('/js/context-cards.js'); await cards.openCardTipsModal('environment');
  });
  const action = modal.getByRole('button', { name: 'Open the EMF assessment →' });
  await action.focus(); await page.keyboard.press('Enter');
  await expect.poll(() => page.evaluate(() => Reflect.get(window, 'contextTipsEmfActions'))).toBe(1);
  await expect(page.locator('#modal-overlay')).not.toHaveClass(/show/);
});
