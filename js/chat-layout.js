// @ts-check
// Resizable desktop Chat layout. Sizes are UI preferences only and never
// contain profile data, so they are intentionally stored outside encrypted
// profile records.

const PANEL_WIDTH_KEY = 'labcharts-chat-panel-width';
const PANEL_WITH_RAIL_WIDTH_KEY = 'labcharts-chat-panel-with-rail-width';
const RAIL_WIDTH_KEY = 'labcharts-chat-rail-width';
const DESKTOP_QUERY = '(min-width: 769px)';
const PANEL_MIN = 420;
const PANEL_MAX = 1100;
const PANEL_DEFAULT = 600;
const PANEL_WITH_RAIL_DEFAULT = 820;
const RAIL_MIN = 180;
const RAIL_MAX = 360;
const RAIL_DEFAULT = 220;
let layoutInitialized = false;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function storedNumber(key, fallback) {
  const raw = localStorage.getItem(key);
  if (raw === null || raw.trim() === '') return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function desktopAvailableWidth() {
  return Math.max(PANEL_MIN, Math.min(PANEL_MAX, globalThis.innerWidth - 48));
}

function currentPanelStorage(railOpen) {
  return railOpen
    ? { key: PANEL_WITH_RAIL_WIDTH_KEY, fallback: PANEL_WITH_RAIL_DEFAULT }
    : { key: PANEL_WIDTH_KEY, fallback: PANEL_DEFAULT };
}

export function syncChatLayout() {
  const panel = document.getElementById('chat-panel');
  const rail = document.getElementById('chat-thread-rail');
  if (!panel || !rail) return;
  if (!matchMedia(DESKTOP_QUERY).matches) {
    panel.style.removeProperty('--chat-panel-width');
    rail.style.removeProperty('--chat-rail-width');
    document.body.style.removeProperty('--chat-panel-current-width');
    return;
  }
  const railOpen = rail.classList.contains('open');
  const railWidth = clamp(storedNumber(RAIL_WIDTH_KEY, RAIL_DEFAULT), RAIL_MIN, RAIL_MAX);
  const panelPref = currentPanelStorage(railOpen);
  const panelMin = railOpen ? railWidth + 360 : PANEL_MIN;
  const panelWidth = clamp(storedNumber(panelPref.key, panelPref.fallback), panelMin, desktopAvailableWidth());
  rail.style.setProperty('--chat-rail-width', `${railWidth}px`);
  panel.style.setProperty('--chat-panel-width', `${panelWidth}px`);
  document.body.style.setProperty('--chat-panel-current-width', `${panelWidth}px`);
  const panelHandle = document.getElementById('chat-panel-resize-handle');
  const railHandle = document.getElementById('chat-rail-resize-handle');
  panelHandle?.setAttribute('aria-valuenow', String(Math.round(panelWidth)));
  panelHandle?.setAttribute('aria-valuemin', String(Math.round(panelMin)));
  panelHandle?.setAttribute('aria-valuemax', String(Math.round(desktopAvailableWidth())));
  railHandle?.setAttribute('aria-valuenow', String(Math.round(railWidth)));
  railHandle?.setAttribute('aria-valuemax', String(Math.round(Math.min(RAIL_MAX, panelWidth - 360))));
}

function persistPanelWidth(value) {
  const railOpen = document.getElementById('chat-thread-rail')?.classList.contains('open') === true;
  const railWidth = storedNumber(RAIL_WIDTH_KEY, RAIL_DEFAULT);
  const min = railOpen ? railWidth + 360 : PANEL_MIN;
  const width = Math.round(clamp(value, min, desktopAvailableWidth()));
  localStorage.setItem(currentPanelStorage(railOpen).key, String(width));
  syncChatLayout();
}

function persistRailWidth(value) {
  const panel = document.getElementById('chat-panel');
  const panelWidth = panel?.getBoundingClientRect().width || PANEL_WITH_RAIL_DEFAULT;
  const width = Math.round(clamp(value, RAIL_MIN, Math.min(RAIL_MAX, panelWidth - 360)));
  localStorage.setItem(RAIL_WIDTH_KEY, String(width));
  syncChatLayout();
}

function bindDrag(handle, onMove) {
  if (!handle || handle.dataset.chatResizeBound === 'true') return;
  handle.dataset.chatResizeBound = 'true';
  handle.addEventListener('pointerdown', event => {
    if (!matchMedia(DESKTOP_QUERY).matches || event.button !== 0) return;
    event.preventDefault();
    const panel = document.getElementById('chat-panel');
    const rail = document.getElementById('chat-thread-rail');
    const startX = event.clientX;
    const startPanel = panel?.getBoundingClientRect().width || PANEL_DEFAULT;
    const startRail = rail?.getBoundingClientRect().width || RAIL_DEFAULT;
    document.body.classList.add('chat-layout-resizing');
    handle.setPointerCapture?.(event.pointerId);
    const move = moveEvent => onMove({ startX, x: moveEvent.clientX, startPanel, startRail });
    const finish = () => {
      document.body.classList.remove('chat-layout-resizing');
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', finish);
      handle.removeEventListener('pointercancel', finish);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', finish);
    handle.addEventListener('pointercancel', finish);
  });
}

function bindKeyboard(handle, getValue, setValue, fallback, direction = 1) {
  if (!handle) return;
  handle.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home'].includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'Home') setValue(fallback);
    else setValue(getValue() + (event.key === 'ArrowLeft' ? -16 : 16) * direction);
  });
  handle.addEventListener('dblclick', () => setValue(fallback));
}

export function initChatLayout() {
  syncChatLayout();
  if (layoutInitialized) return;
  layoutInitialized = true;
  const panelHandle = /** @type {HTMLElement | null} */ (document.getElementById('chat-panel-resize-handle'));
  const railHandle = /** @type {HTMLElement | null} */ (document.getElementById('chat-rail-resize-handle'));
  bindDrag(panelHandle, ({ startX, x, startPanel }) => persistPanelWidth(startPanel + startX - x));
  bindDrag(railHandle, ({ startX, x, startRail }) => persistRailWidth(startRail + x - startX));
  bindKeyboard(
    panelHandle,
    () => document.getElementById('chat-panel')?.getBoundingClientRect().width || PANEL_DEFAULT,
    persistPanelWidth,
    PANEL_DEFAULT,
    -1,
  );
  bindKeyboard(
    railHandle,
    () => document.getElementById('chat-thread-rail')?.getBoundingClientRect().width || RAIL_DEFAULT,
    persistRailWidth,
    RAIL_DEFAULT,
  );
  globalThis.addEventListener('resize', syncChatLayout);
}

export const CHAT_LAYOUT_LIMITS = Object.freeze({
  panelMin: PANEL_MIN,
  panelMax: PANEL_MAX,
  railMin: RAIL_MIN,
  railMax: RAIL_MAX,
});
