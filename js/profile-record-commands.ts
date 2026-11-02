// Profile metadata has its own store; height is always persisted in centimetres.
import { agentDataObject, validAgentDate, validateFieldNames } from '../shared/agent-data-contract.js';
import type { ProfileMetaUpdates } from './profile.js';

export const profileEditableFields = {
  name: 'Nonempty name, up to 160 characters', sex: ['male', 'female', null], dob: 'YYYY-MM-DD or null to clear',
  height: '{value: positive number, unit: cm|in}, or null to clear. Conversion to centimetres is automatic.',
  heightUnit: 'cm|in height-display preference, only for an explicit height-display request; changing it alone preserves physical height. Never use this as a substitute for an app-wide unit-profile change.',
  location: '{country?: string, zip?: string}; unspecified location fields are preserved; empty string clears',
  tags: 'Replacement list of unique text tags (max 30)', notes: 'Profile-list notes, distinct from the profile context note; empty string clears',
  status: ['active', 'flagged', 'archived'], pinned: 'boolean',
};
const rawFields = ['id', 'name', 'sex', 'dob', 'height', 'heightUnit', 'location', 'tags', 'notes', 'status', 'pinned'];
export function profileRecordSnapshot(value: unknown) {
  const row = agentDataObject(value);
  return Object.fromEntries(Object.entries(row).filter(([key]) => rawFields.includes(key)));
}
export function displayProfileRecord(value: unknown) {
  const row = profileRecordSnapshot(value), unit = row.heightUnit === 'in' ? 'in' : 'cm';
  const cm = row.height == null || row.height === '' ? null : Number(row.height);
  if (row.location && typeof row.location === 'object') {
    const location = agentDataObject(row.location); row.location = { country: location.country || '', zip: location.zip || '' };
  }
  return { ...row, height: cm == null ? null : { value: unit === 'in' ? Math.round(cm / 2.54 * 100) / 100 : cm, unit },
    storedHeightCm: cm, heightUnit: unit };
}
function text(value: unknown, max: number, label: string) {
  if (typeof value !== 'string' || value.length > max) throw new Error(`Supply ${label} as text (max ${max} characters).`);
  return value.trim();
}
export function projectProfileRecord(before: unknown, patch: Record<string, unknown>, date: string) {
  const row = agentDataObject(before);
  if (typeof row.id !== 'string' || !row.id) throw new Error('Read the current profile details first.');
  validateFieldNames(patch, Object.keys(profileEditableFields));
  if (!Object.keys(patch).length) throw new Error('Supply at least one profile detail to change.');
  const updates: ProfileMetaUpdates = {};
  if (Object.hasOwn(patch, 'name')) { updates.name = text(patch.name, 160, 'a name'); if (!updates.name) throw new Error('The profile needs a name.'); }
  if (Object.hasOwn(patch, 'sex')) {
    if (patch.sex !== null && patch.sex !== 'male' && patch.sex !== 'female') throw new Error('Use a supported sex or null to clear it.');
    updates.sex = patch.sex;
  }
  if (Object.hasOwn(patch, 'dob')) {
    if (patch.dob !== null && (!validAgentDate(patch.dob) || patch.dob > date)) throw new Error('Supply a real date of birth that is not in the future, or null.');
    updates.dob = patch.dob as string | null;
  }
  if (Object.hasOwn(patch, 'heightUnit')) {
    if (patch.heightUnit !== 'cm' && patch.heightUnit !== 'in') throw new Error('Choose cm or in for height.');
    updates.heightUnit = patch.heightUnit;
  }
  if (Object.hasOwn(patch, 'height')) {
    if (patch.height === null) updates.height = null;
    else {
      const height = agentDataObject(patch.height); validateFieldNames(height, ['value', 'unit']);
      if (typeof height.value !== 'number' || !Number.isFinite(height.value) || height.unit !== 'cm' && height.unit !== 'in') throw new Error('Supply height as a number and cm or in.');
      const cm = height.unit === 'in' ? height.value * 2.54 : height.value;
      if (cm <= 0 || cm > 300) throw new Error('Height must be greater than zero and at most 300 cm.');
      updates.height = Math.round(cm * 10) / 10;
      if (updates.height <= 0) throw new Error('The height is too small.');
      updates.heightUnit ??= height.unit;
    }
  }
  if (Object.hasOwn(patch, 'location')) {
    const location = agentDataObject(patch.location); validateFieldNames(location, ['country', 'zip']);
    const previous = row.location == null ? {} : agentDataObject(row.location);
    updates.location = { ...previous, country: String(previous.country || ''), zip: String(previous.zip || ''),
      ...(Object.hasOwn(location, 'country') ? { country: text(location.country, 160, 'a country') } : {}),
      ...(Object.hasOwn(location, 'zip') ? { zip: text(location.zip, 32, 'a postal code') } : {}) };
  }
  if (Object.hasOwn(patch, 'tags')) {
    if (!Array.isArray(patch.tags) || patch.tags.length > 30) throw new Error('Supply at most 30 tags.');
    updates.tags = [...new Set(patch.tags.map(value => text(value, 80, 'a tag')))];
    if (updates.tags.some(tag => !tag)) throw new Error('Tags cannot be empty.');
  }
  if (Object.hasOwn(patch, 'notes')) updates.notes = text(patch.notes, 4000, 'profile-list notes');
  if (Object.hasOwn(patch, 'status')) {
    if (!['active', 'flagged', 'archived'].includes(String(patch.status))) throw new Error('Choose a supported profile status.');
    updates.status = patch.status as string;
  }
  if (Object.hasOwn(patch, 'pinned')) { if (typeof patch.pinned !== 'boolean') throw new Error('Pinned must be boolean.'); updates.pinned = patch.pinned; }
  return { after: { ...row, ...updates }, updates };
}
