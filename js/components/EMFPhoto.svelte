<script lang="ts">
  import type {EMFPhotoView} from '../emf-photo-presentation.js';
  let {view}: {view: EMFPhotoView} = $props();
</script><img src={view.source} alt={view.name}>
