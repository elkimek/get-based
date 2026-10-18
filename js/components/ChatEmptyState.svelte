<script lang="ts">
  import {untrack} from 'svelte';
  import ContextCardCatalog from './ContextCardCatalog.svelte';
  import type {ContextCatalogView} from '../context-card-catalog-presentation.js';
  import type { ChatEmptyAction, ChatEmptyView } from '../chat-empty-presentation.js';
  import {
    ONBOARDING_BUBBLE, ONBOARDING_WIDE_BUBBLE, ONBOARDING_COMPLETE,
    ONBOARDING_CTA, ONBOARDING_SECONDARY, ONBOARDING_FOCUS,
  } from '../chat-onboarding-classes.js';
  import Persona from './ChatPersonaLabel.svelte';
  import Progress from './ChatOnboardingProgress.svelte';
  let { view, contextCatalog = null }: { view: ChatEmptyView; contextCatalog?: ContextCatalogView | null } = $props();
  let catalog = $state.raw<ContextCatalogView | null>(untrack(() => contextCatalog));
  export function setCatalog(next: ContextCatalogView | null): void { catalog = next; }
  const pausedPrimary = 'import-btn import-btn-primary gb:onboarding:inline-flex gb:onboarding:items-center gb:onboarding:justify-center gb:onboarding:cursor-pointer gb:onboarding:rounded-control gb:onboarding:border-0 gb:onboarding:bg-accent gb:onboarding:px-[18px] gb:onboarding:py-2.5 gb:onboarding:font-body gb:onboarding:text-[13px] gb:onboarding:font-semibold gb:onboarding:text-on-accent gb:onboarding:hover:opacity-90';
  const target = 'gb:onboarding:min-h-[45px] gb:onboarding:min-w-[45px]';

  function actionClasses(item: ChatEmptyAction): string {
    if (!item.primary) return `chat-prompt-btn ${ONBOARDING_SECONDARY}`;
    return view.kind === 'paused' ? pausedPrimary : `chat-onboard-cta ${ONBOARDING_CTA}`;
  }
</script>
{#snippet action(item: ChatEmptyAction)}
  <button type="button" class={`${actionClasses(item)} ${ONBOARDING_FOCUS} ${target}`}
    data-chat-empty-action={item.action} data-prompt={item.prompt} data-focus={item.focus}
    data-chat-onboarding-action={item.step ? 'go-onboarding-step' : undefined} data-chat-step={item.step}>{item.label}</button>
{/snippet}
<div data-chat-empty-view class="gb:onboarding:contents gb:onboarding:[&_.chat-onboard-back-btn]:min-h-[45px] gb:onboarding:[&_.chat-onboard-back-btn]:min-w-[45px]">
  {#if view.kind === 'general'}
    <div class="chat-empty gb:onboarding:flex gb:onboarding:flex-1 gb:onboarding:flex-col gb:onboarding:items-center gb:onboarding:justify-center gb:onboarding:p-5 gb:onboarding:text-center gb:onboarding:text-[13px] gb:onboarding:text-secondary">
      <div class="chat-empty-icon gb:onboarding:mb-2 gb:onboarding:text-[32px]">{view.icon}</div>{' '}<div>{view.greeting}</div>
      <div class="chat-prompts gb:onboarding:mt-4 gb:onboarding:flex gb:onboarding:w-full gb:onboarding:flex-col gb:onboarding:gap-2">{#each view.actions as item}{@render action(item)}{' '}{/each}</div>
    </div>
  {:else}
    <Persona text={view.personalityLabel}/>
    <div data-chat-onboarding-message class={`chat-msg chat-ai ${ONBOARDING_BUBBLE} ${ONBOARDING_WIDE_BUBBLE}`}>
      {#if view.progress}<Progress progress={view.progress}/>{/if}
      {#if view.label}<div class={`chat-onboard-complete-label ${ONBOARDING_COMPLETE}`}>{view.label}</div>{/if}
      <p>{#if view.strong}<strong>{view.strong}</strong>{' '}{/if}{view.body}</p>
      {#if view.progressPercent !== null}
        <div class="chat-onboard-progress gb:onboarding:mt-2 gb:onboarding:mb-1 gb:onboarding:h-1.5 gb:onboarding:overflow-hidden gb:onboarding:rounded-[3px] gb:onboarding:bg-line"><div class="chat-onboard-progress-bar gb:onboarding:h-full gb:onboarding:rounded-[3px] gb:onboarding:bg-[image:var(--accent-gradient)] gb:onboarding:transition-[width] gb:onboarding:duration-[400ms] gb:onboarding:motion-reduce:transition-none" style:width={`${view.progressPercent}%`}></div></div>
        <p class="gb:onboarding:mt-1 gb:onboarding:mb-0 gb:onboarding:text-xs gb:onboarding:text-muted">The more context I have, the better I can interpret results and recommend what to test. Everything is optional.</p>
      {/if}
      {#if view.contextCards}
        <div data-chat-empty-context-slot class="chat-context-cards gb:onboarding:mt-3.5">{#if catalog}<ContextCardCatalog view={catalog}/>{/if}</div>
        <div class="chat-onboard-actions chat-onboard-step4-actions gb:onboarding:mt-3 gb:onboarding:flex gb:onboarding:flex-col gb:onboarding:gap-[7px]">
          <div class="chat-onboard-primary-actions chat-onboard-primary-actions-single gb:onboarding:grid gb:onboarding:grid-cols-1 gb:onboarding:gap-2"><button type="button" class={`chat-onboard-cta ${ONBOARDING_CTA} ${ONBOARDING_FOCUS} ${target} gb:onboarding:justify-center gb:onboarding:text-center`} data-chat-empty-action="continue-after-context-cards">{view.continueLabel}</button></div>
          <div class="chat-onboard-tertiary-actions gb:onboarding:flex gb:onboarding:flex-wrap gb:onboarding:items-center gb:onboarding:justify-center gb:onboarding:gap-x-3 gb:onboarding:gap-y-1 gb:onboarding:pt-0.5"><button type="button" class={`chat-onboard-text-action ${ONBOARDING_FOCUS} ${target} gb:onboarding:cursor-pointer gb:onboarding:rounded-sm gb:onboarding:border-0 gb:onboarding:bg-transparent gb:onboarding:px-0.5 gb:onboarding:py-[3px] gb:onboarding:font-body gb:onboarding:text-xs gb:onboarding:text-muted gb:onboarding:underline gb:onboarding:underline-offset-[3px] gb:onboarding:hover:text-accent`} data-chat-empty-action="skip-context-cards">Skip context cards</button></div>
        </div>
      {:else}
        <div class="chat-onboard-actions gb:onboarding:mt-3 gb:onboarding:flex gb:onboarding:flex-col gb:onboarding:gap-2">{#each view.actions as item}{@render action(item)}{' '}{/each}</div>
      {/if}
    </div>
  {/if}
</div>
