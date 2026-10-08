<script lang="ts">
  import {projectCameraLock, type CameraLockDisplay} from '../light-camera-presentation.js';
  import {cameraToolClasses as c} from '../light-camera-classes.js';
  let {lock}: {lock: CameraLockDisplay} = $props();
  const view = $derived(projectCameraLock(lock));
</script>
{#if view}<span data-light-tool-view class={c(view.manual ? 'camera-note-locked' : 'camera-note-warning')}>{view.text}</span>{/if}
