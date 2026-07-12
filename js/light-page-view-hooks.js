// @ts-check
// light-page-view-hooks.js - wire Light page feature dependencies at startup.

import {
  CHANNEL_DISPLAY,
  channelTier,
  cumulativeMEDToday,
  cumulativeMEDYesterday,
  getActiveSession,
  getSessions,
  getSunCoords,
  openDetailedSessionDialog,
  quickLogSunSession,
  requestPreciseLocation,
  renderSunSessionRow,
  rollingChannelTotals,
  rollingVitaminDIU,
  vitaminDBudgetStatus,
  weeklyChannelTier,
} from './sun.js';
import { getCachedConditionsAtmosphere } from './light-conditions-now.js';
import { resumeActiveTickerIfNeeded } from './sun-active-session.js';
import { openLightSetup, renderSetupCard as renderSunSetupCard } from './sun-defaults.js';
import { _openChannelOnLightPage } from './light-channel-view.js';
import {
  ensureActiveDeviceTicker,
  openAddDeviceDialog,
  quickLogDeviceSession,
  renderActiveDeviceSessionCard,
  renderDevicesSection,
} from './light-devices.js';
import { getDeviceSessions, getDevices, rollingDeviceTotals } from './light-devices-store.js';
import { openLightEnvironmentAssessment, renderEnvironmentAssessmentSummary } from './light-env.js';
import { renderLightTools } from './light-tools.js';
import { renderLightTodayDashboardChip, renderLightTodayHero } from './light-today-ai.js';
import { configureLightPageView } from './light-page-view.js';

configureLightPageView({
  channelDisplay: CHANNEL_DISPLAY,
  channelTier,
  cumulativeMEDToday,
  cumulativeMEDYesterday,
  ensureActiveDeviceTicker,
  getActiveSession,
  getDeviceSessions,
  getDevices,
  getSessions,
  getSunCoords,
  getCachedConditionsAtmosphere,
  openAddDeviceDialog,
  openChannelOnLightPage: _openChannelOnLightPage,
  openDetailedSessionDialog,
  openLightEnvironmentAssessment,
  openLightSetup,
  quickLogDeviceSession,
  quickLogSunSession,
  renderActiveDeviceSessionCard,
  renderDevicesSection,
  renderEnvironmentAssessmentSummary,
  renderLightTodayDashboardChip,
  renderLightTodayHero,
  renderLightTools,
  renderSunSessionRow,
  renderSunSetupCard,
  requestPreciseLocation,
  resumeActiveTickerIfNeeded,
  rollingChannelTotals,
  rollingDeviceTotals,
  rollingVitaminDIU,
  vitaminDBudgetStatus,
  weeklyChannelTier,
});
