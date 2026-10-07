<script lang="ts">
  import { ONBOARDING_FOCUS, QUIZ_OPTION } from '../chat-onboarding-classes.js';
  let { action, branch, provider, title, detail, icon, recommended = false }: {
    action: string; branch?: string; provider?: string; title: string; detail: string; icon?: string; recommended?: boolean;
  } = $props();
</script>
<button type="button" class="gb:group chat-quiz-option{recommended ? ' chat-quiz-recommended' : ''} {QUIZ_OPTION} {ONBOARDING_FOCUS} {recommended ? 'gb:onboarding:border-[color-mix(in_srgb,var(--purple)_50%,transparent)]' : ''}"
  data-chat-onboarding-action={action} data-chat-provider-branch={branch} data-chat-provider={provider}>
  {#if icon}
    <span class="chat-quiz-icon gb:onboarding:text-[22px] gb:onboarding:leading-none gb:onboarding:flex-[0_0_28px] gb:onboarding:text-center" aria-hidden="true">
      {#if icon === 'terminal'}<svg width="28" height="28" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4.5" y="6.5" width="23" height="19" rx="4.5"/><path d="m10 12 4 4-4 4M17 20h5"/></svg>{:else}{icon}{/if}
    </span>
  {/if}
  <span class="chat-quiz-body gb:onboarding:flex-1 gb:onboarding:flex gb:onboarding:flex-col gb:onboarding:gap-0.5 gb:onboarding:min-w-0">
    <strong class="gb:onboarding:text-[13.5px]">{title}</strong>
    <span class="gb:onboarding:text-xs gb:onboarding:text-muted gb:onboarding:leading-[1.35]">{detail}{#if recommended}{' '}<em class="chat-quiz-rec gb:onboarding:not-italic gb:onboarding:text-accent gb:onboarding:font-medium">Recommended</em>{/if}</span>
  </span>
  <span class="chat-quiz-arrow gb:onboarding:text-base gb:onboarding:text-muted gb:onboarding:group-hover:text-accent gb:onboarding:flex-none" aria-hidden="true">→</span>
</button>
