/** Component lifetime port; services publish values and never author picker DOM. */
export interface PersonalityOption { id: string; name: string; icon: string; description: string; custom: boolean; }
export interface PersonalityPickerState { version: number; current: string; name: string; icon: string; options: PersonalityOption[]; }
export interface PersonalityPickerView {
  isCurrent(): boolean;
  render(state: PersonalityPickerState): void;
  setOpen(open: boolean, focusId?: string): void;
  isOpen(): boolean;
}
export interface PersonalityPickerActions { refresh(): void; toggle(): void; select(id: string, version: number): unknown; edit(id: string, version: number): unknown; delete(id: string, version: number): unknown; add(version: number): unknown; }
export const INITIAL_PERSONALITY_PICKER: PersonalityPickerState = {
  version: 0, current: 'default', name: 'AI Lab Analyst', icon: '🔬', options: [
    { id: 'default', name: 'AI Lab Analyst', icon: '🔬', description: 'Neutral, professional analysis', custom: false },
    { id: 'house', name: 'Dr. Gregory House', icon: '🦯', description: 'Sarcastic, brilliant, blunt', custom: false },
  ],
};
let active: { root: HTMLElement; view: PersonalityPickerView; } | null = null;
let actions: PersonalityPickerActions | null = null;
export function configurePersonalityPicker(next: PersonalityPickerActions): void { actions = next; }
export function getPersonalityPickerView(): PersonalityPickerView | null { return active?.view.isCurrent() ? active.view : null; }
export function personalityPickerActions(root: HTMLElement): PersonalityPickerActions | null { return active?.root === root && active.view.isCurrent() ? actions : null; }
export function closePersonalityPickerView(focus = false): void { getPersonalityPickerView()?.setOpen(false, focus ? 'trigger' : undefined); }
export function ownPersonalityPicker(root: HTMLElement, callbacks: Omit<PersonalityPickerView, 'isCurrent'>): { destroy(): void; } {
  const owner = { root, view: { ...callbacks, isCurrent: () => active === owner && root.isConnected && root.ownerDocument.getElementById('chat-personality-options')?.parentElement === root } };
  active = owner;
  queueMicrotask(() => { if (owner.view.isCurrent()) actions?.refresh(); });
  return { destroy() { if (active === owner) active = null; } };
}
