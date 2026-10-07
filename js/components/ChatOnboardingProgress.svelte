<script lang="ts">
  import type { ChatOnboardingProgress } from '../chat-onboarding-presentation.js';
  import { ONBOARDING_FOCUS } from '../chat-onboarding-classes.js';
  let { progress }: { progress: ChatOnboardingProgress } = $props();
</script>
<div data-chat-onboard-progress-view class="chat-onboard-crumbs gb:onboarding:flex gb:onboarding:items-center gb:onboarding:justify-between gb:onboarding:gap-2 gb:onboarding:px-0.5 gb:onboarding:pb-2.5 gb:onboarding:border-b gb:onboarding:border-line gb:onboarding:mb-3"
  role="group" aria-label={`Onboarding step ${progress.step} of ${progress.total}: ${progress.label}`}>
  <span class="chat-onboard-crumbs-main gb:onboarding:inline-flex gb:onboarding:items-center gb:onboarding:gap-[7px] gb:onboarding:min-w-0">
    {#if progress.previousStep !== null}
      <button type="button" class="chat-onboard-back-btn {ONBOARDING_FOCUS} gb:onboarding:size-6 gb:onboarding:[@media(max-width:768px)]:size-11 gb:onboarding:[@media(max-width:768px)]:flex-[0_0_44px] gb:onboarding:inline-flex gb:onboarding:items-center gb:onboarding:justify-center gb:onboarding:flex-[0_0_24px] gb:onboarding:border gb:onboarding:border-line gb:onboarding:rounded-control gb:onboarding:bg-surface gb:onboarding:text-secondary gb:onboarding:[font:inherit] gb:onboarding:text-[13px] gb:onboarding:leading-none gb:onboarding:cursor-pointer gb:onboarding:transition-colors gb:onboarding:duration-150 gb:onboarding:hover:border-accent gb:onboarding:hover:text-accent gb:onboarding:hover:bg-[color-mix(in_srgb,var(--accent)_8%,transparent)] gb:onboarding:motion-reduce:transition-none"
        data-chat-onboarding-action="go-onboarding-step" data-chat-step={progress.previousStep} aria-label="Back to previous onboarding step" title="Previous step">←</button>
    {/if}
    <span class="chat-onboard-crumbs-label gb:onboarding:text-[11px] gb:onboarding:text-muted gb:onboarding:uppercase gb:onboarding:tracking-[0.4px]">Step {progress.step} of {progress.total} · {progress.label}</span>
  </span>
  <span class="chat-onboard-crumbs-dots gb:onboarding:inline-flex gb:onboarding:gap-[5px] gb:onboarding:items-center" aria-hidden="true">
    {#each Array.from({ length: progress.total }) as _, index}
      <span class="chat-onboard-crumb{index < progress.step ? ' active' : ''} gb:onboarding:size-1.5 gb:onboarding:rounded-full gb:onboarding:transition-colors gb:onboarding:duration-200 gb:onboarding:motion-reduce:transition-none {index < progress.step ? 'gb:onboarding:bg-accent' : 'gb:onboarding:bg-line'}"></span>
    {/each}
  </span>
</div>
