// Stable synchronous screen-card adapter for portable and room-assigned screens.
import { renderHTML } from './components/LightEnvironmentScreen.svelte.html.js';
import { SCREEN_DEVICES, computeScreenStatus } from './light-env-model.js';
import { isActiveToday } from './light-env-store.js';
import { projectEnvironmentScreen, projectEnvironmentToday, type ScreenCardReader } from './light-environment-screen-presentation.js';
export { SCREEN_HOURS_BUCKETS, activeScreenHoursBucket, activeScreenEveningBucket } from './light-environment-screen-presentation.js';
export type { ScreenCardReader } from './light-environment-screen-presentation.js';
export interface ScreenCardOptions {
  expanded?: unknown; rooms?: unknown; renderTodayToggle?: unknown; renderScreenAIBlock?: unknown;
  todayToggle?: boolean;
}
type TodayToggleRenderer = (kind: 'screen', id: unknown, active: boolean) => unknown;
type ScreenAIRenderer = (screen: ScreenCardReader) => unknown;
export function readScreenCardView(screen: ScreenCardReader, opts: ScreenCardOptions = {}) {
  const status = (computeScreenStatus as (screen: ScreenCardReader) => ReturnType<typeof computeScreenStatus>)(screen);
  const active = (isActiveToday as (screen: ScreenCardReader) => boolean)(screen);
  const expanded = !!opts.expanded;
  // Existing public renderer callbacks are trusted HTML boundaries; persisted fields
  // never enter these slots. Core today controls compose the typed child directly.
  const trustedTodayHTML = !opts.todayToggle && typeof opts.renderTodayToggle === 'function'
    ? String((opts.renderTodayToggle as TodayToggleRenderer)('screen', screen.id, active)) : '';
  const trustedAIHTML = expanded && typeof opts.renderScreenAIBlock === 'function'
    ? String((opts.renderScreenAIBlock as ScreenAIRenderer)(screen)) : '';
  return projectEnvironmentScreen({ screen, status, active, expanded,
    devices: SCREEN_DEVICES, rooms: opts.rooms, today: opts.todayToggle ? projectEnvironmentToday('screen', screen.id, active) : null, trustedTodayHTML, trustedAIHTML });
}

export function renderScreenCard(screen: ScreenCardReader, opts: ScreenCardOptions = {}) {
  return renderHTML({view:readScreenCardView(screen,opts)});
}
