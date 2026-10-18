<script lang="ts">
 import TipsSection from './TipsSection.svelte';
 import type {TipsSectionView} from '../tips-presentation.js';
 let {view}:{view:TipsSectionView}=$props();
</script><TipsSection {view}/>
