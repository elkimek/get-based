import type {ProfileData} from '../../types/app-state.js';
// Self-contained browser initialization: no physical camera requests.
export function seedDeniedLightToolProfile({defaults, now}: {defaults: ProfileData; now: number}) {
  if (!['http:', 'https:'].includes(location.protocol)) return;
  localStorage.setItem('labcharts-ai-paused', 'true');
  Object.assign(window, {lightToolCameraRequests: 0});
  Object.defineProperty(window, 'AmbientLightSensor', {configurable: true, value: undefined});
  Object.defineProperty(navigator, 'mediaDevices', {configurable: true, value: {getUserMedia: async () => {
    (window as unknown as {lightToolCameraRequests: number}).lightToolCameraRequests++;
    throw new DOMException('Fixture camera permission denied', 'NotAllowedError');
  }}});
  if (localStorage.getItem('light-tools-seeded')) return;
  localStorage.setItem('light-tools-seeded', '1');
  localStorage.setItem('labcharts-profiles', JSON.stringify([{id: 'default', name: 'Ada', sex: 'male', dob: '1990-01-01', createdAt: 1}]));
  localStorage.setItem('labcharts-active-profile', 'default');
  for (const key of ['emptyTour', 'tour']) localStorage.setItem(`labcharts-default-${key}`, 'completed');
  localStorage.setItem('labcharts-default-imported', JSON.stringify({...defaults, contextNotes: 'Retain unrelated tool context',
    sunDefaults: {fitzpatrick: 'II', completedAt: 1}, lightEnvironment: {rooms: [{id: 'tools-room', name: 'Bedroom', primarySource: 'led-warm', hoursOccupiedPerDay: 8}], screens: []},
    lightMeasurements: [{id: 'tools-lux', roomId: 'tools-room', tool: 'lux', value: 150, capturedAt: now, source: 'manual', confidence: 1}],
  }));
}
