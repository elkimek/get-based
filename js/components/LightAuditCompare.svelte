<script lang="ts">
  import type { LightAuditComparisonView } from '../light-audit-presentation.js';
  import { lightAuditClasses as c } from '../light-audit-classes.js';
  let { view }: { view: LightAuditComparisonView } = $props();
</script>

<div class={c('light-audit-compare-head')}>
  <span class={c('light-audit-compare-label')}>{view.before}</span>
  <span class={c('light-audit-compare-arrow')}>→</span>
  <span class={c('light-audit-compare-label')}>{view.after}</span>
  {#if view.hasAI}
    <button type="button" class={c('import-btn import-btn-secondary light-audit-interpret-btn')}
      data-light-env-action="interpret-audit-compare" data-light-env-old-id={view.oldId} data-light-env-new-id={view.newId}
      title="Open the chat panel with a pre-filled comparison summary so the AI can interpret what changed.">✨ Interpret changes</button>
  {/if}
</div>
{#if view.note}<div class={c('light-audit-compare-note')}>{view.note}</div>{/if}
<div class={c('light-audit-compare-rooms')}>
  {#each view.rooms as room}
    <div class={c(`light-audit-compare-room light-audit-compare-room-${room.verdict}`)}>
      <div class={c('light-audit-compare-room-head')}>
        {#if room.before}<span class={c(`light-env-sev-dot light-env-sev-${room.before.color}`)} title="Before"></span>{:else}<span class={c('light-audit-sev-empty')}></span>{/if}
        <span class={c('light-audit-arrow audit-arrow-neutral')}>→</span>
        {#if room.after}<span class={c(`light-env-sev-dot light-env-sev-${room.after.color}`)} title="After"></span>{:else}<span class={c('light-audit-sev-empty')}></span>{/if}
        <span class={c('light-audit-compare-room-name')}>{room.name}</span>
        <span class={c(`light-audit-compare-verdict light-audit-compare-verdict-${room.verdict}`)}>{room.verdict === 'unchanged' ? 'no change' : room.verdict}</span>
      </div>
      {#if room.rows.length}
        <div class={c('light-audit-compare-channels')}>
          {#each room.rows as row}
            <div class={c('light-audit-compare-channel')}>
              <span class={c('light-audit-compare-channel-label')} title={row.title}>{row.label}</span>
              <span class={c('light-audit-compare-channel-before')}>{row.before}</span>
              <span class={c(`light-audit-arrow audit-arrow-${row.arrow.tone}`)}>{row.arrow.glyph}</span>
              <span class={c('light-audit-compare-channel-after')}>{row.after}</span>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {:else}
    <p class={c('light-audit-empty')}>Both audits have rooms but no measurements taken yet — nothing to compare. Use the Light Tools above to capture readings, then save another audit.</p>
  {/each}
</div>
