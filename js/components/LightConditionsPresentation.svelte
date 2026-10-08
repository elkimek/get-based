<script lang="ts">
  import type { ConditionsPresentationProps } from '../light-conditions-presentation.js';
  import { conditionsClasses as c } from '../light-conditions-classes.js';
  import LightConditionsContent from './LightConditionsContent.svelte';
  import LightConditionsSlot from './LightConditionsSlot.svelte';
  import LightConditionsInspection from './LightConditionsInspection.svelte';
  let props: ConditionsPresentationProps = $props();
</script>
{#if props.kind === 'conditions'}<LightConditionsContent view={props.view}/>
{:else if props.kind === 'slot'}<LightConditionsSlot slot={props.slot}/>
{:else if props.kind === 'inspect'}<LightConditionsInspection view={props.view}/>
{:else if props.kind === 'message'}<div class={c('conditions-now-msg')} data-light-conditions-presentation>{props.message}{#if props.error} <small>({props.error})</small>{/if}</div>
{:else if props.kind === 'widget'}
  <div class={c('light-conditions-now-wrap')} data-light-conditions-presentation>
    <div class={c('light-conditions-now-head')}>
      <span class={c('light-conditions-now-title')}>Conditions now</span>
      <span class={c('light-conditions-now-actions')}>
        <button type="button" class={c('conditions-now-refresh light-widget-mini-btn')} data-light-conditions-action="refresh" aria-label="Refresh conditions data — bypasses cache" data-conditions-tooltip="Force a fresh fetch, bypassing the short cache">Refresh</button>
        <button type="button" class={c('conditions-now-inspect light-widget-mini-btn')} data-light-conditions-action="inspect" aria-label="Show raw conditions response, source, cache, and sanity check" data-conditions-tooltip="See raw response, source, cache age, and sanity checks">Details</button>
      </span>
    </div>
    {#if !props.hasLocation}
      <div class={c('conditions-now-location-setup')}>
        <span>To see local conditions, set your country in the profile editor or use your phone location for this session.</span>
        <button type="button" class="dashboard-action-btn dashboard-action-btn-primary gb:conditions:shrink-0 gb:conditions:max-[600px]:w-full gb:conditions:max-[600px]:justify-center" data-light-page-action="request-precise-location">Use phone location</button>
      </div>
    {/if}
    <LightConditionsSlot slot={props.slot}/>
  </div>
{/if}
