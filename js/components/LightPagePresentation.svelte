<script lang="ts">
  import type { LightPagePresentationProps } from '../light-page-presentation.js';
  import LightChannelSection from './LightChannelSection.svelte';
  import LightLocationHint from './LightLocationHint.svelte';
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
{:else if props.kind === 'location'}<LightLocationHint view={props}/>
{:else if props.kind === 'loading'}<div id={props.id} class="light-widget-loading gb:light-page:text-secondary gb:light-page:text-xs gb:light-page:py-2" data-light-page-presentation role="status">{props.label}</div>
{:else if props.kind === 'channels' || props.kind === 'dashboard-channels'}<LightChannelSection view={props}/>
{:else if props.kind === 'weekly'}{@html props.reviewHTML}<p class="light-weekly-disclaimer gb:light-page:m-0 gb:light-page:text-xs gb:light-page:text-secondary gb:light-page:leading-normal" data-light-page-presentation>Wellness interpretation, not medical advice. This review uses logged sessions and may miss unrecorded exposure; it does not measure vitamin-D status or a personal safe UV limit.</p>
{:else if props.kind === 'page'}<div class="light-page gb:light-page:w-full gb:light-page:max-w-none gb:light-page:grid gb:light-page:grid-cols-[minmax(0,1fr)] gb:light-page:gap-4 gb:light-page:min-w-0 gb:light-page:[&>*]:min-w-0 gb:light-page:[&>*]:max-w-full gb:light-page:[&>.category-header]:mb-0 gb:light-page:max-[720px]:pb-[88px]" data-light-page-presentation>{@html props.headerHTML}{@html props.widgetsHTML}</div>
{/if}
