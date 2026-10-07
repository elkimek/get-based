import { state } from './state.js';
import type { ChatSpeechMode } from './chat-voice-contract.js';

interface SpeechOwner {
  current(): boolean;
  render(mode: ChatSpeechMode): void;
  act?: (() => void) | undefined;
}
const owners = new WeakMap<HTMLElement, SpeechOwner>();
let action: (index: number) => unknown = () => {};

export function configureChatSpeechAction(next: (index: number) => unknown): void {
  action = next;
}

export function ownChatSpeech(button: HTMLButtonElement, index: number, render: SpeechOwner['render'], act?: () => void): { destroy(): void } {
  const profile = state.currentProfile;
  const thread = state.currentThreadId;
  const history = state.chatHistory;
  const message = history[index];
  const owner: SpeechOwner = {
    render,
    act,
    current: () => owners.get(button) === owner && button.isConnected && !!message
      && profile === state.currentProfile && thread === state.currentThreadId
      && history === state.chatHistory && message === history[index],
  };
  owners.set(button, owner);
  button.dataset.chatSpeechOwned = '';
  return {
    destroy() {
      owners.delete(button);
      delete button.dataset.chatSpeechOwned;
    },
  };
}

export function runOwnedChatSpeech(button: HTMLButtonElement, index: number): void {
  const owner = owners.get(button);
  if (!owner?.current()) return;
  if (owner.act) owner.act();
  else void action(index);
}

export function publishOwnedChatSpeech(index: number, mode: ChatSpeechMode): boolean {
  const button = document.getElementById(`chat-listen-btn-${index}`);
  const owner = button ? owners.get(button) : null;
  if (!owner?.current()) return false;
  owner.render(mode);
  return true;
}
