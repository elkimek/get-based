import type { DeviceSessionRecord } from './light-devices-store.js';

const text = (value: unknown): string => value == null ? '' : String(value);

export interface SessionDetailField {
  readonly label: string;
  readonly value: string;
  readonly title: string;
  readonly wide: boolean;
}
export function detailField(label: string, value: unknown, title = '', wide = false): SessionDetailField {
  return { label, value: text(value), title, wide };
}

export interface SessionDetailChannel {
  readonly key: string;
  readonly label: string;
  readonly icon: string;
  readonly value: string;
  readonly source: string;
  readonly hasSignal: boolean;
  readonly ariaLabel: string;
}
export function detailChannel(key: string, meta: { label?: unknown; icon?: unknown }, dose: unknown, unit: unknown, kind: 'sun' | 'device'): SessionDetailChannel {
  const hasSignal = Number.isFinite(dose) && Number(dose) > 0;
  const value = text(unit || (hasSignal ? (kind === 'sun' ? 'Signal logged' : 'Device signal logged') : 'Not modeled'));
  const source = hasSignal ? (kind === 'sun' ? 'Sunlight' : 'Device') : 'No signal';
  const label = text(meta.label || key);
  return { key, label, icon: text(meta.icon || '·'), value, source, hasSignal,
    ariaLabel: `${label} — ${value}, ${source}. Open channel details.` };
}

export interface SessionDetailNotice { readonly title: string; readonly text: string; readonly danger?: boolean; }
export function deviceDetailNotices(session: DeviceSessionRecord): SessionDetailNotice[] {
  const notices: SessionDetailNotice[] = [];
  const safety = session.safety;
  if (safety?.hasUV) {
    const modeled = (safety.uvDoseStatus === 'modeled' || safety.uvDoseStatus == null) && Number.isFinite(safety.erythemalSED);
    const summary = modeled
      ? `Local erythemal dose: ${Number(safety.erythemalSED).toFixed(2)} SED${Number.isFinite(safety.conservativeBaseMedFraction) ? ` · ${Math.round(Number(safety.conservativeBaseMedFraction) * 100)}% of a conservative Type I base MED` : ''}${Number(safety.ocularActinicUV) > 0 ? ` · ocular actinic UV: ${Number(safety.ocularActinicUV).toFixed(1)} J/m²` : ''}${Number(safety.ocularUvaJPerM2) > 0 ? ` · ocular UVA: ${Number(safety.ocularUvaJPerM2).toFixed(1)} J/m²` : ''}. This is a model, not a personal threshold.`
      : 'UV was emitted, but the spectral output, band split, or distance basis is insufficient for a defensible number. Burn dose, ocular dose, and vitamin-D output are not calculated.';
    notices.push({ title: safety.unsafeEyeExposure ? '⚠ UV eye protection was not recorded' : modeled ? 'UV dose model' : 'UV dose unavailable',
      text: `${summary} Closed eyelids are not UV protection.`, danger: !!safety.unsafeEyeExposure });
  }
  const warnings = Array.isArray(session.calculation?.warnings) ? session.calculation.warnings : [];
  if (warnings.length) notices.push({ title: 'Estimate limits', text: warnings.map(text).join(' ') });
  return notices;
}
export function deviceDetailLightMetric(session: DeviceSessionRecord): SessionDetailNotice | null {
  const metrics = session.metrics;
  const photopic = Number.isFinite(metrics?.photopicLux), melanopic = Number.isFinite(metrics?.melanopicEdiLux);
  if (!photopic && !melanopic) return null;
  const parts: string[] = [];
  if (photopic) parts.push(`${Math.round(metrics!.photopicLux!).toLocaleString()} photopic lux`);
  if (melanopic) {
    parts.push(`${Math.round(metrics!.melanopicEdiLux!).toLocaleString()} lx melanopic EDI${metrics!.melanopicStatus === 'device-der' ? ' estimated from the device DER' : ''}`);
  } else {
    parts.push('Melanopic EDI unavailable without a measured spectrum or declared melanopic DER');
  }
  return { title: 'Eye-level light metric', text: parts.join(' · ') + '.' };
}

export function sessionCalculationNotice(status: unknown) {
  const messages: Record<string, string> = {
    pending: 'Estimates are being recalculated. Previous derived values are hidden until the new calculation finishes.',
    'needs-location': 'A location is needed to reconstruct conditions and calculate this session.',
    'atmosphere-unavailable': 'Conditions could not be loaded for this session. No dose or burn estimate is being shown.',
    'calculation-error': 'The session could not be calculated. No stale estimate is being shown.',
  };
  const message = messages[text(status)];
  return message ? { message, error: status === 'calculation-error', retry: typeof status === 'string' && ['needs-location', 'atmosphere-unavailable', 'calculation-error'].includes(status) } : null;
}

export interface SessionDetailView {
  readonly kind: 'sun' | 'device';
  readonly id: string;
  readonly title: string;
  readonly summary: readonly SessionDetailField[];
  readonly setup: readonly SessionDetailField[];
  readonly notices: readonly SessionDetailNotice[];
  readonly calculation: ReturnType<typeof sessionCalculationNotice>;
  readonly channels: readonly SessionDetailChannel[];
  readonly channelsEmpty: string;
  readonly signalsDescription: string;
  readonly lightMetric: SessionDetailNotice | null;
  readonly inputTitle: string;
  readonly inputDescription: string;
  readonly inputs: readonly SessionDetailField[];
  readonly inputsEmpty: string;
  readonly location: SessionDetailField | null;
  readonly sourceUrl: string;
  readonly notes: string;
  readonly canEditDuration: boolean;
  readonly canEditMode: boolean;
}
