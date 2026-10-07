import type { ChatModelPickerActions, ChatModelPickerView } from './chat-model-picker-contract.js';

const PROVIDER_EVENTS = [
  'labcharts-ai-settings-local-changed',
  'getbased:agent-model-catalog-changed',
  'getbased:agent-host-settings-changed',
  'getbased:chat-backend-changed',
  'getbased:chat-model-selection-changed',
];
let active: { root: HTMLElement; view: ChatModelPickerView } | null = null;
let actions: ChatModelPickerActions | null = null;

export function getChatModelPickerView(): ChatModelPickerView | null {
  return active?.view.isCurrent() ? active.view : null;
}

export function ownChatModelPicker(
  root: HTMLElement,
  callbacks: Omit<ChatModelPickerView, 'isCurrent'>,
): { destroy(): void } {
  const owner = {
    root,
    view: {
      ...callbacks,
      isCurrent: () => active === owner && root.isConnected
        && root.ownerDocument.getElementById('chat-model-menu') === root,
    },
  };
  active = owner;
  const refresh = () => { if (owner.view.isCurrent()) actions?.refreshView(); };
  for (const event of PROVIDER_EVENTS) globalThis.addEventListener(event, refresh);
  queueMicrotask(refresh);
  return {
    destroy() {
      for (const event of PROVIDER_EVENTS) globalThis.removeEventListener(event, refresh);
      if (active === owner) active = null;
    },
  };
}

export function configureChatModelPicker(next: ChatModelPickerActions): void {
  actions = next;
}

export function chatModelPickerActions(root: HTMLElement): ChatModelPickerActions | null {
  return active?.root === root && active.view.isCurrent() ? actions : null;
}
