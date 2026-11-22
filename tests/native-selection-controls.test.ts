// @vitest-environment jsdom
import {createRequire} from 'node:module';
import {expect, it} from 'vitest';
import {renderCompareDatesPage, type CompareDatesPageView} from '../js/compare-dates-presentation.js';
import {renderCorrelationsOptions, renderCorrelationNoResults, type CorrelationsOptionsView} from '../js/correlations-selection-presentation.js';
import {projectEmojiPicker, renderEmojiPicker} from '../js/emoji-picker-presentation.js';
import {projectKnowledgeBaseLibraryCreate} from '../js/knowledge-base-library-presentation.js';
import {renderKnowledgeBaseLibraryCreate} from '../js/knowledge-base-library-rendering.js';
import {projectDeviceRecommendations} from '../js/light-device-recommendations-presentation.js';
import {renderHTML as renderDeviceOptions} from '../js/components/LightDeviceRecommendations.svelte.html.js';
import {projectPIIDiff} from '../js/pii-review.js';
import {renderPIIReviewModal} from '../js/pii-review-presentation.js';
import {projectWearableSourcePicker, renderWearableSourcePicker} from '../js/wearables-entry-presentation.js';
import {expectNativeReview} from './helpers/native-review-dom.js';

const load = createRequire(import.meta.url);

it.each([false, true])('retains the native privacy review send guard while streaming is %s', async streaming => {
  const native = load('../js/components/PIIReviewModal.svelte.native.js') as typeof import('../js/components/PIIReviewModal.svelte.native.js');
  const initial = 'Synthetic replacement <literal>\nOther retained text';
  const left = projectPIIDiff('Synthetic original\n\nOther retained text', initial).left;
  await expectNativeReview(renderPIIReviewModal(left, initial, streaming), root => {
    const owned = native.mount(native.default, {target: root, props: {view: {left, initial, streaming}}});
    native.flushSync();
    return () => native.unmount(owned);
  }, root => {
    const draft = root.querySelector<HTMLTextAreaElement>('#pii-edit-textarea');
    expect(draft?.readOnly).toBe(streaming);
    expect(draft?.value).toBe(initial);
    expect(draft?.value).not.toContain('Synthetic original');
    expect(root.querySelector<HTMLButtonElement>('#pii-review-send')?.disabled).toBe(streaming);
    expect(root.querySelector('.pii-diff-left')?.textContent).toContain('Synthetic original');
  }, '#pii-search-input');
});

it('sets only the recommended profile as the native library creation default', async () => {
  const native = load('../js/components/KnowledgeBaseLibraryCreate.svelte.native.js') as typeof import('../js/components/KnowledgeBaseLibraryCreate.svelte.native.js');
  const view = projectKnowledgeBaseLibraryCreate({deviceLine: 'Local device fixture', models: [
    {key: 'balanced', isRecommended: true, profileLabel: 'Balanced', label: 'Local test model', downloadMB: 105,
      langLabel: 'English', notes: 'Synthetic default note'},
    {key: 'deep', isRecommended: false, profileLabel: 'Detailed', label: 'Alternate test model', downloadMB: 110,
      langLabel: 'English', notes: 'Synthetic alternate note'},
  ]});
  await expectNativeReview(renderKnowledgeBaseLibraryCreate(view), root => {
    const owned = native.mount(native.default, {target: root, props: {view}});
    native.flushSync();
    return () => native.unmount(owned);
  }, root => {
    const selected = root.querySelector<HTMLInputElement>('input[name="lens-create-model"]:checked');
    expect(selected?.value).toBe('balanced');
    const alternate = root.querySelector<HTMLInputElement>('input[value="deep"]');
    expect(alternate?.checked).toBe(false);
    alternate!.click();
    expect(selected?.checked).toBe(false);
    expect(alternate?.checked).toBe(true);
    expect(root.querySelector<HTMLInputElement>('#lens-create-name')?.value).toBe('');
  }, '#lens-create-name');
});

const categories = [
  {id: 'nature', label: 'Nature', icon: '🌱', emojis: ['🌱', '🍃']},
  {id: 'science', label: 'Science', icon: '🧪', emojis: ['🧪', '🧬']},
];

it.each(['', 'no matching group'])('retains native category and search state for emoji query %j', async search => {
  const native = load('../js/components/EmojiPicker.svelte.native.js') as typeof import('../js/components/EmojiPicker.svelte.native.js');
  const view = projectEmojiPicker(search, 'science', categories, () => true);
  const serialized = document.createElement('template');
  serialized.innerHTML = renderEmojiPicker(search, 'science', categories, () => true);
  const inactive = serialized.content.querySelector('button[data-cat="nature"]');
  expect(inactive?.getAttribute('class')).toBe('');
  // The native client omits the empty class. The HTML contract retains it.
  inactive!.removeAttribute('class');
  await expectNativeReview(serialized.innerHTML, root => {
    const owned = native.mount(native.default, {target: root, props: {view}});
    native.flushSync();
    return () => native.unmount(owned);
  }, root => {
    expect(root.querySelector('button.active')?.getAttribute('data-cat')).toBe('science');
    expect(root.querySelector('button[data-cat="nature"]')?.getAttribute('class')).toBeNull();
    expect(root.querySelector('button[data-cat="__reset"]')?.getAttribute('title')).toBe('Reset to default');
    expect(Array.from(root.querySelectorAll('[data-emoji]'), emoji => emoji.textContent)).toEqual(search ? [] : ['🧪', '🧬']);
    expect(root.querySelector<HTMLInputElement>('input')?.value).toBe(search);
  }, 'input');
});

it.each(['manual', 'automatic'] as const)('retains the native wearable source picker %s selection', async source => {
  const native = load('../js/components/WearableSourcePicker.svelte.native.js') as typeof import('../js/components/WearableSourcePicker.svelte.native.js');
  const current = source === 'manual' ? source : '';
  const input = {label: () => 'Weight', ids: ['manual', 'fixture-device'], current,
    name: (id: string) => id === 'manual' ? 'Manual log' : 'Synthetic device', automatic: () => current};
  const view = projectWearableSourcePicker(input);
  await expectNativeReview(renderWearableSourcePicker(input), root => {
    const owned = native.mount(native.default, {target: root, props: {view}});
    native.flushSync();
    return () => native.unmount(owned);
  }, root => {
    expect(Array.from(root.querySelectorAll('button'), button => button.dataset.source)).toEqual(['manual', 'fixture-device', '']);
    expect(root.querySelector('button.selected')?.getAttribute('data-source') ?? '').toBe(current);
    expect(root.querySelector('button[data-source=""]')?.textContent).toContain('Auto (most recent)');
  });
});

it('retains native Light device link attribution and the local privacy control', async () => {
  const native = load('../js/components/LightDeviceRecommendations.svelte.native.js') as typeof import('../js/components/LightDeviceRecommendations.svelte.native.js');
  const view = projectDeviceRecommendations('Morning', [
    {href: 'https://fixture.invalid/one', event: 'Synthetic one', name: 'Option one', vendor: 'Fixture store', blurb: 'Synthetic detail'},
    {href: 'https://fixture.invalid/two', event: 'Synthetic two', name: 'Option two', vendor: 'Fixture store', blurb: ''},
  ])!;
  await expectNativeReview(renderDeviceOptions({view}), root => {
    const owned = native.mount(native.default, {target: root, props: {view}});
    native.flushSync();
    return () => native.unmount(owned);
  }, root => {
    const links = Array.from(root.querySelectorAll<HTMLAnchorElement>('a'));
    expect(links.map(link => [link.target, link.rel, link.getAttribute('aria-label')])).toEqual([
      ['_blank', 'noopener sponsored', 'View Option one on Fixture store, opens in new tab'],
      ['_blank', 'noopener sponsored', 'View Option two on Fixture store, opens in new tab'],
    ]);
    expect(root.querySelector('[data-rec-action="open-privacy-settings"]')?.textContent).toBe('turn off');
  });
});

it.each(['empty', 'with dates'] as const)('retains native date comparison controls when %s', async mode => {
  const native = load('../js/components/CompareDatesPage.svelte.native.js') as typeof import('../js/components/CompareDatesPage.svelte.native.js');
  const older = {value: '2025-01-01', label: 'January 1, 2025'};
  const newer = {value: '2025-02-01', label: 'February 1, 2025'};
  const view: CompareDatesPageView = mode === 'empty'
    ? {kind: 'empty'} : {kind: 'dates', first: [older, newer], second: [newer, older]};
  await expectNativeReview(renderCompareDatesPage(view), root => {
    const owned = native.mount(native.default, {target: root, props: {view}});
    native.flushSync();
    return () => native.unmount(owned);
  }, root => {
    expect(Array.from(root.querySelectorAll('select'), select => select.value)).toEqual(mode === 'empty' ? [] : [older.value, newer.value]);
    if (mode === 'empty') expect(root.textContent).toContain('Import at least 2 lab result dates');
    else expect(root.querySelector('[data-compare-action="swap-dates"]')?.getAttribute('aria-label')).toBe('Swap dates');
  });
});

it.each(['empty', 'options'] as const)('retains native correlation choice roles when %s', async kind => {
  const native = load('../js/components/CorrelationsSelectionOptions.svelte.native.js') as typeof import('../js/components/CorrelationsSelectionOptions.svelte.native.js');
  const view: CorrelationsOptionsView = kind === 'empty' ? {kind} : {kind, options: [
    {kind: 'marker', selected: true, key: 'fixture-marker', name: 'Marker', category: 'Chemistry', label: 'Marker', categoryLabel: 'Chemistry', count: '2'},
    {kind: 'therapy', selected: false, key: 'fixture-therapy', name: 'Recorded therapy', label: 'Recorded therapy', category: 'Supplement', date: '2025-01-01'},
  ]};
  await expectNativeReview(view.kind === 'empty' ? renderCorrelationNoResults() : renderCorrelationsOptions(view.options), root => {
    const owned = native.mount(native.default, {target: root, props: {view}});
    native.flushSync();
    return () => native.unmount(owned);
  }, root => {
    if (kind === 'empty') expect(root.querySelector<HTMLElement>('#corr-no-results')?.hidden).toBe(true);
    else {
      expect(root.querySelector('[role="option"]')?.getAttribute('aria-selected')).toBe('true');
      expect(root.querySelector('[role="button"]')?.getAttribute('data-compare-action')).toBe('toggle-therapy');
    }
  });
});
