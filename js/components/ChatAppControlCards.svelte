<script lang="ts">
  import { chatAppControlAllowed, CHAT_NATIVE_UI_NOTICE } from '../../shared/chat-control-policy.js';
  import type { AppControlRecord } from '../../shared/agent-control-contract.js';
  import { DRAFT_CONTROL } from '../chat-message-actions-classes.js';
  import { CONTEXT_PREFERENCE_SOURCES } from '../../shared/context-preference-contract.js';
  import { LAB_OVERLAY_LABELS } from '../../shared/lab-overlay-contract.js';
  let { controls, index }: { controls: AppControlRecord[]; index: number } = $props();
  const labels = { unitSystem: 'Unit system', showAltUnits: 'Alternate units', rangeMode: 'Ranges', timeFormat: 'Clock format' };
  const value = (field: string, input: unknown) => field === 'unitSystem' && input === 'EU' ? 'International (SI)' : field === 'unitSystem' && input === 'ANZ' ? 'Australia / NZ' : typeof input === 'boolean' ? input ? 'On' : 'Off' : String(input);
  function rows(control: AppControlRecord) {
    if (control.action === 'display.preferences') return Object.entries(control.parameters).map(([field, next]) => ({ label: labels[field as keyof typeof labels], before: value(field, control.baseline[field as keyof typeof labels]), next: value(field, next) }));
    if (control.action === 'assistant.preferences') return Object.entries(control.parameters).map(([field, next]) => ({ label: field === 'paused' ? 'AI features paused' : 'App web search', before: value(field, control.baseline[field as keyof typeof control.baseline]), next: value(field, next) }));
    if (control.action === 'labs.overlays') return Object.entries(control.parameters).map(([field, next]) => ({ label: LAB_OVERLAY_LABELS[field as keyof typeof LAB_OVERLAY_LABELS], before: value(field, control.baseline[field as keyof typeof LAB_OVERLAY_LABELS]), next: value(field, next) }));
    if (control.action === 'context.preferences') return [
      ...Object.entries(control.parameters.sources || {}).map(([id, next]) => ({ label: CONTEXT_PREFERENCE_SOURCES[id as keyof typeof CONTEXT_PREFERENCE_SOURCES], before: value(id, control.baseline.sources?.[id as keyof typeof CONTEXT_PREFERENCE_SOURCES]), next: value(id, next) })),
      ...Object.entries(control.parameters.groups || {}).map(([id, next]) => ({ label: `Lab group: ${id.slice('lab-group-'.length)}`, before: value(id, control.baseline.groups?.[id]), next: value(id, next) })),
      ...(control.parameters.nutritionDays === undefined ? [] : [{ label: 'Nutrition automatic timeframe', before: `${control.baseline.nutritionDays} days`, next: `${control.parameters.nutritionDays} days` }]),
      ...(control.parameters.wearableSeriesDays === undefined ? [] : [{ label: 'Optional wearable daily series', before: control.baseline.wearableSeriesDays ? `${control.baseline.wearableSeriesDays} days` : 'Off', next: control.parameters.wearableSeriesDays ? `${control.parameters.wearableSeriesDays} days` : 'Off' }]),
    ];
    if (control.action === 'labs.ordering') return [];
    if (control.action === 'profile.selection') return [{ label: 'Profile', before: control.baseline.name, next: control.proposed.name }];
    if (control.action === 'assistant.persona') return [{ label: 'Persona', before: control.baseline.name, next: control.proposed.name }];
    return [
      ...(control.action === 'assistant.connection' ? [{ label: 'Connection', before: `${control.baseline.provider}${control.baseline.target ? ` · ${control.baseline.target}` : ''}`, next: `${control.proposed.provider}${control.proposed.target ? ` · ${control.proposed.target}` : ''}` }] : []),
      { label: 'Model', before: control.baseline.model || 'CLI default', next: control.proposed.model || 'CLI default' },
      { label: 'Reasoning effort', before: control.baseline.effort || 'Default', next: control.proposed.effort || 'Default' },
    ];
  }
</script>
{#each controls as control}
  <section class="chat-app-control gb:message-actions:mt-3 gb:message-actions:p-3 gb:message-actions:border gb:message-actions:rounded-[10px]" aria-label="App control review">
    <strong>{control.action === 'assistant.persona' ? 'Chat persona' : control.action === 'labs.overlays' ? 'Chart layers' : control.action === 'context.preferences' ? 'Assistant context sources' : control.action === 'profile.selection' ? 'Active profile' : control.action === 'labs.ordering' ? 'Lab presentation order' : control.action === 'display.preferences' ? 'Display preferences' : control.action === 'assistant.preferences' ? 'AI and web-search preferences' : control.action === 'assistant.connection' ? 'Assistant connection' : 'Assistant model and reasoning'}</strong>
    {#each rows(control) as row}
      <p>{row.label}: {row.before} → {row.next}</p>
    {/each}
    {#if !chatAppControlAllowed(control.action, control.parameters)}
      <p>Historical app control. This change is managed in the native UI.</p>
    {:else if control.action === 'display.preferences'}
      <p>{Object.hasOwn(control.parameters, 'timeFormat') ? 'Time format applies throughout this browser. Other display preferences apply to this profile.' : 'Applies to this profile.'} Canonical measurements stay unchanged.</p>
    {:else if control.action === 'labs.overlays'}
      <p>Saved chart layers for this profile. Layers appear when matching records exist; cycle phase at blood draw also requires a female profile and recorded period or draw-phase context. Health records and AI source permissions stay unchanged. Undo checks these switches have not changed since Apply.</p>
    {:else if control.action === 'profile.selection'}
      <p>Apply switches the active profile after this reply. This conversation stays with {control.baseline.name}; the destination loads its own permitted context. Health data is preserved. Send or clear unsent input and finish open editors first.</p>
      <p>Destination profile ID: {control.proposed.id}</p>
    {:else if control.action === 'assistant.connection' || control.action === 'assistant.selection'}
      <p>Connection: {control.baseline.provider}{control.baseline.target ? ` · ${control.baseline.target}` : ''}. The next request uses the accepted selection. Conversation history and earlier message attribution stay unchanged.{control.action === 'assistant.connection' ? ' Any native destination approval is also required before saving.' : ''}</p>
    {/if}
    <p>{control.reason}</p>
    <p>Requested: {control.evidence}</p>
    {#if control.action === 'assistant.persona'}
      <p role="status">Persona management is manual-only. This historical request cannot apply or undo changes.</p>
    {:else if !chatAppControlAllowed(control.action, control.parameters)}
      <p role="status">{CHAT_NATIVE_UI_NOTICE}</p>
    {:else if control.status === 'pending'}
      <button type="button" class={DRAFT_CONTROL} data-chat-message-action="apply-app-control" data-chat-message-index={index} data-chat-control-id={control.id}>Apply</button>
      <button type="button" class={DRAFT_CONTROL} data-chat-message-action="discard-app-control" data-chat-message-index={index} data-chat-control-id={control.id}>Discard</button>
    {:else if control.status === 'changed'}
      <p role="status">{control.action === 'labs.overlays' ? 'Chart layers saved' : control.action === 'profile.selection' ? 'Profile switch completed' : control.action === 'display.preferences' ? 'Display preference saved' : 'Assistant selection saved'}</p>
      {#if control.undoAvailable}<button type="button" class={DRAFT_CONTROL} data-chat-message-action="undo-app-control" data-chat-message-index={index} data-chat-control-id={control.id}>Undo</button>
      {:else}<p>{control.action === 'labs.overlays' ? 'Undo unavailable. Check the native Layers menu and request a fresh review for further changes.' : control.action === 'profile.selection' ? 'This conversation was kept with its original profile. Request a fresh profile review to switch again.' : control.action === 'display.preferences' ? 'Undo receipt unavailable. Use Display settings for further changes.' : 'Request a fresh review to change this assistant selection again.'}</p>{/if}
    {:else}
      <p role="status">{control.status === 'applying' ? 'Change in progress' : control.status === 'undone' ? control.action === 'labs.overlays' ? 'Previous chart layers restored' : control.action === 'display.preferences' ? 'Previous display preference restored' : 'Previous assistant selection restored' : control.status === 'discarded' ? 'Discarded' : control.status === 'expired' ? control.action === 'labs.overlays' ? 'Chart-layer review expired — read the switches and request a fresh review.' : control.action === 'profile.selection' ? 'Profile review expired — read profiles and request a fresh review.' : 'Connection review expired — read the current connection and request a fresh review.' : control.status === 'conflict' ? 'Nothing was applied. Check current settings and request a fresh review.' : control.action === 'labs.overlays' ? 'Outcome unconfirmed — check the native Layers menu before trying again.' : control.action === 'profile.selection' ? 'Outcome unconfirmed — check the native profile picker before trying again.' : control.action === 'display.preferences' ? 'Outcome unconfirmed — check Display settings before trying again.' : 'Outcome unconfirmed — check native AI settings before trying again.'}</p>
    {/if}
  </section>
{/each}
