import type { LightRoom, LightScreen } from '../js/light-env-model.js';
import type { computeRoomSeverityForRoom, computeIndoorBurdenForEnvironment } from '../js/light-env-model.js';

// Opaque public readers and private unchecked operations. These shapes do not
// validate persisted fields, callback results, getter rereads, or coercions.
export type EnvironmentRoomReader = { [Key in keyof LightRoom]?: unknown };
export type EnvironmentScreenReader = { [Key in keyof LightScreen]?: unknown };
export interface EnvironmentRoomOperations extends Omit<EnvironmentRoomReader, 'id' | 'name' | 'primarySource' | 'hoursOccupiedPerDay'> {
  id?: unknown; name?: string | null; primarySource?: string | null; hoursOccupiedPerDay?: unknown;
}
export interface EnvironmentMeasurementOperations {
  roomId?: unknown; tool: string; value: number; capturedAt: number;
  extra?: { source?: string; method?: unknown; levelLabel?: unknown; rooms?: { length?: unknown } | null } | null;
}
export interface EnvironmentAuditOperations { createdAt?: number; date?: string; label?: unknown }
export interface EnvironmentAuditCollection { length: unknown; slice(): EnvironmentAuditOperations[] }
export interface EnvironmentCalls extends Record<string, unknown> {
  getMeasurementsForRoom: ((roomId: unknown) => unknown) | null;
  navigate: ((route: string, options?: unknown) => unknown) | null;
  renderBurdenInterp: ((burden: ReturnType<typeof computeIndoorBurdenForEnvironment>) => unknown) | null;
  renderMeasurementAIInline: ((measurement: EnvironmentMeasurementOperations) => unknown) | null;
  renderRoomAIBlock: ((room: EnvironmentRoomOperations) => unknown) | null;
  renderScreenAIBlock: unknown;
  openSpectrumClassifier: unknown; openLuxMeter: unknown; openFlickerDetector: unknown;
  openCCTMeter: unknown; openDarknessMeter: unknown;
}
export interface EnvironmentSeverityOptions { screens?: unknown; isActiveToday?: unknown }
export interface EnvironmentRefreshOptions { scrollAnchor?: string | undefined; fallbackScrollAnchor?: string | undefined }
export type EnvironmentSeverity = ReturnType<typeof computeRoomSeverityForRoom>;
export type RawTextLookup = Record<string, unknown>;
