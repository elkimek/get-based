<script lang="ts">
  import type { SummaryPresentationProps } from '../chat-summary-presentation.js';
  import Saved from './ChatSavedSummaries.svelte';
  import Dialog from './ChatSummaryDialog.svelte';
  import Print from './ChatSummaryPrint.svelte';
  let props: SummaryPresentationProps = $props();
</script>
{#if props.kind === 'list'}<Saved rows={props.rows}/>
{:else if props.kind === 'dialog'}<Dialog view={props.view}/>
{:else}<Print view={props.view}/>{/if}
