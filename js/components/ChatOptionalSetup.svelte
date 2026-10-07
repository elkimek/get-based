<script lang="ts">
  import { untrack } from 'svelte';
  import ChatPersonaLabel from './ChatPersonaLabel.svelte';
  import ChatOnboardingProgress from './ChatOnboardingProgress.svelte';
  import type { ChatOptionalSetupView } from '../chat-optional-onboarding-presentation.js';
  import { ONBOARDING_BUBBLE, ONBOARDING_WIDE_BUBBLE, ONBOARDING_FOCUS, ONBOARDING_CTA } from '../chat-onboarding-classes.js';
  import { OPTIONAL_GRID, OPTIONAL_TASK, OPTIONAL_ICON, OPTIONAL_BODY, OPTIONAL_TITLE, OPTIONAL_SUMMARY,
    OPTIONAL_ACTIONS, OPTIONAL_BUTTON, OPTIONAL_SECONDARY } from '../chat-optional-onboarding-classes.js';
  let { initial }: { initial: ChatOptionalSetupView } = $props();
  let presentation = $state.raw(untrack(() => initial));
  export function setPresentation(next: ChatOptionalSetupView): void { presentation = next; }
</script>

<div data-chat-optional-setup-view class="gb:onboarding:contents">
  <ChatPersonaLabel text={presentation.personalityLabel}/>
  <div class="chat-msg chat-ai {ONBOARDING_BUBBLE} {ONBOARDING_WIDE_BUBBLE}" data-chat-onboarding-message>
    <ChatOnboardingProgress progress={presentation.progress}/>
    <p>{presentation.connected ? 'Great, we are connected.' : 'Nice. We can collect useful context first and connect AI when optional tips or AI imports need it.'} These optional context pieces make later interpretation more useful. Add any that matter now, or continue to the context cards.</p>
    <div class={OPTIONAL_GRID}>
      {#each presentation.tasks as task (task.id)}
        <article data-chat-optional-task={task.id} class="{OPTIONAL_TASK} {task.id === 'genetics' ? 'chat-onboard-dna' : ''} {task.complete ? 'is-complete gb:onboarding:border-[color-mix(in_srgb,var(--green)_42%,var(--border))]' : ''}">
          <span class={OPTIONAL_ICON} aria-hidden="true">{task.icon}</span>
          <span class={OPTIONAL_BODY}><strong class={OPTIONAL_TITLE}>{task.title}</strong><small class={OPTIONAL_SUMMARY}>{task.summary}</small></span>
          {#if task.id === 'genetics' && presentation.confirmation}
            {@const confirmation = presentation.confirmation}
            <div role="status" class="gb:onboarding:col-span-full gb:onboarding:text-[13px] gb:onboarding:leading-[1.8]">
              <p class="gb:onboarding:mt-0 gb:onboarding:mb-1.5">🧬 <strong>{confirmation.count} SNP call{confirmation.count === 1 ? '' : 's'} available</strong> after importing {confirmation.source}</p>
              {#if confirmation.apoe}<span>APOE: <strong>{confirmation.apoe}</strong></span>{/if}
              {#each confirmation.findings as finding, index}{#if index > 0 || confirmation.apoe}<span aria-hidden="true"> · </span>{/if}<span>{finding}</span>{/each}
              <div class="gb:onboarding:text-xs gb:onboarding:text-muted gb:onboarding:mt-1.5">I'll factor these into all your lab interpretations.</div>
            </div>
          {/if}
          <span class={OPTIONAL_ACTIONS}>
            {#each task.actions as action (action.action)}
              <button type="button" class="{OPTIONAL_BUTTON} {action.secondary ? OPTIONAL_SECONDARY : ''} {ONBOARDING_FOCUS}"
                data-chat-empty-action={action.action}>{action.label}</button>
            {/each}
            {#if task.id === 'genetics'}
              <input type="file" id="mtdna-onboard-input" class="gb:onboarding:sr-only" accept=".txt,.csv" aria-label="Import mtDNA file" data-chat-empty-action="import-mtdna-file"/>
            {/if}
          </span>
        </article>
      {/each}
    </div>
    {#if !presentation.hasSnps}
      <div class="chat-onboard-affiliate-foot gb:onboarding:mt-3 gb:onboarding:text-xs gb:onboarding:text-muted gb:onboarding:leading-[1.4]">
        No DNA file? We recommend a <a href="https://www.dpbolvw.net/q2101xdmjdl0212824AA4024989447" target="_blank" rel="noopener sponsored"
          class="chat-onboard-affiliate-link gb:onboarding:text-accent gb:onboarding:underline gb:onboarding:underline-offset-2 gb:onboarding:font-semibold gb:onboarding:hover:text-accent {ONBOARDING_FOCUS}">LivingDNA kit</a>.
      </div>
    {/if}
    <div class="chat-onboard-note gb:onboarding:mt-2.5 gb:onboarding:text-muted gb:onboarding:text-xs gb:onboarding:leading-[1.45]">You can change all of this later from the dashboard, settings, or client profile.</div>
    <div class="gb:onboarding:flex gb:onboarding:flex-wrap gb:onboarding:gap-2 gb:onboarding:mt-3 gb:onboarding:[@media(max-width:768px)]:flex-col">
      <button type="button" class="chat-onboard-cta {ONBOARDING_CTA} {ONBOARDING_FOCUS} gb:onboarding:[@media(max-width:768px)]:min-h-11 gb:onboarding:[@media(max-width:768px)]:w-full gb:onboarding:[@media(max-width:768px)]:justify-center gb:onboarding:[@media(max-width:768px)]:text-center" data-chat-empty-action="skip-extras">Continue to context cards</button>
    </div>
  </div>
</div>
