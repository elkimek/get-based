import { CHANNEL_CITATIONS, CHANNEL_READING_NOTES, channelTakeaway } from './light-channel-content.js';

export interface ChannelDay { sun: number; device: number; date: { getDay(): number; getTime(): unknown } }
export interface ChannelBar { empty: boolean; x: number; sunY: number; deviceY: number; sunHeight: number; deviceHeight: number; label: string; labelY: number; day: string; today: boolean }
export interface ChannelChart { bars: ChannelBar[]; summary: string }
export interface ChannelDetailView {
  channel: string; icon: string; label: string; meaning: string;
  primary: string; sub: string; hasSun: boolean; hasDevice: boolean;
  chart: ChannelChart | null; note: string;
  takeaway: { text: string; peakTime: string; matchingDevice: boolean } | null;
  research: { spectrum: string; refs: { cite: string; href: string; why: string }[]; suggestURL: string } | null;
}
interface ChannelDetailInput {
  channel: string; meta: { icon?: unknown; label?: unknown; what?: unknown };
  sun: unknown; device: unknown; recentDays: ChannelDay[];
  chartDays: ChannelDay[] | null; iuDays: ChannelDay[] | null;
  pbmJoulesPerCm2: ((n: number) => number) | null;
  matchingDevice: boolean; peakAt: string | number | null; peakUV: number | null;
}
const hasSignal = (n: unknown) => Number.isFinite(n) && (n as number) > 0.0001;
const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Scale sources independently to the observed week. These bars are a log of
// modeled signals, never a target, completion percentage or combined dose.
export function projectChannelChart(channel: string, days: ChannelDay[] | null, iuDays: ChannelDay[] | null,
  pbmJoulesPerCm2: ChannelDetailInput['pbmJoulesPerCm2'], now = new Date()): ChannelChart | null {
  if (!days) return null;
  const max = Math.max(Math.max(0, ...days.flatMap(d => [d.sun, d.device])), 0.001);
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const format = (n: number, index: number) => {
    if (!Number.isFinite(n) || n < 0.5) return '';
    if (channel === 'vitamin_d') {
      const iu = iuDays ? (iuDays[index]?.sun || 0) + (iuDays[index]?.device || 0) : 0;
      if (iu < 1) return '';
      if (iu >= 1000) return (iu / 1000).toFixed(1) + 'k';
      if (iu >= 100) return String(Math.round(iu / 10) * 10);
      return String(Math.round(iu));
    }
    if (channel === 'nir_solar' && pbmJoulesPerCm2) {
      const j = pbmJoulesPerCm2(n);
      if (j < 0.05) return '';
      if (j >= 10) return String(Math.round(j));
      return j >= 1 ? j.toFixed(1) : j.toFixed(2);
    }
    return '';
  };
  const barWidth = (280 - 36) / 7, inner = Math.max(10, barWidth * 0.7);
  return {
    bars: days.map((d, i) => {
      const total = d.sun + d.device;
      const sunHeight = total > 0 ? (d.sun / max) * 66 : 0;
      const deviceHeight = total > 0 ? (d.device / max) * 66 : 0;
      return { empty: !(total > 0), x: 18 + i * barWidth + (barWidth - inner) / 2,
        sunHeight, deviceHeight, sunY: 80 - sunHeight, deviceY: 80 - deviceHeight,
        label: d.sun > 0 && d.device <= 0 ? format(d.sun, i) : d.device > 0 && d.sun <= 0 ? format(d.device, i) : '',
        labelY: 80 - Math.max(sunHeight, deviceHeight) - 2, day: 'SMTWTFS'[d.date.getDay()] || '',
        today: d.date.getTime() === today.getTime() };
    }),
    summary: days.map(d => {
      const name = dayNames[d.date.getDay()];
      if (d.sun + d.device < 0.0001) return `${name}: no exposure`;
      if (d.device > 0 && d.sun > 0) return `${name}: sunlight and device signal logged`;
      return `${name}: ${d.sun > 0 ? 'sunlight' : 'device'} signal logged`;
    }).join('. '),
  };
}
export function projectChannelDetail(input: ChannelDetailInput, now = new Date()): ChannelDetailView {
  const { channel, meta, recentDays } = input;
  const hasSun = hasSignal(input.sun), hasDevice = hasSignal(input.device);
  const counts = { any: 0, sun: 0, device: 0 };
  for (const day of recentDays) {
    if (hasSignal(day.sun + day.device)) counts.any++;
    if (hasSignal(day.sun)) counts.sun++;
    if (hasSignal(day.device)) counts.device++;
  }
  const sourceDays = [counts.sun ? `sunlight on ${counts.sun} day${counts.sun === 1 ? '' : 's'}` : '',
    counts.device ? `device on ${counts.device} day${counts.device === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ');
  const label = String(meta.label || channel);
  const citation = CHANNEL_CITATIONS[channel];
  const issueTitle = encodeURIComponent(`[Light & Sun] ${label}: better study / correction`);
  const issueBody = citation ? encodeURIComponent(`**Channel:** ${label} (\`${channel}\`)\n**Action spectrum:** ${citation.spectrum}\n\n**Current references:**\n${citation.refs.map(r => `- ${r.cite}\n  ${r.href}`).join('\n')}\n\n**What's wrong / what's better:**\n\n**Suggested study (with link):**\n\n**Why this is a better fit (one line):**\n`) : '';
  const text = channelTakeaway(channel, hasSun, hasDevice);
  return { channel, icon: String(meta.icon || '·'), label, meaning: String(meta.what || ''), hasSun, hasDevice,
    primary: hasSun && hasDevice ? 'Sunlight + device logged' : hasSun ? 'Sunlight logged' : hasDevice ? 'Device logged' : 'Not logged',
    sub: counts.any ? `${sourceDays}. This records exposure, not biological completion.` : 'No matching exposure was recorded this week. That is a logging result, not a deficiency.',
    chart: projectChannelChart(channel, input.chartDays, input.iuDays, input.pbmJoulesPerCm2, now),
    note: CHANNEL_READING_NOTES[channel] || '',
    takeaway: text ? { text, matchingDevice: input.matchingDevice,
      peakTime: channel === 'vitamin_d' && !hasSun && input.peakAt && (input.peakUV as number) >= 3
        ? new Date(input.peakAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '' } : null,
    research: citation ? { ...citation, suggestURL: `https://github.com/elkimek/get-based/issues/new?title=${issueTitle}&body=${issueBody}&labels=enhancement` } : null,
  };
}


export const LIGHT_CHANNEL_ORDER = ['vitamin_d', 'circadian', 'nir_solar', 'no_cv', 'pomc', 'violet_eye'] as const;
export interface ChannelSparkBar { x: number; empty: boolean; sunHeight: number; deviceHeight: number }
export interface ChannelSparkline { bars: ChannelSparkBar[] }
export interface ChannelDayCount { txt: string; n: number; sun: number; device: number }
export interface ChannelPillView {
  key: string; icon: string; label: string; active: boolean; title: string;
  days: string; description: string; chart: ChannelSparkline | null;
}

// The mini chart retains the same relative scaling and source separation as
// the detail chart. The adapter handles absent services; an empty week shows placeholders.
export function projectChannelSparkline(days: readonly Pick<ChannelDay, 'sun' | 'device'>[]): ChannelSparkline {
  const max = Math.max(Math.max(0, ...days.flatMap(day => [day.sun, day.device])), 0.001);
  return { bars: days.map((day, index) => ({ x: index * 7, empty: !hasSignal(day.sun + day.device),
    sunHeight: Math.max(0, day.sun / max * 14), deviceHeight: Math.max(0, day.device / max * 14) })) };
}
export function projectChannelDayCount(days: readonly Pick<ChannelDay, 'sun' | 'device'>[]): ChannelDayCount {
  let n = 0, sun = 0, device = 0;
  for (const day of days) {
    if (hasSignal(day.sun + day.device)) n++;
    if (hasSignal(day.sun)) sun++;
    if (hasSignal(day.device)) device++;
  }
  return { txt: n ? `${n} day${n === 1 ? '' : 's'}` : 'Not logged', n, sun, device };
}
export function projectChannelPill(key: string, meta: ChannelDetailInput['meta'], sun: unknown, device: unknown,
  counts: ChannelDayCount, chart: ChannelSparkline | null): ChannelPillView {
  const hasSun = hasSignal(sun), hasDevice = hasSignal(device);
  const source = hasSun && hasDevice ? 'Sunlight + device logged' : hasSun ? 'Sunlight logged' : hasDevice ? 'Device logged' : 'Not logged';
  const sourceDays = [counts.sun ? `sunlight ${counts.sun}d` : '', counts.device ? `device ${counts.device}d` : ''].filter(Boolean).join(' · ');
  return { key, icon: String(meta.icon || '·'), label: String(meta.label || key), active: hasSun || hasDevice,
    title: `${meta.what || ''} — ${source}${sourceDays ? ` (${sourceDays})` : ''}.`, days: counts.txt,
    description: source + (counts.n ? ` on ${counts.n} day${counts.n === 1 ? '' : 's'} this week` : ''), chart };
}
