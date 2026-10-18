import type{EnvironmentAIView}from'./light-environment-ai-presentation.js';
// Display-only projection. Grading, today overrides and mutations remain domain-owned.
export type ScreenCardReader = { [Key in keyof import('./light-env-model.js').LightScreen]?: unknown };
export interface EnvironmentTodayView {
  readonly kind: string | undefined; readonly id: string | undefined; readonly active: boolean; readonly compact: boolean;
  readonly icon: string; readonly label: string; readonly tip: string;
}
export interface ScreenOptionView { readonly value: string; readonly label: string; readonly selected: boolean }
export interface EnvironmentScreenView {
  readonly id: string; readonly actionId: string | undefined; readonly expanded: boolean; readonly active: boolean;
  readonly severity: 'green' | 'yellow' | 'orange' | 'red' | 'incomplete';
  readonly status: string; readonly statusTitle: string; readonly icon: string; readonly deviceLabel: string;
  readonly summary: string; readonly disclosureLabel: string; readonly devices: readonly ScreenOptionView[]; readonly rooms: readonly ScreenOptionView[];
  readonly hours: string | null; readonly evening: string | null; readonly blueReduced: boolean;
  readonly today: EnvironmentTodayView | null; readonly alternateToday: Readonly<EnvironmentTodayView> | null; readonly ai: Readonly<EnvironmentAIView> | null;
}
const text = (value: unknown) => value == null ? '' : String(value);
// Match the established delegated attribute omission contract, including numeric zero.
const actionValue = (value: unknown) => value == null || value === '' || value === false ? undefined : String(value);
export function projectEnvironmentToday(kind: unknown, id: unknown, active: unknown, compact = true): EnvironmentTodayView {
  return { kind: actionValue(kind), id: actionValue(id), active: !!active, compact,
    icon: active ? '✓' : '⊘', label: active ? 'In use today' : 'Skipped today',
    tip: active ? "Click to skip today — won't count toward today's exposure. Resets to 'in use' tomorrow."
      : "Click to use today — counts toward today's exposure." };
}
// Hours-per-day chip buckets — separate set from room HOURS_BUCKETS
// because screen total-day usage often skews lower (a phone is 3 hr,
// not 8). Stored as numeric midpoint, same as rooms.
export const SCREEN_HOURS_BUCKETS = [
  { key: 'short',  label: '< 1 hr',  midpoint: 0.5, min: 0, max: 1 },
  { key: 'some',   label: '1–3 hr',  midpoint: 2,   min: 1, max: 3 },
  { key: 'lots',   label: '3–6 hr',  midpoint: 4.5, min: 3, max: 6 },
  { key: 'most',   label: '6+ hr',   midpoint: 8,   min: 6, max: 24 },
];

export function activeScreenHoursBucket(hours: unknown) {
  if (hours == null || isNaN(+(hours as number))) return null;
  const h = +(hours as number);
  for (const b of SCREEN_HOURS_BUCKETS) if (h >= b.min && h < b.max) return b.key;
  return 'most';
}

export function activeScreenEveningBucket(eve: unknown) {
  if (eve == null) return null;
  const h = +(eve as number);
  if (h <= 0) return 'none';
  if (h < 1) return 'lt1';
  if (h < 3) return 'mid';
  return 'gt3';
}


export function projectEnvironmentScreen(input: {
  screen: ScreenCardReader; expanded: boolean; active: boolean;
  status: { color: unknown; label: unknown; reason: unknown };
  devices: readonly { key: string; label: string }[]; rooms: unknown;
  today?: EnvironmentTodayView | null; alternateToday: Readonly<EnvironmentTodayView> | null; ai: Readonly<EnvironmentAIView> | null;
}): EnvironmentScreenView {
  const { screen: s, status, expanded } = input;
  const parts: string[] = [];
  if (s.hoursPerDay != null && (s.hoursPerDay as number) > 0) parts.push(`${s.hoursPerDay} hr/day`);
  if (s.eveningUseAfterSunset != null && (s.eveningUseAfterSunset as number) > 0) parts.push(`${s.eveningUseAfterSunset} hr evening`);
  else if ((s.hoursPerDay as number) > 0) parts.push('daytime only');
  if (s.blueBlockerEnabled) parts.push('blue reduced');
  const summary = parts.join(' · '), deviceLabel = input.devices.find(d => d.key === s.device)?.label || 'Device';
  const icons: Record<string, string> = { phone: '📱', laptop: '💻', monitor: '🖥', tablet: '📲', tv: '📺' };
  const icon = typeof s.device === 'string' && Object.hasOwn(icons, s.device) ? icons[s.device]! : '📱';
  const severity = status.color === 'green' || status.color === 'yellow' || status.color === 'orange' || status.color === 'red' ? status.color : 'incomplete';
  const rooms = Array.isArray(input.rooms) ? input.rooms as { id?: unknown; name?: unknown }[] : [];
  return { id: text(s.id), actionId: actionValue(s.id), expanded, active: input.active, severity,
    status: text(status.label), statusTitle: `${status.label} — ${status.reason}`, icon, deviceLabel,
    summary: summary || 'Tap to set up', disclosureLabel: `${deviceLabel} — ${status.label}${summary ? ', ' + summary : ''}, ${expanded ? 'expanded' : 'collapsed'}`,
    devices: input.devices.map(d => ({ value: d.key, label: d.label, selected: s.device === d.key })),
    rooms: rooms.length ? [{ value: '', label: 'Portable / multiple rooms', selected: !s.roomId },
      ...rooms.map(r => ({ value: text(r.id), label: text(r.name || 'Room'), selected: s.roomId === r.id }))] : [],
    hours: activeScreenHoursBucket(s.hoursPerDay), evening: activeScreenEveningBucket(s.eveningUseAfterSunset),
    blueReduced: !!s.blueBlockerEnabled, today: input.today || null,
    alternateToday: input.alternateToday, ai: expanded ? input.ai : null,
  };
}
