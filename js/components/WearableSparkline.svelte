<script lang="ts">
 import type {WearableSparklineView} from '../wearable-strip-sparkline-presentation.js';
 let {view}:{view:WearableSparklineView}=$props();
</script><svelte:options preserveWhitespace={true}/><svg class="wearable-sparkline {view.toneClass}" viewBox="0 0 {view.width} {view.height}" preserveAspectRatio="none" aria-hidden="true">
    <line x1="0" y1={view.baselineStartY} x2={view.baselineWidth} y2={view.baselineEndY} class="spark-baseline"/>
    <polyline points={view.points} class="spark-line"/>
    <circle cx={view.lastX} cy={view.lastY} r="2" class="spark-last"/>
  </svg>