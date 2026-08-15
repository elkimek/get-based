// @ts-check
// sun-session-ai-render-hooks.js - wire Sun Session UI AI render callbacks.

import { renderSessionAIDetail } from './sun-ai-analysis.js';
import { configureSunSessionUI } from './sun-session-ui.js';

configureSunSessionUI({ renderSessionAIDetail });
