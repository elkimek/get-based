// light-channel-view-ui-hooks.js - wire Light channel shell dependencies after UI modules load.

import { navigate } from './views-runtime.js';
import { configureLightChannelView } from './light-channel-view.js';

configureLightChannelView({ navigate });
