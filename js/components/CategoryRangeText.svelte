<script lang="ts">
 import {componentStaticStyles} from '../component-inline-style-map.generated.js';
 import type {CategoryRangeTextView} from '../category-presentation.js';
 let {view,fatty=false}:{view:CategoryRangeTextView;fatty?:boolean}=$props();
</script><svelte:options preserveWhitespace/>{#if view.kind==='single'}{view.text}{:else if fatty}Ref: {view.referenceMinimum} – {view.referenceMaximum} · <span style={componentStaticStyles.optimalRange}>Opt: {view.optimalMinimum} – {view.optimalMaximum}</span>{:else}{view.referenceMinimum} – {view.referenceMaximum}<br><span style={componentStaticStyles.optimalRangeSmall}>opt: {view.optimalMinimum} – {view.optimalMaximum}</span>{/if}
