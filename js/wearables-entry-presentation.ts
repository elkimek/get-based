import {renderHTML as manualHTML} from './components/WearableManualLog.svelte.html.js';
import {renderHTML as pickerHTML} from './components/WearableSourcePicker.svelte.html.js';

/** Synchronous serializers remain available at the native controller boundary. */
export type WearableEntryHTML = string;
const text = (value: unknown): string => value === null || value === undefined ? '' : String(value);
export type ManualLogMode = 'strip-weight' | 'strip-bp' | 'strip-rhr' | 'detail-weight' | 'detail-rhr' | 'detail-bp' | 'tags' | 'chip' | 'note';
export interface WearableTagChipView {readonly tag: string; readonly label: string}
export interface WearableTagGroupView {readonly chips: readonly WearableTagChipView[]}
export interface WearableNoteView {readonly id: string}
type DelegatedAttributes = Readonly<Record<string, string>>;
export interface ManualLogView {
  readonly mode: ManualLogMode; readonly placeholder: string; readonly label: string; readonly date: string; readonly max: string;
  readonly tags: WearableTagGroupView | null; readonly note: WearableNoteView | null;
  readonly tag: string; readonly tagLabel: string; readonly noteId: string;
  readonly form: DelegatedAttributes; readonly save: DelegatedAttributes; readonly cancel: DelegatedAttributes;
}
export interface SourcePickerRowView {readonly id: string; readonly name: string; readonly className: string; readonly selected: boolean}
export interface SourcePickerView {
  readonly mode: 'shell' | 'row' | 'check'; readonly label: string;
  readonly rows: readonly SourcePickerRowView[]; readonly row: SourcePickerRowView | null; readonly automatic: boolean;
}
const TAG_CHIPS: Readonly<Record<PropertyKey, unknown>> = {
  bp_systolic: ['resting','morning-fasted','post-workout','stress'],
  rhr: ['resting','morning-fasted','post-workout'],
};
function baseManual(mode: ManualLogMode): ManualLogView {
  return {mode, placeholder:'', label:'', date:'', max:'', tags:null, note:null, tag:'', tagLabel:'', noteId:'', form:{},save:{},cancel:{}};
}
export function projectWearableTagChips(metricId: unknown): WearableTagGroupView | null {
  const tags = TAG_CHIPS[metricId as PropertyKey] as readonly unknown[] | undefined;
  if (!tags) return null;
  // Preserve inherited-property/map failure and independent attribute/text reads.
  const chips = tags.map(tag => ({tag: text(tag), label: text(tag)}));
  return {chips};
}
export function projectWearableNoteField(id: unknown = 'wl-note'): WearableNoteView { return {id: text(id)}; }
export function renderWearableTagChips(metricId: unknown): WearableEntryHTML {
  const tags = projectWearableTagChips(metricId);
  return tags === null ? '' : manualHTML({view: {...baseManual('tags'), tags}});
}
export function renderWearableNoteField(id: unknown = 'wl-note'): WearableEntryHTML {
  const note = projectWearableNoteField(id);
  return manualHTML({view: {...baseManual('note'), note, noteId: note.id}});
}
export interface ManualLogInput {
  mode: Exclude<ManualLogMode,'tags'|'chip'|'note'>; today: string;
  placeholder?: () => unknown; label?: () => unknown;
  tags?: () => WearableTagGroupView | null; note: () => WearableNoteView;
  form?: () => string; save?: () => string; cancel: () => string;
}
function delegatedAttributes(value: string): DelegatedAttributes {
  // Preserve the existing public action-helper lane, converting its bounded
  // attribute fragment into data before genuine Svelte receives it.
  if (!/^data-wearable-(?:action|form)="[^"<>]*"(?: data-wearable-(?:kind|metric)="[^"<>]*")*$/.test(value))
    throw new Error('Unexpected wearable delegated attribute fragment');
  const entities: Readonly<Record<string,string>> = {'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&#39;':"'"};
  return Object.fromEntries([...value.matchAll(/(data-wearable-(?:action|form|kind|metric))="([^"]*)"/g)]
    .map(match => [match[1]!, match[2]!.replace(/&(?:amp|lt|gt|quot|#39);/g, entity => entities[entity]!)]));
}
export function projectWearableManualLog(input: ManualLogInput): ManualLogView {
  const detail = input.mode.startsWith('detail');
  const form = detail ? delegatedAttributes(input.form!()) : {};
  const placeholder = input.placeholder ? text(input.placeholder()) : '';
  const label = input.label ? text(input.label()) : '';
  const tags = input.tags ? input.tags() : null;
  const note = input.note();
  const date = `${input.today}`;
  const max = detail ? '' : `${input.today}`;
  const save = detail ? {} : delegatedAttributes(input.save!());
  const cancel = delegatedAttributes(input.cancel());
  return {...baseManual(input.mode), placeholder, label, tags, note, date, max, form, save, cancel};
}
export function renderWearableManualLog(input: ManualLogInput): WearableEntryHTML {
  return manualHTML({view: projectWearableManualLog(input)});
}
export interface SourcePickerInput {
  label: () => unknown; ids: readonly string[]; current: unknown;
  name: (id: string) => unknown; automatic: () => unknown;
}
export function projectWearableSourcePicker(input: SourcePickerInput): SourcePickerView {
  const label = text(input.label());
  const mappedRows = input.ids.map(id => {
    const className = 'wearable-source-picker-item' + (id === input.current ? ' selected' : '');
    const sourceId = text(id), name = text(input.name(id));
    const selected = id === input.current;
    return {id: sourceId, name, className, selected};
  });
  // Native map/join skips sparse slots; Svelte each requires a dense view list.
  const rows: SourcePickerRowView[] = [];
  for (let index = 0; index < mappedRows.length; index++) if (index in mappedRows) rows.push(mappedRows[index]!);
  const automatic = !input.automatic();
  return {mode:'shell', label, rows, row:null, automatic};
}
export function renderWearableSourcePicker(input: SourcePickerInput): WearableEntryHTML {
  return pickerHTML({view: projectWearableSourcePicker(input)});
}
