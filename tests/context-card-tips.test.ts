// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { contextTipsSlotKeys, projectContextTips, type ContextTipsInput } from '../js/context-card-tips-presentation.js';
import { renderHTML } from '../js/components/ContextCardTips.svelte.html.js';

function input(): ContextTipsInput {
  return {
    cardKey: 'diet', enabled: true, now: new Date('2026-10-07T00:00:00').getTime(),
    catalog: { slots: {
      'diet.fiber': { card: 'Diet & Digestion', label: 'Fiber', freeActions: ['Eat vegetables'], forms: ['Food'] },
      'diet.empty': { card: 'Diet & Digestion' },
      'sleep.other': { card: 'Sleep & Rest', freeActions: ['Keep a routine'] },
    } },
    genetics: { snps: { rs1: { gene: 'GENE', genotype: 'AG' } } },
    snpTable: { rs1: { contextCards: ['diet'], genotypes: { AG: { effect: 'mild' } }, snpHints: { AG: { slotKey: 'diet.fiber', direction: 'avoid', text: 'A contextual finding', ref: 'https://example.org/study' } } } },
  };
}
describe('authored context tips', () => {
  it('retains card slots, genetic evidence and general-information text without catalog mutation', () => {
    const source = input(), before = JSON.stringify(source), view = projectContextTips(source)!;
    expect(contextTipsSlotKeys(source.catalog, 'diet')).toEqual(['diet.fiber', 'diet.empty']);
    expect(view.sections).toEqual([{ label: 'Fiber', actions: ['Eat vegetables'], forms: ['Food'] }]);
    expect(view.genetics[0]).toMatchObject({ gene: 'GENE', genotype: 'AG', avoid: true, text: 'A contextual finding', study: 'https://example.org/study' });
    const host = document.createElement('div'); host.innerHTML = renderHTML({ view });
    expect(host.querySelector('h2')?.textContent).toContain('Diet & Digestion — Tips');
    expect(host.textContent).toContain('Evidence ·');
    expect(host.textContent).toContain('not individualized medical advice or a care plan');
    expect(host.querySelector('[data-rec-action="close-modal"]')?.tagName).toBe('BUTTON');
    expect(JSON.stringify(source)).toBe(before);
  });
  it.each(['disabled', 'missing catalog', 'unknown card', 'empty slot', 'toString', 'constructor', '__proto__'])('retains the empty contract for %s', condition => {
    const source = input();
    if (condition === 'disabled') source.enabled = false;
    if (condition === 'missing catalog') source.catalog = null;
    if (condition === 'unknown card') source.cardKey = 'unknown';
    if (['toString', 'constructor', '__proto__'].includes(condition)) source.cardKey = condition;
    if (condition === 'empty slot') { source.genetics = null; source.catalog = { slots: { empty: { card: 'Diet & Digestion' } } }; }
    expect(projectContextTips(source)).toBeNull();
  });
  it('filters absent, unrelated and effect-none genetic calls while retaining strand-aware matches', () => {
    const source = input();
    source.genetics!.snps!.rs1!.genotype = 'GA';
    expect(projectContextTips(source)!.genetics).toHaveLength(1);
    source.snpTable!.rs1!.genotypes!.AG!.effect = 'none';
    expect(projectContextTips(source)!.genetics).toHaveLength(0);
    source.snpTable!.rs1!.genotypes!.AG!.effect = 'mild';
    source.snpTable!.rs1!.contextCards = ['sleepRest'];
    expect(projectContextTips(source)!.genetics).toHaveLength(0);
    source.snpTable!.rs1!.contextCards = ['diet'];
    source.genetics!.snps!.rs1!.genotype = null;
    expect(projectContextTips(source)!.genetics).toHaveLength(0);
  });
  it('skips APOE component calls when a haplotype already owns their interpretation', () => {
    const source = input();
    source.genetics = { apoe: 'ε3/ε4', snps: { rs429358: { gene: 'APOE', genotype: 'AG' } } };
    source.snpTable = { rs429358: source.snpTable!.rs1! };
    expect(projectContextTips(source)!.genetics).toHaveLength(0);
    source.genetics.apoe = null;
    expect(projectContextTips(source)!.genetics).toHaveLength(1);
  });
  it('renders catalog and genotype strings literally and excludes executable study links', () => {
    const source = input();
    source.catalog!.slots['diet.fiber']!.label = '<img src=x onerror=evil>';
    source.catalog!.slots['diet.fiber']!.freeActions = ['<script>evil()</script> & food'];
    source.catalog!.slots['diet.fiber']!.forms = ['<input autofocus>'];
    source.genetics!.snps!.rs1!.gene = '<svg onload=evil>';
    source.snpTable!.rs1!.snpHints!.AG!.text = '<b>literal</b>';
    source.snpTable!.rs1!.snpHints!.AG!.ref = 'javascript:evil()';
    const host = document.createElement('div'); host.innerHTML = renderHTML({ view: projectContextTips(source)! });
    expect(host.querySelector('img,script,input,svg,b,a')).toBeNull();
    expect(host.textContent).toContain('<script>evil()</script> & food');
    expect(host.textContent).toContain('<b>literal</b>');
  });
  it('keeps valid study URLs escaped with isolated new-tab navigation', () => {
    const source = input(); source.snpTable!.rs1!.snpHints!.AG!.ref = 'https://example.org/?q=" onclick="evil';
    const host = document.createElement('div'); host.innerHTML = renderHTML({ view: projectContextTips(source)! });
    const link = host.querySelector('a')!;
    expect(link.getAttribute('href')).toBe(source.snpTable!.rs1!.snpHints!.AG!.ref);
    expect(link.hasAttribute('onclick')).toBe(false); expect(link.target).toBe('_blank'); expect(link.rel).toBe('noopener');
  });
  it('preserves the latest-assessment 120-day nudge boundary and missing/invalid dates', () => {
    const source = input(); source.cardKey = 'environment'; source.catalog = { slots: { emf: { card: 'Environment' } } };
    expect(projectContextTips(source)!.environment?.event).toBe('emf-nudge-env-tips-noassessment');
    const date = (days: number) => { const value = new Date(source.now! - days * 86400000); return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`; };
    source.assessments = [{ date: date(121) }, { date: date(120) }]; expect(projectContextTips(source)).toBeNull();
    source.assessments = [{ date: date(121) }]; expect(projectContextTips(source)!.environment?.text).toContain('4 months ago');
    source.assessments = [{ date: date(370) }]; expect(projectContextTips(source)!.environment?.text).toContain('over a year ago');
    source.assessments = [{ date: 'invalid' }]; expect(projectContextTips(source)).toBeNull();
  });
  it('exposes environment navigation as a keyboard button with the retained action and analytics contract', () => {
    const source = input(); source.cardKey = 'environment'; source.catalog = { slots: { emf: { card: 'Environment' } } };
    const host = document.createElement('div'); host.innerHTML = renderHTML({ view: projectContextTips(source)! });
    const control = host.querySelector<HTMLButtonElement>('[data-rec-action="open-emf-assessment"]')!;
    expect(control.tagName).toBe('BUTTON'); expect(control.type).toBe('button'); expect(control.dataset.umamiEvent).toBe('emf-nudge-env-tips-noassessment');
  });
});
