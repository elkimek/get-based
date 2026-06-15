// @ts-check
// light-sessions-view-hooks.js - wire Light Sessions View callbacks at startup.

import { CHANNEL_DISPLAY, channelTier, formatChannelUnit, getSessions } from './sun.js';
import { renderSunSessionRow } from './sun-session-ui.js';
import { deleteDeviceSessionWithConfirm, openDeviceSessionDetail } from './light-devices.js';
import { getDeviceSessions, getDevices } from './light-devices-store.js';
import { renderDeviceSessionAIInline } from './light-device-ai-analysis.js';
import { configureLightSessionsView } from './light-sessions-view.js';

configureLightSessionsView({
  channelDisplay: CHANNEL_DISPLAY,
  channelTier,
  deleteDeviceSession: deleteDeviceSessionWithConfirm,
  formatChannelUnit,
  getDeviceSessions,
  getDevices,
  getSessions,
  openDeviceSessionDetail,
  renderDeviceSessionAIInline,
  renderSunSessionRow,
});
