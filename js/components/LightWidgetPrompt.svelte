<script lang="ts">
  import type { LightPromptView } from '../light-page-presentation.js';
  let { view }: { view: LightPromptView } = $props();
</script>
<div class={`light-widget-prompt gb:light-page:flex gb:light-page:items-center gb:light-page:justify-between gb:light-page:gap-4 gb:light-page:px-4 gb:light-page:py-3.5 gb:light-page:border gb:light-page:border-dashed gb:light-page:border-line gb:light-page:rounded-control gb:light-page:bg-surface gb:light-page:min-w-0 gb:light-page:max-[720px]:flex-col gb:light-page:max-[720px]:items-stretch ${view.extraClass}`} data-light-page-presentation data-light-widget-prompt>
  <div class="light-widget-prompt-copy gb:light-page:min-w-0 gb:light-page:[overflow-wrap:anywhere]">
    <strong class="gb:light-page:block gb:light-page:text-ink gb:light-page:text-[13px] gb:light-page:mb-[3px]">{view.status}</strong>
    <p class="gb:light-page:m-0 gb:light-page:text-secondary gb:light-page:text-xs gb:light-page:leading-normal">{view.hint}</p>
  </div>
  <button type="button" class="light-widget-prompt-cta gb:light-page:shrink-0 gb:light-page:[@media(pointer:coarse)]:min-h-11 gb:light-page:max-[480px]:min-h-11 gb:light-page:[@media(pointer:coarse)]:min-w-11 gb:light-page:max-[480px]:min-w-11 gb:light-page:cursor-pointer gb:light-page:rounded-control gb:light-page:border gb:light-page:border-accent gb:light-page:bg-accent gb:light-page:px-3 gb:light-page:py-2 gb:light-page:font-body gb:light-page:text-xs gb:light-page:font-semibold gb:light-page:leading-normal gb:light-page:text-on-accent gb:light-page:focus-visible:outline-2 gb:light-page:focus-visible:outline-offset-2 gb:light-page:focus-visible:outline-accent" data-light-page-action={view.action}>{view.label}</button>
</div>
