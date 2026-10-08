<script lang="ts">
  import type { WalkthroughStatus } from '../light-tools-presentation.js';
  import { lightToolClasses as c } from '../light-tools-classes.js';
  let { state }: { state: WalkthroughStatus } = $props();
</script>
{#if state === 'no-context'}Camera processing is unavailable in this browser.
{:else if state === 'denied'}Camera access denied — audit unavailable. <br/><span data-light-tool-view class={c('tool-note')}>The walkthrough captures 4 frames per second to detect when you've paused in a new room. Open your browser's site settings to allow camera access, or log rooms manually from the Light Environment section.</span>
{:else}Recording… <span data-light-tool-view class={c(`tool-note${state === 'auto' ? ' tool-warning' : ''}`)}>{#if state === 'auto'}⚠ camera auto-exposure is on — room levels are rough comparisons only.{:else}Exposure is held so rooms can be compared. The walkthrough saves relative brightness—not lux.{/if}</span>{/if}
