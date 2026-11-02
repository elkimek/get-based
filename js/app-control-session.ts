// Compatibility boundary for retired chat-management requests. Native UI is independent.
import { CHAT_NATIVE_UI_NOTICE } from '../shared/chat-control-policy.js';
import type { AppControlRecord } from '../shared/agent-control-contract.js';
import type { AgentToolReadOptions } from './agent-tool-runtime.js';
export function createAppControlSession(_userMessage: string, _isCurrent: () => boolean, _signal: AbortSignal) {
  const denied = (): never => { throw new Error(CHAT_NATIVE_UI_NOTICE); };
  function readAppState(_options: { action: 'display.preferences' }): { action: string; snapshotId: string; values: { unitSystem: string; showAltUnits: boolean; rangeMode: string }; scope: string; approval: string; canonicalDataUnchanged: boolean };
  function readAppState(_options: AgentToolReadOptions['readAppState']): unknown;
  function readAppState(_options: AgentToolReadOptions['readAppState']): never { return denied(); }
  return {
    tools: { listAppActions: () => ({ actions: [] as Array<{ id: string }>, notice: CHAT_NATIVE_UI_NOTICE }), readAppState,
      prepareAppControl: (_input: AgentToolReadOptions['prepareAppControl']): never => denied() },
    finish: (): AppControlRecord[] => [], cancel() {},
  };
}
export type AppControlSession = ReturnType<typeof createAppControlSession>;
