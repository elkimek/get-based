// @ts-check
// light-sun-ai-hooks.js - wire session-store completion hooks to AI analyzers.

import { configureLightDevicesStore } from './light-devices-store.js';
import { configureSunSessionsStore } from './sun-sessions-store.js';
import { maybeAnalyzeDeviceSessionAfterFinish } from './light-device-ai-analysis.js';
import { maybeAnalyzeSessionAfterFinish } from './sun-ai-analysis.js';

configureLightDevicesStore({ maybeAnalyzeDeviceSessionAfterFinish });
configureSunSessionsStore({ maybeAnalyzeSessionAfterFinish });
