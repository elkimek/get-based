// pii-scroll-sync.ts — side-by-side scroll sync for the privacy Review & Edit panes.
//
// The right pane scrolls through whichever element is showing: the editable
// textarea, the diff preview, or the pane itself. Scroll events do not bubble,
// so the right pane listens in the capture phase. Programmatic positions are
// remembered per element and the echo event they cause is ignored, which keeps
// the two panes from driving each other in a loop.

type Axis = 'top' | 'left';

function isShown(element: HTMLElement) {
  return element.isConnected && element.style.display !== 'none' && element.clientHeight > 0;
}

function range(element: HTMLElement, axis: Axis) {
  return axis === 'top'
    ? element.scrollHeight - element.clientHeight
    : element.scrollWidth - element.clientWidth;
}

function position(element: HTMLElement, axis: Axis) {
  return axis === 'top' ? element.scrollTop : element.scrollLeft;
}

/** Picks the element that actually scrolls inside the right pane right now. */
export function activePIIRightScroller(rightPane: HTMLElement): HTMLElement {
  const candidates = [
    rightPane.querySelector<HTMLElement>('.pii-edit-textarea'),
    rightPane.querySelector<HTMLElement>('.pii-diff-preview'),
  ];
  for (const candidate of candidates) {
    if (candidate && isShown(candidate) && (range(candidate, 'top') > 0 || range(candidate, 'left') > 0)) return candidate;
  }
  return rightPane;
}

export function syncPIIReviewScroll(leftPane: HTMLElement, rightPane: HTMLElement): () => void {
  const pending = new WeakMap<HTMLElement, { top: number; left: number }>();

  const apply = (source: HTMLElement, target: HTMLElement) => {
    if (source === target || !isShown(source) || !isShown(target)) return;
    const next = { top: target.scrollTop, left: target.scrollLeft };
    for (const axis of ['top', 'left'] as const) {
      const sourceRange = range(source, axis);
      const targetRange = range(target, axis);
      if (sourceRange <= 0 || targetRange <= 0) continue;
      next[axis] = Math.round((position(source, axis) / sourceRange) * targetRange);
    }
    if (next.top === target.scrollTop && next.left === target.scrollLeft) return;
    pending.set(target, next);
    target.scrollTop = next.top;
    target.scrollLeft = next.left;
  };

  const isEcho = (element: HTMLElement) => {
    const expected = pending.get(element);
    if (!expected) return false;
    pending.delete(element);
    return Math.abs(element.scrollTop - expected.top) <= 1 && Math.abs(element.scrollLeft - expected.left) <= 1;
  };

  const onLeftScroll = () => {
    if (isEcho(leftPane)) return;
    apply(leftPane, activePIIRightScroller(rightPane));
  };
  const onRightScroll = (event: Event) => {
    const source = event.target;
    if (!(source instanceof HTMLElement) || !rightPane.contains(source)) return;
    if (source !== rightPane && !source.matches('.pii-edit-textarea, .pii-diff-preview')) return;
    if (isEcho(source)) return;
    apply(source, leftPane);
  };

  leftPane.addEventListener('scroll', onLeftScroll, { passive: true });
  rightPane.addEventListener('scroll', onRightScroll, { capture: true, passive: true });
  return () => {
    leftPane.removeEventListener('scroll', onLeftScroll);
    rightPane.removeEventListener('scroll', onRightScroll, { capture: true });
  };
}
