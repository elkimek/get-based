// @vitest-environment jsdom
import {afterEach, beforeAll, describe, expect, it, vi} from 'vitest';
import {getModalFocusables} from '../js/modal-focusable.js';
import {openModalOverlay, trapModalFocus} from '../js/modal-lifecycle.js';

vi.mock('../js/state.js', () => ({state: {currentView: 'reports'}}));
vi.mock('../js/data.js', () => ({registerRefreshCallback: vi.fn()}));
vi.mock('../js/nav.js', () => ({buildSidebar: vi.fn()}));
vi.mock('../js/tour.js', () => ({endTour: vi.fn()}));
const appEvents = await import('../js/app-event-listeners.js');
const disposers: (() => void)[] = [];
beforeAll(() => appEvents.installGlobalEventListeners());
afterEach(() => {
  for (const dispose of disposers.splice(0).reverse()) dispose();
  document.body.replaceChildren();
  document.body.style.overflow = '';
});
function host(markup: string): HTMLElement {
  const el = document.createElement('div');
  el.className = 'modal-overlay show';
  el.innerHTML = `<div class="modal" role="dialog">${markup}</div>`;
  document.body.append(el);
  return el;
}
function press(target: Element, shiftKey = false): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {key: 'Tab', shiftKey, bubbles: true, cancelable: true});
  target.dispatchEvent(event);
  return event;
}
describe('visible native modal focus candidates', () => {
  it('excludes hidden, disabled, negative-tabindex and inert ancestors without opacity/ARIA heuristics', () => {
    const el = host(`<input type="hidden"><input style="display:none"><button disabled>No</button>
      <div style="display:none"><button>No</button></div><div style="visibility:hidden"><button>No</button></div>
      <button style="visibility:collapse">No</button><div inert><button>No</button></div><button tabindex="-1">No</button>
      <fieldset disabled><legend><button id="legend">Legend exception</button></legend><input></fieldset>
      <button id="first">First</button><button id="alpha" style="opacity:0" aria-hidden="true">Alpha</button>`);
    const before = el.outerHTML;
    expect(getModalFocusables(el).map(node => node.id)).toEqual(['legend', 'first', 'alpha']);
    expect(el.outerHTML).toBe(before);
    el.remove();
    expect(getModalFocusables(el)).toEqual([]);
  });
  it('keeps only the first summary subtree of closed details and permits inherited visibility override', () => {
    const el = host(`<details tabindex="0" id="closed-details"><summary id="summary">Summary <button id="summary-child">Child</button></summary>
      <summary>Hidden second summary</summary><button id="closed-child">Hidden</button></details>
      <details open><summary id="open-summary">Open</summary><button id="open-child">Child</button></details>
      <div style="visibility:hidden"><button style="visibility:visible" id="override">Visible override</button></div>`);
    expect((el.querySelector('#summary') as HTMLElement).tabIndex).toBe(0);
    expect((el.querySelector('details > summary:nth-of-type(2)') as HTMLElement).tabIndex).toBe(-1);
    expect(getModalFocusables(el).map(node => node.id)).toEqual(['closed-details', 'summary', 'summary-child', 'open-summary', 'open-child', 'override']);
  });
  it('static owner enters visible controls and wraps both ends despite a hidden first and last input', () => {
    const el = host('<input id="cl-json-import" style="display:none"><button id="first">First</button><button id="last">Last</button><input type="hidden">');
    const outside = document.createElement('button');document.body.prepend(outside);outside.focus();
    expect(press(outside).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(el.querySelector('#first'));
    expect(press(el.querySelector('#first')!, true).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(el.querySelector('#last'));
    expect(press(el.querySelector('#last')!).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(el.querySelector('#first'));
  });
  it('static trap reaches the unadorned archived summary and follows its native open state', () => {
    const el = host('<button id="first">First</button><details><summary class="cl-archived-header">Archived</summary><button id="archive-row">Archived row</button></details>');
    const summary = el.querySelector('summary')!;
    const first = el.querySelector<HTMLElement>('#first')!;
    expect(getModalFocusables(el)).toEqual([first, summary]);
    first.focus();
    expect(press(first, true).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(summary);
    expect(press(summary).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(first);
    el.querySelector('details')!.open = true;
    const row = el.querySelector<HTMLElement>('#archive-row')!;
    expect(getModalFocusables(el)).toEqual([first, summary, row]);
    row.focus();
    expect(press(row).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(first);
  });
  it('static delayed opening autofocus skips hidden import and respects existing workflow focus', async () => {
    const outside = document.createElement('button');document.body.append(outside);outside.focus();
    const el = host('<input id="cl-json-import" style="display:none"><input id="search"><button id="chosen">Chosen</button>');
    openModalOverlay(el, {focusDelay: 0});
    await vi.waitFor(() => expect(document.activeElement).toBe(el.querySelector('#search')));
    const chosen = el.querySelector<HTMLElement>('#chosen')!;
    chosen.focus();
    openModalOverlay(el, {focusDelay: 0});
    await new Promise(resolve => setTimeout(resolve, 30));
    expect(document.activeElement).toBe(chosen);
  });
  it('managed lifecycle auto-focus uses the same visible boundary and only the top trap handles Tab', async () => {
    const older = host('<button id="older">Older</button>');older.setAttribute('data-modal-lifecycle-managed', '');
    disposers.push(trapModalFocus(older, {autoFocus: false, closeOnEscape: false}));
    const top = host('<input style="display:none"><button id="top-first">First</button><button id="top-last">Last</button>');
    top.setAttribute('data-modal-lifecycle-managed', '');
    disposers.push(trapModalFocus(top, {closeOnEscape: false}));
    await vi.waitFor(() => expect(document.activeElement).toBe(top.querySelector('#top-first')));
    expect(press(top.querySelector('#top-first')!, true).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(top.querySelector('#top-last'));
    expect(press(top.querySelector('#top-last')!).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(top.querySelector('#top-first'));
  });
});
