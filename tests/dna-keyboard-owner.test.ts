// @vitest-environment jsdom
import {afterEach, beforeAll, describe, expect, it, vi} from 'vitest';

// Compose the real two event owners. Their shell dependencies are unused in
// these keyboard fixtures; no private handler or duplicate click algorithm.
vi.mock('../js/state.js', () => ({state: {currentView: 'reports'}}));
vi.mock('../js/data.js', () => ({registerRefreshCallback: vi.fn()}));
vi.mock('../js/nav.js', () => ({buildSidebar: vi.fn()}));
vi.mock('../js/tour.js', () => ({endTour: vi.fn()}));
vi.mock('../js/action-attributes.js', () => ({actionAttributes: () => {
  throw new Error('Keyboard ownership must not render action markup');
}}));
const app = await import('../js/app-event-listeners.js');
const dna = await import('../js/dna-actions.js');
beforeAll(() => {
  // Production installs the generic owner before the lazy DNA delegate.
  app.installGlobalEventListeners();
  dna.initDnaActionDelegates();
  dna.initDnaActionDelegates(); // Reopening must not add a second owner.
});
afterEach(() => document.body.replaceChildren());
function host(markup: string): HTMLElement {
  document.body.innerHTML = markup;
  const target = document.querySelector<HTMLElement>('#target');
  if (!target) throw new Error('Missing native keyboard fixture');
  return target;
}
function key(target: Element, value: string): KeyboardEvent {
  // Synthetic unit events exercise actual delegates; trusted input is proved
  // separately by the retained original/current headless browser receipts.
  const event = new KeyboardEvent('keydown', {key: value, bubbles: true, cancelable: true});
  target.dispatchEvent(event);
  return event;
}
function group(): HTMLElement {
  return host('<section class="genetics-section"><div class="dna-preview-group"><div id="target" role="button" tabindex="0" data-dna-action="toggle-preview-group"><span>Group</span></div></div></section>');
}
describe('DNA keyboard action ownership', () => {
  it.each(['Enter', ' '])('activates a group once with %j', value => {
    const target = group();
    const click = vi.fn();target.addEventListener('click', click);
    expect(key(target, value).defaultPrevented).toBe(true);
    expect(click).toHaveBeenCalledOnce();
    expect(target.parentElement!.classList.contains('expanded')).toBe(true);
  });
  it('Enter expands and Space collapses with exactly two total activations', () => {
    const target = group();
    const click = vi.fn();target.addEventListener('click', click);
    key(target, 'Enter');
    expect(target.parentElement!.classList.contains('expanded')).toBe(true);
    key(target, ' ');
    expect(target.parentElement!.classList.contains('expanded')).toBe(false);
    expect(click).toHaveBeenCalledTimes(2);
  });
  it.each(['Enter', ' '])('retains DNA delegation from a nested child for %j', value => {
    const target = group();
    const click = vi.fn();target.addEventListener('click', click);
    expect(key(target.firstElementChild!, value).defaultPrevented).toBe(true);
    expect(click).toHaveBeenCalledOnce();
    expect(target.parentElement!.classList.contains('expanded')).toBe(true);
  });
  it.each(['Enter', ' '])('retains generic role-button activation for %j', value => {
    const target = host('<div id="target" role="button" tabindex="0">Other control</div>');
    const click = vi.fn();target.addEventListener('click', click);
    expect(key(target, value).defaultPrevented).toBe(true);
    expect(click).toHaveBeenCalledOnce();
  });
  it('does not activate DNA actions outside their owned scope', () => {
    const target = host('<div><div id="target" role="button" tabindex="0" data-dna-action="toggle-preview-group">Outside</div></div>');
    const click = vi.fn();target.addEventListener('click', click);
    expect(key(target, 'Enter').defaultPrevented).toBe(false);
    expect(key(target, ' ').defaultPrevented).toBe(false);
    expect(click).not.toHaveBeenCalled();
    expect(target.parentElement!.classList.contains('expanded')).toBe(false);
  });
  it('keeps unrelated keys and negative tabindex outside generic activation', () => {
    const target = host('<div id="target" role="button" tabindex="0">Other control</div>');
    const click = vi.fn();target.addEventListener('click', click);
    expect(key(target, 'ArrowDown').defaultPrevented).toBe(false);
    target.tabIndex = -1;
    expect(key(target, 'Enter').defaultPrevented).toBe(false);
    expect(key(target, ' ').defaultPrevented).toBe(false);
    expect(click).not.toHaveBeenCalled();
  });
  it.each(['button', 'a', 'input', 'select', 'textarea'])('leaves native %s keyboard handling alone', tag => {
    const target = host(`<${tag} id="target" role="button" tabindex="0"></${tag}>`);
    const click = vi.fn();target.addEventListener('click', click);
    expect(key(target, 'Enter').defaultPrevented).toBe(false);
    expect(key(target, ' ').defaultPrevented).toBe(false);
    expect(click).not.toHaveBeenCalled();
  });
  it.each(['onkeydown', 'data-chat-key-action', 'data-chat-message-action', 'data-cl-key-action'])('preserves the existing %s owner exclusion', attribute => {
    const target = host('<div id="target" role="button" tabindex="0">Owned elsewhere</div>');
    target.setAttribute(attribute, '');
    const click = vi.fn();target.addEventListener('click', click);
    expect(key(target, 'Enter').defaultPrevented).toBe(false);
    expect(key(target, ' ').defaultPrevented).toBe(false);
    expect(click).not.toHaveBeenCalled();
  });
});
