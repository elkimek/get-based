export interface PersonaSelectionMetadata { id: string; name: string; icon: string }
export interface PersonaEditorDraft { name?: string; promptText?: string; promptMode?: 'append' | 'replace' }
/** No IDs, agreements, saved-state flags or other native fields are model editable. */
export function parsePersonaEditorDraft(value: unknown): PersonaEditorDraft | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const draft = value as Record<string, unknown>;
  if (!Object.keys(draft).length || Object.keys(draft).some(key => !['name', 'promptText', 'promptMode'].includes(key))) return null;
  for (const [key, maximum] of [['name', 60], ['promptText', 12000]] as const) {
    if (Object.hasOwn(draft, key) && (typeof draft[key] !== 'string' || !draft[key].trim() || draft[key] !== draft[key].trim() || draft[key].length > maximum || /[\u0000\u007f]/.test(draft[key]))) return null;
  }
  if (typeof draft.name === 'string' && /[\u0000-\u001f\u007f]/.test(draft.name)) return null;
  if (!Object.hasOwn(draft, 'name') && !Object.hasOwn(draft, 'promptText') || Object.hasOwn(draft, 'promptMode') && (!Object.hasOwn(draft, 'promptText') || draft.promptMode !== 'append' && draft.promptMode !== 'replace')) return null;
  return { ...draft } as PersonaEditorDraft;
}
export function parsePersonaSelectionMetadata(value: unknown): PersonaSelectionMetadata | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).sort().join() !== 'icon,id,name' || typeof record.id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(record.id)
    || typeof record.name !== 'string' || record.name.length > 160 || typeof record.icon !== 'string' || record.icon.length > 64) return null;
  return { id: record.id, name: record.name, icon: record.icon };
}
