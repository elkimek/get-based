<script lang="ts">
  import DashboardGreeting from './DashboardGreeting.svelte';
  import LabDateRange from './LabDateRange.svelte';
  import DashboardOnboarding from './DashboardOnboarding.svelte';
  import DashboardActionBar from './DashboardActionBar.svelte';
  import DashboardWidgetFrame from './DashboardWidgetFrame.svelte';
  import DashboardWelcome from './DashboardWelcome.svelte';
  import type {DesktopDashboardPageView} from '../desktop-dashboard-presentation.js';
  let {view}: {view: DesktopDashboardPageView} = $props();
</script>
<DashboardGreeting view={view.greeting} />
{#if view.dateRange}<LabDateRange view={view.dateRange} />{/if}
<div class="drop-zone drop-zone-hidden" id="drop-zone"></div>
{#if view.onboarding}<DashboardOnboarding view={view.onboarding} />{/if}
{#if view.reminder}<DashboardOnboarding view={view.reminder} />{/if}
<DashboardActionBar view={view.stickyControls} sticky />
<div class={`dashboard-widgets${view.organizing ? ' is-organizing' : ''}`}>
  {#each view.widgets as widget}{#if widget}<DashboardWidgetFrame view={widget} />{/if}{/each}
  {#if view.empty}<DashboardWelcome view={view.empty} />{/if}
</div>
{#if view.footerControls}<div class="dashboard-organize-footer"><DashboardActionBar view={view.footerControls} /></div>{/if}
