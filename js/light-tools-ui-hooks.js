// @ts-check
// light-tools-ui-hooks.js - wire Light Tools UI callbacks after views startup.

import { configureLightTools } from './light-tools.js';
import { navigate } from './views.js';

configureLightTools({ navigate });
