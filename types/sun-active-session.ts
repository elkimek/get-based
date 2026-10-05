import type { SunSessionRecord } from '../js/sun-sessions-store.js';
import type * as spectrum from '../js/sun-spectrum.js';
import type { FetchedAtmosphere } from '../js/sun-uvdata.js';
import type { sunSessionExposure } from '../js/sun-session-model.js';
import type { activeElapsedMs, plainStopSummary } from '../js/sun-active-session-format.js';
import type { reconstructSpectrum } from '../js/sun-spectrum.js';
import type { SunStopSummaryOptions } from '../js/sun-active-session-format.js';

// Private views of the original unchecked callback and arithmetic operations.
// Configuration and persisted inputs are not validated by these annotations.
export interface SessionOperations extends Pick<SunSessionRecord, 'id' | 'startedAt' | 'endedAt' | 'durationMin' | 'updatedAt' | 'bodyExposure' | 'eyeExposure' | 'posture' | 'surfaceAlbedo' | 'safety' | 'doses' | 'paused' | 'pausedAt' | 'accumulatedPausedMs'> {
  location?: {lat?: number | undefined; lon?: number | undefined; altitudeM?: number; source?: unknown} | null;
  atmosphere?: AtmosphereOperations | null; exposureSegments?: unknown[];
}
export interface AtmosphereOperations extends Partial<Record<keyof FetchedAtmosphere, unknown>> {
  uvIndex?: number | null | undefined; confidence?: number | null | undefined; ozoneDU?: number | null | undefined;
  cloudCover?: number | null | undefined; temperatureC?: number | null | undefined; airQuality?: {aod?: number | null} | null;
}
interface OptionOperations {key?: unknown; label?: unknown; pickerLabel?: unknown}
type DoseOptionsReader = Omit<NonNullable<Parameters<typeof spectrum.computeChannelDoses>[0]>, 'eyeExposure'> & {eyeExposure?: ReturnType<typeof sunSessionExposure>['eyeExposure']};
export type ElapsedReader = (session: SessionOperations | null | undefined, ...args: [now?: number]) => ReturnType<typeof activeElapsedMs>;
export type StopSummaryReader = (session: SessionOperations | null | undefined, ...args: [durationMin: number, options?: Omit<SunStopSummaryOptions, 'vitaminDIUPerSession'> & {vitaminDIUPerSession?: SunStopSummaryOptions['vitaminDIUPerSession']}]) => ReturnType<typeof plainStopSummary>;
export interface ActiveSessionCalls extends Record<string, unknown> {
  getSessions(): SessionOperations[]; getActiveSession(): SessionOperations | null | undefined;
  startSession(options?: unknown): Promise<unknown>; stopSession(id: unknown): Promise<unknown>;
  hydrateSession(id: unknown, coords?: unknown): Promise<unknown>; getSunCoords(): SessionOperations['location'];
  saveImportedData(): Promise<unknown> | unknown; applyAtmOverrides(atmosphere: AtmosphereOperations | null): AtmosphereOperations | null;
  refreshSurfaces(): unknown; normalizePSMTier(raw: unknown): unknown; photosensitiveMedScale(tier?: unknown): number | null;
  openLightSetup(): unknown; eyeModes: OptionOperations[]; lensTints: OptionOperations[];
  postureOptions: OptionOperations[]; surfaceOptions: OptionOperations[];
  fetchAtmosphere(options: {lat: number | undefined; lon: number | undefined; isoTime: string}): Promise<AtmosphereOperations | null>;
  reconstructSpectrum: (...args: Parameters<typeof reconstructSpectrum>) => ReturnType<typeof reconstructSpectrum> | null;
  computeChannelDoses: (options: DoseOptionsReader) => Record<string, number>;
  erythemalSED(options: DoseOptionsReader): ReturnType<typeof spectrum.erythemalSED>;
  ocularActinicUVdose(options: Omit<Parameters<typeof spectrum.ocularActinicUVdose>[0], 'eyeExposure'> & {eyeExposure?: ReturnType<typeof sunSessionExposure>['eyeExposure']}): ReturnType<typeof spectrum.ocularActinicUVdose>;
  fractionOfMED: typeof spectrum.fractionOfMED;
  solarZenithAngle(date: Date, lat: number | undefined, lon: number | undefined): number;
  interpolateAtmosphere(atmosphere: AtmosphereOperations, isoTime: string): AtmosphereOperations | null;
  vitaminDIU: NonNullable<SunStopSummaryOptions['vitaminDIU']>;
  vitaminDIUPerSession: SunStopSummaryOptions['vitaminDIUPerSession'];
  skinTypeToFitzpatrick(skinType: unknown): string | null;
  renderLightChannelsLive(): unknown; renderLightTodayStrip(): string;
}
export interface LiveOperations {
  ratePerMin?: Record<string, number> | null; pending?: unknown; ownsSession?: (() => unknown);
  snapshotAt?: number; baselineZenith?: number; zenith?: number; atm?: AtmosphereOperations | null;
  committedDoses?: Record<string, number>; committedSED?: number; committedRetinalUV?: number;
  fitzpatrick?: string; fitzpatrickAssumed?: boolean; medScale?: number | null | undefined; psmTier?: unknown;
  fractionOfMEDFn?: typeof spectrum.fractionOfMED;
  alertedOver?: unknown; alerted70?: unknown; alertedRetinalOver?: unknown; alertedRetinal500?: unknown; alertedHeat?: unknown;
}
// Copies retain raw installed values; arithmetic views never promise sanitization.
export interface SunLiveDosesReader {
  doses: Record<string, unknown>; sed: unknown; retinalUV: unknown; medFraction: unknown;
  fitzpatrick: unknown; fitzpatrickAssumed: unknown; psmTier: unknown; atm: unknown; paused?: true;
}
export interface LiveDosesOperations extends Omit<SunLiveDosesReader, 'doses' | 'sed' | 'retinalUV' | 'medFraction' | 'fitzpatrick' | 'atm'> {
  doses: Record<string, number>; sed: number; retinalUV: number; medFraction: number;
  fitzpatrick?: string; atm?: AtmosphereOperations | null;
}
export interface SunLiveSegmentReader {
  startedAt: unknown; endedAt: number; durationMin: number; doses: Record<string, number>;
  sed: number; ocularActinicUV: number; bodyExposure: Record<string, unknown>;
  eyeExposure: Record<string, unknown>; posture: unknown; surfaceAlbedo: unknown; atmosphere: unknown; zenith: unknown;
}
