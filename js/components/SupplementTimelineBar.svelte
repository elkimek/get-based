<script lang="ts">
 import type {SupplementBar} from '../supplement-dashboard-presentation.js';
 let {view}:{view:SupplementBar}=$props();
</script><svelte:options preserveWhitespace/><div class={view.kind==='gap'?'supp-bar-gap':'supp-bar supp-bar-'+view.kind+(view.ongoing?' supp-bar-ongoing':'')} style={'left:'+view.left+'%;width:'+view.width+'%'}></div>
