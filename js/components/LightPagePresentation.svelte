<script lang="ts">
  import type { LightPagePresentationProps } from '../light-page-presentation.js';
  import LightDashboardPills from './LightDashboardPills.svelte';
  import LightSessionActions from './LightSessionActions.svelte';
  import LightWidgetPrompt from './LightWidgetPrompt.svelte';
  import LightUVSafety from './LightUVSafety.svelte';
  import LightTodayStrip from './LightTodayStrip.svelte';
  import LightMethods from './LightMethods.svelte';
  let props: LightPagePresentationProps = $props();
</script>
{#if props.kind === 'pills'}<LightDashboardPills pills={props.pills}/>
{:else if props.kind === 'actions'}<LightSessionActions view={props.view}/>
{:else if props.kind === 'prompt'}<LightWidgetPrompt view={props.view}/>
{:else if props.kind === 'safety'}<LightUVSafety view={props.view}/>
{:else if props.kind === 'methods'}<LightMethods skinBasis={props.skinBasis} dataSourceHTML={props.dataSourceHTML} showDataSource={props.showDataSource}/>
{:else if props.kind === 'today'}<LightTodayStrip view={props.view} dashboardHTML={props.dashboardHTML} conditionsHTML={props.conditionsHTML} pillsHTML={props.pillsHTML}/>
{:else if props.kind === 'live'}
  {#if props.sun}<div class="light-active-session-pinned gb:light-page:m-0" aria-label="Active sun session" data-light-page-presentation>{@html props.sunHTML}</div>{/if}{#if props.device}<div class="light-active-session-pinned gb:light-page:m-0" aria-label="Active device session" data-light-page-presentation>{@html props.deviceHTML}</div>{/if}
{:else if props.kind === 'location'}
  <p class="light-intro-hint gb:light-page:text-xs gb:light-page:text-secondary gb:light-page:leading-normal" data-light-page-presentation>
    {#if props.country}Calculations use your country (~{props.latitude}° lat). Add a postal code in Profile, or <button type="button" class="gb:light-page:inline gb:light-page:cursor-pointer gb:light-page:border-0 gb:light-page:bg-transparent gb:light-page:p-0 gb:light-page:font-body gb:light-page:min-h-[45px] gb:light-page:min-w-[45px] gb:light-page:focus-visible:outline-2 gb:light-page:focus-visible:outline-accent gb:light-page:text-inherit gb:light-page:text-ink gb:light-page:underline gb:light-page:decoration-accent gb:light-page:underline-offset-2" data-light-page-action="request-precise-location">use current location today</button> for local conditions.
    {:else}Tip: set your home country in Profile, or <button type="button" class="gb:light-page:inline gb:light-page:cursor-pointer gb:light-page:border-0 gb:light-page:bg-transparent gb:light-page:p-0 gb:light-page:font-body gb:light-page:min-h-[45px] gb:light-page:min-w-[45px] gb:light-page:focus-visible:outline-2 gb:light-page:focus-visible:outline-accent gb:light-page:text-inherit gb:light-page:text-ink gb:light-page:underline gb:light-page:decoration-accent gb:light-page:underline-offset-2" data-light-page-action="request-precise-location">use your current location today</button>. Device coordinates are privacy-rounded and temporary.{/if}
  </p>
{:else if props.kind === 'loading'}<div id={props.id} class="light-widget-loading gb:light-page:text-secondary gb:light-page:text-xs gb:light-page:py-2" data-light-page-presentation role="status">{props.label}</div>
{:else if props.kind === 'channels'}<div class="light-channels-section" data-light-page-presentation><p class="light-section-hint gb:light-page:text-xs gb:light-page:text-secondary">{props.lead}</p>{@html props.channelHTML}{@html props.locationHTML}</div>
{:else if props.kind === 'weekly'}{@html props.reviewHTML}<p class="light-weekly-disclaimer gb:light-page:text-xs gb:light-page:text-secondary gb:light-page:leading-normal" data-light-page-presentation>Wellness interpretation, not medical advice. This review uses logged sessions and may miss unrecorded exposure; it does not measure vitamin-D status or a personal safe UV limit.</p>
{:else if props.kind === 'page'}<div class="light-page gb:light-page:w-full gb:light-page:max-w-none gb:light-page:grid gb:light-page:grid-cols-[minmax(0,1fr)] gb:light-page:gap-4 gb:light-page:min-w-0 gb:light-page:[&>*]:min-w-0 gb:light-page:[&>*]:max-w-full gb:light-page:[&>.category-header]:mb-0 gb:light-page:max-[720px]:pb-[88px]" data-light-page-presentation>{@html props.headerHTML}{@html props.widgetsHTML}</div>
{/if}
