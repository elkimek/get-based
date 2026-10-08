<script lang="ts">
  import type { ConditionsView } from '../light-conditions-presentation.js';
  import { conditionsClasses as c } from '../light-conditions-classes.js';
  let { view: v }: { view: ConditionsView } = $props();
</script>
{#if v.rail.length}
  <div class={c('conditions-now-events-wrap')} data-conditions-tooltip={v.timelineTip} data-light-conditions-presentation>
    <div class={c('conditions-now-events-caption')}>Today's sun timeline <span class={c('conditions-now-events-scroll-hint')} aria-hidden="true">scroll ↔</span></div>
    <!-- The named timeline viewport must remain keyboard-scrollable on narrow screens. -->
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <div class={c('conditions-now-events')} role="region" aria-label="Scrollable sun timeline" tabindex="0">
      <div class={c('conditions-now-events-rail')} role="list" aria-label="Today's sun timeline" style={`--conditions-event-count: ${v.rail.length};`}>
        <span class={c('conditions-now-events-track')} aria-hidden="true"></span>
        {#each v.rail as event}
          <span role="listitem" class={c(`conditions-now-event${event.peak ? ' conditions-now-event-peak' : ''}${event.uvaEvent ? ' conditions-now-event-uva' : ''}${event.isNow ? ' conditions-now-event-now' : ''}${event.past ? ' conditions-now-event-past' : ''}`)} style={`grid-column: ${event.column};`} data-conditions-tooltip={event.tooltip} aria-label={event.ariaLabel}>
            <span class={c('conditions-now-event-dot')}><span class={c('conditions-now-event-icon')}>{event.icon}</span></span><span class={c('conditions-now-event-copy')}><span class={c('conditions-now-event-label')}>{event.heading}</span><span class={c('conditions-now-event-time')}>{event.time}</span></span>
          </span>
        {/each}
      </div>
    </div>
  </div>
{/if}
