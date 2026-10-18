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
  getSunSessionRowView,
  rollingChannelTotals,
  rollingVitaminDIU,
  vitaminDBudgetStatus,
  weeklyChannelTier,
} from './sun.js';
import { resumeActiveTickerIfNeeded } from './sun-active-session.js';
import{getSunSetupCardView}from'./sun-defaults.js';
import { _openChannelOnLightPage } from './light-channel-view.js';
import {
  ensureActiveDeviceTicker,
  openAddDeviceDialog,
  quickLogDeviceSession,
  getActiveDeviceSessionCardView,
  renderDevicesSection,
} from './light-devices.js';
import { getActiveDeviceSession, getDeviceSessions, getDevices, rollingDeviceTotals } from './light-devices-store.js';
import { openLightEnvironmentAssessment, renderEnvironmentAssessmentSummary } from './light-env.js';
import { renderLightTools } from './light-tools.js';
import { getChannelMixVerdictView } from './light-channels-ai-analysis.js';
import { getLightTodayDashboardView, getLightTodayHeroView } from './light-today-ai.js';
import { installSunDataSourceDelegates, getSunDataSourceSettingsView } from './settings-privacy.js';
import { configureLightPageView } from './light-page-view.js';

installSunDataSourceDelegates();

configureLightPageView({
  channelDisplay: CHANNEL_DISPLAY,
  channelTier,
  cumulativeMEDToday,
  cumulativeMEDYesterday,
  ensureActiveDeviceTicker,
  getActiveDeviceSession,
  getActiveSession,
  getDeviceSessions,
  getDevices,
  getSessions,
  getSunCoords,
  openAddDeviceDialog,
  openChannelOnLightPage: _openChannelOnLightPage,
  openDetailedSessionDialog,
  openLightEnvironmentAssessment,
  quickLogDeviceSession,
  quickLogSunSession,
  getActiveDeviceSessionCardView,
  getChannelMixVerdictView,
  renderDevicesSection,
  renderEnvironmentAssessmentSummary,
  getLightTodayDashboardView,
  getLightTodayHeroView,
  renderLightTools,
  getSunDataSourceSettingsView,
  getSunSessionRowView,
  getSunSetupCardView,
  requestPreciseLocation,
  resumeActiveTickerIfNeeded,
  rollingChannelTotals,
  rollingDeviceTotals,
  rollingVitaminDIU,
  vitaminDBudgetStatus,
  weeklyChannelTier,
});
