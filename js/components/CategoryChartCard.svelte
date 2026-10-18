<script lang="ts">
 import type {CategoryChartCardView} from '../category-presentation.js';
 let {view}:{view:CategoryChartCardView}=$props();
</script><svelte:options preserveWhitespace/><div class="chart-card chart-card-{view.status}" data-marker-detail-action="show-detail-modal" data-marker-detail-id={view.id}>
    <div class="chart-card-header">
      <div class="chart-card-title-block">
        <div class="chart-card-title" title="{view.nameTitle}">
          <span class="chart-card-title-text">{view.name}</span>
          <span class="chart-card-tips-host" id="chart-rec-{view.id}"></span>
        </div>
      </div>
      <div class="chart-card-state"><span class="chart-card-status status-{view.status}">{view.icon}{view.statusLabel}</span>{#if view.trend}<span class="chart-card-trend {view.trend.className}" aria-label="{view.trend.label}" title="{view.trend.title}">{view.trend.arrow}</span>{/if}</div>
    </div>
    <div class="chart-card-main" role="button" tabindex="0" aria-label="{view.accessibleLabel}" data-marker-detail-action="show-detail-modal" data-marker-detail-id={view.id}>
    <div class="chart-card-snapshot{view.stacked ? ' chart-card-snapshot-stacked' : ''}">
      <div>
        <span class="chart-card-snapshot-label">Latest</span>
        <span class="chart-card-latest-measurement">
          <strong class="chart-card-latest-value val-{view.status}">{view.latestValue}</strong>
          {#if view.latestUnit!==null}<span class="chart-card-latest-unit">{view.latestUnit}</span>{/if}
        </span>
        <span class="chart-card-snapshot-meta">{view.latestMetadata}</span>
      </div>
      <div class="chart-card-snapshot-side" aria-label="{view.rangeLabel}">
        {#each view.ranges as row}<div class="chart-card-range-row"><span>{row.label}</span><strong>{row.value}{#if row.unit!==null}<span class="chart-card-range-unit"> {row.unit}</span>{/if}</strong></div>{/each}
      </div>
    </div>
    <div class="chart-container"><canvas id="chart-{view.id}" aria-hidden="true"></canvas></div>
    <div class="chart-values" role="list" aria-label="Recent results" style="--chart-value-count:{view.recentCount}">
      <span class="chart-values-label" aria-hidden="true">Recent results</span>{#each view.recent as item}<div class="chart-value-item" role="listitem"><div class="chart-value-date" title="{item.title}">{item.date}</div>
      <div class="chart-value-num val-{item.status}">{item.value}</div></div>{/each}</div></div></div>
