// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { ContextCatalogView } from '../js/context-card-catalog-presentation.js';
import { projectContextDemoBar } from '../js/context-card-catalog-presentation.js';
import { renderHTML } from '../js/components/ContextCardCatalog.svelte.html.js';
import Catalog, { mount, unmount, flushSync } from '../js/components/ContextCardCatalog.svelte.native.js';
const metadata = { provider: 'openrouter', providerLabel: '<Provider>', modelId: 'model', modelLabel: '<Model>', demo: true as const };
function view(): ContextCatalogView {
  return { renderId: 'catalog-test', embedded: false, subtitle: '<optional context>', addedCount: 1, refresh: true, demo: null,
    notes: '</textarea><img src=x onerror=alert(1)>\n& literal', cards: [
      { key: 'healthGoals', label: '<Goals>', tooltip: '<Why goals matter>', placeholder: 'Add a goal', editor: 'openHealthGoalsEditor', filled: true, summary: '<Reported goal>', icon: 'healthGoals', contaminants: null, nutrition: null },
      { key: 'diet', label: 'Diet & Digestion', tooltip: 'Why diet matters', placeholder: '<Describe diet>', editor: 'openDietEditor', filled: false, summary: '', icon: 'diet', contaminants: null, nutrition: {title: 'Meals & Nutrition', detail: '', surface: 'meals', attributes: {'data-context-card-action':'open-nutrition','data-context-card-surface':'meals'}} },
    ] };
}
function rendered(presentation = view()) { const host = document.createElement('div'); host.innerHTML = renderHTML({ view: presentation }); return host; }
describe('authored shared context catalog', () => {
  it('renders literal profile text, notes, relationships and trusted application icons/extensions', () => {
    const host = rendered();
    expect(host.querySelector('[data-context-cards-view]')?.getAttribute('aria-labelledby')).toBe('catalog-test-section-title');
    expect(host.querySelector('.context-section-subtitle')?.textContent).toBe('<optional context>');
    expect(host.querySelector('.context-card-label')?.textContent).toBe('<Goals>');
    expect(host.querySelector('.context-card-body')?.textContent).toBe('<Reported goal>');
    expect(host.querySelector('.context-card-body')?.getAttribute('data-local-summary')).toBe('<Reported goal>');
    expect(host.querySelector('.context-card-placeholder')?.textContent).toBe('<Describe diet>');
    expect(host.querySelector('.context-card-explanation')?.textContent).toBe('<Why goals matter>');
    expect(host.querySelector('textarea')?.value).toBe(view().notes);
    expect(host.querySelectorAll('img, script, optional, Goals, Reported')).toHaveLength(0);
    expect(host.querySelectorAll('.context-card-icon svg')).toHaveLength(2);
    expect(host.querySelector('[data-context-card-action="open-nutrition"] .diet-nutrition-extension-title')?.textContent).toBe('Meals & Nutrition');
    expect(host.querySelector('[data-context-card-action="open-nutrition"]')?.getAttribute('data-context-card-surface')).toBe('meals');
    expect(host.querySelector('[data-context-card-action="open-nutrition"] [aria-hidden]')?.textContent).toBe('→');
    expect(host.querySelector('label')?.htmlFor).toBe(host.querySelector('textarea')?.id);
    expect(host.querySelector('textarea')?.getAttribute('aria-describedby')).toBe(host.querySelector('.ctx-notes-hint')?.id);
  });
  it('keeps card order, filled state, editor dispatch, hidden assessments and explanation controls', () => {
    const host = rendered();
    expect([...host.querySelectorAll<HTMLElement>('article')].map(card => card.dataset.contextCardKey)).toEqual(['healthGoals', 'diet']);
    expect(host.querySelector('.context-progress-text')?.getAttribute('aria-label')).toBe('1 of 2 context areas added');
    expect(host.querySelector('.context-card-added .context-card-open')?.getAttribute('aria-label')).toBe('Edit <Goals>');
    expect(host.querySelector<HTMLElement>('.context-card-empty .context-card-open')?.dataset.contextCardEditor).toBe('openDietEditor');
    expect(host.querySelectorAll('.ctx-health-indicator[hidden]')).toHaveLength(2);
    const info = host.querySelector('.context-info-icon')!;
    expect(info.getAttribute('aria-expanded')).toBe('false');
    expect(host.querySelector(`#${info.getAttribute('aria-controls')}`)?.hasAttribute('hidden')).toBe(true);
    expect(host.querySelectorAll('[onclick],[oninput]')).toHaveLength(0);
  });
  it('keeps embedded headings, refresh availability and per-render explanation relationships', () => {
    const first = view(), second = { ...view(), renderId: 'other', embedded: true, refresh: false };
    const host = document.createElement('div'); host.innerHTML = renderHTML({ view: first }) + renderHTML({ view: second });
    const fields = [...host.querySelectorAll<HTMLTextAreaElement>('.ctx-notes-textarea')];
    expect(new Set(fields.map(field => field.id)).size).toBe(2);
    for (const field of fields) {
      expect(host.querySelector<HTMLLabelElement>(`label[for="${field.id}"]`)?.textContent).toBe('Additional context');
      expect(host.querySelector(`#${field.getAttribute('aria-describedby')}`)?.textContent).toContain('Anything else');
    }
    expect(host.querySelectorAll('.context-section-title')).toHaveLength(1);
    expect(host.querySelectorAll('[aria-label="Your health context"]')).toHaveLength(1);
    expect(host.querySelectorAll('[data-context-card-action="refresh-all-health-dots"]')).toHaveLength(1);
    expect([...host.querySelectorAll('.context-info-icon')].map(button => button.getAttribute('aria-controls'))).toEqual(['catalog-test-explanation-healthGoals','catalog-test-explanation-diet','other-explanation-healthGoals','other-explanation-diet']);
  });
  it('exposes the same authored structure through the client component contract', async () => {
    const host = document.createElement('div'); document.body.appendChild(host);
    const component = mount(Catalog, { target: host, props: { view: view() } }); flushSync();
    expect(host.querySelectorAll('article.context-card')).toHaveLength(2);
    expect(host.querySelector('textarea')?.value).toBe(view().notes);
    expect(host.querySelector('.context-card-label')?.textContent).toBe('<Goals>');
    await unmount(component); host.remove();
  });
});
describe('demo context consent projection', () => {
  it('omits demo copy for ordinary profiles', () => expect(projectContextDemoBar({ mode: 'standard', live: true, demo: false })).toBeNull());
  it('keeps local inference automatic with the explicit no-paid-token explanation', () => expect(projectContextDemoBar({ ...metadata, mode: 'local-live', live: true, local: true })).toEqual({ kind: 'local', title: 'Local AI active', copy: 'Edited cards update automatically with <Model>. No paid-provider token charges.', action: null, actionLabel: '' }));
  it('requires explicit enablement for paid demo inference and offers revocation only when enabled', () => {
    expect(projectContextDemoBar({ ...metadata, mode: 'paid-off', live: false, local: false })).toMatchObject({ action: 'enable-demo-live-ai', actionLabel: 'Enable live AI', copy: 'Live AI is off to prevent unexpected <Provider> charges.' });
    expect(projectContextDemoBar({ ...metadata, mode: 'paid-live', live: true, local: false })).toMatchObject({ action: 'disable-demo-live-ai', actionLabel: 'Turn off', copy: '<Provider> · <Model>. Context edits may use paid tokens.' });
  });
  it.each(['paused', 'precomputed'] as const)('retains precomputed copy without inference actions in %s mode', mode => {
    const projected = projectContextDemoBar({ ...metadata, mode, live: false });
    expect(projected).toMatchObject({ kind: 'precomputed', title: 'Precomputed demo insights', action: null, actionLabel: '' });
    expect(projected?.copy).toBe(mode === 'paused' ? 'AI is paused. Browsing and editing use no inference.' : 'Browsing and editing use no AI inference. Connect a provider to recalculate changed cards.');
  });
  it('renders provider and model labels as literal text through the demo bar', () => {
    const presentation = view(); presentation.demo = projectContextDemoBar({ ...metadata, mode: 'paid-live', live: true, local: false });
    const host = rendered(presentation);
    expect(host.querySelector('.demo-context-ai-copy')?.textContent).toContain('<Provider> · <Model>');
    expect(host.querySelectorAll('Provider, Model')).toHaveLength(0);
    expect(host.querySelector('[data-context-card-action="disable-demo-live-ai"]')?.textContent).toBe('Turn off');
  });
});
