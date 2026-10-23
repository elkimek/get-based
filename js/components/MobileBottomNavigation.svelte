<script lang="ts">
  import MobileNavigationIcon from './MobileNavigationIcon.svelte';
  import type {MobileNavigationView} from '../mobile-navigation-presentation.js';
  let {view}: {view: MobileNavigationView} = $props();
  const tabs = [
    {route: 'dashboard', label: 'Home', icon: 'labs'},
    {route: 'labs', label: 'Labs', icon: 'labs'},
    {route: 'body', label: 'Biometrics', icon: 'body'},
    {route: 'nutrition', label: 'Nutrition', icon: 'nutrition'},
    {route: 'supplements', label: 'Supplements & Medication', icon: 'supplements'},
    {route: 'light', label: 'Light', icon: 'light'},
    {route: 'insight', label: 'Insight', icon: 'insight'},
  ] as const;
</script>
<nav id={view.id ?? undefined} class="m-tabbar" aria-label="Mobile primary navigation">
  {#each tabs as tab}
    <button type="button" class={`m-tab${view.activeTab === tab.route ? ' active' : ''}`} data-tab={tab.route} aria-current={view.activeTab === tab.route ? 'page' : 'false'} data-mobile-dashboard-action="navigate-tab" data-mobile-dashboard-tab={tab.route} data-mobile-dashboard-route={tab.route} aria-label={tab.label}>
      <span class="m-tab-icon"><MobileNavigationIcon kind={tab.icon} /></span><small>{tab.route === 'supplements' ? 'Supplements' : tab.label}</small>
    </button>
  {/each}
</nav>
