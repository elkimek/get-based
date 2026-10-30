// Shared native selection owner. Private connection leases never enter prompts.
import { state } from './state.js';
import { getChatModelControlState, getNativeChatModelChoices } from './chat-model-control-state.js';
import { saveAgentChatSettings, getAgentModelEffort, getAgentSelectionStorageKeys } from './agent-chat-settings.js';
import { getVeniceE2EE, setCustomApiModel, setOllamaMainModel, setPpqModel } from './api.js';
import { captureAssistantConnectionConfiguration, assistantConfigurationsEqual } from './assistant-connection-configuration.js';
import { getDirectChatReasoningEffort, setDirectChatReasoningEffort, getDirectChatReasoningPreferenceKey } from './chat-model-preferences.js';
import { hasPendingAttachments } from './chat-images.js';
import { updateChatHeaderModelRuntime, isChatRuntimeStreaming } from './chat-runtime.js';
import type { AssistantSelection, AssistantSelectionPatch } from '../shared/agent-control-contract.js';
import { parseAssistantSelectionPatch } from '../shared/agent-control-contract.js';
import { runNativeCommandWithLocks } from './native-command-locks.js';
import { getAppExtensionAIConnectionState } from './app-extension-runtime.js';
import { captureManagedConnection, type ManagedConnectionBinding } from './app-extension-connection-control.js';

export class AssistantSelectionConflict extends Error { readonly noChangeApplied = true; }
export function assistantConnectionConfiguration(selection = readAssistantSelection()): unknown[] { return captureAssistantConnectionConfiguration(selection); }
export { assistantConfigurationsEqual };

export function readAssistantSelection(): AssistantSelection {
  const value = getChatModelControlState();
  return { backend: value.cli ? 'cli' : 'direct', provider: value.provider, target: value.cli ? value.target : '', model: String(value.selectedId ?? ''), effort: value.selectedEffort };
}
const equal = (a: AssistantSelection, b: AssistantSelection) => Object.keys(a).every(key => a[key as keyof AssistantSelection] === b[key as keyof AssistantSelection]);
interface Lease { selection: AssistantSelection; connection: unknown[]; profile: string; thread: string | null; managed: ManagedConnectionBinding; }
const leases = new Map<string, Lease>();
export function captureAssistantSelection(options: { reviewed?: boolean } = {}) {
  const leaseId = crypto.randomUUID(), selection = readAssistantSelection();
  const managed = selection.backend === 'direct' ? captureManagedConnection(selection.provider, options.reviewed === true) : null;
  if (leases.size >= 200) leases.delete(leases.keys().next().value!);
  leases.set(leaseId, { selection, connection: assistantConnectionConfiguration(), profile: state.currentProfile, thread: state.currentThreadId, managed });
  return { leaseId, selection };
}
export function isAssistantSelectionLeaseCurrent(id: string): boolean {
  const lease = leases.get(id);
  return !!lease && lease.profile === state.currentProfile && lease.thread === state.currentThreadId && equal(lease.selection, readAssistantSelection())
    && (!lease.managed || lease.managed.current())
    && assistantConfigurationsEqual(lease.connection, assistantConnectionConfiguration());
}
export function previewAssistantSelection(leaseId: string, patch: AssistantSelectionPatch): AssistantSelection {
  if (!parseAssistantSelectionPatch(patch)) throw new AssistantSelectionConflict('Supply only an exact model and/or reasoning choice.');
  if (!isAssistantSelectionLeaseCurrent(leaseId)) throw new AssistantSelectionConflict('The assistant connection review expired or changed. Read it again for a fresh review.');
  const before = leases.get(leaseId)!.selection;
  const model = patch.model ?? before.model;
  const choices = getNativeChatModelChoices();
  const choice = choices.find(item => item.id === model);
  if (!choice) throw new AssistantSelectionConflict('That exact model is not in this connection’s current catalog. Refresh the native model picker first.');
  if (!choice.inputModalities.includes('text')) throw new AssistantSelectionConflict('Choose a model with confirmed text input support for chat.');
  if (hasPendingAttachments() && !choice.inputModalities.includes('image')) throw new AssistantSelectionConflict('This model does not have confirmed image support. Remove the attached photos or refresh the model catalog.');
  const effort = patch.effort ?? (model === before.model ? before.effort : before.backend === 'cli' ? getAgentModelEffort(model) : getDirectChatReasoningEffort(before.provider, model));
  if (effort && !choice.reasoningChoices.includes(effort)) throw new AssistantSelectionConflict('Choose a reasoning effort supported by this exact model, or use its default.');
  return { ...before, model, effort };
}

export async function commitAssistantSelection(leaseId: string, patch: AssistantSelectionPatch, options: { canCommit?: () => boolean; requireLocks?: boolean; expectedProposed?: AssistantSelection } = {}) {
  const before = leases.get(leaseId)?.selection;
  if (!before) throw new AssistantSelectionConflict('Read the assistant connection again for a fresh review.');
  // Load presentation adapters before the final lock/check; they cannot change
  // the recipient while a command is waiting for an import or another tab.
  const controls = before.backend === 'direct' && ['venice', 'openrouter', 'routstr'].includes(before.provider) ? await import('./provider-model-controls.js') : null;
  const binding = leases.get(leaseId)!.managed;
  const proposed = previewAssistantSelection(leaseId, patch);
  const checked = binding ? await binding.check(proposed.model, { isCurrent: () => isAssistantSelectionLeaseCurrent(leaseId) && options.canCommit?.() !== false }) : null;
  const write = async () => {
    if (options.requireLocks && before.backend === 'direct' && getAppExtensionAIConnectionState(before.provider).managed && !binding) throw new AssistantSelectionConflict('This edition manages the connection. Use its native model controls for this change.');
    if (checked && Date.now() - checked.checkedAt > 15000) throw new AssistantSelectionConflict('The connection check expired. Request a fresh review.');
    if (isChatRuntimeStreaming() || options.canCommit?.() === false) throw new AssistantSelectionConflict('Finish the current reply before changing the assistant selection. Nothing was changed.');
    const after = previewAssistantSelection(leaseId, patch);
    if (!equal(after, options.expectedProposed ?? proposed)) throw new AssistantSelectionConflict('The proposed model or effort changed. Request a fresh review.');
    // Only selection keys participate in compensation. Never capture keys,
    // endpoints, credentials, data sources or health records in this journal.
    const keys = before.backend === 'cli' ? getAgentSelectionStorageKeys(after.model) : [
      ...(patch.model === undefined ? [] : [`labcharts-${before.provider}-model`,
        ...(before.provider === 'venice' ? [getVeniceE2EE() ? 'labcharts-venice-model-e2ee' : 'labcharts-venice-model-regular'] : []),
        ...(before.provider === 'routstr' ? [after.model.startsWith('tinfoil-') ? 'labcharts-routstr-model-private' : 'labcharts-routstr-model-regular'] : [])]),
      ...(patch.effort === undefined ? [] : [getDirectChatReasoningPreferenceKey(before.provider, after.model)]),
    ];
    const saved = new Map(keys.map(key => [key, localStorage.getItem(key)]));
    try {
      if (before.backend === 'cli') await saveAgentChatSettings({ ...(patch.model === undefined ? {} : { model: after.model }), ...(patch.effort === undefined ? {} : { effort: after.effort }) });
      else {
        if (patch.model !== undefined) {
          if (before.provider === 'ollama') setOllamaMainModel(after.model);
          else if (before.provider === 'ppq') setPpqModel(after.model);
          else if (before.provider === 'custom') setCustomApiModel(after.model);
          else if (before.provider === 'venice') controls!.onVeniceModelDropdownChange(after.model);
          else if (before.provider === 'openrouter') controls!.onOpenRouterDropdownChange(after.model);
          else if (before.provider === 'routstr') controls!.onRoutstrModelDropdownChange(after.model);
          else throw new AssistantSelectionConflict('Use the native provider settings for this connection.');
        }
        if (patch.effort !== undefined) setDirectChatReasoningEffort(before.provider, after.model, after.effort);
      }
    } catch (cause) {
      const observed = readAssistantSelection();
      if (Object.keys(before).some(key => observed[key as keyof AssistantSelection] !== before[key as keyof AssistantSelection] && observed[key as keyof AssistantSelection] !== after[key as keyof AssistantSelection])) throw new Error('The assistant selection changed during saving. Check the native picker before trying again.', { cause });
      try {
        for (const [key, value] of saved) { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); }
      } catch { throw new Error('The assistant selection could not be fully confirmed. Check the native model picker before trying again.', { cause }); }
      try {
        globalThis.dispatchEvent?.(new CustomEvent('getbased:chat-model-selection-changed'));
        updateChatHeaderModelRuntime();
      } catch { /* Repaint cannot change the rollback result. */ }
      throw Object.assign(new Error('The assistant selection could not be saved. Nothing was changed.', { cause }), { noChangeApplied: true });
    }
    if (!equal(after, readAssistantSelection())) throw new Error('The assistant selection outcome could not be confirmed. Check the native model picker.');
    if (binding && !binding.current()) throw new Error('The edition owner changed during publication. Check native AI settings before changing this selection again.');
    const nextLeaseId = crypto.randomUUID();
    if (leases.size >= 200) leases.delete(leases.keys().next().value!);
    leases.set(nextLeaseId, { selection: after, connection: assistantConnectionConfiguration(), profile: state.currentProfile, thread: state.currentThreadId, managed: binding });
    try { updateChatHeaderModelRuntime(); } catch { /* Saved settings remain authoritative. */ }
    return { before, after, leaseId: nextLeaseId, changed: !equal(before, after) };
  };
  if (!navigator.locks?.request) {
    if (options.requireLocks) throw new AssistantSelectionConflict('Use the native model picker in this browser. Safe automated selection requires Web Locks.');
    return write();
  }
  return runNativeCommandWithLocks(navigator.locks, ['getbased-assistant-selection'], write);
}
