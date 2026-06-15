// @ts-check
// sun-session-ui-hooks.js - wire Sun Session UI callbacks after views startup.

import { configureSunSessionUI } from './sun-session-ui.js';
import { navigate } from './views.js';

configureSunSessionUI({ navigate });
