<script lang="ts">
  import type { NutritionMealPhotoView } from '../nutrition-editor-model.js';
  let { view }: { view: NutritionMealPhotoView } = $props();
</script>
<span class="nutrition-photo-grid gb:nutrition:grid gb:nutrition:h-[230px] gb:nutrition:w-full gb:nutrition:auto-rows-[minmax(0,1fr)] gb:nutrition:grid-cols-2 gb:nutrition:gap-0.5">
  {#each view.urls as url, index}<img src={url} alt={`${view.kind === 'stored' ? 'Meal' : 'Selected'} view ${index + 1}`} class="gb:nutrition:h-full gb:nutrition:min-h-0 gb:nutrition:w-full gb:nutrition:object-cover gb:nutrition:only:col-span-full gb:nutrition:only:row-span-full"/>{/each}
</span>
<span class="nutrition-photo-change gb:nutrition:absolute gb:nutrition:right-2 gb:nutrition:bottom-2 gb:nutrition:rounded-full gb:nutrition:bg-black/75 gb:nutrition:px-[9px] gb:nutrition:py-1 gb:nutrition:text-[11px] gb:nutrition:text-white">{view.kind === 'stored' ? 'Change views' : `${view.urls.length} view${view.urls.length === 1 ? '' : 's'} · change`}</span>
