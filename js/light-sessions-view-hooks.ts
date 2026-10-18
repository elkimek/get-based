// light-sessions-view-hooks.js - wire Light Sessions View callbacks at startup.

import { getSessions } from './sun.js';
import { getSunSessionRowView } from './sun-session-ui.js';
import { configureLightDevices, openDeviceSessionDetail } from './light-devices.js';
import { getDeviceSessions, getDevices } from './light-devices-store.js';
import { getDeviceSessionAIView } from './light-device-ai-analysis.js';
import { configureLightSessionsView } from './light-sessions-view.js';

configureLightDevices({getDeviceSessionAIDetailView:(session:Parameters<typeof getDeviceSessionAIView>[0])=>getDeviceSessionAIView(session,'detail')});

configureLightSessionsView({
  getDeviceSessions,
  getDevices,
  getSessions,
  openDeviceSessionDetail,
  getSunSessionRowView,
});
