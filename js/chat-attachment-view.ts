import type { ChatAttachment } from './chat-attachment-drafts.js';
export interface ChatAttachmentView { scope: string; attachments: ChatAttachment[]; limit: number; canAttach: boolean; }
export interface ChatAttachmentActions {
  files(files: File[]): Promise<void>;
  drop(source: DataTransfer): Promise<void>;
  remove(attachment: ChatAttachment, scope: string): void;
}
const PROVIDER_EVENTS = ['getbased:agent-model-catalog-changed', 'labcharts-ai-settings-local-changed', 'getbased:agent-host-settings-changed', 'getbased:chat-backend-changed', 'getbased:chat-model-selection-changed'];
let active: { root: HTMLElement; render(view: ChatAttachmentView): void; } | null = null;
let actions: ChatAttachmentActions | null = null, refresh: (() => void) | null = null;
let context: (() => unknown) | null = null;
export const INITIAL_CHAT_ATTACHMENTS: ChatAttachmentView = { scope: '', attachments: [], limit: 5, canAttach: false };
function current(root: HTMLElement): boolean {
  return active?.root === root && root.isConnected && root.ownerDocument.querySelector('[data-chat-attachment-view]') === root;
}
export function configureChatAttachmentActions(next: ChatAttachmentActions, update: () => void): void {
  actions = next; refresh = update; if (active && current(active.root)) refresh();
}
export function configureChatAttachmentContext(next: () => unknown): void { context = next; }
export function openOwnedChatContext(root: HTMLElement): void { if (current(root)) void context?.(); }
export function chatAttachmentActions(root: HTMLElement): ChatAttachmentActions | null { return current(root) ? actions : null; }
export function publishChatAttachments(view: ChatAttachmentView): void { if (active && current(active.root)) active.render(view); }
export function ownChatAttachments(root: HTMLElement, render: (view: ChatAttachmentView) => void): { destroy(): void; } {
  const owner = { root, render }; active = owner;
  const update = () => { if (current(root)) refresh?.(); };
  const window = root.ownerDocument.defaultView;
  for (const event of PROVIDER_EVENTS) window?.addEventListener(event, update);
  queueMicrotask(update);
  return {
    destroy() {
      for (const event of PROVIDER_EVENTS) window?.removeEventListener(event, update);
      if (active === owner) active = null;
    }
  };
}
// Invoked synchronously from the Svelte drop handler so portal handles are
// acquired before the event returns. Never put an import/await before this call.
export function dropChatAttachments(root: HTMLElement, source: DataTransfer): void {
  if (root.isConnected && root.ownerDocument.querySelector('.chat-panel-conversation') === root) void actions?.drop(source);
}
export function pasteChatAttachments(input: HTMLTextAreaElement, event: ClipboardEvent): void {
  if (!input.isConnected || input.ownerDocument.getElementById('chat-input') !== input) return;
  const files = Array.from(event.clipboardData?.items || []).filter(item => item.type.startsWith('image/')).map(item => item.getAsFile()).filter((file): file is File => !!file);
  if (files.length && actions) { event.preventDefault(); void actions.files(files); }
}
/** Image-only URLs; metadata is always rendered as literal Svelte text. */
export function chatAttachmentImageURL(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  return /^(?:data:image\/(?:jpeg|png|gif|webp);base64,|blob:|https?:\/\/|\/(?!\/)|\.\.?\/)/i.test(value) ? value : undefined;
}
export function chatAttachmentName(value: unknown): string { return typeof value === 'string' && value ? value : 'Attached image'; }

export function captureChatAttachmentOwner(): () => boolean {
  const owner = active;
  return () => active === owner && (!owner || current(owner.root));
}
