import { MAX_CHAT_APP_REVIEWS } from '../shared/chat-turn-outcome.js';
import { captureChatControlAuthorization } from './chat-control-settings.js';
import { chatAppActionAllowed, chatAppControlAllowed, CHAT_NATIVE_UI_NOTICE } from '../shared/chat-control-policy.js';
import { APP_CONTROL_ACTIONS, parseDisplayControlPatch, parseAssistantSelectionPatch, parseAssistantConnectionPatch, parseProfileSelectionPatch } from '../shared/agent-control-contract.js';
import type { AppControlRecord, DisplayControlPatch, AssistantSelection } from '../shared/agent-control-contract.js';
import { readDisplayPreferences } from './display-preferences.js';
import { state } from './state.js';
import * as assistantSelectionOwner from './assistant-selection.js';

/** Created only by an accepted interactive human turn. Tools can prepare, never commit. */
export function createAppControlSession(userMessage: string, isCurrent: () => boolean, signal: AbortSignal) {
  const authorization = captureChatControlAuthorization();
  const profileId = state.currentProfile, threadId = state.currentThreadId || '', root = state.importedData, history = state.chatHistory;
  const snapshots = new Map<string, ReturnType<typeof readDisplayPreferences>>();
  const assistantSnapshots = new Map<string, { leaseId: string; selection: AssistantSelection }>();
  const connectionSnapshots = new Map<string, { leaseId: string; selection: AssistantSelection }>();
  const profileSnapshots = new Map<string, { leaseId: string; before: import('../shared/agent-control-contract.js').ProfileSelection; proposed: import('../shared/agent-control-contract.js').ProfileSelection }>();
  const records: AppControlRecord[] = [];
  const overlaySnapshots = new Map<string, string>();
  let closed = false;
  const owned = () => authorization.current() && !closed && isCurrent() && state.currentProfile === profileId
    && state.currentThreadId === threadId && state.importedData === root && state.chatHistory === history;
  const current = () => !signal.aborted && owned();
  const assertCurrent = () => { if (!profileId || !threadId || !current()) throw new Error('The originating interactive chat is no longer current. No app setting was changed.'); };
  function readAppState(options: { action: 'display.preferences' }): { action: string; snapshotId: string; values: Omit<ReturnType<typeof readDisplayPreferences>, 'timeFormat'>; scope: string; approval: string; canonicalDataUnchanged: boolean };
  function readAppState(options: { action: string; query?: string; offset?: number; limit?: number; connectionId?: string; profileId?: string; scopeId?: string }): unknown;
  function readAppState({ action, ...options }: { action: string; query?: string; offset?: number; limit?: number; connectionId?: string; profileId?: string; scopeId?: string }): unknown {
    assertCurrent();
    if (!chatAppActionAllowed(action)) throw new Error(CHAT_NATIVE_UI_NOTICE);
    if (options.connectionId && !['assistant.connection', 'assistant.models'].includes(action)) throw new Error('connectionId applies only to assistant.connection or assistant.models.');
    if (options.profileId && action !== 'profile.selection') throw new Error('profileId applies only to a profile.selection snapshot.');
    if (options.scopeId) throw new Error(CHAT_NATIVE_UI_NOTICE);
    if (action === 'conversations.search') return import('./conversation-search.js').then(async owner => { assertCurrent(); const result = await owner.searchPriorConversations(profileId, options, current); assertCurrent(); return result; });
    if (action === 'wearables.sources') return import('./wearable-source-controls.js').then(owner => { assertCurrent(); return owner.readConfiguredWearableSources(profileId, options, current); });

    if (action === 'labs.comparison') return import('./comparison-view-controls.js').then(owner => { assertCurrent(); return owner.readLabComparison(profileId, options); });
    if (action === 'labs.correlations') return import('./correlation-view-controls.js').then(async owner => { assertCurrent(); const result = await owner.readLabCorrelations(profileId, options); assertCurrent(); return result; });
    if (action === 'history.views') return import('./history-view-controls.js').then(owner => { assertCurrent(); return owner.readHistoryViews(profileId, options); });

    if (action === 'labs.overlays') return import('./lab-overlay-controls.js').then(owner => {
      assertCurrent(); const read = owner.readLabOverlayControl(profileId), snapshotId = authorization.createId();
      if (overlaySnapshots.size >= 20) overlaySnapshots.delete(overlaySnapshots.keys().next().value!); overlaySnapshots.set(snapshotId, read.leaseId); return { ...read.result, snapshotId };
    });

    if (action === 'profiles') return import('./profile-selection.js').then(async owner => { const result = await owner.readProfileDirectory(options); assertCurrent(); return result; });
    if (action === 'profile.selection') return import('./profile-selection.js').then(async owner => {
      assertCurrent(); if (!options.profileId) throw new Error('Find an exact profile ID in profiles before reading its selection snapshot.');
      const snapshot = await owner.captureProfileSelection(options.profileId, { userMessage }); assertCurrent(); const snapshotId = authorization.createId();
      if (profileSnapshots.size >= 20) profileSnapshots.delete(profileSnapshots.keys().next().value!); profileSnapshots.set(snapshotId, snapshot);
      return { snapshotId, before: snapshot.before, proposed: snapshot.proposed, approval: 'Apply required after the reply; drafts or unsaved data block the switch.', healthDataRead: false, scope: 'active profile; current chat stays with its origin', afterReload: 'Read again for a fresh profile review' };
    });

    if (action === 'assistant.connections') return import('./assistant-connections.js').then(async module => { const result = await module.readAssistantConnections(signal); assertCurrent(); return result; });
    if (action === 'assistant.models' && options.connectionId) return import('./assistant-connections.js').then(async module => { const result = await module.readConnectionModelCatalog(options.connectionId!, options, signal); assertCurrent(); return result; });
    if (action === 'assistant.connection') return import('./assistant-connections.js').then(async module => {
      assertCurrent(); if (!options.connectionId) throw new Error('List assistant.connections and supply an exact connectionId.');
      const snapshot = await module.captureAssistantConnection(options.connectionId, signal); assertCurrent();
      const snapshotId = authorization.createId(); if (connectionSnapshots.size >= 20) connectionSnapshots.delete(connectionSnapshots.keys().next().value!);
      connectionSnapshots.set(snapshotId, snapshot);
      return { snapshotId, values: snapshot.selection, destination: snapshot.destination, catalog: snapshot.catalog, approval: 'Apply required; native destination activation may also be required. A restored review expires.' };
    });
    if (action === 'assistant.models') return import('./chat-model-control-state.js').then(module => { assertCurrent(); return module.readChatModelCatalogMetadata(options); });
    if (action === 'assistant.selection') return Promise.resolve(assistantSelectionOwner).then(async module => {
      assertCurrent();
      assertCurrent(); const snapshot = module.captureAssistantSelection({ reviewed: true }), snapshotId = authorization.createId();
      if (assistantSnapshots.size >= 20) assistantSnapshots.delete(assistantSnapshots.keys().next().value!);
      assistantSnapshots.set(snapshotId, snapshot);
      const catalog = (await import('./chat-model-control-state.js')).readChatModelCatalogMetadata(options);
      assertCurrent();
      return { snapshotId, values: snapshot.selection, catalog, scope: 'current assistant connection in this browser', approval: 'Apply required after the reply is saved', afterReload: 'Read again for a fresh connection review' };
    });
    if (action !== 'display.preferences') throw new Error('Unsupported app action.');
    const all = readDisplayPreferences(profileId), values = { unitSystem: all.unitSystem, showAltUnits: all.showAltUnits, rangeMode: all.rangeMode }, snapshotId = authorization.createId();
    if (snapshots.size >= 20) snapshots.delete(snapshots.keys().next().value!);
    snapshots.set(snapshotId, all);
    return { action, snapshotId, values, scope: 'active profile', approval: 'Apply required', canonicalDataUnchanged: true };
  }
  return {
    tools: {
      listAppActions: () => { assertCurrent(); return { actions: APP_CONTROL_ACTIONS, approval: 'Review actions require Apply. Reading and preparing never save settings. Explicit native view commands follow their declared command scope and receipt.' }; },
      readAppState,
      prepareAppControl: ({ action, snapshotId, parameters, reason, evidence }: { action: string; snapshotId: string; parameters: string; reason: string; evidence: string }) => {
        assertCurrent();
        if (!chatAppControlAllowed(action, JSON.parse(parameters))) throw new Error(CHAT_NATIVE_UI_NOTICE);
        if (!evidence.trim() || !userMessage.includes(evidence)) throw new Error('Evidence must quote the accepted human message exactly.');
        if (records.length >= MAX_CHAT_APP_REVIEWS) throw new Error('Too many app controls in one reply.');
        if (records.some(record => record.action === 'profile.selection')) throw new Error('Finish the profile switch before requesting another app change in its new context.');
        if (action === 'labs.overlays') return import('./lab-overlay-controls.js').then(owner => {
          assertCurrent(); const leaseId = overlaySnapshots.get(snapshotId); if (!leaseId || records.some(record => record.action === action)) throw new Error('Read fresh labs.overlays and request at most one chart-layer review per reply.');
          const preview = owner.previewLabOverlayControl(leaseId, JSON.parse(parameters));
          const record: AppControlRecord = { version: 1, id: authorization.createId(), profileId, threadId, action, leaseId, ...preview, reason, evidence, status: 'pending' };
          owner.bindLabOverlayControl(record); records.push(record); return { controlId: record.id, status: 'pending_user_approval', before: record.baseline, proposed: record.parameters, saved: false };
        });

        if (action === 'profile.selection') return import('./profile-selection.js').then(owner => {
          assertCurrent(); const snapshot = profileSnapshots.get(snapshotId), patch = parseProfileSelectionPatch(JSON.parse(parameters));
          if (!snapshot || !patch || records.length) throw new Error('Read the exact profile.selection first and request this transition separately from other app controls.');
          const preview = owner.previewProfileSelection(snapshot.leaseId, patch.profileId);
          const record: AppControlRecord = { version: 1, id: authorization.createId(), profileId, threadId, action, parameters: patch, baseline: preview.before, proposed: preview.proposed, leaseId: snapshot.leaseId, reason, evidence, status: 'pending' };
          records.push(record); return { controlId: record.id, status: 'pending_user_approval', before: record.baseline, proposed: record.proposed, saved: false, notice: 'Apply switches after this reply. This conversation stays with its original profile. New target context is loaded natively; no health data is copied.' };
        });

        if (action === 'assistant.connection') return import('./assistant-connections.js').then(module => {
          assertCurrent(); const snapshot = connectionSnapshots.get(snapshotId), patch = parseAssistantConnectionPatch(JSON.parse(parameters));
          if (!snapshot || !patch) throw new Error('Read that exact assistant.connection in this turn before preparing its review.');
          if (records.some(record => record.action === 'assistant.selection' || record.action === 'assistant.connection')) throw new Error('Only one assistant change is allowed per reply.');
          const proposed = module.previewAssistantConnection(snapshot.leaseId, patch);
          const record: AppControlRecord = { version: 1, id: authorization.createId(), profileId, threadId, action, parameters: patch, baseline: snapshot.selection, proposed, leaseId: snapshot.leaseId, reason, evidence, status: 'pending' };
          records.push(record);
          return { controlId: record.id, status: 'pending_user_approval', before: record.baseline, proposed, saved: false, notice: 'Apply changes the next request destination. Any native destination approval remains required. History and earlier message attribution are retained.' };
        });
        if (action === 'assistant.selection') return Promise.resolve(assistantSelectionOwner).then(module => {
          assertCurrent();
          const snapshot = assistantSnapshots.get(snapshotId), patch = parseAssistantSelectionPatch(JSON.parse(parameters));
          if (!snapshot || !patch) throw new Error('Read the current assistant selection and use its declared fields.');
          if (records.some(record => record.action === action || record.action === 'assistant.connection')) throw new Error('Only one assistant change is allowed per reply.');
          const proposed = module.previewAssistantSelection(snapshot.leaseId, patch);
          const record: AppControlRecord = { version: 1, id: authorization.createId(), profileId, threadId, action, parameters: patch, baseline: snapshot.selection, proposed, leaseId: snapshot.leaseId, reason, evidence, status: 'pending' };
          records.push(record);
          return { controlId: record.id, status: 'pending_user_approval', before: record.baseline, proposed, saved: false, notice: 'The next request uses the accepted selection. Existing message provenance and conversation history are retained.' };
        });
        if (action !== 'display.preferences') throw new Error('Unsupported app action.');
        const before = snapshots.get(snapshotId); if (!before) throw new Error('Read the app setting in this turn before preparing a change.');
        const patch = parseDisplayControlPatch(JSON.parse(parameters)); if (!patch) throw new Error('Supply only the declared display fields and exact values.');
        const baseline = Object.fromEntries(Object.keys(patch).map(key => [key, before[key as keyof typeof before]])) as DisplayControlPatch;
        const fresh = readDisplayPreferences(profileId);
        if (Object.entries(baseline).some(([key, value]) => fresh[key as keyof typeof fresh] !== value)) throw new Error('The setting changed. Read a fresh snapshot.');
        if (records.some(item => Object.keys(patch).some(key => Object.hasOwn(item.parameters, key)))) throw new Error('Only one proposed change per display field is allowed in a reply.');
        const record: AppControlRecord = { version: 1, id: authorization.createId(), profileId, threadId, action, parameters: patch, baseline, reason, evidence, status: 'pending' };
        records.push(record);
        return { controlId: record.id, status: 'pending_user_approval', before: baseline, proposed: patch, saved: false };
      },
    },
    hasPreparedReview: () => current() && records.length > 0,
    finish() { if (!authorization.current()) { closed = true; records.length = 0; return []; } if (!profileId || !threadId || !owned()) throw new Error('The originating interactive chat is no longer current.'); closed = true; return structuredClone(records); },
    cancel() { closed = true; records.length = 0; snapshots.clear(); overlaySnapshots.clear(); assistantSnapshots.clear(); connectionSnapshots.clear(); profileSnapshots.clear(); },
  };
}
export type AppControlSession = ReturnType<typeof createAppControlSession>;
