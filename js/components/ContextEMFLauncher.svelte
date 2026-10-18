<script lang="ts">
  import type { EMFLauncherView } from '../context-emf-launcher-model.js';
  let { view, inModal = false, surface = 'environment-editor', disabled = false, activate }: {
    view: EMFLauncherView; inModal?: boolean; surface?: string; disabled?: boolean; activate?: () => void;
  } = $props();
</script>
<button type="button" data-context-emf-launcher data-context-card-action={activate ? undefined : 'open-emf-assessment'} data-context-card-close-modal={inModal ? 'true' : 'false'} data-umami-event={`emf-launcher-${surface}`} {disabled} onclick={activate}
  class={`ctx-emf-launcher ${view.hasAssessments ? 'has-data gb:context-emf:border-accent gb:context-emf:bg-accent-fill' : 'gb:context-emf:border-line gb:context-emf:bg-surface'} gb:context-emf:box-border gb:context-emf:w-full gb:context-emf:grid gb:context-emf:grid-cols-[36px_minmax(0,1fr)_auto] gb:context-emf:items-center gb:context-emf:gap-3 gb:context-emf:p-3 gb:context-emf:rounded-control gb:context-emf:border gb:context-emf:text-ink gb:context-emf:[font:inherit] gb:context-emf:text-left gb:context-emf:[overflow-wrap:anywhere] gb:context-emf:cursor-pointer gb:context-emf:hover:bg-hover gb:context-emf:hover:border-accent gb:context-emf:focus-visible:outline-2 gb:context-emf:focus-visible:outline-accent gb:context-emf:focus-visible:outline-offset-2 gb:context-emf:disabled:cursor-wait gb:context-emf:max-[480px]:grid-cols-[36px_minmax(0,1fr)]`}>
  <span class="ctx-emf-launcher-mark gb:context-emf:flex gb:context-emf:items-center gb:context-emf:justify-center gb:context-emf:w-9 gb:context-emf:h-9 gb:context-emf:border gb:context-emf:border-line gb:context-emf:rounded-control gb:context-emf:bg-accent-fill gb:context-emf:text-ink gb:context-emf:text-[10px] gb:context-emf:font-extrabold" aria-hidden="true">EMF</span>
  <span class="ctx-emf-launcher-copy gb:context-emf:min-w-0 gb:context-emf:flex gb:context-emf:flex-col gb:context-emf:gap-[3px]">
    <span class="ctx-emf-launcher-kicker gb:context-emf:text-[10px] gb:context-emf:font-extrabold gb:context-emf:uppercase gb:context-emf:text-secondary">{view.kicker}</span>
    <strong class="gb:context-emf:text-[13px] gb:context-emf:text-ink">{view.title}</strong>
    <span class="gb:context-emf:text-xs gb:context-emf:leading-[1.4] gb:context-emf:text-secondary">{view.summary}</span>
  </span>
  <span class="ctx-emf-launcher-action gb:context-emf:text-xs gb:context-emf:font-extrabold gb:context-emf:text-ink gb:context-emf:whitespace-nowrap gb:context-emf:max-[480px]:col-start-2">{view.action}</span>
</button>
