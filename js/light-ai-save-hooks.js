// @ts-check
// light-ai-save-hooks.js - wire saved Light/onboarding records to AI analyzers.

import { configureLightEnvAudits } from './light-env-audits.js';
import {
  configureLightTools,
  getMeasurementsForRoom,
  openCCTMeter,
  openDarknessMeter,
  openFlickerDetector,
  openLuxMeter,
  openSpectrumClassifier,
} from './light-tools.js';
import { configureSunDefaults } from './sun-defaults.js';
import { hasAssistantFeatureProvider } from './ai-feature-routing.js';
import { addRoom, configureLightEnv, getRooms, refreshLightEnvironmentAssessment, suggestRoomSourceFromSpectrum } from './light-env.js';
import { maybeAnalyzeAuditAfterSave, renderAuditAIBlock, renderAuditAIDot } from './light-audit-ai-analysis.js';
import { openChatPanel } from './chat-loader.js';
import { maybeAnalyzeMeasurementAfterSave, renderMeasurementAIInline } from './light-tools-ai-analysis.js';
import { renderRoomAIBlock } from './light-env-ai-analysis.js';
import { renderScreenAIBlock } from './light-screen-ai-analysis.js';
import { getSunCoords } from './sun.js';
import { getSessions, hydrateSession, logCompletedSession } from './sun-sessions-store.js';
import { maybeAnalyzeOnboardingAfterSave, renderOnboardingAIBlock } from './sun-onboarding-ai.js';
import { solarZenithAngle } from './sun-uvdata.js';

configureLightEnv({
  getMeasurementsForRoom,
  renderMeasurementAIInline,
  renderRoomAIBlock,
  renderScreenAIBlock,
  openSpectrumClassifier,
  openLuxMeter,
  openFlickerDetector,
  openCCTMeter,
  openDarknessMeter,
});
configureLightEnvAudits({ hasAIProvider: hasAssistantFeatureProvider, maybeAnalyzeAuditAfterSave, renderAuditAIBlock, renderAuditAIDot, openChatPanel });
configureLightTools({
  maybeAnalyzeMeasurementAfterSave,
  suggestRoomSourceFromSpectrum,
  refreshLightEnvironmentAssessment,
  getSunCoords,
  solarZenithAngle,
  logCompletedSession,
  getSessions,
  hydrateSession,
  getRooms,
  addRoom,
});
configureSunDefaults({ maybeAnalyzeOnboardingAfterSave, renderOnboardingAIBlock });
