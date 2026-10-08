<script lang="ts">
  import type { Snippet } from 'svelte';
  import { lightToolClasses as c } from '../light-tools-classes.js';
  let { title, suffix, closeId, closeAction, children }: { title: string; suffix: string; closeId?: string; closeAction?: string; children: Snippet } = $props();
</script>
<div data-light-tool-view class={c('modal light-tool-modal')} role="dialog" aria-label={title}>
  <div class="modal-header">
    <h3>{title} <span class={c('tool-suffix')}>— {suffix}</span></h3>
    <button type="button" class={c('modal-close tool-control')} id={closeId} data-light-tools-action={closeAction} aria-label="Close">×</button>
  </div>
  <div class="modal-body">{@render children()}</div>
</div>
