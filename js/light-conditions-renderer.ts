// Stable synchronous facade; authored Svelte owns all conditions markup.
import { projectConditions } from './light-conditions-presentation.js';
import { renderHTML } from './components/LightConditionsPresentation.svelte.html.js';
import type { ConditionsAtmosphere } from './light-conditions-presentation.js';
import type { SolarCoordinates } from './light-conditions-interpretation.js';
export type { ConditionsAirQuality, ConditionsAtmosphere } from './light-conditions-presentation.js';
export function renderConditionsHTML(atm: ConditionsAtmosphere, coords: SolarCoordinates | null | undefined, variant: string, offline = false) {
  return renderHTML({ kind: 'conditions', view: projectConditions(atm, coords, variant, offline) });
}
