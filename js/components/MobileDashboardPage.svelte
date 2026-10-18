<script lang="ts">
 import type {MobileDashboardPageView} from '../mobile-dashboard-presentation.js';
 import MobileDashboardWidgetStack from './MobileDashboardWidgetStack.svelte';
 import MobileBottomNavigation from './MobileBottomNavigation.svelte';
 import LabDateRange from './LabDateRange.svelte';
 let {view}:{view:MobileDashboardPageView}=$props();
</script><svelte:options preserveWhitespace/><div class="drop-zone drop-zone-hidden" id="drop-zone"></div>
    <div class="m-shell">
      <div class="m-bg" aria-hidden="true"></div>
      <div class="m-content">
        <section class="m-greeting">
          <h1>Hey {view.firstName}.</h1>
          <div class="m-greeting-sub">{view.greetingSub}</div>
        </section>

        {#if view.range}<LabDateRange view={view.range}/>{/if}
        <MobileDashboardWidgetStack view={view.stack}/>
      </div>
    </div>
    <MobileBottomNavigation view={{activeTab:'dashboard',id:null}}/>
