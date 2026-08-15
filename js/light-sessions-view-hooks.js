// @ts-check
// light-sessions-view-hooks.js - wire Light Sessions View callbacks at startup.

import { getSessions } from './sun.js';
import { renderSunSessionRow } from './sun-session-ui.js';
import { configureLightDevices, openDeviceSessionDetail } from './light-devices.js';
import { getDeviceSessions, getDevices } from './light-devices-store.js';
import { renderDeviceSessionAIDetail } from './light-device-ai-analysis.js';
import { configureLightSessionsView } from './light-sessions-view.js';

configureLightDevices({ renderDeviceSessionAIDetail });

configureLightSessionsView({
  getDeviceSessions,
  getDevices,
  getSessions,
  openDeviceSessionDetail,
  renderSunSessionRow,
});
