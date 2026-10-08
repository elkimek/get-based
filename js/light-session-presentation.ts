import type { SessionReader } from '../types/sun-session-ui.js';
import type { DeviceSessionRecord, LightDeviceRecord } from './light-devices-store.js';

const literal = (value: unknown) => value == null ? '' : String(value);
export interface SessionStamp { date: string; time: string; }
export interface CompletedLightSessionView {
  kind: 'sun' | 'device'; id: string; name: string; date: string; time: string;
  duration: string; ariaLabel: string; vitaminD: string;
  mode: { label: string; accent: boolean } | null;
  warning: { label: string; danger: boolean } | null;
}
export function projectCompletedSunSession(session: SessionReader, stamp: SessionStamp, duration: string, vitaminD: unknown): CompletedLightSessionView {
  const status = session.calculationStatus;
  let warning: CompletedLightSessionView['warning'] = null;
  if (status && status !== 'computed') {
    const labels: Record<string, string> = { pending: 'Updating estimates…', 'needs-location': 'Location needed for estimates', 'atmosphere-unavailable': 'Conditions unavailable — retry', 'calculation-error': 'Calculation failed — retry' };
    warning = { label: labels[literal(status)] || 'Estimates unavailable', danger: status === 'calculation-error' };
  } else {
    const med = Number(session.safety?.medFraction);
    if (Number.isFinite(med) && med >= 1) warning = { label: 'Base burn threshold reached', danger: true };
    else if (Number.isFinite(med) && med >= 0.7) warning = { label: 'High modeled burn dose', danger: false };
    else if (session.safety?.fitzpatrickAssumed || session.safety?.medicationThresholdUnknown) warning = { label: 'Review safety assumptions', danger: false };
  }
  return { kind: 'sun', id: literal(session.id), name: 'Sunlight', ...stamp, duration, vitaminD: literal(vitaminD), mode: null, warning,
    ariaLabel: `Open ${stamp.date}${stamp.time ? ` at ${stamp.time}` : ''} outdoor sun session details` };
}
export function projectCompletedDeviceSession(session: DeviceSessionRecord, device: LightDeviceRecord | DeviceSessionRecord['deviceSnapshot'] | null, stamp: SessionStamp): CompletedLightSessionView {
  const name = device ? `${device.brand} ${device.model}` : 'Device details unavailable';
  let mode: CompletedLightSessionView['mode'] = null;
  if (device && Array.isArray(device.modes) && device.modes.length > 0) {
    const resolved = device.modes.find(item => item.id === session.mode) || device.modes.find(item => item.default) || device.modes[0];
    if (resolved) mode = { label: literal(resolved.label || resolved.id), accent: !(resolved.default || device.modes[0]?.id === resolved.id) };
  }
  const safety = session.safety;
  const warning = safety?.unsafeEyeExposure ? { label: 'UV eye exposure — review', danger: true }
    : Number(safety?.conservativeBaseMedFraction) >= 0.7 ? { label: 'High modeled burn dose', danger: false }
    : safety?.hasUV && safety.uvDoseStatus && safety.uvDoseStatus !== 'modeled' ? { label: 'UV dose unavailable', danger: false } : null;
  return { kind: 'device', id: literal(session.id), name, ...stamp, duration: session.durationMin ? `${Math.round(session.durationMin * 10) / 10} min` : '—', vitaminD: '', mode, warning,
    ariaLabel: `Open ${stamp.date}${stamp.time ? ` at ${stamp.time}` : ''} device session details — ${name}${mode ? ` mode ${mode.label}` : ''}` };
}
export interface SessionOption { key: string; label: string; selected: boolean; }
export interface PastSessionLogOptions {
  lastUsed?: { posture?: unknown; surfaceAlbedo?: unknown } | null;
  lastRegions: Parameters<typeof import('./sun-body-silhouette.js').renderBodySilhouette>[0];
  eyeMode: unknown; lensTint: unknown; localStartDefault: unknown; localNow: unknown;
  eyeModes: ReadonlyArray<{ key?: unknown; pickerLabel?: unknown; label?: unknown }>;
  lensTints: ReadonlyArray<{ key?: unknown; label?: unknown }>;
  postureOptions: ReadonlyArray<{ key?: unknown; label?: unknown }>;
  surfaceOptions: ReadonlyArray<{ key?: unknown; label?: unknown }>;
}
export function projectPastSessionForm(options: PastSessionLogOptions) {
  const choices = (items: ReadonlyArray<{ key?: unknown; label?: unknown; pickerLabel?: unknown }>, selected: unknown, picker = false): SessionOption[] => items.map(item => ({ key: literal(item.key), label: literal(picker ? item.pickerLabel || item.label : item.label), selected: item.key === selected }));
  return { lastUsed: !!options.lastUsed, start: literal(options.localStartDefault), now: literal(options.localNow),
    eyeModes: choices(options.eyeModes, options.eyeMode, true), lensTints: choices(options.lensTints, options.lensTint),
    postures: choices(options.postureOptions, options.lastUsed?.posture || 'standing'), surfaces: choices(options.surfaceOptions, options.lastUsed?.surfaceAlbedo || 'grass') };
}
export type PastSessionFormView = ReturnType<typeof projectPastSessionForm>;
export interface DeviceSessionFormView {
  name: string; modes: Array<{ id: string; label: string }>; defaultMode: string | null;
  duration: number; distance: number; unit: 'cm' | 'in'; referenceCm: number; distanceHint: string;
  eyeLabel: string; eyesChecked: boolean;
}
export function projectDeviceSessionForm(input: { device: LightDeviceRecord; validModes: NonNullable<LightDeviceRecord['modes']>; defaultMode: string | null; defaultDuration: number; defaultDistanceCm: number; useUS: boolean; isUVDevice: boolean; isEyeLightDevice: boolean; defaultEyeControlChecked: boolean }): DeviceSessionFormView {
  const { device, defaultDistanceCm } = input;
  const referenceCm = device.recommendedDistanceCm || 15;
  const inches = (cm: number) => +(cm / 2.54).toFixed(1);
  const override = Number.isFinite(device.lastSession?.distanceCm) && Math.abs(device.lastSession!.distanceCm! - referenceCm) > 0.5;
  const modelHint = Array.isArray(device.irradianceByDistanceCm) && device.irradianceByDistanceCm.length >= 2 ? "Dose uses the device's measured distance table." : device.distanceModel === 'point-source' ? 'Dose uses point-source inverse-square scaling declared for this device.' : 'No unverified distance correction is applied; use the vendor reference distance or enter measured irradiance data.';
  return { name: `${literal(device.brand)} ${literal(device.model)}`, modes: input.validModes.length > 1 ? input.validModes.map(item => ({ id: literal(item.id), label: literal(item.label || item.id) })) : [], defaultMode: input.defaultMode,
    duration: input.defaultDuration, distance: input.useUS ? inches(defaultDistanceCm) : defaultDistanceCm, unit: input.useUS ? 'in' : 'cm', referenceCm,
    distanceHint: `Vendor reference: ${referenceCm} cm (${inches(referenceCm)} in).${override ? ` You usually log at ${defaultDistanceCm} cm — prefilled below.` : ''} ${modelHint}`,
    eyeLabel: input.isUVDevice ? 'UV-rated goggles worn (closed eyelids are not protection)' : input.isEyeLightDevice ? 'Eyes open to receive ambient light (never stare at lamp)' : 'Device-appropriate eye protection worn', eyesChecked: input.defaultEyeControlChecked };
}
export type LightSessionPresentationProps = { kind: 'row'; view: CompletedLightSessionView }
  | { kind: 'past'; view: PastSessionFormView; silhouetteHTML: string }
  | { kind: 'device'; view: DeviceSessionFormView; silhouetteHTML: string }
  | { kind: 'history'; rowsHTML: string; total: number; sunCount: number; deviceCount: number; modal: boolean; showMore: boolean; emptySun?: boolean };
