// Svelte owns DOM input events; the draft service owns their side effects.
const handlers = new WeakMap<HTMLTextAreaElement, () => void>();
const owners = new WeakMap<HTMLTextAreaElement, symbol>();

/** Svelte action: retiring the component also retires its draft side effects. */
export function registerChatComposerInput(input: HTMLTextAreaElement): { destroy(): void } {
  const token = Symbol('composer input');
  owners.set(input, token);
  return { destroy() {
    if (owners.get(input) === token) { owners.delete(input); handlers.delete(input); }
  } };
}

export function isChatComposerInputCurrent(input: HTMLTextAreaElement): boolean {
  return owners.has(input) && input.isConnected && input.ownerDocument.getElementById('chat-input') === input;
}

/** Pre-initialization helpers retain their contract; owned reads retain a token. */
export function captureChatComposerInput(input: HTMLTextAreaElement): () => boolean {
  const owner = owners.get(input);
  return () => input.isConnected && input.ownerDocument.getElementById('chat-input') === input
    && (owner === undefined || owners.get(input) === owner);
}

export function ownChatComposerInput(input: HTMLTextAreaElement, handler: () => void): () => void {
  handlers.set(input, handler);
  return () => { if (handlers.get(input) === handler) handlers.delete(input); };
}

export function notifyChatComposerInput(input: HTMLTextAreaElement): void {
  if (isChatComposerInputCurrent(input)) handlers.get(input)?.();
}
