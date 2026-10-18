// sun-session-ai-render-hooks.js - wire Sun Session UI AI render callbacks.

import { getSunSessionAIView } from './sun-ai-analysis.js';
import { configureSunSessionUI } from './sun-session-ui.js';

configureSunSessionUI({getSessionAIDetailView:(session:Parameters<typeof getSunSessionAIView>[0])=>getSunSessionAIView(session,'detail')});
