// Pure display projection. Camera, solar calculations and storage keep their owners.
import type {AimingGuideView} from './light-camera-presentation.js';
import { formatSunClock, type classifyDayWindow } from './light-tools-solar-time.js';

export interface LightToolActionView { id: string; icon: string; name: string; title: string; reason: string; primary: boolean }
export interface LightToolGroupView { title: string; time: string; actions: LightToolActionView[] }
export interface LightToolsLauncherView { status: string[]; recommended: LightToolActionView[]; groups: LightToolGroupView[] }
export interface GoldenHourLogView { label: string; inGolden: boolean; currentWindow: string; subtitle: string; warning: boolean }
export interface AuditPauseDisplay { lux: number | null; levelLabel: string; label: string }
export interface AuditPauseRowView { index: number; reading: string; ariaLabel: string; placeholder: string; value: string; list: string }
export type WalkthroughStatus = 'manual' | 'auto' | 'denied' | 'no-context';
export type LightToolPresentationProps =
  | { kind: 'launcher'; view: LightToolsLauncherView }
  | { kind: 'golden'; view: GoldenHourLogView }
  | { kind: 'audit'; guide: AimingGuideView | null }
  | { kind: 'audit-rows'; rows: AuditPauseRowView[] }
  | { kind: 'audit-status'; state: WalkthroughStatus };

const TOOLS: Readonly<Record<string, { icon: string; name: string; desc: string; short: string } | undefined>> = {
    spectrum: {
      icon: '🔬',
      name: 'What is this light?',
      desc: 'Screen the camera RGB pattern as warm, cool, or mixed without calling it a spectrum.',
      short: 'Warm / cool pattern',
    },
    lux: {
      icon: '📏',
      name: 'Lux meter',
      desc: 'Measure photopic lux from a built-in sensor, meter entry, or a device-calibrated camera.',
      short: 'Brightness baseline',
    },
    cct: {
      icon: '🎨',
      name: 'Color temp',
      desc: 'Get an approximate warm/cool camera estimate and screen for visible banding.',
      short: 'Warm vs cool',
    },
    flicker: {
      icon: '⚡',
      name: 'Flicker detector',
      desc: 'Screen for rolling-shutter banding; absence does not prove flicker-free output.',
      short: 'Banding screen',
    },
    darkness: {
      icon: '🌙',
      name: 'Sleep darkness',
      desc: 'Run a qualitative low-light camera check or enter a meter reading at the pillow.',
      short: 'Bedroom night check',
    },
    glass: {
      icon: '🪟',
      name: 'Window check',
      desc: 'Compare two readings with and without glass for a better behind-glass estimate.',
      short: 'Glass transmission',
    },
    audit: {
      icon: '🚶',
      name: 'Home audit',
      desc: 'Walk through rooms for relative brightness with one held camera exposure.',
      short: 'Room sweep',
    },
    golden: {
      icon: '🌅',
      name: 'Golden hour log',
      desc: 'After-the-fact log for sunrise or sunset sessions.',
      short: 'Solar timing',
    },
  };


function action(id: string, reason?: string, primary = false): LightToolActionView {
  const tool = TOOLS[id]!;
  return { id, icon: tool.icon, name: tool.name, title: tool.desc, reason: reason || tool.short, primary };
}

export function projectLightTools(measurements: readonly { capturedAt?: unknown }[], environment: { rooms?: unknown } | null | undefined, now: number): LightToolsLauncherView {
  const total = measurements.length;
  const recent = measurements.filter(item => ((item.capturedAt || 0) as number) >= now - 7 * 86400000).length;
  const rooms = Array.isArray(environment?.rooms) ? environment.rooms.length : 0;
  return {
    status: total ? [
      `${total} measurement${total === 1 ? '' : 's'}`,
      recent ? `${recent} in the last 7 days` : 'No readings this week',
      rooms ? `${rooms} room${rooms === 1 ? '' : 's'} mapped` : 'No rooms mapped',
    ] : [
      'No measurements yet', 'Camera frames stay local',
      rooms ? `${rooms} room${rooms === 1 ? '' : 's'} ready` : 'Map rooms to attach readings',
    ],
    recommended: [action('lux', 'Set brightness baseline', true), action('flicker', 'Screen for visible banding'), action('spectrum', 'Check warm / cool pattern')],
    groups: [
      { title: 'Specialized checks', time: '30 s-2 min', actions: ['cct', 'darkness', 'glass'].map(id => action(id)) },
      { title: 'Walkthroughs & logs', time: '2-10 min', actions: ['audit', 'golden'].map(id => action(id)) },
    ],
  };
}

export function projectGoldenHourLog(solarWindow: ReturnType<typeof classifyDayWindow>): GoldenHourLogView {
  return {
    label: solarWindow.label, inGolden: solarWindow.kind === 'sunrise' || solarWindow.kind === 'sunset', currentWindow: solarWindow.label.toLowerCase(),
    warning: solarWindow.kind === 'unknown',
    subtitle: solarWindow.kind === 'unknown' ? 'No location coords — set country in profile for accurate sunrise/sunset windows.'
      : solarWindow.sunrise && solarWindow.sunset ? `today: sunrise ${formatSunClock(solarWindow.sunrise)} · sunset ${formatSunClock(solarWindow.sunset)}` : '',
  };
}

export const COMMON_AUDIT_ROOMS = ['Bedroom', 'Living room', 'Kitchen', 'Bathroom', 'Office', 'Hallway', 'Kids room'] as const;
export function projectAuditPauseRows(pauses: readonly AuditPauseDisplay[]): AuditPauseRowView[] {
  return pauses.map((pause, index) => ({
    index, reading: pause.lux != null ? `~${Math.round(pause.lux)} lux` : pause.levelLabel,
    ariaLabel: `Label for room ${index + 1} (${pause.lux != null ? `about ${Math.round(pause.lux)} lux` : pause.levelLabel})`,
    placeholder: `Room ${index + 1} (tap to label)`, value: pause.label || '', list: `audit-rooms-${index}`,
  }));
}
