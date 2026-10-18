import type{EnvironmentAIView}from'./light-environment-ai-presentation.js';
import type{EnvironmentTodayView}from'./light-environment-screen-presentation.js';
// Stable synchronous screen-card adapter for portable and room-assigned screens.
import { renderHTML } from './components/LightEnvironmentScreen.svelte.html.js';
import { SCREEN_DEVICES, computeScreenStatus } from './light-env-model.js';
import { isActiveToday } from './light-env-store.js';
import { projectEnvironmentScreen, projectEnvironmentToday, type ScreenCardReader } from './light-environment-screen-presentation.js';
export { SCREEN_HOURS_BUCKETS, activeScreenHoursBucket, activeScreenEveningBucket } from './light-environment-screen-presentation.js';
export type { ScreenCardReader } from './light-environment-screen-presentation.js';
export interface ScreenCardOptions {
  expanded?: unknown; rooms?: unknown; getTodayView?: unknown; getScreenAIView?: unknown;
  todayToggle?: boolean;
}
type TodayToggleReader = (kind: 'screen', id: unknown, active: boolean) => Readonly<EnvironmentTodayView> | null;
type ScreenAIReader = (screen: ScreenCardReader) => Readonly<EnvironmentAIView> | null;
export function readScreenCardView(screen: ScreenCardReader, opts: ScreenCardOptions = {}) {
  const status = (computeScreenStatus as (screen: ScreenCardReader) => ReturnType<typeof computeScreenStatus>)(screen);
  const active = (isActiveToday as (screen: ScreenCardReader) => boolean)(screen);
  const expanded = !!opts.expanded;
  // Capture each configured readonly child once in the native callback order.
  // Core controls retain their independent later projection position.
  const alternateToday = !opts.todayToggle && typeof opts.getTodayView === 'function'
    ? (opts.getTodayView as TodayToggleReader)('screen', screen.id, active) : null;
  const ai = expanded && typeof opts.getScreenAIView === 'function'
    ? (opts.getScreenAIView as ScreenAIReader)(screen) : null;
  return projectEnvironmentScreen({ screen, status, active, expanded,
    devices: SCREEN_DEVICES, rooms: opts.rooms, today: opts.todayToggle ? projectEnvironmentToday('screen', screen.id, active) : null, alternateToday, ai });
}

export function renderScreenCard(screen: ScreenCardReader, opts: ScreenCardOptions = {}) {
  return renderHTML({view:readScreenCardView(screen,opts)});
}
