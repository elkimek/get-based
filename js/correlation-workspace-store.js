// @ts-check
import { state } from './state.js';
import { encryptedGetItem, encryptedSetItem } from './crypto.js';
import { profileStorageKey } from './profile-storage-key.js';
import { showNotification } from './utils.js';

const writes = new Map();
let restoreVersion = 0;
const strings = value => Array.isArray(value) ? [...new Set(value.filter(v => typeof v === 'string' && v.length > 0 && v.length <= 256))] : [];

/** Keep a small versioned preference record, never chart objects or lab values. */
export function normalizeCorrelationWorkspace(input) {
  const markers = strings(input?.markers).slice(0, 8);
  const therapies = strings(input?.therapies).slice(0, 8 - markers.length);
  const raw = input?.view || {};
  const view = {};
  for (const [key, allowed] of Object.entries({ rangePreset: ['3m', '6m', '1y', 'all', 'custom'], grouping: ['combined', 'separate'], layout: ['overlay', 'lanes'], tab: ['timeline', 'scatter', 'data'] })) {
    if (allowed.includes(raw[key])) view[key] = raw[key];
  }
  for (const key of ['start', 'end', 'inspectDate']) if (typeof raw[key] === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw[key])) view[key] = raw[key];
  if (typeof raw.pairKey === 'string' && raw.pairKey.length <= 1024) view.pairKey = raw.pairKey;
  if (typeof raw.analysisOpen === 'boolean') view.analysisOpen = raw.analysisOpen;
  view.hidden = strings(raw.hidden).filter(id => markers.includes(id) || therapies.includes(id));
  view.ingredients = Object.fromEntries(therapies.flatMap(id => typeof raw.ingredients?.[id] === 'string' && raw.ingredients[id].length <= 256 ? [[id, raw.ingredients[id]]] : []));
  return { version: 1, markers, therapies, view };
}

export function saveCorrelationWorkspace() {
  const profile = state.currentProfile;
  if (!profile) return Promise.resolve();
  const value = JSON.stringify(normalizeCorrelationWorkspace({ markers: state.selectedCorrelationMarkers, therapies: state.selectedCorrelationSupplements, view: state.correlationView }));
  // Serialize encryption/writes so a slower earlier edit cannot overwrite a later one.
  const pending = (writes.get(profile) || Promise.resolve()).then(() => encryptedSetItem(profileStorageKey(profile, 'correlation-workspace'), value)).catch(() => {
    if (state.currentProfile === profile) showNotification('Could not save the correlation workspace. Your current view is still available.', 'error');
  });
  writes.set(profile, pending);
  void pending.finally(() => { if (writes.get(profile) === pending) writes.delete(profile); });
  return pending;
}

export async function restoreCorrelationWorkspace(profile) {
  const version = ++restoreVersion;
  try {
    await writes.get(profile);
    const raw = await encryptedGetItem(profileStorageKey(profile, 'correlation-workspace'));
    if (state.currentProfile !== profile || version !== restoreVersion) return;
    const saved = raw ? JSON.parse(raw) : null;
    const workspace = normalizeCorrelationWorkspace(saved?.version === 1 ? saved : null);
    state.selectedCorrelationMarkers = workspace.markers;
    state.selectedCorrelationSupplements = workspace.therapies;
    state.correlationView = workspace.view;
  } catch {
    if (state.currentProfile === profile && version === restoreVersion) showNotification('Could not restore the saved correlation workspace. Select your items again.', 'error');
  }
}
