import { INITIAL_CHAT_CAPTURE, type ChatCaptureMode, type ChatCaptureView } from './chat-voice-contract.js';
interface CaptureOwner { root: HTMLElement; render(view: ChatCaptureView): void; }
let owner: CaptureOwner | null = null;
let view = { ...INITIAL_CHAT_CAPTURE };
let toggle: (() => unknown) | null = null;
let cancel: (() => unknown) | null = null;
function current(candidate: CaptureOwner): boolean {
  return owner === candidate && candidate.root.isConnected && candidate.root.ownerDocument.querySelector('[data-chat-voice-view]') === candidate.root;
}
export function configureChatVoiceActions(next: () => unknown): void { toggle = next; }
export function configureChatVoiceCancellation(next: () => unknown): void { cancel = next; }
export function toggleOwnedChatVoice(root: HTMLElement): void { if (owner?.root === root && current(owner)) void toggle?.(); }
export function publishChatCapture(mode: ChatCaptureMode, text = ''): void {
  view = { ...view, mode, text };
  if (owner && current(owner)) owner.render(view);
}
export function setChatVoiceAvailable(available: boolean): void {
  if (!available && view.available) cancel?.();
  view = { ...view, available };
  if (owner && current(owner)) owner.render(view);
}
/** Disposing a composer cancels capture while spoken replies may continue. */
export function ownChatCapture(root: HTMLElement, render: CaptureOwner['render']): { destroy(): void; } {
  if (owner) cancel?.();
  const entry = { root, render }; owner = entry;
  render(view);
  return { destroy() { if (owner === entry) { cancel?.(); owner = null; } } };
}
