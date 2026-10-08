import type { PageSessionOperations, PageDeviceReader, PageBudgetOperations, PageCoordsOperations } from '../types/light-page-view.js';
import type { LightAction } from './light-page-presentation.js';
export interface LightTodayInput {
  sessions: readonly PageSessionOperations[];
  deviceSessions: readonly PageSessionOperations[];
  active: PageSessionOperations | null;
  devices: readonly PageDeviceReader[];
  solarWindow: boolean;
  windowLabel: string;
  hasSetup: boolean;
  hasRooms: boolean;
  medToday: number;
  weeklyIU: number;
  budget: PageBudgetOperations | null | undefined;
  coords: PageCoordsOperations | null;
  now: number;
  elapsed: string;
}
export function projectLightToday(input: LightTodayInput) {
  const actions: LightAction[] = [];
  if (input.active)
    actions.push({ action: 'quick-log-sun', label: '⏹ Stop session — ', active: true, liveId: String(input.active.id), elapsed: input.elapsed });
  else {
    actions.push({ action: 'quick-log-sun', primary: true, label: input.solarWindow ? `☀ ${input.windowLabel} — log a session` : input.devices.length ? '☀ Log sun' : '☀ Log a sun session' });
    if (input.devices.length === 1) {
      const device = input.devices[0]!;
      actions.push({ action: 'quick-log-device', label: `🔴 ${device.brand || ''} ${device.model || ''}`.trim(), title: `Log a session on your ${device.brand || ''} ${device.model || ''}` });
    }
    else if (input.devices.length > 1)
      actions.push({ action: 'quick-log-device', label: '🔴 Device ', more: true, title: `Pick from your ${input.devices.length} devices` });
    if (!input.hasSetup)
      actions.push({ action: 'navigate-light', label: '🌞 Set up Light & Sun', title: 'Skin type, location, indoor light, photosensitive meds — 30 seconds. Drives every Light & Sun calculation.' });
    else if (!input.hasRooms)
      actions.push({ action: 'navigate-light', label: '🛋 Map a room', title: 'Map your rooms — most of your day is under indoor lights' });
  }
  const cutoff = input.now - 7 * 86400 * 1000;
  const sunWeek = input.sessions.filter(session => (session.startedAt || 0) >= cutoff).length;
  const deviceWeek = input.deviceSessions.filter(session => (session.startedAt || 0) >= cutoff).length;
  const weekTotal = sunWeek + deviceWeek;
  const formatWeekly = (n: number) => n >= 10000 ? (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : n >= 1000 ? Math.round(n / 100) * 100 : Math.round(n / 10) * 10;
  const weekly = input.weeklyIU >= 100 ? `☀ ~${formatWeekly(input.weeklyIU)} IU-eq vitamin D estimate this week` : '';
  let budget: {
    tone: 'warn' | 'info';
    label: string;
    title: string;
  } | null = null;
  const value = input.budget;
  if (value) {
    const formatIU = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k` : `${Math.round(n)}`;
    if (value.exceedsSupplementUL)
      budget = {
        tone: 'warn', label: `⚠ Logged vitamin D supplements: ${formatIU(value.supplementIU)} IU above the adult intake UL`,
        title: `The adult tolerable upper intake level is 4,000 IU/day from food, beverages, and supplements. The app sees ${formatIU(value.supplementIU)} IU in logged supplements but does not know dietary intake. Its separate ~${formatIU(value.sunIU)} IU-eq sunlight estimate is not intake and is not added. Discuss clinician-directed high-dose treatment with the prescriber.`,
      };
    else if (value.supplementIU > 0 && value.sunIU > 0)
      budget = {
        tone: 'info', label: `Vit D: ${formatIU(value.supplementIU)} IU supplements · ~${formatIU(value.sunIU)} IU-eq sunlight`,
        title: `Separate quantities: ${formatIU(value.supplementIU)} IU in logged supplements; ~${formatIU(value.sunIU)} IU-equivalent from the optical sunlight model. The sunlight estimate is not measured synthesis or intake and is not added to the supplement amount.`,
      };
  }
  const altitude = input.coords?.altitudeM || 0;
  const altitudeView = altitude > 1500 ? {
    label: `⛰ +${Math.round((altitude / 1000) * 10)}% UV (altitude ${Math.round(altitude)}m)`,
    title: `UV irradiance climbs ~10% per 1000m above sea level. At ${Math.round(altitude)}m, expect ~${Math.round((altitude / 1000) * 10)}% more UV than sea-level estimates.`,
  } : null;
  const med = input.medToday;
  return { actions, weekly, budget, altitude: altitudeView, weekTotal, weekTitle: `${sunWeek} sun + ${deviceWeek} device · last 7 days`,
    burn: med >= 0.3 ? { tone: med >= 1 ? 'over' : med >= 0.7 ? 'warn' : 'ok', percent: Math.round(med * 100), message: med >= 1 ? 'base MED reference reached — stop UV exposure' : med >= 0.7 ? 'approaching the base MED reference' : 'moderate sun exposure today' } : null,
  };
}
export type LightTodayView = ReturnType<typeof projectLightToday>;
