// @ts-check
// light-ai-save-hooks.js - wire saved Light/onboarding records to AI analyzers.

import { configureLightEnvAudits } from './light-env-audits.js';
import { configureLightTools } from './light-tools.js';
import { configureSunDefaults } from './sun-defaults.js';
import { hasAIProvider } from './api.js';
import { maybeAnalyzeAuditAfterSave, renderAuditAIBlock, renderAuditAIDot } from './light-audit-ai-analysis.js';
import { maybeAnalyzeMeasurementAfterSave } from './light-tools-ai-analysis.js';
import { maybeAnalyzeOnboardingAfterSave, renderOnboardingAIBlock } from './sun-onboarding-ai.js';

configureLightEnvAudits({ hasAIProvider, maybeAnalyzeAuditAfterSave, renderAuditAIBlock, renderAuditAIDot });
configureLightTools({ maybeAnalyzeMeasurementAfterSave });
configureSunDefaults({ maybeAnalyzeOnboardingAfterSave, renderOnboardingAIBlock });
