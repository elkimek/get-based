// Minimal native timer wiring for chat controls used before the Light facade loads.
import { configureSunActiveSession, stageSunLiveSlice, setSunLiveState, clearSunLiveState } from './sun-active-session.js';
import { configureSunSessionsStore, getSessions, getActiveSession, persistActiveSunSlice } from './sun-sessions-store.js';
import { hasPendingSunSessionWrites } from './sun-session-record-store.js';
import { getSunCoords } from './sun-location.js';
import { fetchAtmosphere, interpolateAtmosphere, solarZenithAngle } from './sun-uvdata.js';
import { reconstructSpectrum, computeChannelDoses, erythemalSED, ocularActinicUVdose, fractionOfMED } from './sun-spectrum.js';
import { _applyAtmOverrides } from './sun-sessions-store.js';
export function initializeSunLiveRuntime() {
  configureSunSessionsStore({ commitCurrentSlice: row => stageSunLiveSlice(row)?.publish, setLiveState: setSunLiveState, clearLiveState: clearSunLiveState });
  configureSunActiveSession({ getSessions, getActiveSession, getSunCoords, fetchAtmosphere, interpolateAtmosphere, solarZenithAngle,
    reconstructSpectrum, computeChannelDoses, erythemalSED, ocularActinicUVdose, fractionOfMED, applyAtmOverrides: _applyAtmOverrides,
    canPersistActiveSlice: () => !hasPendingSunSessionWrites(), persistActiveSlice: persistActiveSunSlice });
}
