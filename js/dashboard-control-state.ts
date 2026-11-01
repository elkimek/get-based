import { state } from './state.js';
import { getActiveData } from './data.js';
import { isContextSourceEnabled } from './context-source-registry.js';
import { createLabContextDisclosure } from './lab-context-disclosure.js';
import { canonicalMetric } from './wearable-adapters.js';
import { captureDashboardPresentationModel } from './dashboard-presentation-model.js';
import { readDashboardPreferenceFootprint } from './dashboard-preference-store.js';
import type { DashboardControlPorts } from './dashboard-control-runtime.js';
const label = (value: unknown) => String(value || '').slice(0, 160);
/** Read private native eligibility, then retain only permitted identifiers and plain labels. */
export function captureDashboardControlState(ports: DashboardControlPorts, profile: string) {
  const allowBody = isContextSourceEnabled('wearables'), allowCycle = isContextSourceEnabled('insight-cards');
  const fixed = ports.fixedWidgets(), applicable = ports.applicableWidgetIds();
  const markers = isContextSourceEnabled('lab-markers') ? ports.markerOptions(createLabContextDisclosure().project(getActiveData())).map(row => ({ id: row.id, label: label(row.name), category: label(row.category) })) : [];
  const biometrics = allowBody ? ports.biometricOrder().flatMap(id => {
    if (typeof id !== 'string') return [];
    const metric = canonicalMetric(id), tile = ports.biometricTile(id, { allowEmptyManual: true });
    return metric && tile ? [{ id: String(id), label: id === 'bp_systolic' ? 'Blood pressure' : metric.label }] : [];
  }) : [];
  const inventory = {
    fixed: fixed.filter(row => applicable.includes(row.id) && (row.id !== 'cycle' || allowCycle)).map(row => ({ id: row.id, label: label(row.title) })),
    knownFixedIds: fixed.map(row => row.id), markers, biometrics, allowBody, allowCycle,
    defaults: { widgets: ports.widgets() as { order: string[]; hidden: string[] }, biometrics: ports.biometrics() },
  };
  const model = captureDashboardPresentationModel(readDashboardPreferenceFootprint(profile), inventory);
  const eligibility = JSON.stringify({ fixed: inventory.fixed, markers, biometrics, allowBody, allowCycle, sex: state.profileSex });
  return { model, eligibility };
}
