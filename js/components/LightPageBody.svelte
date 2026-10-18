<script lang="ts">
  import type { LightPageBodyProps } from '../light-page-presentation.js';
  import LightSessionRow from './LightSessionRow.svelte';
  import LightActiveSession from './LightActiveSession.svelte';
  import LightReviewAI from './LightReviewAI.svelte';
  import LightChannelSection from './LightChannelSection.svelte';
  import LightLocationHint from './LightLocationHint.svelte';
  import LightDashboardPills from './LightDashboardPills.svelte';
  import LightSessionActions from './LightSessionActions.svelte';
  import LightWidgetPrompt from './LightWidgetPrompt.svelte';
  import LightUVSafety from './LightUVSafety.svelte';
  import LightTodayStrip from './LightTodayStrip.svelte';
  import LightMethods from './LightMethods.svelte';
  let props: LightPageBodyProps = $props();
</script>
{#if props.kind === 'pills'}<LightDashboardPills pills={props.pills}/>
{:else if props.kind === 'actions'}<LightSessionActions view={props.view}/>
{:else if props.kind === 'prompt'}<LightWidgetPrompt view={props.view}/>
{:else if props.kind === 'safety'}<LightUVSafety view={props.view}/>
{:else if props.kind === 'methods'}<LightMethods skinBasis={props.skinBasis} dataSource={props.dataSource}/>
{:else if props.kind === 'today'}<LightTodayStrip view={props.view} dashboard={props.dashboard} conditions={props.conditions} pills={props.pills}/>
{:else if props.kind === 'live'}
  {#if props.sun}<div class="light-active-session-pinned gb:light-page:m-0" aria-label="Active sun session" data-light-page-presentation>{#if props.sunView}{#if props.sunView.kind === 'active'}<LightActiveSession view={props.sunView.view}/>{:else}<LightSessionRow view={props.sunView.view}/>{/if}{/if}</div>{/if}{#if props.deviceView}<div class="light-active-session-pinned gb:light-page:m-0" aria-label="Active device session" data-light-page-presentation><LightActiveSession view={props.deviceView.view}/></div>{/if}
{:else if props.kind === 'location'}<LightLocationHint view={props}/>
{:else if props.kind === 'loading'}<div id={props.id} class="light-widget-loading gb:light-page:text-secondary gb:light-page:text-xs gb:light-page:py-2" data-light-page-presentation role="status">{props.label}</div>
{:else if props.kind === 'channels' || props.kind === 'dashboard-channels'}<LightChannelSection view={props}/>
{:else if props.kind === 'weekly'}{#if props.review}<LightReviewAI view={props.review}/>{/if}<p class="light-weekly-disclaimer gb:light-page:m-0 gb:light-page:text-[11.5px] gb:light-page:text-secondary gb:light-page:leading-normal" data-light-page-presentation>Wellness interpretation, not medical advice. This review uses logged sessions and may miss unrecorded exposure; it does not measure vitamin-D status or a personal safe UV limit.</p>

{/if}
