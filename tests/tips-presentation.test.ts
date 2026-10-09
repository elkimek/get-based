// @vitest-environment jsdom
import {expect, it} from 'vitest';
import {tipsText, type TipsSectionView, type TipsProductView} from '../js/tips-presentation.js';
import {renderHTML as productHTML} from '../js/components/TipsProduct.svelte.html.js';
import {renderHTML as couponHTML} from '../js/components/TipsCoupon.svelte.html.js';
import {renderHTML as sectionHTML} from '../js/components/TipsSection.svelte.html.js';
import {renderHTML as detailHTML} from '../js/components/TipsDetail.svelte.html.js';

function dom(html: string): HTMLElement {
  const root = document.createElement('div'); root.innerHTML = html; return root;
}
function section(overrides: Partial<TipsSectionView> = {}): TipsSectionView {
  return {variant: 'standard', header: 'Options', gated: false, banner: false, normalNote: false,
    genetics: [], tiers: [], products: [], coupon: null, suggestionHref: null,
    footer: {region: 'Worldwide'}, disclaimer: true, ...overrides};
}

it('keeps literal product values and safe link attributes without interpreting catalog markup', () => {
  const literal = '<img src=x onerror="alert(1)"> & \'quoted\'';
  const view: TipsProductView = {brand: tipsText(literal), name: tipsText(0), meta: [tipsText(false)],
    link: {href: 'https://example.test/?q=\"<&', event: 'rec-literal', label: literal}};
  const root = dom(productHTML({view}));
  expect(root.querySelector('img')).toBeNull();
  expect(root.querySelector('strong')?.textContent).toBe(literal);
  expect(root.querySelector('.rec-product-info')?.textContent).toBe(`${literal} · 0 · false`);
  const link = root.querySelector('a')!;
  expect(link.getAttribute('href')).toBe(view.link!.href);
  expect(link.getAttribute('aria-label')).toBe(literal);
  expect(link.rel).toBe('noopener sponsored');
  expect(link.target).toBe('_blank');
});

it('preserves empty present product fragments and original leading metadata separators', () => {
  const empty = dom(productHTML({view: {brand: '', name: 'Name', meta: ['Dose'], link: null}}));
  expect(empty.querySelector('strong')).not.toBeNull();
  expect(empty.querySelector('.rec-product-info')?.textContent).toBe(' · Name · Dose');
  const metaOnly = dom(productHTML({view: {brand: null, name: null, meta: ['Dose'], link: null}}));
  expect(metaOnly.querySelector('.rec-product-info')?.textContent).toBe(' · Dose');
  expect(metaOnly.querySelector('a')).toBeNull();
});

it('keeps coupon code as literal copy payload, accessible name and announced text', () => {
  const code = '\"<&\' >';
  const root = dom(couponHTML({view: {code, discount: '12 & 5%'}}));
  const button = root.querySelector('button')!;
  expect(button.dataset.code).toBe(code);
  expect(button.textContent).toBe(code);
  expect(button.dataset.recAction).toBe('copy-coupon');
  expect(button.getAttribute('aria-label')).toBe(`Copy coupon code ${code} to clipboard`);
  expect(root.querySelector('.rec-coupon')?.getAttribute('aria-live')).toBe('polite');
  expect(root.querySelector('.rec-coupon')?.getAttribute('aria-atomic')).toBe('true');
  expect(root.textContent).toBe(`Use code ${code} at checkout for 12 & 5% off.`);
});

it('preserves inline genetics spaces, evidence and separate reference links', () => {
  const root = dom(sectionHTML({view: section({genetics: [{kind: 'finding', icon: '→', gene: 'GENE',
    variant: 'Variant', genotype: 'CT', note: 'Literal <note>', evidence: 'Limited', relevance: 'Context',
    study: 'https://example.test/study', snpedia: 'https://example.test/snp'}]})}));
  const row = root.querySelector('.rec-dna-row')!;
  expect(row.textContent).toBe('→ GENE Variant: CT — Literal <note> Evidence · Limited · Context study SNPedia');
  expect([...row.querySelectorAll('a')].map(link => link.textContent)).toEqual(['study', 'SNPedia']);
  expect(row.querySelector('note')).toBeNull();
});

it('composes form fallback separators and keeps optional study fragments separate', () => {
  const root = dom(sectionHTML({view: section({tiers: [{label: 'SUPPLEMENTS', hint: 'review safety first',
    items: [{kind: 'forms', forms: [{text: 'First <form>', href: null}, {text: 'Second', href: 'https://example.test/study'}]}]}]})}));
  expect(root.querySelector('.rec-item-form')?.textContent).toBe('First <form>, Second (study)');
  expect(root.querySelector('.rec-section-label')?.textContent).toBe('SUPPLEMENTS review safety first');
  expect(root.querySelector('form')).toBeNull();
});

it('supports direct chat heading and one disclosure banner without rewriting rendered HTML', () => {
  const view = section({banner: true, gated: true});
  const root = dom(sectionHTML({view, headingMode: 'chat'}) + sectionHTML({view, headingMode: 'chat', showBanner: false}));
  expect(root.querySelectorAll('.rec-disclosure-banner')).toHaveLength(1);
  expect(root.querySelectorAll('.rec-chat-subheading')).toHaveLength(2);
  expect(root.querySelector('.rec-section-header')).toBeNull();
  expect(root.querySelectorAll('.rec-section-gated')).toHaveLength(2);
  expect(root.querySelector('[data-rec-action="accept-disclosure"]')?.textContent).toBe('Got it');
});

it.each([
  ['loading', 'Loading options...'], ['loaded', 'No tip details are available for this topic.'], ['error', 'Could not load tip details.'],
] as const)('retains accessible close/title and %s detail copy', (state, text) => {
  const root = dom(detailHTML({label: '<Literal & title>', state, section: null}));
  expect(root.querySelector('h3')?.textContent).toBe('<Literal & title>');
  expect(root.querySelector('literal')).toBeNull();
  expect(root.querySelector('.dashboard-widget-empty')?.textContent).toBe(text);
  const close = root.querySelector('button')!;
  expect(close.type).toBe('button');
  expect(close.dataset.recommendationDetailAction).toBe('close');
  expect(close.getAttribute('aria-label')).toBe('Close');
});

it('composes a loaded detail section without adding an empty-state body', () => {
  const root = dom(detailHTML({label: 'Tip', state: 'loaded', section: section({normalNote: true})}));
  expect(root.querySelector('.dashboard-widget-empty')).toBeNull();
  expect(root.querySelector('.rec-section-header')?.textContent).toBe('Options');
  expect(root.querySelector('.rec-in-range-note')?.textContent).toBe('Your value is in range. These tips are general information only.');
});
