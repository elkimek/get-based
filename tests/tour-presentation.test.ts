// @vitest-environment jsdom
import {readFileSync} from 'node:fs';
import {expect, it} from 'vitest';
import {projectTourPresentation} from '../js/tour-presentation.js';
import {tourClasses} from '../js/tour-classes.js';
import {renderHTML} from '../js/components/TourPresentation.svelte.html.js';

function renderStep(index: number, count: number) {
  const root = document.createElement('div');
  root.innerHTML = renderHTML(projectTourPresentation({title: 'Tour title', text: 'Tour copy'}, index, count));
  return root;
}

it.each([
  {index: 0, count: 5, back: 'Skip', backAction: 'end', backIndex: null, next: 'Next', nextAction: 'go', nextIndex: '1'},
  {index: 2, count: 5, back: 'Back', backAction: 'go', backIndex: '1', next: 'Next', nextAction: 'go', nextIndex: '3'},
  {index: 4, count: 5, back: 'Back', backAction: 'go', backIndex: '3', next: 'Done', nextAction: 'end', nextIndex: null},
  {index: 0, count: 1, back: 'Skip', backAction: 'end', backIndex: null, next: 'Done', nextAction: 'end', nextIndex: null},
])('preserves navigation and progress for step $index of $count', sample => {
  const root = renderStep(sample.index, sample.count);
  expect(root.querySelector('h4')?.id).toBe('tour-tooltip-heading');
  expect(root.querySelector('h4')?.textContent).toBe('Tour title');
  expect(root.querySelector('p')?.textContent).toBe('Tour copy');
  const dots = [...root.querySelectorAll('.tour-dot')];
  expect(dots).toHaveLength(sample.count);
  expect(dots.map(dot => dot.classList.contains('active')))
    .toEqual(Array.from({length: sample.count}, (_, index) => index === sample.index));
  const buttons = [...root.querySelectorAll('button')];
  expect(buttons).toHaveLength(2);
  expect(buttons.map(button => button.type)).toEqual(['button', 'button']);
  expect(buttons.map(button => button.textContent)).toEqual([sample.back, sample.next]);
  expect(buttons.map(button => button.getAttribute('data-tour-action')))
    .toEqual([sample.backAction, sample.nextAction]);
  expect(buttons.map(button => button.getAttribute('data-tour-index')))
    .toEqual([sample.backIndex, sample.nextIndex]);
  expect(buttons[0]!.classList.contains('tour-btn-secondary')).toBe(true);
  expect(buttons[1]!.classList.contains('tour-btn-primary')).toBe(true);
  expect(root.querySelector('[onclick]')).toBeNull();
});

it('escapes literal title and copy and leaves the source step unchanged', () => {
  const step = {title: '<img src=x onerror="throw 1">', text: '<script>throw 1</script> & "quoted"'};
  const before = {...step};
  const root = document.createElement('div');
  root.innerHTML = renderHTML(projectTourPresentation(step, 0, 1));
  expect(root.querySelector('h4')?.textContent).toBe(step.title);
  expect(root.querySelector('p')?.textContent).toBe(step.text);
  expect(root.querySelector('img,script,[onerror]')).toBeNull();
  expect(step).toEqual(before);
});

it('keeps authored presentation and controller-owned position separate', () => {
  const component = readFileSync('js/components/TourPresentation.svelte', 'utf8');
  const controller = readFileSync('js/tour.ts', 'utf8');
  expect(component).not.toContain('{@html');
  expect(controller).toContain('tooltip.innerHTML = renderTourPresentation(projectTourPresentation(step, index, steps.length))');
  expect(controller).not.toContain('dotsHtml');
  expect(controller).not.toContain('tourActionAttrs');
  expect(component).not.toMatch(/style=/);
  expect(tourClasses('tour-tooltip')).not.toMatch(/\[(?:left|top|height|transform):/);
  expect(tourClasses('tour-spotlight')).not.toMatch(/\[(?:left|top|width|height|transform):/);
  expect(tourClasses('tour-btn')).toContain('focus-visible:[outline:2px_solid_var(--accent)]');
});
