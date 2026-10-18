<script lang="ts">
  import LightEnvironmentAI from './LightEnvironmentAI.svelte';
  import type { LightAuditDetailView } from '../light-audit-presentation.js';
  import { lightAuditClasses as c } from '../light-audit-classes.js';
  let { view, actionId }: { view: LightAuditDetailView; actionId: string | undefined } = $props();
</script>

<div class={c('light-audit-detail')}>
  <div class={c('light-audit-meta-row')}>
    <label class={c('light-audit-meta-field light-audit-meta-field--date')}>
      <span class={c('light-audit-meta-field-text')}>Date</span>
      <input type="date" class={c('ctx-input')} value={view.date} aria-label="Audit date"
        data-light-env-action="update-audit-field" data-light-env-id={actionId} data-light-env-field="date"/>
    </label>
    <label class={c('light-audit-meta-field light-audit-meta-field--label')}>
      <span class={c('light-audit-meta-field-text')}>Label</span>
      <input type="text" class={c('ctx-input')} value={view.label} placeholder="e.g. Pre-mitigation" aria-label="Audit label"
        data-light-env-action="update-audit-field" data-light-env-id={actionId} data-light-env-field="label"/>
    </label>
  </div>
  <!-- The AI service retains request, provenance and persistence ownership. -->
  {#if view.ai}<LightEnvironmentAI view={view.ai}/>{/if}
  {#if !view.rooms.length}
    <p class={c('light-audit-empty')}>No rooms in this audit's snapshot.</p>
  {:else}
    <div class={c('light-audit-rooms')}>
      {#each view.rooms as room}
        <div class={c('light-audit-room-card')}>
          <div class={c('light-audit-room-head')}>
            <span class={c(`light-env-sev-dot light-env-sev-${room.severity.color}`)}></span>
            <span class={c('light-audit-room-name')}>{room.name}</span>
            <span class={c(`light-audit-room-status light-audit-room-status-${room.severity.color}`)}>{room.severity.label}</span>
          </div>
          {#if !room.channels.length}
            <p class={c('light-audit-room-empty')}>No measurements taken in this room before the snapshot.</p>
          {:else}
            <div class={c('light-audit-room-channels')}>
              {#each room.channels as channel}
                <div class={c('light-audit-channel')}>
                  <span class={c('light-audit-channel-label')}>{channel.label}</span>{' '}
                  <span class={c('light-audit-channel-value')}>{channel.text}</span>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
  <div class={c('light-audit-footer')}>
    <button type="button" class={c('import-btn import-btn-secondary audit-delete-button')}
      data-light-env-action="delete-audit-confirm" data-light-env-id={actionId}>Delete audit</button>
  </div>
</div>
