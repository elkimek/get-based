<script lang="ts">
  import type {DashboardMiniSparkView} from '../../types/dashboard-owned-widgets.js';
  let {view}: {view: DashboardMiniSparkView} = $props();
</script><svelte:options preserveWhitespace />{#if view.kind === 'empty'}<span class="db-spark db-spark-empty" aria-hidden="true"></span>{:else}<svg class={'db-spark db-spark-' + view.status} viewBox={'0 0 ' + view.width + ' ' + view.height} preserveAspectRatio="none" aria-hidden="true">
      <polyline points={view.points}></polyline>
      <circle cx={view.cx} cy={view.cy} r="2.5"></circle>
    </svg>{/if}
