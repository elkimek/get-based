<script lang="ts">
 import type {DashboardInsightCardView} from '../../types/dashboard-insights-view.js';
 let {view}:{view:DashboardInsightCardView}=$props();
</script><svelte:options preserveWhitespace={true}/><button type="button" class={'db-insight db-insight-'+view.tone} data-dashboard-widget-action={view.detail?'open-marker-detail':undefined} data-dashboard-widget-id={view.detail?view.id??undefined:undefined}>
        <span class="db-insight-tag">{view.eyebrow}</span>
        <strong>{view.title}</strong>
        <span>{view.body}</span>
      </button>