import type { SunSessionRecord } from '../js/sun-sessions-store.js';
import type { reconstructSpectrum } from '../js/sun-spectrum.js';
// Public leaves are unvalidated stored values. Unchecked operations are localized
// at existing bindings/call sites; this reader never promises a canonical session.
export type DoseReader = Record<string, unknown>;
export interface SessionReader {
  id?: unknown; startedAt?: unknown; endedAt?: unknown; durationMin?: unknown;
  paused?: unknown; pausedAt?: unknown; accumulatedPausedMs?: unknown;
  calculationStatus?: unknown; posture?: unknown; surfaceAlbedo?: unknown; notes?: unknown;
  safety?: Partial<Record<keyof NonNullable<SunSessionRecord['safety']>, unknown>> | null;
  doses?: DoseReader | null;
  bodyExposure?: Partial<Record<keyof NonNullable<SunSessionRecord['bodyExposure']>, unknown>> | null;
  eyeExposure?: {mode?: unknown; lensTint?: unknown} | null;
  location?: {lat?: unknown; lon?: unknown; altitudeM?: unknown; source?: unknown} | null;
  atmosphere?: {uvIndex?: unknown} | null;
}
export interface OptionReader {key?: unknown; label?: unknown; pickerLabel?: unknown}
export interface OptionOperations extends Omit<OptionReader, 'label'> {label?: string}
export interface GeneticOperations {contributors: Array<{gene?: unknown; genotype?: unknown}>}
export interface ChipRow {key: string; v: number}
// Private callable/collection operations on injected slots, not validated output.
export interface SessionCalls extends Record<string, unknown> {
  getSessions(): SessionReader[];
  deleteSession(id: unknown): unknown;
  updateSession(id: unknown, patch: {durationMin: number}): Promise<{calculationStatus?: unknown} | null | undefined>;
  logCompletedSession(payload: unknown): Promise<unknown>;
  hydrateSession(id: unknown, coords?: unknown): Promise<{calculationStatus?: unknown} | null | undefined>;
  getSunCoords(): SessionReader['location']; refreshSurfaces(): unknown;
  summarizeBodyExposure(session: SessionReader): unknown; formatElapsed(ms: number): unknown;
  exposurePresets: OptionReader[]; eyeModes: OptionReader[]; lensTints: OptionReader[];
  postureOptions: OptionReader[]; surfaceOptions: OptionReader[];
  channelDisplay: Record<string, {label?: unknown; what?: unknown; icon?: unknown}>;
  channelTier(value: unknown, key: unknown): unknown; tierLabel(tier: unknown): unknown;
  formatChannelUnit(...args: unknown[]): unknown; tooShortForChannelVerdictMin: number;
  quickLogSunSession(): unknown; pauseSunSession(id: unknown): unknown; resumeSunSession(id: unknown): unknown;
  flipSidesMidSession(id: unknown): unknown; changeCoverageMidSession(id: unknown): unknown;
  applySunscreenMidSession(id: unknown): unknown; setOzoneOverrideMidSession(): unknown;
  forgotStopPrompt(id: unknown): unknown; openChannelOnLightPage(channel: string): unknown;
  renderSessionAIDetail(session: SessionReader): unknown; navigate(route: string, data?: unknown): unknown;
  openLightSetup(): unknown;
  solarZenithAngle: ((date: Date, lat: unknown, lon: unknown) => number) | null;
  reconstructSpectrum: typeof reconstructSpectrum | null;
  geneticVitaminDMultiplier(genetics: unknown): GeneticOperations;
  vitaminDIU: ((...args: unknown[]) => number) | null;
  vitaminDIUPerSession: ((...args: unknown[]) => number) | null;
  pbmJoulesPerCm2: ((value: unknown) => number) | null;
  circadianMelanopicLux: ((value: unknown, duration: number) => number) | null;
}
