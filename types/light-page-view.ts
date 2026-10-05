import type { LensPageWidget } from '../js/lens-page-shell.js';

// Unchecked private operations preserve raw injected fields, numeric coercion,
// and getter errors. They are not validated callback output or storage DTOs.
export interface PageSessionOperations { id?: unknown; startedAt: number; endedAt?: unknown; paused?: unknown; pausedAt: number; accumulatedPausedMs?: number }
export interface PageDeviceReader { brand?: unknown; model?: unknown }
export interface PageCoordsOperations { source?: unknown; lat?: unknown; altitudeM?: number }
export interface PageBudgetOperations { exceedsSupplementUL?: unknown; supplementIU: number; sunIU: number }
export interface PageMetaOperations { label?: string; icon?: unknown; what?: unknown }
export type PageTotalsOperations = Record<string, number>;
export interface PageCalls extends Record<string, unknown> {
  channelDisplay: unknown;
  getSessions(): PageSessionOperations[] | null | undefined;
  getDevices(): PageDeviceReader[] | null | undefined;
  getDeviceSessions(): PageSessionOperations[] | null | undefined;
  getActiveDeviceSession(): unknown;
  getActiveSession(): PageSessionOperations | null | undefined;
  rollingChannelTotals(days: number): PageTotalsOperations | null | undefined;
  rollingDeviceTotals(days: number): PageTotalsOperations | null | undefined;
  cumulativeMEDToday(): number; cumulativeMEDYesterday(): number;
  rollingVitaminDIU(days: number): number;
  vitaminDBudgetStatus(): PageBudgetOperations | null | undefined;
  getSunCoords(): PageCoordsOperations | null | undefined;
  resumeActiveTickerIfNeeded(): unknown; ensureActiveDeviceTicker(): unknown;
  openChannelOnLightPage(channel: string): unknown;
  quickLogDeviceSession(): unknown; openAddDeviceDialog(): unknown;
  quickLogSunSession(): unknown; openDetailedSessionDialog(): unknown;
  navigate(view: string): unknown; requestPreciseLocation(): unknown;
  openLightEnvironmentAssessment(): unknown;
  renderSunDataSourceSettings(): unknown; renderLightTodayDashboardChip(): unknown;
  renderLightTodayHero(): unknown; renderSunSessionRow(session: PageSessionOperations): unknown;
  renderActiveDeviceSessionCard(): unknown; renderSunSetupCard(): unknown;
  renderChannelMixVerdict(fallback: string): unknown; renderDevicesSection(): unknown;
  renderEnvironmentAssessmentSummary(): unknown; renderLightTools(): unknown;
}
export interface PageDelegateRoot { contains(node: Node): unknown; addEventListener(type: string, listener: (event: PageActionEvent) => unknown): unknown }
export interface PageActionEvent extends Omit<Event, 'currentTarget'> { currentTarget: PageDelegateRoot | null }
export type PageInnerHTMLWriter = Omit<HTMLDivElement, 'innerHTML'> & { innerHTML: unknown };
export type PageOuterHTMLWriter = Omit<HTMLElement, 'outerHTML'> & { outerHTML: unknown };
export type PageWidget = LensPageWidget & { opts?: NonNullable<LensPageWidget['opts']> & { source?: string } };
