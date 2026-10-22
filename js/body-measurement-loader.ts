import {state} from './state.js';
import {routeRevision} from './route-lifecycle.js';
import {showNotification} from './utils.js';
import type {BodyMeasurementKind} from './body-measurement-model.js';

let request = 0;
/** Retire cold actions when their profile, route, surface or modal changes. */
export async function openBodyMeasurement(kind: BodyMeasurementKind): Promise<void> {
  const ticket = ++request, profile = state.currentProfile, data = state.importedData, revision = routeRevision();
  const surface = document.getElementById('main-content')?.firstElementChild;
  const modal = document.getElementById('detail-modal')?.firstElementChild;
  const current = () => ticket === request && state.currentProfile === profile && state.importedData === data
    && routeRevision() === revision && document.getElementById('main-content')?.firstElementChild === surface
    && document.getElementById('detail-modal')?.firstElementChild === modal;
  try {
    const editor = await import('./body-measurement-modal.js');
    if (current()) await editor.openBodyMeasurementEditor(kind);
  } catch {
    if (current()) showNotification('Could not open body measurements. Try again.', 'error');
  }
}
