// @ts-check
// light-channel-view-hooks.js - wire Light channel feature dependencies at startup.

import {
  CHANNEL_DISPLAY,
  dailyChannelBreakdown,
  dailyVitaminDIUBreakdown,
  quickLogSunSession,
  rollingChannelTotals,
  rollingVitaminDIU,
  tierLabel,
  weeklyChannelTier,
} from './sun.js';
import { pbmJoulesPerCm2 } from './sun-spectrum.js';
import { quickLogDeviceSession } from './light-devices.js';
import { getDevices, rollingDeviceTotals } from './light-devices-store.js';
import { configureLightChannelView } from './light-channel-view.js';

configureLightChannelView({
  channelDisplay: CHANNEL_DISPLAY,
  dailyChannelBreakdown,
  dailyVitaminDIUBreakdown,
  getDevices,
  pbmJoulesPerCm2,
  quickLogDeviceSession,
  quickLogSunSession,
  rollingChannelTotals,
  rollingDeviceTotals,
  rollingVitaminDIU,
  tierLabel,
  weeklyChannelTier,
});
