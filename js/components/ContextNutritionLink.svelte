<script lang="ts">
  import type {NutritionContextLinkView} from '../nutrition-context-card-view.js';
  let {view}: {view: NutritionContextLinkView} = $props();
</script>
<button type="button" data-nutrition-context-link="" {...view.attributes}
  class="diet-nutrition-extension gb:nutrition-link:relative gb:nutrition-link:z-[2] gb:nutrition-link:grid gb:nutrition-link:grid-cols-[auto_minmax(0,1fr)_auto] gb:nutrition-link:items-center gb:nutrition-link:gap-[7px] gb:nutrition-link:w-full gb:nutrition-link:pointer-coarse:min-h-11 gb:nutrition-link:max-[480px]:min-h-11 gb:nutrition-link:mt-[7px] gb:nutrition-link:rounded-lg gb:nutrition-link:border gb:nutrition-link:border-line gb:nutrition-link:bg-[color-mix(in_srgb,var(--bg-card)_88%,var(--accent)_12%)] gb:nutrition-link:px-2 gb:nutrition-link:py-[7px] gb:nutrition-link:[font-family:inherit] gb:nutrition-link:[font-weight:inherit] gb:nutrition-link:[font-style:inherit] gb:nutrition-link:[line-height:inherit] gb:nutrition-link:text-[10px] gb:nutrition-link:text-secondary gb:nutrition-link:text-left gb:nutrition-link:cursor-pointer gb:nutrition-link:hover:border-accent gb:nutrition-link:focus-visible:outline-2 gb:nutrition-link:focus-visible:outline-accent gb:nutrition-link:focus-visible:outline-offset-2 gb:nutrition-link:[@media(max-width:480px)]:grid-cols-[minmax(0,1fr)_auto]">
  <span class="diet-nutrition-extension-title gb:nutrition-link:min-w-0 gb:nutrition-link:font-bold gb:nutrition-link:text-ink gb:nutrition-link:[overflow-wrap:anywhere]">{view.title}</span>
  <span class="gb:nutrition-link:min-w-0 gb:nutrition-link:[overflow-wrap:anywhere] gb:nutrition-link:[@media(max-width:480px)]:col-start-1 gb:nutrition-link:[@media(max-width:480px)]:row-start-2">{view.detail}</span>
  <span aria-hidden="true" class="gb:nutrition-link:[@media(max-width:480px)]:col-start-2 gb:nutrition-link:[@media(max-width:480px)]:row-start-1 gb:nutrition-link:[@media(max-width:480px)]:row-span-2">→</span>
</button>
