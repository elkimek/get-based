// @ts-check
// light-channel-view-ui-hooks.js - wire Light channel shell dependencies after UI modules load.

import { navigate } from './views.js';
import { configureLightChannelView } from './light-channel-view.js';

configureLightChannelView({ navigate });
