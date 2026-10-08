import type { LightDeviceRecord } from './light-devices-store.js';

export interface DevicePresetRow { id: string; name: string; specification: string }
export interface DevicePresetGroup { id: string; label: string; rows: readonly DevicePresetRow[] }
export interface DevicePresetView { groups: readonly DevicePresetGroup[]; hint: string }
export interface DeviceCustomView { hasAI: boolean; hasVision: boolean; unit: 'cm' | 'in'; distancePlaceholder: string }
export type LightDeviceSetupProps =
  | { kind: 'presets'; view: DevicePresetView }
  | { kind: 'custom'; view: DeviceCustomView };

export const deviceTypeOptions = [
  { value: 'combined', label: 'Red + near-IR panel' },
  { value: 'uvb', label: 'UV phototherapy (UVB-capable)' },
  { value: 'uva', label: 'UVA panel (no UVB)' },
  { value: 'pbm-targeted', label: 'Targeted PBM device' },
  { value: 'sad', label: 'SAD light box (10k lux)' },
  { value: 'dawn-sim', label: 'Dawn simulator' },
  { value: 'full-spectrum', label: 'Full-spectrum bulb' },
] as const;

const text = (value: unknown) => value == null ? '' : String(value);
const presetTypeOrder = ['uvb', 'uva', 'combined', 'pbm-targeted', 'sad', 'dawn-sim', 'full-spectrum'];

// Display-only metadata. Raw specifications and validation stay in the store/controller.
export function formatDevicePresetSpecification(preset: Partial<LightDeviceRecord>): string {
  const parts: string[] = [];
  if (Array.isArray(preset.peakWavelengths) && preset.peakWavelengths.length) {
    parts.push(`${preset.peakWavelengths.join('/')} nm`);
  }
  if (Number.isFinite(Number(preset.mwPerCm2At15cm)) && Number(preset.mwPerCm2At15cm) > 0) {
    parts.push(`${preset.mwPerCm2At15cm} mW/cm²`);
  } else if (Number.isFinite(Number(preset.lux)) && Number(preset.lux) > 0) {
    parts.push(`${Number(preset.lux).toLocaleString()} lux`);
  } else if (Number.isFinite(Number(preset.melanopicEdiLux)) && Number(preset.melanopicEdiLux) > 0) {
    parts.push(`${Number(preset.melanopicEdiLux).toLocaleString()} lx M-EDI`);
  }
  if (Number.isFinite(Number(preset.recommendedDistanceCm)) && Number(preset.recommendedDistanceCm) > 0) {
    parts.push(`${preset.recommendedDistanceCm} cm`);
  }
  return parts.join(' · ');
}

export function projectDevicePresets(input: {
  presets: readonly LightDeviceRecord[];
  types: Record<string, { icon?: string; label?: string }>;
  hasAI: boolean;
}): DevicePresetView {
  const groups: DevicePresetGroup[] = [];
  for (const type of presetTypeOrder) {
    const records = input.presets.filter(preset => preset.type === type);
    if (!records.length) continue;
    const meta = input.types[type] || {};
    groups.push({
      id: `add-device-group-${type.replace(/[^a-z0-9-]/gi, '-')}`,
      label: (meta.icon || '') + ' ' + (meta.label || type),
      rows: records.map(preset => ({ id: text(preset.id), name: `${text(preset.brand)} ${text(preset.model)}`, specification: formatDevicePresetSpecification(preset) })),
    });
  }
  return { groups, hint: input.hasAI
    ? "Don't see your device? Paste its product page or snap a photo of the back panel — AI extracts the specs."
    : "Don't see your device? Set up an AI provider in Settings to auto-extract specs from a URL or photo, or click below to enter manually." };
}

export function projectDeviceCustomSetup(input: { hasAI: boolean; hasVision: boolean; unitSystem: unknown }): DeviceCustomView {
  const unit = input.unitSystem === 'US' ? 'in' : 'cm';
  return { hasAI: input.hasAI, hasVision: input.hasAI && input.hasVision, unit, distancePlaceholder: unit === 'in' ? 'e.g. 6' : 'e.g. 15' };
}
