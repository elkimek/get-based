<script lang="ts">
  import type {AimingGuideView} from '../light-camera-presentation.js';
  import {cameraToolClasses as c} from '../light-camera-classes.js';
  let {view}: {view: AimingGuideView | null} = $props();
</script>
{#if view}
  <div data-light-tool-view class={c('tool-aiming-guide')} data-tool={view.key}>
    <div class={c('tool-aiming-guide-head')}>
      <span class={c('tool-aiming-guide-icon')}>📐</span>
      <span class={c('tool-aiming-guide-mode')}>{view.mode}</span>
      <button type="button" class={c('tool-aiming-guide-dismiss camera-control')} data-aiming-guide-action="dismiss" data-tool={view.key} aria-label="Dismiss aiming guide">×</button>
    </div>
    <div class={c('tool-aiming-guide-body')}>{view.before}<b>{view.emphasis}</b>{view.after}</div>
    {#if view.webcam}<div class={c('tool-aiming-guide-webcam')}>{view.webcam}</div>{/if}
  </div>
{/if}
