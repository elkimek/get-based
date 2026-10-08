import type { LightDeviceRecord } from '../../js/light-devices-store.js';
import type { ProfileData } from '../../types/app-state.js';

/** One-time returning profile; later UI actions must use canonical persistence. */
export function seedLightPageFixture({ defaults, devices = [], sunDefaults = {} }: { defaults: ProfileData; devices?: LightDeviceRecord[]; sunDefaults?: ProfileData['sunDefaults'] }) {
  if (!['http:', 'https:'].includes(location.protocol) || localStorage.getItem('light-page-seeded')) return;
  localStorage.setItem('light-page-seeded', '1');
  localStorage.setItem('labcharts-profiles', JSON.stringify([{ id: 'default', name: 'Ada', sex: 'male', dob: '1990-01-01', createdAt: 1 }]));
  localStorage.setItem('labcharts-active-profile', 'default');
  localStorage.setItem('labcharts-default-imported', JSON.stringify({
    ...defaults, contextNotes: 'Unrelated Light acceptance context <kept>.',
    sunDefaults: { fitzpatrick: 'II', completedAt: 1, ...sunDefaults }, lightDevices: devices,
    sunSessions: [], deviceSessions: [], lightMeasurements: [], lightAudits: [],
    lightEnvironment: { rooms: [], screens: [] }, lightDailyVerdicts: {},
  }));
}
