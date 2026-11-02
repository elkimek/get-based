// Semantic presentation plans preserve every unmentioned preference, including undisclosed IDs.
import { safeMarkerId } from './utils.js';
import { canonicalMetric } from './wearable-adapters.js';
import type { DashboardPresentationPatch, DashboardSelectionPatch } from '../shared/dashboard-control-contract.js';
import type { DashboardPreferenceFootprint } from './dashboard-preference-store.js';
export interface DashboardChoice { id: string; label: string; category?: string }
export interface DashboardPresentationInventory {
  fixed: DashboardChoice[]; knownFixedIds: string[]; markers: DashboardChoice[]; biometrics: DashboardChoice[];
  allowBody: boolean; allowCycle: boolean;
  defaults: { widgets: { order: string[]; hidden: string[] }; biometrics: string[] };
}
function list(value: unknown): value is string[] { return Array.isArray(value) && value.length <= 1024 && value.every(id => typeof id === 'string' && id.length <= 200) && new Set(value).size === value.length; }
function parsed(raw: string | null): unknown { try { return raw !== null && raw.length <= 64000 ? JSON.parse(raw) : undefined; } catch { return undefined; } }
const unique = (ids: string[]) => [...new Set(ids)];
const invalid = (message = 'dashboard must use exact currently permitted IDs and a recognized saved preference. Read dashboard.presentation again or use native Customize.'): never => { throw new Error(message); };
function widgetState(raw: string | null, inventory: DashboardPresentationInventory) {
  const known = (id: string) => inventory.knownFixedIds.includes(id) || id.startsWith('marker_') && !!safeMarkerId(id.slice(7));
  const value = parsed(raw);
  const recognized = raw === null || !!value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 2 && 'order' in value && 'hidden' in value && list(value.order) && list(value.hidden) && value.order.every(known) && value.hidden.every(known);
  const stored = recognized && value && typeof value === 'object' ? value as { order: string[]; hidden: string[] } : null;
  // Native defaults add newly introduced fixed widgets. Retain inactive/private stored identities too.
  const order = stored ? unique([...stored.order, ...inventory.defaults.widgets.order]) : [...inventory.defaults.widgets.order];
  const hidden = stored ? unique([...stored.hidden, ...inventory.defaults.widgets.hidden.filter(id => !stored.order.includes(id))]) : [...inventory.defaults.widgets.hidden];
  return { recognized, order, hidden };
}
function bodyState(raw: string | null, inventory: DashboardPresentationInventory) {
  const value = raw === null ? inventory.defaults.biometrics : parsed(raw);
  const recognized = list(value) && value.every(id => !!safeMarkerId(id) && !!canonicalMetric(id)) && !(value.includes('bp_systolic') && value.indexOf('bp_diastolic') > value.indexOf('bp_systolic'));
  return { recognized, selected: recognized ? [...value] : [] };
}
export function captureDashboardPresentationModel(raw: DashboardPreferenceFootprint, inventory: DashboardPresentationInventory) {
  const widgets = widgetState(raw.widgets, inventory), body = bodyState(raw.biometrics, inventory), value = raw.pins === null ? [] : parsed(raw.pins);
  const markers = new Set(inventory.markers.map(row => row.id));
  const pinsRecognized = list(value) && value.length <= 4 && value.every(id => !!safeMarkerId(id));
  const pins = pinsRecognized ? [...value] : [];
  const permittedWidget = (id: string) => inventory.fixed.some(row => row.id === id) || id.startsWith('marker_') && markers.has(id.slice(7));
  const availability = {
    widgets: widgets.recognized,
    biometrics: body.recognized && inventory.allowBody,
    pins: pinsRecognized && pins.every(id => markers.has(id)) && inventory.markers.length > 0,
    resetLayout: widgets.recognized && body.recognized && inventory.allowBody && inventory.allowCycle && [...widgets.order, ...widgets.hidden].every(permittedWidget),
  };
  return { raw, inventory, widgets, body, pins, availability, permittedWidget };
}
export type DashboardPresentationModel = ReturnType<typeof captureDashboardPresentationModel>;
export function projectDashboardPresentation(model: DashboardPresentationModel, options: { query?: string; offset?: number; limit?: number } = {}) {
  const { inventory, availability, widgets, body, pins } = model, offset = options.offset ?? 0, limit = options.limit ?? 25;
  const page = (items: DashboardChoice[]) => { const filtered = items.filter(item => !options.query || JSON.stringify(item).toLowerCase().includes(options.query.toLowerCase())); return { choices: filtered.slice(offset, offset + limit).map(item => ({ ...item })), total: filtered.length, nextOffset: offset + limit < filtered.length ? offset + limit : null }; };
  return {
    available: availability,
    fixedWidgets: inventory.fixed.map(row => ({ ...row, ...(widgets.recognized ? { hidden: widgets.hidden.includes(row.id) } : {}) })),
    ...(widgets.recognized ? { widgetOrder: widgets.order.filter(model.permittedWidget), markerWidgets: widgets.order.filter(id => id.startsWith('marker_') && model.permittedWidget(id)).map(id => id.slice(7)) } : {}),
    markerOptions: page(inventory.markers),
    biometrics: availability.biometrics ? { selected: [...body.selected], ...page(inventory.biometrics) } : { available: false },
    pins: availability.pins ? { selected: [...pins], maximum: 4 } : { available: false },
  };
}
function selection(current: string[], patch: DashboardSelectionPatch, canAdd: (id: string) => boolean, canSelect: (id: string) => boolean) {
  if (patch.add?.some(id => !canAdd(id)) || patch.remove?.some(id => !current.includes(id) || !canSelect(id))) invalid();
  const next = unique([...current.filter(id => !patch.remove?.includes(id)), ...(patch.add || [])]);
  if (patch.order?.some(id => !next.includes(id) || !canSelect(id))) invalid();
  return patch.order ? [...patch.order, ...next.filter(id => !patch.order!.includes(id))] : next;
}
/** A partial raw write plan, never an arbitrary storage patch from the model. */
export function planDashboardPresentation(model: DashboardPresentationModel, patch: DashboardPresentationPatch): Partial<DashboardPreferenceFootprint> {
  const { inventory, availability, widgets, body, pins } = model, writes: Partial<DashboardPreferenceFootprint> = {};
  if (patch.resetLayout) { if (!availability.resetLayout) invalid(); return { widgets: null, biometrics: null }; }
  if (patch.show || patch.hide || patch.order || patch.markerWidgets) {
    if (!availability.widgets) invalid();
    const fixed = (id: string) => inventory.fixed.some(row => row.id === id), marker = (id: string) => inventory.markers.some(row => row.id === id);
    if (patch.show?.some(id => !fixed(id)) || patch.hide?.some(id => !fixed(id)) || patch.markerWidgets?.add?.some(id => !marker(id)) || patch.markerWidgets?.remove?.some(id => !marker(id) || !widgets.order.includes(`marker_${id}`))) invalid();
    let order = unique([...widgets.order.filter(id => !patch.markerWidgets?.remove?.some(markerId => id === `marker_${markerId}`)), ...(patch.markerWidgets?.add || []).map(id => `marker_${id}`)]);
    if (patch.order?.some(id => !order.includes(id) || !model.permittedWidget(id))) invalid();
    if (patch.order) order = [...patch.order, ...order.filter(id => !patch.order!.includes(id))];
    const hidden = unique([...widgets.hidden.filter(id => !patch.show?.includes(id) && !patch.markerWidgets?.add?.some(markerId => id === `marker_${markerId}`) && !patch.markerWidgets?.remove?.some(markerId => id === `marker_${markerId}`)), ...(patch.hide || [])]);
    writes.widgets = JSON.stringify({ order, hidden }) !== JSON.stringify({ order: widgets.order, hidden: widgets.hidden }) ? JSON.stringify({ order, hidden }) : model.raw.widgets;
  }
  if (patch.biometrics) {
    if (!availability.biometrics) invalid();
    const next = selection(body.selected, patch.biometrics, id => inventory.biometrics.some(row => row.id === id), id => !!canonicalMetric(id));
    if (next.includes('bp_systolic') && next.indexOf('bp_diastolic') > next.indexOf('bp_systolic')) invalid('dashboard must use the combined bp_systolic blood-pressure tile, or explicitly remove it before adding bp_diastolic. No tile was silently removed.');
    writes.biometrics = JSON.stringify(next) !== JSON.stringify(body.selected) ? JSON.stringify(next) : model.raw.biometrics;
  }
  if (patch.pins) {
    if (!availability.pins) invalid();
    const allowed = (id: string) => inventory.markers.some(row => row.id === id), next = selection(pins, patch.pins, allowed, allowed);
    if (next.length > 4) invalid('dashboard must explicitly remove a current pin before adding beyond the four-pin limit. No existing pin was evicted.');
    writes.pins = JSON.stringify(next) !== JSON.stringify(pins) ? JSON.stringify(next) : model.raw.pins;
  }
  return writes;
}
