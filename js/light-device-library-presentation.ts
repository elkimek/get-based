import type { LightDeviceRecord, DeviceSessionRecord } from './light-devices-store.js';
import { formatWavelengthSummary, projectDeviceChannelChips, relativeTimeShort } from './light-device-view-formatters.js';
import type { DeviceChannelDisplay } from './light-device-view-formatters.js';

export interface LightDeviceAffiliateView { href: string; event: string; label: string; vendor: string }
export interface LightDeviceCardView {
  id: string; type: string; icon: string; name: string; specification: string; stats: string;
  chips: ReturnType<typeof projectDeviceChannelChips>; affiliate: LightDeviceAffiliateView | null;
}
export interface LightDevicePickerRow { id: string; name: string; specification: string }
export type LightDevicePresentationProps = {
  kind: 'library'; cards: readonly LightDeviceCardView[];
} | { kind: 'picker'; rows: readonly LightDevicePickerRow[]
} | { kind: 'chips'; chips: ReturnType<typeof projectDeviceChannelChips> };
const text = (value: unknown) => value == null ? '' : String(value);

// Pure display projection. The controller supplies captured records and resolved
// affiliate policy; calculations, catalog loading and persistence stay outside.
export function projectDeviceLibrary(input: {
  devices: readonly LightDeviceRecord[]; sessions: readonly DeviceSessionRecord[];
  types: Record<string, { icon?: unknown; label?: unknown }>;
  channels: Record<string, DeviceChannelDisplay>;
  affiliateFor(slug: string): LightDeviceAffiliateView | null;
  now: number;
}): LightDeviceCardView[] {
  const statsByDevice: Record<string, { count: number; lastAt: number }> = {};
  for (const session of input.sessions) {
    if (!session.deviceId) continue;
    const stats = statsByDevice[session.deviceId] = statsByDevice[session.deviceId] || { count: 0, lastAt: 0 };
    stats.count++;
    if ((session.startedAt || 0) > stats.lastAt) stats.lastAt = session.startedAt;
  }
  return input.devices.map(device => {
    const slug = device.catalogSlug || device.presetId || null;
    const affiliate = slug ? input.affiliateFor(slug) : null;
    const meta = input.types[device.type as string] || {};
    const type = text(meta.label || device.type || 'Device');
    const peaks = Array.isArray(device.peakWavelengths) ? device.peakWavelengths : [];
    const wavelength = formatWavelengthSummary(peaks);
    const estimated = ['curated-estimate', 'unknown'].includes(device.irradianceBasis || 'unknown');
    const intensity = device.mwPerCm2At15cm
      ? `${estimated ? '~' : ''}${device.mwPerCm2At15cm} mW/cm² @ ${device.recommendedDistanceCm || 15} cm`
      : device.lux ? `${device.lux} photopic lux` : device.melanopicEdiLux ? `${device.melanopicEdiLux} lx M-EDI` : '';
    const stats = statsByDevice[device.id] || { count: 0, lastAt: 0 };
    return { id: text(device.id), type: text(device.type), icon: text(meta.icon || '🔴'),
      name: `${text(device.brand)} ${text(device.model)}`,
      specification: `${type}${wavelength ? ` · ${wavelength}` : ''}${intensity ? ` · ${intensity}` : ''}`,
      stats: stats.count === 0 ? 'No sessions yet' : `${stats.count} session${stats.count !== 1 ? 's' : ''} · last ${relativeTimeShort(stats.lastAt, input.now)}`,
      chips: projectDeviceChannelChips(device.channels || [], input.channels), affiliate,
    };
  });
}

export function projectDevicePicker(devices: readonly LightDeviceRecord[]): LightDevicePickerRow[] {
  return devices.slice().sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0)).map(device => ({
    id: text(device.id), name: `${text(device.brand)} ${text(device.model)}`,
    specification: `${text(device.type || '')}${device.peakWavelengths?.length ? ' · ' + device.peakWavelengths.join('/') + 'nm' : ''}${device.mwPerCm2At15cm ? ' · ' + device.mwPerCm2At15cm + ' mW/cm²' : ''}`,
  }));
}
