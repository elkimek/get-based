// @ts-check
// sun-context-hooks.js - wire Sun AI context dependencies at startup.

import {
  BODY_REGIONS,
  CHANNEL_DISPLAY,
  cumulativeMEDToday,
  rollingChannelTotals,
  tierLabel,
  weeklyChannelTier,
} from './sun.js';
import {
  VITD_DAILY_SATURATION_IU,
  circadianMelanopicLux,
  pbmJoulesPerCm2,
  vitaminDIUPerSession,
} from './sun-spectrum.js';
import { getMeteoConfig } from './sun-uvdata.js';
import { rollingDeviceTotals } from './light-devices-store.js';
import {
  computeDeficitAxesForEnvironment,
  computeIndoorBurdenForEnvironment,
} from './light-env-model.js';
import { getEnvironment, isActiveToday } from './light-env-store.js';
import { state } from './state.js';
import { configureDataContextDependencies } from './data.js';
import { configureLabContext, invalidateLabContextCache } from './lab-context.js';
import { isDebugMode } from './utils.js';
import { buildSunContext, configureSunContext } from './sun-context.js';

function computeDeficitAxes() {
  return computeDeficitAxesForEnvironment(getEnvironment(), {
    isActiveToday,
    getMeasurementsForRoom: roomId => (state.importedData?.lightMeasurements || []).filter(m => m?.roomId === roomId),
  });
}

function computeIndoorBurden() {
  return computeIndoorBurdenForEnvironment(getEnvironment(), {
    isActiveToday,
    getMeasurementsForRoom: roomId => (state.importedData?.lightMeasurements || []).filter(m => m?.roomId === roomId),
  });
}

configureLabContext({ buildSunContext });
configureDataContextDependencies({ invalidateLabContextCache });

configureSunContext({
  bodyRegions: BODY_REGIONS,
  channelDisplay: CHANNEL_DISPLAY,
  circadianMelanopicLux,
  computeDeficitAxes,
  computeIndoorBurden,
  cumulativeMEDToday,
  getMeteoConfig,
  isDebugMode,
  invalidateLabContextCache,
  pbmJoulesPerCm2,
  rollingChannelTotals,
  rollingDeviceTotals,
  tierLabel,
  vitaminDDailySaturationIU: VITD_DAILY_SATURATION_IU,
  vitaminDIUPerSession,
  weeklyChannelTier,
});
