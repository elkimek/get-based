<script lang="ts">
  import type { Snippet } from 'svelte';
  import { lightToolClasses as c } from '../light-tools-classes.js';
  let { title, label = title, suffix, closeId, closeAction, cameraCloseAction, children }: { title: string; label?: string; suffix?: string; cameraCloseAction?: string; closeId?: string; closeAction?: string; children: Snippet } = $props();
</script>
<div data-light-tool-view class={c('modal light-tool-modal')} role="dialog" aria-label={label}>
  <div class="modal-header">
    <h3>{title}{#if suffix}{' '}<span class={c('tool-suffix')}>— {suffix}</span>{/if}</h3>
    <button type="button" class={c('modal-close tool-control')} id={closeId} data-light-tools-action={closeAction} data-light-tool-modal-action={cameraCloseAction} aria-label="Close">×</button>
  </div>
  <div class="modal-body">{@render children()}</div>
</div>
