<script lang="ts">
 import type {TherapyComparisonGroupView,TherapyComparisonMeasurementView,TherapyComparisonPeriodView} from '../therapy-comparison-presentation.js';
 type View={readonly kind:'groups';readonly rows:readonly TherapyComparisonGroupView[]}|{readonly kind:'measurements';readonly rows:readonly TherapyComparisonMeasurementView[]}|{readonly kind:'periods';readonly rows:readonly TherapyComparisonPeriodView[]};
 let {view}:{view:View}=$props();
</script><svelte:options preserveWhitespace/>{#if view.kind==='groups'}{#each view.rows as row}<tr><td>{row.dose}</td><td>{row.count}</td><td>{row.mean} {row.unit}</td><td>{row.start} – {row.end}</td></tr>{/each}{:else if view.kind==='measurements'}{#each view.rows as row}<tr><td>{row.date}</td><td>{row.value} {row.unit}</td><td>{row.exposure}</td><td>{row.days}</td><td>{row.status}</td><td>{row.source}</td></tr>{/each}{:else}{#each view.rows as row}<li>{row.start} → {row.end}: {row.dose}</li>{/each}{/if}
