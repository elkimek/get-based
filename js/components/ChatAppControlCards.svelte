<script lang="ts">
  import { CHAT_NATIVE_UI_NOTICE } from '../../shared/chat-control-policy.js';
  import type { AppControlRecord } from '../../shared/agent-control-contract.js';
  import { CONTEXT_PREFERENCE_SOURCES } from '../../shared/context-preference-contract.js';
  import { LAB_OVERLAY_LABELS } from '../../shared/lab-overlay-contract.js';
  let { controls }: { controls: AppControlRecord[]; index?: number } = $props();
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
    <p>{control.reason}</p>
    <p>Requested: {control.evidence}</p>
    <p role="status">Previous app-management request. {CHAT_NATIVE_UI_NOTICE}</p>
  </section>
{/each}
