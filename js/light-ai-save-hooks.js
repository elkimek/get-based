// @ts-check
// light-ai-save-hooks.js - wire saved Light/onboarding records to AI analyzers.

import { configureLightEnvAudits } from './light-env-audits.js';
import { configureLightTools } from './light-tools.js';
import { configureSunDefaults } from './sun-defaults.js';
import { hasAIProvider } from './api.js';
import { addRoom, getRooms, refreshLightEnvironmentAssessment, suggestRoomSourceFromSpectrum } from './light-env.js';
import { maybeAnalyzeAuditAfterSave, renderAuditAIBlock, renderAuditAIDot } from './light-audit-ai-analysis.js';
import { maybeAnalyzeMeasurementAfterSave } from './light-tools-ai-analysis.js';
import { getSunCoords } from './sun.js';
import { getSessions, hydrateSession, logCompletedSession } from './sun-sessions-store.js';
import { maybeAnalyzeOnboardingAfterSave, renderOnboardingAIBlock } from './sun-onboarding-ai.js';
import { solarZenithAngle } from './sun-uvdata.js';

configureLightEnvAudits({ hasAIProvider, maybeAnalyzeAuditAfterSave, renderAuditAIBlock, renderAuditAIDot });
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
