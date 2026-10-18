<script lang="ts">
 let {kind,dates}:{kind:'data'|'heatmap';dates:readonly string[]}=$props();
</script><svelte:options preserveWhitespace/><tr><th>Biomarker</th>{#if kind==='data'}<th>Unit</th><th>Reference</th>{/if}{#each dates as label}<th>{label}</th>{/each}{#if kind==='data'}<th>Trend</th><th>Range</th>{/if}</tr>
