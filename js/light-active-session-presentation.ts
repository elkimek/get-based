import type { SessionReader } from '../types/sun-session-ui.js';
import type { LiveDosesOperations } from '../types/sun-active-session.js';

const literal = (value: unknown): string => value == null ? '' : String(value);
export interface SessionChannelChip {
  readonly key: string; readonly icon: string; readonly label: string; readonly value: string; readonly title: string; readonly ariaLabel: string;
}
export function sessionChannelChip(key: string, meta: { icon?: unknown; label?: unknown; what?: unknown } | undefined, value: string): SessionChannelChip {
  const label = literal(meta?.label || key.replace('_', ' '));
  return { key, label, value, icon: literal(meta?.icon || '·'),
    title: value ? `${meta?.what || ''} — this session: ${value}. Open channel details.` : `${meta?.what || ''} — sunlight signal logged. Open channel details.`,
    ariaLabel: `${label}${value ? `, this session ${value}` : ', sunlight signal logged'}. Open channel details.` };
}
export interface LiveSessionReadout {
  readonly kind: 'vitamin-d' | 'burn' | 'retinal' | 'heat';
  readonly tone: 'normal' | 'warning' | 'danger';
  readonly title: string; readonly values: readonly string[]; readonly idle?: boolean;
}
function burnBand(med: number): { label: string; tone: LiveSessionReadout['tone'] } {
  if (med >= 1) return { label: 'over threshold', tone: 'danger' };
  if (med >= 0.7) return { label: 'high', tone: 'warning' };
  return { label: med >= 0.3 ? 'moderate' : 'low modeled dose', tone: 'normal' };
}
function vitaminDValue(iu: number): string {
  if (iu >= 10000) return `~${(iu / 1000).toFixed(1).replace(/\.0$/, '')}k IU-eq`;
  if (iu >= 1000) return `~${Math.round(iu / 100) * 100} IU-eq`;
  if (iu >= 100) return `~${Math.round(iu / 10) * 10} IU-eq`;
  if (iu >= 10) return `~${Math.round(iu)} IU-eq`;
  return '<10 IU-eq';
}
function vitaminDRate(rate: number): string {
  if (rate >= 100) return `~${Math.round(rate / 10) * 10} IU-eq/min avg`;
  if (rate >= 1) return `~${Math.round(rate)} IU-eq/min avg`;
  return rate > 0 ? '<1 IU-eq/min avg' : 'rate pending';
}
const calculating = (): LiveSessionReadout => ({ kind: 'vitamin-d', tone: 'normal', title: '', values: ['Calculating…'], idle: true });
export function initialSessionReadouts(session: SessionReader): LiveSessionReadout[] {
  const readouts = [calculating()];
  const med = session.safety?.medFraction as number | null | undefined;
  if (med != null) {
    const { label, tone } = burnBand(med);
    const caution = session.safety?.medicationThresholdUnknown ? ' Medication effects are not included.' : '';
    const assumed = session.safety?.fitzpatrickAssumed ? ' Conservative Type I is assumed because skin type was unset.' : '';
    readouts.push({ kind: 'burn', tone,
      title: `Base skin-type burn dose: ${Math.round(med * 100)}% of Fitzpatrick ${literal(session.safety!.fitzpatrick || 'I')} MED.${assumed + caution}`,
      values: [`Base burn dose: ${label}${assumed || caution ? ' ⚠' : ''}`] });
  }
  return readouts;
}
/** Formats already calculated live values; dose integration and IU conversion stay in the ticker. */
export function liveSessionReadouts(live: LiveDosesOperations | null, vitaminD: { iu: number; ratePerMin: number } | null, elapsedMin: number): LiveSessionReadout[] {
  let vitamin = calculating();
  if (live && live.doses?.vitamin_d! > 0) {
    const iu = vitaminD?.iu ?? Number.NaN, rate = vitaminD?.ratePerMin ?? 0;
    vitamin = Number.isFinite(iu) && iu > 0
      ? { kind: 'vitamin-d', tone: 'normal', title: 'Modeled vitamin D IU-equivalent from incident action-weighted UVB. The per-minute value is the active-session average, not an instantaneous synthesis rate. This is not measured absorption or a blood-response prediction; individual uncertainty is multi-fold.', values: [vitaminDValue(iu), vitaminDRate(rate)] }
      : { kind: 'vitamin-d', tone: 'normal', title: 'The live UVB dose is available, but its IU-equivalent conversion did not produce a finite value. No numeric estimate is shown.', values: ['Estimate unavailable'], idle: true };
  } else if (live) {
    vitamin = { kind: 'vitamin-d', tone: 'normal', title: 'No vitamin-D-effective UVB dose is being modeled yet. This can occur near the edge of the solar UVB window or when skin is behind glass or covered.', values: ['No modeled UVB dose yet'], idle: true };
  }
  const readouts = [vitamin];
  if (live && Number.isFinite(live.medFraction)) {
    const { label, tone } = burnBand(live.medFraction), pct = Math.round(live.medFraction * 100);
    const caution = live.psmTier && live.psmTier !== 'none' ? ' Medication photosensitivity is not numerically included; your actual threshold may be lower.' : '';
    const assumed = live.fitzpatrickAssumed ? ' Conservative Type I is assumed because skin type is unset.' : '';
    readouts.push({ kind: 'burn', tone, title: `Base skin-type burn dose so far — ${pct}% of Fitzpatrick ${literal(live.fitzpatrick)} MED.${assumed + caution}`, values: [`${pct}% base burn dose · ${label}${assumed || caution ? ' ⚠' : ''}`] });
  }
  if (live && Number.isFinite(live.retinalUV) && live.retinalUV > 3) {
    const ruv = live.retinalUV, display = ruv >= 10 ? String(Math.round(ruv)) : ruv.toFixed(1);
    const label = ruv >= 30 ? 'at the ICNIRP 8-hour reference' : ruv >= 15 ? 'half the ICNIRP 8-hour reference' : 'building';
    readouts.push({ kind: 'retinal', tone: ruv >= 15 ? 'danger' : 'warning', title: `ICNIRP actinic-UV-weighted incident dose at the anterior eye. This is not retinal dose and does not track the separate unweighted UVA limit or the visible/thermal hazard of looking at the sun. Never stare at the sun. At ${display} J/m² this is ${label}.`, values: [`👁 ${display} J/m² ocular actinic UV`] });
  }
  const tempC = (live?.atm?.temperatureC ?? null) as number;
  if (Number.isFinite(tempC) && tempC > 30 && elapsedMin > 30) readouts.push({ kind: 'heat', tone: 'danger', title: `Ambient ${tempC.toFixed(0)}°C — heat risk is separate from UV dose. Move to a cool or shaded place, hydrate, and stop if you feel unwell.`, values: [`🌡 ${Math.round(tempC)}°C · cool down`] });
  return readouts;
}
export interface ActiveSessionView {
  readonly deviceIds?:Readonly<{readonly root:string|undefined;readonly elapsed:string|undefined;readonly stop:string|undefined}>;
  readonly kind: 'sun' | 'device'; readonly id: string; readonly date: string; readonly elapsed: string; readonly ariaLabel: string;
  readonly body: string; readonly eyes: string; readonly directEye: boolean; readonly suffix: string; readonly paused: boolean; readonly rotated: boolean; readonly forgotHours: number | null;
  readonly readouts: readonly LiveSessionReadout[]; readonly chips: readonly SessionChannelChip[] | null;
}
export function activeSunSessionView(session: SessionReader, date: string, elapsed: unknown, body: unknown, eyes: unknown, chips: SessionChannelChip[] | null, now: number): ActiveSessionView {
  return { kind: 'sun', id: literal(session.id), date, elapsed: literal(elapsed), ariaLabel: `Open ${date} session details`,
    body: literal(body), eyes: literal(eyes || 'Eyes unset'), directEye: session.eyeExposure?.mode === 'direct',
    suffix: `${session.bodyExposure?.glassBetween ? ' · through glass' : ''}${session.bodyExposure?.sunscreenSPF ? ` · SPF ${session.bodyExposure.sunscreenSPF}` : ''}`,
    paused: !!session.paused, rotated: !!session.bodyExposure?.rotatedSides,
    forgotHours: now - (session.startedAt as number) > 12 * 3600 * 1000 ? Math.round((now - (session.startedAt as number)) / 3600000) : null,
    readouts: initialSessionReadouts(session), chips };
}
