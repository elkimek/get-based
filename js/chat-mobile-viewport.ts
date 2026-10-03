// Keep the mobile chat chrome inside the visual viewport when the software
// keyboard resizes or pans it independently of the layout viewport.

const MOBILE_CHAT_QUERY = '(max-width: 768px)';
const VIEWPORT_TOP_PROPERTY = '--chat-visual-viewport-top';
const VIEWPORT_BOTTOM_PROPERTY = '--chat-visual-viewport-bottom';
const PASSIVE_LISTENER_OPTIONS = { passive: true };

let activePanel: HTMLElement | null = null;
let activeRuntime: Window | null = null;
let activeVisualViewport: VisualViewport | null = null;

function getRuntimeWindow() {
  return typeof window !== 'undefined' ? window : null;
}

function finitePositiveNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

function finiteNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function isMobileChatViewport(runtime: Window) {
  if (typeof runtime.matchMedia === 'function') {
    return runtime.matchMedia(MOBILE_CHAT_QUERY).matches;
  }
  const width = finitePositiveNumber(runtime.innerWidth);
  return width != null && width <= 768;
}

function clearMobileChatViewportInsets(panel: HTMLElement) {
  panel.style.removeProperty(VIEWPORT_TOP_PROPERTY);
  panel.style.removeProperty(VIEWPORT_BOTTOM_PROPERTY);
}

/**
 * Return the portions of the layout viewport hidden above and below the
 * visual viewport. Android keyboards generally change only the bottom inset;
 * iOS may also pan the visual viewport, producing a non-zero top inset.
 *
 */
export function getMobileChatViewportInsets(runtime: Window | null = getRuntimeWindow()) {
  const visualViewport = runtime?.visualViewport;
  if (!runtime || !visualViewport) return null;

  const root = typeof document !== 'undefined' ? document.documentElement : null;
  const layoutHeight = finitePositiveNumber(runtime.innerHeight)
    || finitePositiveNumber(root?.clientHeight);
  const viewportTop = finiteNumber(visualViewport.offsetTop);
  const viewportHeight = finitePositiveNumber(visualViewport.height);
  if (layoutHeight == null || viewportTop == null || viewportHeight == null) return null;

  const top = Math.max(0, Math.ceil(viewportTop));
  const bottom = Math.max(0, Math.ceil(layoutHeight - top - viewportHeight));
  return { top, bottom };
}

export function syncMobileChatViewport(panel: HTMLElement | null = activePanel) {
  const runtime = getRuntimeWindow();
  if (!panel) return false;
  const insets = runtime && isMobileChatViewport(runtime)
    ? getMobileChatViewportInsets(runtime)
    : null;

  if (!panel.classList.contains('open') || !insets) {
    clearMobileChatViewportInsets(panel);
    return false;
  }

  panel.style.setProperty(VIEWPORT_TOP_PROPERTY, `${insets.top}px`);
  panel.style.setProperty(VIEWPORT_BOTTOM_PROPERTY, `${insets.bottom}px`);
  return true;
}

function handleMobileChatViewportChange() {
  syncMobileChatViewport();
}

export function startMobileChatViewportSync(panel: HTMLElement | null) {
  stopMobileChatViewportSync();
  if (!panel) return false;

  activePanel = panel;
  activeRuntime = getRuntimeWindow();
  activeVisualViewport = activeRuntime?.visualViewport || null;

  activeRuntime?.addEventListener(
    'resize',
    handleMobileChatViewportChange,
    PASSIVE_LISTENER_OPTIONS,
  );
  activeVisualViewport?.addEventListener(
    'resize',
    handleMobileChatViewportChange,
    PASSIVE_LISTENER_OPTIONS,
  );
  activeVisualViewport?.addEventListener(
    'scroll',
    handleMobileChatViewportChange,
    PASSIVE_LISTENER_OPTIONS,
  );
  return syncMobileChatViewport(panel);
}

export function stopMobileChatViewportSync() {
  activeRuntime?.removeEventListener(
    'resize',
    handleMobileChatViewportChange,
  );
  activeVisualViewport?.removeEventListener(
    'resize',
    handleMobileChatViewportChange,
  );
  activeVisualViewport?.removeEventListener(
    'scroll',
    handleMobileChatViewportChange,
  );
  if (activePanel) clearMobileChatViewportInsets(activePanel);
  activePanel = null;
  activeRuntime = null;
  activeVisualViewport = null;
}
