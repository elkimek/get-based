// Shared native candidate boundary for static and lifecycle-owned modal traps.
const MODAL_FOCUSABLE_SELECTOR = 'button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],summary,[tabindex]:not([tabindex="-1"])';

export function getModalFocusables(container: Element): HTMLElement[] {
  const view = container.ownerDocument.defaultView;
  if (!view || !container.isConnected) return [];
  return Array.from(container.querySelectorAll(MODAL_FOCUSABLE_SELECTOR)).filter(
    (node): node is HTMLElement => {
      if (!(node instanceof view.HTMLElement) || node.tabIndex < 0 || node.matches(':disabled')) return false;
      if (node instanceof view.HTMLInputElement && node.type === 'hidden') return false;
      const visibility = view.getComputedStyle(node).visibility;
      if (visibility === 'hidden' || visibility === 'collapse') return false;
      for (let ancestor: Element | null = node; ancestor; ancestor = ancestor.parentElement) {
        if (ancestor.hasAttribute('inert') || view.getComputedStyle(ancestor).display === 'none') return false;
        if (ancestor !== node && ancestor instanceof view.HTMLDetailsElement && !ancestor.open) {
          const summary: Element | undefined = Array.from(ancestor.children).find(child => child.tagName === 'SUMMARY');
          if (!summary?.contains(node)) return false;
        }
      }
      return true;
    },
  );
}
