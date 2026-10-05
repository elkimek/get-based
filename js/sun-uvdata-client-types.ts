import type * as client from './sun-uvdata.js';
import type * as atmosphere from './sun-uvdata-atmosphere.js';

/** Synchronous settings remain available while the encrypted write is queued. */
export interface MeteoConfig {
  mode: string; selfhostUrl: string; selfhostBearer: string; privacyRounding: number;
}
/** Public provider client boundary; the normalization algorithms have native types. */
export interface UVDataClient {
  UV_SOURCE_CONFIDENCE: typeof atmosphere.UV_SOURCE_CONFIDENCE;
  solarZenithAngle: typeof atmosphere.solarZenithAngle;
  computeUVConfidence: typeof atmosphere.computeUVConfidence;
  nearestHourIndex: typeof atmosphere.nearestHourIndex;
  interpolateAtmosphere: typeof atmosphere.interpolateAtmosphere;
  initMeteoConfigCache: typeof client.initMeteoConfigCache;
  getMeteoConfig: typeof client.getMeteoConfig;
  saveMeteoConfig: typeof client.saveMeteoConfig;
  fetchAtmosphere: typeof client.fetchAtmosphere;
  purgeMeteoCache: typeof client.purgeMeteoCache;
}
