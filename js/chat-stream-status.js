// @ts-check
// chat-stream-status.js — one concise screen-reader announcement per response phase.

/** @param {string} message @param {{ busy?: boolean }} [options] */
export function setChatStreamStatus(message, { busy = false } = {}) {
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
