<script lang="ts">
  import { untrack } from 'svelte';
  import ChatPersonaLabel from './ChatPersonaLabel.svelte';
  import ChatOnboardingProgress from './ChatOnboardingProgress.svelte';
  import ChatProviderQuiz from './ChatProviderQuiz.svelte';
  import type { ChatProviderSetupView } from '../chat-onboarding-presentation.js';
  import { ONBOARDING_BUBBLE, ONBOARDING_NARROW_BUBBLE, ONBOARDING_WIDE_BUBBLE, ONBOARDING_COMPLETE, ONBOARDING_CTA, ONBOARDING_SECONDARY, ONBOARDING_FOCUS } from '../chat-onboarding-classes.js';
  let { initial }: { initial: ChatProviderSetupView } = $props();
  let view = $state.raw(untrack(() => initial));
  export function setView(next: ChatProviderSetupView): void { view = next; }
</script>
<div data-chat-provider-setup-view class="gb:onboarding:contents">
  <ChatPersonaLabel text={view.personalityLabel}/>
  <div class="chat-msg chat-ai {ONBOARDING_BUBBLE} {view.connected || !['card', 'local', 'cli'].includes(view.branch) ? ONBOARDING_WIDE_BUBBLE : ONBOARDING_NARROW_BUBBLE}" data-chat-onboarding-message>
    {#if view.connected}
      <div class="chat-onboard-complete-label {ONBOARDING_COMPLETE}">AI connected</div>
      <p>{view.name}, AI is connected. You can continue the setup or change providers from AI settings.</p>
      <div class="chat-onboard-actions gb:onboarding:flex gb:onboarding:flex-col gb:onboarding:gap-2 gb:onboarding:mt-3">
        <button type="button" class="chat-onboard-cta {ONBOARDING_CTA} {ONBOARDING_FOCUS}" data-chat-onboarding-action="go-onboarding-step" data-chat-step="3">Continue</button>
        <button type="button" class="chat-prompt-btn {ONBOARDING_SECONDARY} {ONBOARDING_FOCUS}" data-chat-onboarding-action="open-ai-settings">Change AI provider</button>
      </div>
    {:else}
      <ChatOnboardingProgress progress={view.progress}/>
      {#if view.extensionHTML}
        <!-- Existing app-extension HTML contract; the extension owns its presentation. -->
        {@html view.extensionHTML}
      {:else}<ChatProviderQuiz branch={view.branch} name={view.name}/>{/if}
    {/if}
  </div>
</div>
