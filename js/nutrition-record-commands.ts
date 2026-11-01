// Typed meal edits. Source evidence and opaque record extensions are never model patches.
import { agentDataObject, validateFieldNames, validAgentDate } from '../shared/agent-data-contract.js';
import type { AgentDataProposal } from '../shared/agent-data-contract.js';
import { NUTRIENT_DEFINITIONS, NUTRITION_KEYS } from './nutrition-nutrient-registry.js';
import { normalizeNutritionComponent, updateComponentQuantity, recalculateMealFromComponents } from './nutrition-food-data.js';

export const mealEditableFields = {
  name: 'Nonempty meal name (max 120 characters). Changing an AI-estimated meal identity invalidates its previous estimate, as shown in review.', mealType: ['breakfast', 'brunch', 'lunch', 'dinner', 'snack', 'drink', 'other'],
  localDateTime: 'YYYY-MM-DDTHH:mm in the browser timezone; mutually exclusive with eatenAt',
  eatenAt: 'ISO timestamp including Z or an explicit offset. Omit only for a new meal eaten now.',
  timeZone: 'Optional IANA timezone for the meal display; changing it alone preserves the instant. Defaults to the turn timezone.',
  note: 'Text, empty string clears (max 4000 characters)', analysisContext: 'User-supplied meal details (max 2000 characters). Changing an AI-estimated meal identity/details retains its old analysis as history and clears estimated ingredients/nutrients; explicit whole-meal values remain. New ingredients use add operations.',
  nutrients: Object.fromEntries(NUTRIENT_DEFINITIONS.map(field => [field.key, `${field.unit}; nonnegative number, null clears; unspecified values remain`])),
  drink: '{kind: water|tea-coffee|other, amountMl: number in (0,10000]}; sets beverage volume and plain-water accounting',
  responseCheckIn: '{satiety2h?: 1 hungry again|2 neutral|3 still satisfied|null, energy2h?: 1 slump|2 steady|3 energized|null}; null clears a level, or null for the whole field clears all. Unreported levels stay unknown.',
  componentChanges: 'List of {operation: add|update|remove, index?: original component index, record?: {name?, quantityG?, nutrients?, nutrientsPer100g?}}. Only add omits index. Unspecified components and metadata survive. Identity changes clear the old food nutrient basis; linked portion changes recalculate totals. Unsupported estimated totals become unknown; explicit user-entered totals survive.',
  keepImageIndices: 'Optional list of existing photo indices to retain, in order; [] removes all. New images require the chosen-file photo workflow. Never supply photo bytes or URLs.',
};
const text = (value: unknown, max: number, field: string) => {
  if (typeof value !== 'string' || value.length > max) throw new Error(`Supply ${field} as text (max ${max} characters).`);
  return value.trim();
};
const fields = (value: unknown, allowed: readonly string[]) => Object.fromEntries(Object.entries(agentDataObject(value)).filter(([key]) => allowed.includes(key)));
function nutrients(value: unknown, previous: unknown = {}): Record<string, unknown> {
  const patch = agentDataObject(value); validateFieldNames(patch, NUTRITION_KEYS);
  const result = { ...(previous && typeof previous === 'object' ? agentDataObject(previous) : {}) };
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete result[key];
    else {
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error(`Supply a finite nonnegative ${key} value, or null.`);
      result[key] = value;
    }
  }
  return result;
}
function publicNutrients(value: unknown) { return value && typeof value === 'object' ? fields(value, NUTRITION_KEYS) : {}; }
function mealImages(row: Record<string, unknown>): unknown[] { return Array.isArray(row.images) && row.images.length ? row.images : row.image ? [row.image] : []; }
export function displayMealRecord(value: unknown): Record<string, unknown> | null {
  if (value === null) return null;
  const row = agentDataObject(value);
  const result = fields(row, ['id', 'name', 'mealType', 'eatenAt', 'localDate', 'localTimeMinutes', 'timezoneOffsetMinutes', 'timeZone', 'note', 'analysisContext']);
  result.nutrients = publicNutrients(row.nutrients);
  result.components = (Array.isArray(row.components) ? row.components : []).map((raw, index) => {
    const component = fields(raw, ['name', 'quantityG']);
    return { ...component, index, nutrients: publicNutrients(agentDataObject(raw).nutrients), nutrientsPer100g: publicNutrients(agentDataObject(raw).nutrientsPer100g) };
  });
  result.images = mealImages(row).map((image, index) => ({ ...fields(image, ['fileName', 'mediaType', 'width', 'height']), index }));
  if (row.responseCheckIn) result.responseCheckIn = fields(row.responseCheckIn, ['satiety2h', 'energy2h']);
  const source = row.source && typeof row.source === 'object' ? agentDataObject(row.source) : {};
  const review = source.review && typeof source.review === 'object' ? agentDataObject(source.review) : {};
  result.source = { kind: typeof source.kind === 'string' ? source.kind : 'manual', nutrientBasis: source.nutrientBasis, review: {
    editedNutrients: Array.isArray(review.editedNutrients) ? review.editedNutrients.filter(key => NUTRITION_KEYS.includes(key)) : [],
    calculatedNutrients: Array.isArray(review.calculatedNutrients) ? review.calculatedNutrients.filter(key => NUTRITION_KEYS.includes(key)) : [],
    analysisInvalidated: review.analysisInvalidated === true,
  } };
  return result;
}
export interface MealRecordSnapshot { version: 1; revision: string; record: Record<string, unknown> | null; }
export function parseMealRecordSnapshot(value: unknown): MealRecordSnapshot {
  const snapshot = agentDataObject(value);
  if (snapshot.version !== 1 || typeof snapshot.revision !== 'string' || !/^[a-f0-9]{64}$/.test(snapshot.revision) || snapshot.record !== null && (!snapshot.record || typeof snapshot.record !== 'object' || Array.isArray(snapshot.record))) throw new Error('Read the meal record first to obtain a valid revision.');
  return snapshot as unknown as MealRecordSnapshot;
}
export async function createMealRecordSnapshot(value: unknown): Promise<MealRecordSnapshot> {
  const canonical = JSON.stringify(value, (_key, item: unknown) => item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, (item as Record<string, unknown>)[key]])) : item);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
  return { version: 1, revision: Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join(''), record: displayMealRecord(value) };
}
function mealTime(row: Record<string, unknown>, patch: Record<string, unknown>, recordedAt: number) {
  if (Object.hasOwn(patch, 'eatenAt') && Object.hasOwn(patch, 'localDateTime')) throw new Error('Choose one meal timestamp.');
  const local = patch.localDateTime;
  if (local !== undefined && (typeof local !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local) || !validAgentDate(local.slice(0, 10)))) throw new Error('Supply a real local meal date and time.');
  if (patch.eatenAt !== undefined && (typeof patch.eatenAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(patch.eatenAt) || !validAgentDate(patch.eatenAt.slice(0, 10)))) throw new Error('Supply an ISO meal timestamp with its timezone.');
  const date = new Date((local ?? patch.eatenAt ?? recordedAt) as string | number);
  if (!Number.isFinite(date.getTime()) || date.getUTCFullYear() < 1 || date.getUTCFullYear() > 9999) throw new Error('The meal timestamp is invalid.');
  const zone = patch.timeZone === undefined ? Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' : text(patch.timeZone, 100, 'a timezone');
  if (local && zone !== Intl.DateTimeFormat().resolvedOptions().timeZone) throw new Error('For another timezone supply eatenAt with an explicit offset.');
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const parts = Object.fromEntries(formatter.formatToParts(date).map(part => [part.type, part.value]));
  const day = `${String(parts.year).padStart(4, '0')}-${parts.month}-${parts.day}`, time = `${parts.hour}:${parts.minute}`;
  if (local && `${day}T${time}` !== local) throw new Error('That local time does not exist. Choose its actual time and timezone.');
  const offset = (Math.floor(date.getTime() / 60000) * 60000 - Date.parse(`${day}T${time}:00Z`)) / 60000;
  Object.assign(row, { eatenAt: date.toISOString(), localDate: day, localTimeMinutes: Number(parts.hour) * 60 + Number(parts.minute), timezoneOffsetMinutes: offset, timeZone: zone });
}
/** Resolve local/implicit times once, before the proposal is persisted. */
export function freezeMealPatchTiming(patch: Record<string, unknown>, before: unknown, recordedAt: number, turnZone: string) {
  if (before !== null && patch.eatenAt === undefined && patch.localDateTime === undefined && patch.timeZone === undefined) return patch;
  if (patch.localDateTime !== undefined && turnZone !== Intl.DateTimeFormat().resolvedOptions().timeZone) throw new Error('The timezone changed during this turn. Retry before proposing a meal time.');
  const row: Record<string, unknown> = {}, input = { ...patch };
  if (patch.eatenAt === undefined && patch.localDateTime === undefined && before !== null) input.eatenAt = agentDataObject(before).eatenAt;
  input.timeZone ??= turnZone;
  mealTime(row, input, recordedAt);
  const { localDateTime: _resolved, ...remaining } = patch;
  return { ...remaining, eatenAt: row.eatenAt, timeZone: row.timeZone };
}
function editComponents(row: Record<string, unknown>, value: unknown, explicitTotals: Record<string, unknown>) {
  if (!Array.isArray(value) || value.length > 100 || !value.length) throw new Error('Supply one to 100 component changes.');
  const original = Array.isArray(row.components) ? row.components : [], changes = new Map<number, Record<string, unknown> | null>(), added: Record<string, unknown>[] = [];
  let portions = 0; const identities: string[] = [], removed: string[] = [];
  for (const raw of value) {
    const command = agentDataObject(raw); validateFieldNames(command, ['operation', 'index', 'record']);
    const add = command.operation === 'add';
    if (!['add', 'update', 'remove'].includes(String(command.operation))) throw new Error('Choose add, update or remove for an ingredient.');
    if (add ? command.index !== undefined : !Number.isInteger(command.index) || Number(command.index) < 0 || Number(command.index) >= original.length || changes.has(Number(command.index))) throw new Error('Use each original component index at most once.');
    if (command.operation === 'remove') { if (command.record !== undefined) throw new Error('A removal needs no component fields.'); removed.push(String(agentDataObject(original[Number(command.index)]).name || 'Unnamed ingredient')); changes.set(Number(command.index), null); continue; }
    const patch = agentDataObject(command.record); validateFieldNames(patch, ['name', 'quantityG', 'nutrients', 'nutrientsPer100g']);
    if (!Object.keys(patch).length) throw new Error('Supply component fields to change.');
    let component = add ? {} : structuredClone(agentDataObject(original[Number(command.index)]));
    if (Object.hasOwn(patch, 'name')) {
      const name = text(patch.name, 120, 'an ingredient name'); if (!name) throw new Error('An ingredient needs a name.');
      if (component.name !== name) identities.push(name);
      if (component.name !== undefined && component.name !== name) { component.nutrients = {}; component.nutrientsPer100g = {}; }
      component.name = name;
    }
    if (!component.name) throw new Error('A new ingredient needs a name.');
    if (patch.nutrients !== undefined && patch.nutrientsPer100g !== undefined) throw new Error('Choose portion nutrients or a per-100g nutrient basis for one component change.');
    if (Object.hasOwn(patch, 'quantityG')) {
      if (patch.quantityG !== null && (typeof patch.quantityG !== 'number' || !Number.isFinite(patch.quantityG) || patch.quantityG < 0)) throw new Error('Supply finite nonnegative ingredient grams, or null.');
      if (component.quantityG !== patch.quantityG) portions++;
    }
    if (patch.nutrients !== undefined) {
      component.nutrients = nutrients(patch.nutrients, component.nutrients); component.nutrientsPer100g = {};
      if (Object.hasOwn(patch, 'quantityG')) component.quantityG = patch.quantityG;
      component = normalizeNutritionComponent(component);
    } else {
      if (patch.nutrientsPer100g !== undefined) component.nutrientsPer100g = nutrients(patch.nutrientsPer100g, component.nutrientsPer100g);
      component = Object.hasOwn(patch, 'quantityG') || patch.nutrientsPer100g !== undefined
        ? updateComponentQuantity(component, Object.hasOwn(patch, 'quantityG') ? patch.quantityG : component.quantityG)
        : normalizeNutritionComponent(component);
    }
    if (add) added.push(component); else changes.set(Number(command.index), component);
  }
  row.components = [...original.flatMap((component, index) => changes.has(index) ? changes.get(index) === null ? [] : [changes.get(index)!] : [component]), ...added];
  if ((row.components as unknown[]).length > 100) throw new Error('A meal supports at most 100 ingredients.');
  row.nutrients = recalculateMealFromComponents(row.components, row.nutrients, explicitTotals).nutrients;
  return { portions, identities, removed };
}
export function projectMealCommand(before: unknown, proposal: AgentDataProposal, patch: Record<string, unknown>): Record<string, unknown> | null {
  if (!['add', 'update', 'remove'].includes(proposal.operation)) throw new Error('Unsupported meal operation.');
  if (proposal.operation === 'add' ? before !== null : !before || agentDataObject(before).id !== proposal.recordId) throw new Error('Read the intended meal first.');
  validateFieldNames(patch, proposal.operation === 'remove' ? [] : Object.keys(mealEditableFields));
  if (proposal.operation === 'remove') return null;
  if (!Object.keys(patch).length) throw new Error('Supply meal fields to change.');
  const stamp = new Date(proposal.recordedAt).toISOString(), row = before ? structuredClone(agentDataObject(before)) : { id: proposal.recordId, createdAt: stamp, images: [], components: [], nutrients: {}, note: '', mealType: 'other' };
  const source = row.source && typeof row.source === 'object' ? structuredClone(agentDataObject(row.source)) : { kind: 'manual', recordedAt: stamp, ...(before ? {} : { nutrientBasis: 'user-entered', recordedBy: 'chat-proposal' }) };
  if (typeof source.kind !== 'string') source.kind = 'manual';
  const review = source.review && typeof source.review === 'object' ? structuredClone(agentDataObject(source.review)) : {};
  for (const [key, max] of Object.entries({ name: 120, note: 4000, analysisContext: 2000 })) if (Object.hasOwn(patch, key)) row[key] = text(patch[key], max, key);
  if (patch.mealType !== undefined) { if (!mealEditableFields.mealType.includes(String(patch.mealType))) throw new Error('Choose a supported meal type.'); row.mealType = patch.mealType; }
  if (patch.localDateTime !== undefined) throw new Error('Prepare the meal time through a current read snapshot first.');
  if (before === null || patch.eatenAt !== undefined || patch.timeZone !== undefined) {
    if (patch.eatenAt === undefined || patch.timeZone === undefined) throw new Error('The meal time must be resolved before review.');
    mealTime(row, patch, proposal.recordedAt);
  }
  const oldNutrients = row.nutrients && typeof row.nutrients === 'object' ? agentDataObject(row.nutrients) : {};
  row.nutrients = oldNutrients;
  const edited = new Set<string>(Array.isArray(review.editedNutrients) ? review.editedNutrients.filter((key): key is string => typeof key === 'string' && NUTRITION_KEYS.includes(key)) : []);
  const calculated = new Set(Array.isArray(review.calculatedNutrients) ? review.calculatedNutrients : []);
  if (source.nutrientBasis === 'user-entered' || String(source.kind).startsWith('manual')) for (const key of Object.keys(oldNutrients)) if (!calculated.has(key)) edited.add(key);
  const previous = before === null ? null : agentDataObject(before);
  const invalidated = previous && ['ai-photo-estimate', 'ai-label-scan'].includes(String(source.kind))
    && (patch.name !== undefined && row.name !== previous.name || patch.analysisContext !== undefined && row.analysisContext !== String(previous.analysisContext || '').trim());
  if (invalidated) {
    if (Array.isArray(patch.componentChanges) && patch.componentChanges.some(command => agentDataObject(command).operation !== 'add')) throw new Error('A changed meal identification resets estimated ingredients. Use add operations for newly reported ingredients.');
    review.originalAnalysis ??= { name: previous.name, analysisContext: previous.analysisContext, nutrients: previous.nutrients, components: previous.components,
      label: source.label, aiNutritionEstimate: source.aiNutritionEstimate, foodComposition: source.foodComposition };
    row.nutrients = Object.fromEntries(Object.entries(oldNutrients).filter(([key]) => edited.has(key))); row.components = [];
    for (const key of ['label', 'aiNutritionEstimate', 'foodComposition']) delete source[key];
    review.analysisInvalidated = true; source.nutrientBasis = 'user-corrected-analysis-invalidated';
  }
  if (patch.componentChanges !== undefined) {
    const effects = editComponents(row, patch.componentChanges, Object.fromEntries(Object.entries(oldNutrients).filter(([key]) => edited.has(key))));
    if (effects.portions) review.editedPortions = (Number(review.editedPortions) || 0) + effects.portions;
    if (effects.identities.length) review.editedComponentIdentities = [...new Set([...(Array.isArray(review.editedComponentIdentities) ? review.editedComponentIdentities : []), ...effects.identities])];
    if (effects.removed.length) review.removedComponents = [...new Set([...(Array.isArray(review.removedComponents) ? review.removedComponents : []), ...effects.removed])];
    review.calculatedNutrients = Object.keys(agentDataObject(row.nutrients)).filter(key => !edited.has(key));
  }
  if (patch.nutrients !== undefined) { row.nutrients = nutrients(patch.nutrients, row.nutrients); for (const key of Object.keys(agentDataObject(patch.nutrients))) edited.add(key); }
  if (patch.drink !== undefined) {
    const drink = agentDataObject(patch.drink); validateFieldNames(drink, ['kind', 'amountMl']);
    if (!['water', 'tea-coffee', 'other'].includes(String(drink.kind)) || typeof drink.amountMl !== 'number' || !Number.isFinite(drink.amountMl) || drink.amountMl <= 0 || drink.amountMl > 10000 || patch.mealType !== undefined && patch.mealType !== 'drink') throw new Error('Supply a supported drink kind and volume up to 10000 mL.');
    if (patch.nutrients && ['fluidMl', 'plainWaterMl'].some(key => Object.hasOwn(agentDataObject(patch.nutrients), key))) throw new Error('Set beverage amounts with drink, not duplicate nutrient fields.');
    row.mealType = 'drink'; row.name ||= drink.kind === 'water' ? 'Water' : drink.kind === 'tea-coffee' ? 'Tea or coffee' : 'Beverage';
    row.nutrients = nutrients({ fluidMl: drink.amountMl, plainWaterMl: drink.kind === 'water' ? drink.amountMl : null }, row.nutrients);
    edited.add('fluidMl'); edited.add('plainWaterMl');
  }
  if (patch.responseCheckIn !== undefined) {
    if (patch.responseCheckIn === null) delete row.responseCheckIn;
    else {
      const response = agentDataObject(patch.responseCheckIn); validateFieldNames(response, ['satiety2h', 'energy2h']);
      const next = row.responseCheckIn && typeof row.responseCheckIn === 'object' ? structuredClone(agentDataObject(row.responseCheckIn)) : {};
      for (const [key, value] of Object.entries(response)) {
        if (value === null) delete next[key];
        else { if (![1, 2, 3].includes(value as number)) throw new Error('Check-in levels must be 1, 2, 3 or null.'); next[key] = value; }
      }
      if (next.satiety2h === undefined && next.energy2h === undefined) delete row.responseCheckIn;
      else row.responseCheckIn = { ...next, recordedAt: stamp };
    }
  }
  if (patch.keepImageIndices !== undefined) {
    const images = mealImages(row), order = patch.keepImageIndices;
    if (!Array.isArray(order) || new Set(order).size !== order.length || order.some(index => !Number.isInteger(index) || index < 0 || index >= images.length)) throw new Error('Choose unique existing photo indices.');
    row.images = order.map(index => images[index]);
    delete row.image;
  }
  if (typeof row.name !== 'string' || !row.name.trim()) throw new Error('A meal needs a name.');
  const total = agentDataObject(row.nutrients);
  if (typeof total.plainWaterMl === 'number' && typeof total.fluidMl === 'number' && total.plainWaterMl > total.fluidMl) throw new Error('Plain water cannot exceed the total beverage volume.');
  source.review = { ...review, editedNutrients: [...edited], reviewedAt: stamp, lastChatChange: { reason: proposal.reason, evidence: proposal.evidence, fields: Object.keys(patch) } };
  row.source = source; row.reviewed = true;
  row.updatedAt = new Date(Math.max(proposal.recordedAt, Date.parse(String(row.updatedAt || '')) + 1 || 0)).toISOString();
  return row;
}
