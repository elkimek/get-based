import type{SessionAIView}from'./light-session-ai-presentation.js';
import type {BodyPickerView} from './sun-body-picker-presentation.js';
import type { ActiveSessionView, LiveSessionReadout, SessionChannelChip } from './light-active-session-presentation.js';
import type { SessionDetailView } from './light-session-detail-presentation.js';
import type { SessionReader } from '../types/sun-session-ui.js';
import type { DeviceSessionRecord, LightDeviceRecord } from './light-devices-store.js';

const literal = (value: unknown) => value == null ? '' : String(value);
export interface SessionStamp { readonly date: string; readonly time: string; }
export interface CompletedLightSessionView {
  readonly kind: 'sun' | 'device'; readonly id: string; readonly name: string; readonly date: string; readonly time: string;
  readonly duration: string; readonly ariaLabel: string; readonly vitaminD: string;
  readonly mode: { readonly label: string; readonly accent: boolean } | null;
  readonly warning: { readonly label: string; readonly danger: boolean } | null;
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
export interface SessionOption { readonly key: string; readonly label: string; readonly selected: boolean; }
export interface PastSessionLogOptions {
  readonly lastUsed?: { readonly posture?: unknown; readonly surfaceAlbedo?: unknown } | null;
  readonly lastRegions: Parameters<typeof import('./sun-body-silhouette.js').renderBodySilhouette>[0];
  readonly eyeMode: unknown; readonly lensTint: unknown; readonly localStartDefault: unknown; readonly localNow: unknown;
  readonly eyeModes: ReadonlyArray<{ readonly key?: unknown; readonly pickerLabel?: unknown; readonly label?: unknown }>;
  readonly lensTints: ReadonlyArray<{ readonly key?: unknown; readonly label?: unknown }>;
  readonly postureOptions: ReadonlyArray<{ readonly key?: unknown; readonly label?: unknown }>;
  readonly surfaceOptions: ReadonlyArray<{ readonly key?: unknown; readonly label?: unknown }>;
}
function sessionChoices(items: ReadonlyArray<{ key?: unknown; label?: unknown; pickerLabel?: unknown }>, selected: unknown, picker = false): SessionOption[] {
  return items.map(item => ({ key: literal(item.key), label: literal(picker ? item.pickerLabel || item.label : item.label), selected: item.key === selected }));
}
export function projectPastSessionForm(options: PastSessionLogOptions) {
  return { lastUsed: !!options.lastUsed, start: literal(options.localStartDefault), now: literal(options.localNow),
    eyeModes: sessionChoices(options.eyeModes, options.eyeMode, true), lensTints: sessionChoices(options.lensTints, options.lensTint),
    postures: sessionChoices(options.postureOptions, options.lastUsed?.posture || 'standing'), surfaces: sessionChoices(options.surfaceOptions, options.lastUsed?.surfaceAlbedo || 'grass') };
}
export type PastSessionFormView = ReturnType<typeof projectPastSessionForm>;
export interface StartSunSessionFormOptions extends Pick<PastSessionLogOptions, 'eyeModes' | 'lensTints' | 'postureOptions' | 'surfaceOptions'> {
  readonly lastUsed?: SessionReader | null;
}
export function projectStartSunSessionForm(options: StartSunSessionFormOptions) {
  const last = options.lastUsed;
  return { glass: !!last?.bodyExposure?.glassBetween,
    eyeModes: sessionChoices(options.eyeModes, last?.eyeExposure?.mode || 'direct', true),
    lensTints: sessionChoices(options.lensTints, last?.eyeExposure?.lensTint || 'clear'),
    postures: sessionChoices(options.postureOptions, last?.posture || 'standing'),
    surfaces: sessionChoices(options.surfaceOptions, last?.surfaceAlbedo || 'grass') };
}
export type StartSunSessionFormView = ReturnType<typeof projectStartSunSessionForm>;
export interface SunPreflightBannerView {
  readonly className: 'sun-uvi-warn' | 'sun-uvi-veryhigh' | 'sun-uvi-extreme';
  readonly icon: string; readonly title: string; readonly text: string;
}
export interface DeviceSessionFormView {
  readonly name: string; readonly modes: Array<{ readonly id: string; readonly label: string }>; readonly defaultMode: string | null;
  readonly duration: number; readonly distance: number; readonly unit: 'cm' | 'in'; readonly referenceCm: number; readonly distanceHint: string;
  readonly eyeLabel: string; readonly eyesChecked: boolean;
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
export type LightSessionPresentationProps = { kind: 'start'; view: StartSunSessionFormView; silhouetteView: BodyPickerView | null }
  | { kind: 'coverage'; silhouetteView: BodyPickerView | null }
  | { kind: 'preflight'; view: SunPreflightBannerView }
  | { kind: 'active'; view: ActiveSessionView }
  | { kind: 'live-readouts'; readouts: LiveSessionReadout[] }
  | { kind: 'channel-chips'; chips: SessionChannelChip[] }
  | LightSessionDetailProps | { kind: 'row'; view: CompletedLightSessionView }
  | { kind: 'past'; view: PastSessionFormView; silhouetteView: BodyPickerView | null }
  | { kind: 'device'; view: DeviceSessionFormView; silhouetteView: BodyPickerView | null }
  | { kind: 'history'; rows: readonly LightSessionRowProps[]; total: number; sunCount: number; deviceCount: number; modal: boolean; showMore: boolean; emptySun?: boolean };

export type LightSessionDetailProps = { kind: 'detail'; view: SessionDetailView; ai: Readonly<SessionAIView> | null } | { kind: 'mode-editor'; name: string; modes: SessionOption[] };

export type LightSessionRowProps=Extract<LightSessionPresentationProps,{kind:'active'|'row'}>;
export type LightSessionHistoryProps=Extract<LightSessionPresentationProps,{kind:'history'}>;
