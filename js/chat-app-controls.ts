// Historical message actions are inert; manual application controls keep their own owners.
import { state } from './state.js';
import { CHAT_NATIVE_UI_NOTICE } from '../shared/chat-control-policy.js';
import { showNotification } from './utils.js';
export async function handleChatAppControl(index: number, id: string, _action: 'apply' | 'discard' | 'undo', _refresh: () => void) {
  const message = state.chatHistory[index];
  if (message?.role === 'assistant' && message.appControls?.some(record => record.id === id)) showNotification(CHAT_NATIVE_UI_NOTICE, 'info');
}
