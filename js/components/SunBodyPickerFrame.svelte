<script lang="ts">
  import SunBodyPicker from './SunBodyPicker.svelte';
  import type {BodyPickerView} from '../sun-body-picker-presentation.js';
  let { id, silhouetteView }: { id: string; silhouetteView: BodyPickerView | null } = $props();
</script>
<!-- The sole HTML slot accepts the authored body picker's synchronous renderer. -->
<div {id} class="sun-silhouette-wrap gb:light-session:mt-3.5 gb:light-session:mb-2 gb:light-session:mx-0 gb:light-session:flex gb:light-session:flex-col gb:light-session:items-center gb:light-session:relative gb:light-session:bg-secondary-surface gb:light-session:border gb:light-session:border-line gb:light-session:rounded-[var(--radius)] gb:light-session:pt-3.5 gb:light-session:px-3 gb:light-session:pb-2.5 gb:light-session:[@media(max-width:600px)]:pt-2.5 gb:light-session:[@media(max-width:600px)]:px-1.5 gb:light-session:[@media(max-width:600px)]:pb-1.5">{#if silhouetteView}<SunBodyPicker view={silhouetteView}/>{/if}</div>
