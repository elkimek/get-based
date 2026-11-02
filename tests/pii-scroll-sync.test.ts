import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {JSDOM} from 'jsdom';
import {activePIIRightScroller, syncPIIReviewScroll} from '../js/pii-scroll-sync.js';

let window: JSDOM['window'];
beforeEach(() => {
  window = new JSDOM('<!doctype html><body></body>', {pretendToBeVisual: true}).window;
  for (const name of ['window', 'document', 'HTMLElement', 'Event']) vi.stubGlobal(name, Reflect.get(window, name));
});
afterEach(() => { window.close(); vi.unstubAllGlobals(); });

/** jsdom has no layout: give an element a fixed box and content size. */
function box(element: HTMLElement, size: {client: number; scroll: number; clientWidth?: number; scrollWidth?: number}) {
  let top = 0, left = 0;
  const writes: number[] = [];
  Object.defineProperties(element, {
    clientHeight: {configurable: true, get: () => size.client},
    scrollHeight: {configurable: true, get: () => size.scroll},
    clientWidth: {configurable: true, get: () => size.clientWidth ?? 100},
    scrollWidth: {configurable: true, get: () => size.scrollWidth ?? 100},
    scrollTop: {configurable: true, get: () => top, set: (value: number) => { writes.push(value); top = Math.max(0, Math.min(value, size.scroll - size.client)); }},
    scrollLeft: {configurable: true, get: () => left, set: (value: number) => { left = Math.max(0, Math.min(value, (size.scrollWidth ?? 100) - (size.clientWidth ?? 100))); }},
  });
  return writes;
}

function panes() {
  document.body.innerHTML = '<div class="pii-diff-viewer pii-review-viewer"><div class="pii-diff-left"></div><div class="pii-diff-right"><details class="pii-thinking-section"><pre class="pii-thinking-content"></pre></details><textarea class="pii-edit-textarea"></textarea></div></div>';
  const left = document.querySelector<HTMLElement>('.pii-diff-left')!;
  const right = document.querySelector<HTMLElement>('.pii-diff-right')!;
  const textarea = document.querySelector<HTMLElement>('.pii-edit-textarea')!;
  const thinking = document.querySelector<HTMLElement>('.pii-thinking-content')!;
  return {left, right, textarea, thinking};
}
const scroll = (element: HTMLElement) => element.dispatchEvent(new window.Event('scroll'));

describe('privacy review scroll sync', () => {
  it('syncs left → editable textarea and textarea → left without echo loops', () => {
    const {left, right, textarea} = panes();
    const leftWrites = box(left, {client: 100, scroll: 1100, clientWidth: 100, scrollWidth: 300});
    const textWrites = box(textarea, {client: 100, scroll: 1100, clientWidth: 100, scrollWidth: 300});
    box(right, {client: 120, scroll: 120});
    syncPIIReviewScroll(left, right);

    left.scrollTop = 500; left.scrollLeft = 100; scroll(left);
    expect(textarea.scrollTop).toBe(500);
    expect(textarea.scrollLeft).toBe(100);
    scroll(textarea); // the echo of our own write
    expect(leftWrites).toEqual([500]);

    textarea.scrollTop = 250; scroll(textarea);
    expect(left.scrollTop).toBe(250);
    scroll(left); // echo
    expect(textWrites).toEqual([500, 250]);
    expect((textarea as HTMLTextAreaElement).readOnly).toBe(false);
  });

  it('maps proportionally when the panes have different scroll ranges', () => {
    const {left, right, textarea} = panes();
    box(left, {client: 100, scroll: 1100});
    box(textarea, {client: 100, scroll: 600});
    box(right, {client: 120, scroll: 120});
    syncPIIReviewScroll(left, right);
    left.scrollTop = 500; scroll(left);
    expect(textarea.scrollTop).toBe(250);
  });

  it('follows the diff preview or the pane itself when the textarea is hidden', () => {
    const {left, right, textarea} = panes();
    textarea.style.display = 'none';
    const preview = document.createElement('div');
    preview.className = 'pii-diff-preview';
    right.insertBefore(preview, textarea);
    box(left, {client: 100, scroll: 1100});
    box(textarea, {client: 0, scroll: 0});
    box(preview, {client: 1000, scroll: 1000});
    box(right, {client: 100, scroll: 1100});
    expect(activePIIRightScroller(right)).toBe(right);
    syncPIIReviewScroll(left, right);
    left.scrollTop = 300; scroll(left);
    expect(right.scrollTop).toBe(300);
    right.scrollTop = 700; scroll(right);
    expect(left.scrollTop).toBe(700);
  });

  it('ignores unrelated scrollers inside the right pane and stops after teardown', () => {
    const {left, right, textarea, thinking} = panes();
    box(left, {client: 100, scroll: 1100});
    box(textarea, {client: 100, scroll: 1100});
    box(thinking, {client: 50, scroll: 500});
    box(right, {client: 120, scroll: 120});
    const stop = syncPIIReviewScroll(left, right);
    thinking.scrollTop = 400; scroll(thinking);
    expect(left.scrollTop).toBe(0);
    stop();
    left.scrollTop = 300; scroll(left);
    expect(textarea.scrollTop).toBe(0);
  });
});
