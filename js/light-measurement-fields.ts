// Pure command vocabulary. Acquisition evidence and calculations remain local.
export type LightMeasurementResource = 'lightMeasurements' | 'lightAudits';
export const isLightMeasurementResource = (value: string): value is LightMeasurementResource => value === 'lightMeasurements' || value === 'lightAudits';
export const LIGHT_MEASUREMENT_FIELDS = ['lightMeasurements', 'lightAudits', 'lightEnvironment', '_deleted', '_deletedAt', '_deletedClearedAt'] as const;
export const LIGHT_READING_TOOLS = ['lux', 'darkness', 'cct', 'flicker', 'spectrum', 'brightness-proxy', 'glass-transmission'] as const;
export const lightMeasurementFields = {
  tool: [...LIGHT_READING_TOOLS], value: 'Explicitly reported reading; unit is required with a value',
  unit: ['lux', 'K', 'banding-score', 'classification', 'camera-percent', 'ratio'],
  method: ['meter-entry', 'reported', 'camera-report'],
  capturedAt: 'Actual ISO 8601 timestamp with explicit UTC offset; do not invent a time from a date',
  roomId: 'Exact current room ID, or null for an unmapped reading', label: 'Text, max 120 characters', notes: 'Text, max 2000 characters',
  context: ['daytime', 'evening', 'sleep', null],
};
export const lightAuditFields = { label: 'Text, max 80 characters', notes: 'Text, max 1000 characters', date: 'Reported corrected YYYY-MM-DD for an existing checkpoint only' };
export interface LightMeasurementRecord {
  id: string; tool: string; value: unknown; capturedAt: number; roomId?: string | null;
  label?: string | null; notes?: string; confidence?: number | null; extra?: Record<string, unknown> | null; updatedAt?: number;
  [key: string]: unknown;
}
export interface LightAuditRecord {
  id: string; date: string; label: string; notes: string; createdAt: number; updatedAt?: number;
  rooms: unknown[]; screens: unknown[]; measurements: LightMeasurementRecord[]; [key: string]: unknown;
}
