// @ts-check
// light-conditions-now-hooks.js - wire Conditions Now runtime dependencies at startup.

import {
  computeUVConfidence,
  fetchAtmosphere,
  purgeMeteoCache,
  solarZenithAngle,
} from './sun-uvdata.js';
import { _applyAtmOverrides, getSunCoords } from './sun.js';
import { isDebugMode, showNotification } from './utils.js';
import { configureLightConditionsNow } from './light-conditions-now.js';

configureLightConditionsNow({
  applyAtmOverrides: _applyAtmOverrides,
  computeUVConfidence,
  fetchAtmosphere,
  getSunCoords,
  isDebugMode,
  purgeMeteoCache,
  showNotification,
  solarZenithAngle,
});
