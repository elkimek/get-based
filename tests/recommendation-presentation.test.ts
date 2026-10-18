// @vitest-environment jsdom
import {readFileSync} from 'node:fs';
import {expect, it} from 'vitest';
import {projectRecommendationCard, projectRecommendationEmpty, projectRecommendationList, type RecommendationPresentationView} from '../js/recommendation-presentation.js';
import {recommendationCardClasses} from '../js/recommendation-cards-classes.js';
import {renderHTML} from '../js/components/RecommendationPresentation.svelte.html.js';
import {renderHTML as renderPageHTML} from '../js/components/RecommendationPage.svelte.html.js';
import type {RecommendationPageView} from '../js/recommendation-page-presentation.js';

function render(view: RecommendationPresentationView) {
  const root = document.createElement('div');
  root.innerHTML = renderHTML({view});
  return root;
}
const candidate = {
  id: 'labs:ferritin:blood_ferritin', source: 'Labs', label: 'Iron context', slotKey: 'blood.ferritin',
  markerId: 'blood_ferritin', markerStatus: 'low', reason: 'Below active reference range',
  meta: 'Blood · 12 µg/L', primaryAction: 'Food examples', saved: false, dismissed: false,
};

it('retains full card copy, optional fragments and delegated actions', () => {
  const root = render({kind: 'card', card: projectRecommendationCard(candidate)});
  expect(root.querySelector('article')?.getAttribute('data-rec-id')).toBe(candidate.id);
  expect(root.querySelector('.rec-next-source')?.textContent).toBe('Labs');
  expect(root.querySelector('.rec-next-head strong')?.textContent).toBe('Iron context');
  expect(root.querySelector('.rec-next-reason')?.textContent).toBe(candidate.reason);
  expect(root.querySelector('.rec-next-meta')?.textContent).toBe(candidate.meta);
  expect(root.querySelector('.rec-next-primary')?.textContent).toBe('Example to exploreFood examples');
  const actions = [...root.querySelectorAll('button')];
  expect(actions.map(el => el.type)).toEqual(Array(5).fill('button'));
  expect(actions.map(el => el.getAttribute('data-dashboard-rec-action'))).toEqual(['open-detail', 'view-marker', 'discuss', 'save', 'dismiss']);
  expect(actions[0]!.getAttribute('data-dashboard-rec-slot-key')).toBe(candidate.slotKey);
  expect(actions[0]!.getAttribute('data-dashboard-rec-label')).toBe(candidate.label);
  expect(actions[0]!.getAttribute('data-dashboard-rec-marker-status')).toBe(candidate.markerStatus);
  expect(actions[1]!.getAttribute('data-dashboard-rec-marker-id')).toBe(candidate.markerId);
  expect(actions.slice(2).map(el => el.getAttribute('data-dashboard-rec-id'))).toEqual(Array(3).fill(candidate.id));
});

it.each([false, true])('retains saved/dismissed labels and inverse actions when saved=%s', saved => {
  const root = render({kind: 'card', card: projectRecommendationCard({...candidate, saved, dismissed: saved})});
  expect(root.querySelector('article')?.classList.contains('is-saved')).toBe(saved);
  const save = root.querySelector('[data-dashboard-rec-action="save"]')!;
  const dismiss = root.querySelector('[data-dashboard-rec-action="dismiss"]')!;
  expect(save.textContent).toBe(saved ? 'Bookmarked' : 'Bookmark');
  expect(dismiss.textContent).toBe(saved ? 'Show' : 'Hide');
  expect(save.getAttribute('data-dashboard-rec-on')).toBe(saved ? 'false' : 'true');
  expect(dismiss.getAttribute('data-dashboard-rec-on')).toBe(saved ? 'false' : 'true');
});

it('retains compact omissions and emits only selected compact padding', () => {
  const root = render({kind: 'card', card: projectRecommendationCard(candidate, true)});
  expect(root.querySelector('article')?.classList.contains('rec-next-card-compact')).toBe(true);
  expect(root.querySelector('.rec-next-primary')).toBeNull();
  expect(root.querySelector('[data-dashboard-rec-action="dismiss"]')).toBeNull();
  expect(root.querySelectorAll('button')).toHaveLength(4);
  expect(recommendationCardClasses(true, false)).toContain('gb:rec-ui:[padding:10px]');
  expect(recommendationCardClasses(true, false)).not.toContain('gb:rec-ui:[padding:12px]');
  expect(recommendationCardClasses(false, false)).toContain('gb:rec-ui:[padding:12px]');
  expect(recommendationCardClasses(false, false)).not.toContain('gb:rec-ui:[padding:10px]');
});

it('renders untrusted literal copy and attributes without markup or executable handlers', () => {
  const literal = '<img src=x onerror="throw 1"> & "quoted"';
  const root = render({kind: 'card', card: projectRecommendationCard({
    id: literal, source: literal, label: literal, slotKey: literal, markerId: literal,
    markerStatus: literal, reason: literal, meta: literal, primaryAction: literal,
  })});
  expect(root.querySelector('img,script,[onclick],[onerror]')).toBeNull();
  expect(root.querySelector('.rec-next-head strong')?.textContent).toBe(literal);
  expect(root.querySelector('.rec-next-meta')?.textContent).toBe(literal);
  expect(root.querySelector('article')?.getAttribute('data-rec-id')).toBe(literal);
  expect(root.querySelector('[data-dashboard-rec-action="open-detail"]')?.getAttribute('data-dashboard-rec-slot-key')).toBe(literal);
  expect(root.querySelector('[data-dashboard-rec-action="view-marker"]')?.getAttribute('data-dashboard-rec-marker-id')).toBe(literal);
});

it('preserves nullish/false/zero attribute omission and original conditional truthiness', () => {
  const root = render({kind: 'card', card: projectRecommendationCard({id: null, source: null, label: false, slotKey: 0, markerId: 0, markerStatus: false, reason: 0, meta: false, primaryAction: 0})});
  expect(root.querySelector('article')?.getAttribute('data-rec-id')).toBe('');
  expect(root.querySelector('.rec-next-source')?.textContent).toBe('');
  expect(root.querySelector('.rec-next-head strong')?.textContent).toBe('false');
  const detail = root.querySelector('[data-dashboard-rec-action="open-detail"]')!;
  expect(detail.getAttribute('data-dashboard-rec-slot-key')).toBe('0');
  expect(detail.getAttribute('data-dashboard-rec-label')).toBe('false');
  expect(detail.hasAttribute('data-dashboard-rec-marker-status')).toBe(false);
  expect(root.querySelector('[data-dashboard-rec-action="discuss"]')?.hasAttribute('data-dashboard-rec-id')).toBe(false);
  expect(root.querySelector('[data-dashboard-rec-action="view-marker"]')).toBeNull();
  expect(root.querySelector('.rec-next-reason')?.textContent).toBe('');
  expect(root.querySelector('.rec-next-meta,.rec-next-primary')).toBeNull();
});

it('preserves card order and input records in authored full lists and compact widgets', () => {
  const candidates = [{...candidate, id: 'second'}, {...candidate, id: 'first'}];
  const before = JSON.stringify(candidates);
  const list = render({kind: 'list', cards: projectRecommendationList(candidates)});
  const widget = render({kind: 'widget', cards: projectRecommendationList(candidates, true)});
  expect([...list.querySelectorAll('.rec-next-list > article')].map(el => el.getAttribute('data-rec-id'))).toEqual(['second', 'first']);
  expect(list.querySelectorAll('[data-dashboard-rec-action="dismiss"]')).toHaveLength(2);
  expect(widget.querySelectorAll('.rec-next-card-compact')).toHaveLength(2);
  const all = widget.querySelector('.rec-next-widget > button')!;
  expect(all.textContent).toBe('View all tips');
  expect(all.getAttribute('data-dashboard-rec-action')).toBe('navigate');
  expect(all.getAttribute('data-dashboard-rec-route')).toBe('recommendations');
  expect(JSON.stringify(candidates)).toBe(before);
});

it('retains loading, disabled and empty affordances with their original shared owners', () => {
  const loading = render({kind: 'loading'});
  expect(loading.querySelector('.dashboard-widget-empty')?.textContent).toBe('Loading tips...');
  const disabled = render({kind: 'disabled'}).querySelector('button')!;
  expect(disabled.className).toBe('db-correlation-empty');
  expect(disabled.getAttribute('data-dashboard-rec-action')).toBe('open-privacy-settings');
  expect(disabled.querySelector('strong')?.textContent).toBe('Tips are off');
  const empty = render({kind: 'empty', empty: projectRecommendationEmpty()}).querySelector('button')!;
  expect(empty.querySelector('strong')?.textContent).toBe('No data-linked tips yet.');
  expect(empty.getAttribute('data-dashboard-rec-action')).toBe('navigate');
  expect(empty.getAttribute('data-dashboard-rec-route')).toBe('labs');
  expect(projectRecommendationEmpty(null).message).toBe('');
});

it('authors all card/list markup without raw HTML and replaces exactly the four page list assemblies', () => {
  for (const path of ['js/components/RecommendationPresentation.svelte', 'js/components/RecommendationCard.svelte']) {
    const source = readFileSync(path, 'utf8');
    expect(source).not.toContain('{@html');
    expect(source).not.toMatch(/style=/);
  }
  const controller = readFileSync('js/dashboard-recommendation-widget.ts', 'utf8');
  const page = readFileSync('js/lens-pages.ts', 'utf8');
  expect(controller).toContain('function renderRecommendationList(candidates: readonly RecRenderCandidate[])');
  for (const variable of ['top', 'rows', 'saved', 'dismissed']) expect(page).toContain(`content: projectRecommendationList(${variable})`);
  expect(page.match(/content: projectRecommendationList\(/g)).toHaveLength(4);
  const authoredPage = readFileSync('js/components/RecommendationPage.svelte', 'utf8');
  expect(authoredPage).toContain("<RecommendationPresentation view={{kind: 'list', cards: widget.content}}/>");
  expect(authoredPage).not.toContain('{@html');
  expect(page).not.toContain('class="rec-next-list"');
  expect(page).not.toContain('.map(c => renderRecommendationCard(c))');
});


it('composes the four typed page list groups through the actual authored recommendation owner', () => {
  const groups = ['top', 'rows', 'saved', 'dismissed'];
  const view: RecommendationPageView = {
    header: {title: 'Tips', subtitle: null, className: '', actions: null}, actions: {buttons: [], affiliate: false},
    content: {kind: 'groups', grid: {route: 'recommendations', orderKey: 'recommendations', widgets: groups.map((id, index) => ({
      view: {id, title: id, description: null, size: 'full', compact: false, tools: {move: null, dashboard: null}},
      content: projectRecommendationList([{...candidate, id, saved: index === 2, dismissed: index === 3}]),
    }))}},
  };
  const before = JSON.stringify(view), root = document.createElement('div'); root.innerHTML = renderPageHTML({view});
  expect([...root.querySelectorAll('[data-widget-id]')].map(element => element.getAttribute('data-widget-id'))).toEqual(groups);
  expect([...root.querySelectorAll('.rec-next-list > article')].map(element => element.getAttribute('data-rec-id'))).toEqual(groups);
  expect(root.querySelectorAll('[data-dashboard-rec-action="dismiss"]')).toHaveLength(4);
  expect(root.querySelector('[data-rec-id="saved"] [data-dashboard-rec-action="save"]')?.textContent).toBe('Bookmarked');
  expect(root.querySelector('[data-rec-id="dismissed"] [data-dashboard-rec-action="dismiss"]')?.textContent).toBe('Show');
  expect(JSON.stringify(view)).toBe(before);
});
