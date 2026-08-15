// @ts-check
// app-light-sun-modules.js - lazy-loaded Light & Sun analysis and UI hooks

import './sun-uvdata.js';
import './sun-spectrum.js';
import { rollingChannelTotals } from './sun.js';
import './sun-ai-analysis.js';
import './sun-session-ai-render-hooks.js';
import './sun-context.js';
import { ensureActiveDeviceTicker } from './light-devices.js';
import './light-device-ai-analysis.js';
import './light-sessions-view-hooks.js';
import './light-sun-ai-hooks.js';
import { configureLightTools, getMeasurementsForRoom } from './light-tools.js';
import './light-tools-ai-analysis.js';
import { configureLightEnv, openLightEnvironmentAssessment } from './light-env.js';
import './sun-context-hooks.js';
import './light-conditions-now-hooks.js';
import './light-env-ai-analysis.js';
import './light-screen-ai-analysis.js';
import './light-audit-ai-analysis.js';
import './light-burden-ai-analysis.js';
import './light-channels-ai-analysis.js';
import './sun-defaults.js';
import './sun-onboarding-ai.js';
import './light-ai-save-hooks.js';
import './sun-correlations.js';
import { renderLightTodayHero } from './light-today-ai.js';
import './light-channel-view-hooks.js';
import './light-page-view-hooks.js';
import {
  configureLightChannelView,
  _openChannelOnLightPage,
  _toggleChannelDetail,
} from './light-channel-view.js';
import {
  configureLightPageView,
  _expandLightToolsSection,
  renderDashboardLightChannelPills,
  renderLightChannelsLive,
  renderLightLiveSession,
  renderLightSessionLogActions,
  renderLightTodayStrip,
  showLight,
} from './light-page-view.js';
import {
  _inspectConditionsNow,
  _refreshConditionsNow,
  renderConditionsNow,
  renderLightConditionsWidgetBody,
} from './light-conditions-now.js';
import { _openAllSessionsModal } from './light-sessions-view.js';
import { configureSunSessionUI } from './sun-session-ui.js';
import { resumeActiveTickerIfNeeded } from './sun-active-session.js';
import { configureLightDevicesRuntimeDeps } from './light-devices-runtime.js';
import { configureSunDefaultsRuntimeDeps } from './sun-defaults-runtime.js';
import { configureSunRuntimeDeps } from './sun-runtime.js';

export {
  _expandLightToolsSection,
  _inspectConditionsNow,
  _openAllSessionsModal,
  _openChannelOnLightPage,
  _refreshConditionsNow,
  _toggleChannelDetail,
  configureLightEnv,
  ensureActiveDeviceTicker,
  openLightEnvironmentAssessment,
  renderConditionsNow,
  renderDashboardLightChannelPills,
  renderLightChannelsLive,
  renderLightConditionsWidgetBody,
  renderLightLiveSession,
  renderLightSessionLogActions,
  renderLightTodayHero,
  renderLightTodayStrip,
  resumeActiveTickerIfNeeded,
  rollingChannelTotals,
  showLight,
};

/**
 * @param {{
 *   buildSidebar?: (...args: any[]) => any,
 *   navigate?: (...args: any[]) => any,
 *   openClientList?: (...args: any[]) => any,
 *   openProfileLocationEditor?: (...args: any[]) => any,
 * }} [deps]
 */
export function configureLightSunShell({
  buildSidebar,
  navigate,
  openClientList,
  openProfileLocationEditor,
} = {}) {
  configureLightChannelView({ navigate });
  configureLightPageView({ navigate });
  configureLightTools({ navigate });
  configureLightEnv({ getMeasurementsForRoom, navigate });
  configureSunSessionUI({ navigate });
  configureSunDefaultsRuntimeDeps({ navigate, openClientList, openProfileLocationEditor });
  configureSunRuntimeDeps({
    buildSidebar,
    navigate,
    openChannelOnLightPage: _openChannelOnLightPage,
    renderLightChannelsLive,
    renderLightTodayStrip,
  });
  configureLightDevicesRuntimeDeps({
    navigate,
    openChannelOnLightPage: _openChannelOnLightPage,
  });
}
