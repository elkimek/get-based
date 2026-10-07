// Resizable desktop Chat layout. Sizes are UI preferences only and never
// contain profile data, so they are intentionally stored outside encrypted
// profile records.

import { configureChatLayoutView, renderChatLayout } from './chat-layout-view.js';

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

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function storedNumber(key: string, fallback: number) {
  const raw = localStorage.getItem(key);
  if (raw === null || raw.trim() === '') return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function desktopAvailableWidth() {
  return Math.max(PANEL_MIN, Math.min(PANEL_MAX, globalThis.innerWidth - 48));
}

function currentPanelStorage(railOpen: boolean) {
  return railOpen
    ? { key: PANEL_WITH_RAIL_WIDTH_KEY, fallback: PANEL_WITH_RAIL_DEFAULT }
    : { key: PANEL_WIDTH_KEY, fallback: PANEL_DEFAULT };
}

export function syncChatLayout() {
  const panel = document.getElementById('chat-panel');
  const rail = document.getElementById('chat-thread-rail');
  if (!panel || !rail) return;
  const shell = { open: panel.classList.contains('open'), fullscreen: panel.classList.contains('chat-panel-fullscreen'), railOpen: rail.classList.contains('open') };
  if (!matchMedia(DESKTOP_QUERY).matches) {
    renderChatLayout({ ...shell, desktop: false, panelWidth: PANEL_DEFAULT, railWidth: RAIL_DEFAULT, panelMin: PANEL_MIN, panelMax: PANEL_MAX, railMax: RAIL_MAX });
    document.body.style.removeProperty('--chat-panel-current-width');
    return;
  }
  const railOpen = rail.classList.contains('open');
  const railWidth = clamp(storedNumber(RAIL_WIDTH_KEY, RAIL_DEFAULT), RAIL_MIN, RAIL_MAX);
  const panelPref = currentPanelStorage(railOpen);
  const panelMin = railOpen ? railWidth + 360 : PANEL_MIN;
  const panelWidth = clamp(storedNumber(panelPref.key, panelPref.fallback), panelMin, desktopAvailableWidth());
  renderChatLayout({ ...shell, desktop: true, panelWidth, railWidth, panelMin,
    panelMax: Math.round(desktopAvailableWidth()), railMax: Math.round(Math.min(RAIL_MAX, panelWidth - 360)) });
  document.body.style.setProperty('--chat-panel-current-width', `${panelWidth}px`);
}

function persistPanelWidth(value: number) {
  const railOpen = document.getElementById('chat-thread-rail')?.classList.contains('open') === true;
  const railWidth = clamp(storedNumber(RAIL_WIDTH_KEY, RAIL_DEFAULT), RAIL_MIN, RAIL_MAX);
  const min = railOpen ? railWidth + 360 : PANEL_MIN;
  const width = Math.round(clamp(value, min, desktopAvailableWidth()));
  localStorage.setItem(currentPanelStorage(railOpen).key, String(width));
  syncChatLayout();
}

function persistRailWidth(value: number) {
  const panel = document.getElementById('chat-panel');
  const panelWidth = panel?.getBoundingClientRect().width || PANEL_WITH_RAIL_DEFAULT;
  const width = Math.round(clamp(value, RAIL_MIN, Math.min(RAIL_MAX, panelWidth - 360)));
  localStorage.setItem(RAIL_WIDTH_KEY, String(width));
  syncChatLayout();
}

/** Called after opening/restoring the rail; Svelte owns all control listeners. */
export function initChatLayout() {
  configureChatLayoutView({ sync: syncChatLayout, resize: (kind, value) => {
    if (!matchMedia(DESKTOP_QUERY).matches) return;
    if (kind === 'panel') persistPanelWidth(value);
    else persistRailWidth(value);
  } });
  syncChatLayout();
}

export const CHAT_LAYOUT_LIMITS = Object.freeze({
  panelMin: PANEL_MIN,
  panelMax: PANEL_MAX,
  railMin: RAIL_MIN,
  railMax: RAIL_MAX,
});
