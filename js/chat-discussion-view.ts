/** Composer-owned discussion presentation; services retain round execution and persistence. */
export interface DiscussionPersona { id: string; name: string; icon: string; }
export interface DiscussionOption extends DiscussionPersona { locked: boolean; }
export interface DiscussionPicker {
  options: DiscussionOption[];
  selected: string[];
  addingToExisting: boolean;
}
export interface DiscussionRound { participants: string[]; pending: number; progress: string; }
export interface ChatDiscussionView {
  scope: string;
  visible: boolean;
  dim: boolean;
  active: boolean;
  picker: DiscussionPicker | null;
  round: DiscussionRound | null;
}
export const INITIAL_CHAT_DISCUSSION: ChatDiscussionView = {
  scope: '', visible: false, dim: true, active: false, picker: null, round: null,
};
interface Owner { root: HTMLElement; render(view: ChatDiscussionView): void; }
let owner: Owner | null = null;
let view: ChatDiscussionView = { ...INITIAL_CHAT_DISCUSSION };
let context: () => string = () => '';
export function configureChatDiscussionContext(read: () => string): void { context = read; }
function current(candidate: Owner): boolean {
  return owner === candidate && candidate.root.isConnected
    && candidate.root.ownerDocument.querySelector('[data-chat-discussion-view]') === candidate.root;
}
export function currentChatDiscussion(): ChatDiscussionView | null {
  return owner && current(owner) && view.scope === context() ? view : null;
}
function publish(next: ChatDiscussionView): void {
  view = next;
  if (owner && current(owner)) owner.render(view);
}
function scoped(scope: string): ChatDiscussionView {
  return view.scope === scope ? view : { ...INITIAL_CHAT_DISCUSSION, scope };
}
export function publishDiscussionButton(scope: string, button: Pick<ChatDiscussionView, 'visible' | 'dim' | 'active'>): void {
  publish({ ...scoped(scope), ...button });
}
export function publishDiscussionPicker(scope: string, picker: DiscussionPicker | null): boolean {
  if (!owner || !current(owner)) return false;
  publish({ ...scoped(scope), picker });
  return true;
}
export function publishDiscussionRound(scope: string, round: DiscussionRound | null): boolean {
  if (!owner || !current(owner)) return false;
  publish({ ...scoped(scope), round });
  return true;
}
export function publishDiscussionProgress(progress: string): void {
  const current = currentChatDiscussion();
  if (current?.round) publish({ ...current, round: { ...current.round, progress } });
}
export function discussionPickerLimit(picker: DiscussionPicker): number {
  return picker.addingToExisting || picker.options.some(option => option.locked) ? 1 : 2;
}
export function selectDiscussionPersona(root: HTMLElement, id: string, checked: boolean): void {
  const current = currentChatDiscussion(), picker = current?.picker;
  if (owner?.root !== root || !picker) return;
  const option = picker.options.find(option => option.id === id);
  if (!option || option.locked) return;
  const selected = picker.selected.filter(value => value !== id);
  if (checked && selected.length < discussionPickerLimit(picker)) selected.push(id);
  publish({ ...current, picker: { ...picker, selected } });
}
export function discussionPickerSelection(picker: DiscussionPicker | null) {
  if (!picker || picker.selected.length !== discussionPickerLimit(picker)) return null;
  const locked = picker.options.filter(option => option.locked);
  const selected = picker.options.filter(option => !option.locked && picker.selected.includes(option.id));
  if (selected.length !== picker.selected.length) return null;
  const persona = ({ id, name, icon }: DiscussionPersona): DiscussionPersona => ({ id, name, icon });
  return { allPersonas: [...locked, ...selected].map(persona), newPersonas: selected.map(persona), addingToExisting: picker.addingToExisting };
}
export function closeOwnedDiscussionPicker(root: HTMLElement, focus = false): void {
  if (owner?.root !== root || !current(owner)) return;
  publish({ ...view, picker: null });
  if (focus) root.ownerDocument.getElementById('chat-discuss-btn')?.focus();
}
/** Do not let controls retained from another conversation dispatch domain actions. */
export function guardDiscussionAction(root: HTMLElement, event: MouseEvent): void {
  if (owner?.root !== root || !currentChatDiscussion()) {
    event.preventDefault(); event.stopImmediatePropagation();
  }
}
export function ownChatDiscussion(root: HTMLElement, render: Owner['render']): { destroy(): void; } {
  const entry = { root, render }; owner = entry;
  view = { ...INITIAL_CHAT_DISCUSSION, scope: context() };
  render(view);
  return { destroy() { if (owner === entry) { owner = null; view = { ...INITIAL_CHAT_DISCUSSION }; } } };
}
