// chat-stream-status.js — one concise screen-reader announcement per response phase.

export function setChatStreamStatus(message: string, { busy = false }: { busy?: boolean } = {}): boolean {
  if (typeof document === 'undefined') return false;
  const transcript = document.getElementById('chat-messages');
  const status = document.getElementById('chat-stream-status');
  transcript?.setAttribute('aria-busy', String(busy));
  if (status) status.textContent = message;
  return Boolean(transcript || status);
}

export function clearChatStreamStatus() {
  return setChatStreamStatus('', { busy: false });
}
