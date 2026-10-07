<script lang="ts">
  import { untrack } from 'svelte';
  import ChatPersonaLabel from './ChatPersonaLabel.svelte';
  import ChatOnboardingProgress from './ChatOnboardingProgress.svelte';
  import type { ChatProfileDraft, ChatProfileSetupView } from '../chat-profile-onboarding-contract.js';
  import { ONBOARDING_BUBBLE, ONBOARDING_WIDE_BUBBLE, ONBOARDING_FOCUS } from '../chat-onboarding-classes.js';
  import {
    PROFILE_ROW, PROFILE_LABEL, PROFILE_INPUT, PROFILE_UNIT, PROFILE_SEX,
    PROFILE_FORM, PROFILE_MORE, PROFILE_MORE_BODY, PROFILE_UNIT_PAIR, PROFILE_NEXT,
  } from '../chat-profile-onboarding-classes.js';

  let { initial }: { initial: ChatProfileSetupView } = $props();
  // Repainting updates presentation, never the user's in-progress fields or native details/focus state.
  const fields = untrack(() => initial);
  let presentation = $state.raw(untrack(() => initial));
  let sex = $state(fields.sex);
  let pending = $state(false);
  let error = $state('');
  let latitude = $state(fields.latitude);
  let enabled = $state(Boolean(fields.name.trim() && fields.sex));
  let height = $state(fields.height);
  let heightPlaceholder = $state(fields.heightUnit === 'in' ? 'inches' : 'cm');
  let nameInput: HTMLInputElement;
  let dobInput: HTMLInputElement;
  let heightInput: HTMLInputElement;
  let heightUnit: HTMLSelectElement;
  let weightInput: HTMLInputElement;
  let weightUnit: HTMLSelectElement;
  let countryInput: HTMLInputElement;

  export function setPresentation(next: ChatProfileSetupView): void { presentation = next; }
  export function readDraft(): ChatProfileDraft {
    return {
      name: nameInput.value, sex, dob: dobInput.value,
      height: heightInput.value, heightUnit: heightUnit.value,
      weight: weightInput.value, weightUnit: weightUnit.value, country: countryInput.value,
    };
  }
  export function setPending(value: boolean): void { pending = value; }
  export function setError(value: string): void { error = value; }
  export function setSex(value: string | null): void { sex = value; }
  export function setLatitude(value: string): void { latitude = value; }
  export function setContinueEnabled(value: boolean): void { enabled = value; }
  export function setHeight(value: string, placeholder: string): void {
    height = value;
    heightPlaceholder = placeholder;
  }
</script>

<div data-chat-profile-setup-view class="gb:onboarding:contents">
  <ChatPersonaLabel text={presentation.personalityLabel}/>
  <div class="chat-msg chat-ai {ONBOARDING_BUBBLE} {ONBOARDING_WIDE_BUBBLE}" data-chat-onboarding-message>
    <ChatOnboardingProgress progress={presentation.progress}/>
    <p>Hey! 👋 I'll be your AI health analyst — I help you understand blood work, track trends, and spot what matters. First, tell me a bit about yourself:</p>
    <div class={PROFILE_FORM} aria-busy={pending}>
      <div class={PROFILE_ROW}>
        <label class={PROFILE_LABEL} for="chat-onboard-name">Name</label>
        <input class={PROFILE_INPUT} id="chat-onboard-name" placeholder="your name"
          value={fields.name} bind:this={nameInput} data-chat-empty-action="save-profile"
          oninput={() => { enabled = Boolean(nameInput.value.trim() && sex); }}/>
      </div>
      <div class={PROFILE_ROW}>
        <span class={PROFILE_LABEL} id="chat-onboard-sex-label">Sex</span>
        <div class="chat-onboard-sex gb:onboarding:flex gb:onboarding:gap-1" role="group" aria-labelledby="chat-onboard-sex-label">
          {#each [['male', 'Male'], ['female', 'Female']] as [value, label]}
            <button type="button" class="{PROFILE_SEX} {ONBOARDING_FOCUS} {sex === value
              ? 'active gb:onboarding:bg-accent gb:onboarding:border-accent gb:onboarding:text-on-accent'
              : 'gb:onboarding:bg-[var(--bg-sidebar)] gb:onboarding:border-line gb:onboarding:text-secondary'}"
              aria-pressed={sex === value} data-chat-empty-action="set-profile-sex" data-sex={value}>
              {label}
            </button>
          {/each}
        </div>
      </div>
      <div class={PROFILE_ROW}>
        <label class={PROFILE_LABEL} for="chat-onboard-dob">Born</label>
        <input type="date" class={PROFILE_INPUT} id="chat-onboard-dob" value={fields.dob}
          min="1900-01-01" max={fields.today} bind:this={dobInput}/>
      </div>
      <details class={PROFILE_MORE}>
        <summary class="gb:onboarding:py-2.5 gb:onboarding:px-3 gb:onboarding:text-secondary gb:onboarding:cursor-pointer gb:onboarding:text-xs gb:onboarding:leading-[1.58] gb:onboarding:[@media(max-width:768px)]:min-h-11 gb:onboarding:box-border gb:onboarding:list-none gb:onboarding:[&::-webkit-details-marker]:hidden {ONBOARDING_FOCUS}">
          <svg aria-hidden="true" viewBox="0 0 8 8" class="gb:onboarding:inline-block gb:onboarding:size-2 gb:onboarding:mr-[7px] gb:onboarding:transition-transform gb:onboarding:duration-150 gb:onboarding:motion-reduce:transition-none">
            <path d="M2 1l4 3-4 3Z" fill="currentColor"/>
          </svg>Optional body and location context
        </summary>
        <div class={PROFILE_MORE_BODY}>
          <div class={PROFILE_ROW}>
            <label class={PROFILE_LABEL} for="chat-onboard-height">Height</label>
            <div class={PROFILE_UNIT_PAIR}>
              <input type="number" class={PROFILE_INPUT} id="chat-onboard-height"
                placeholder={heightPlaceholder} step="0.1" value={height} bind:this={heightInput}/>
              <select class="{PROFILE_INPUT} {PROFILE_UNIT}" id="chat-onboard-height-unit"
                aria-label="Height unit" data-chat-empty-action="height-unit-changed"
                value={fields.heightUnit} bind:this={heightUnit}>
                <option value="cm">cm</option>
                <option value="in">in</option>
              </select>
            </div>
          </div>
          <div class={PROFILE_ROW}>
            <label class={PROFILE_LABEL} for="chat-onboard-weight">Weight</label>
            <div class={PROFILE_UNIT_PAIR}>
              <input type="number" class={PROFILE_INPUT} id="chat-onboard-weight"
                placeholder="kg" step="0.1" value={fields.weight} bind:this={weightInput}/>
              <select class="{PROFILE_INPUT} {PROFILE_UNIT}" id="chat-onboard-weight-unit"
                aria-label="Weight unit" value={fields.weightUnit} bind:this={weightUnit}>
                <option value="kg">kg</option>
                <option value="lbs">lbs</option>
              </select>
            </div>
          </div>
          <div class={PROFILE_ROW}>
            <label class={PROFILE_LABEL} for="chat-onboard-country">Location</label>
            <input class={PROFILE_INPUT} id="chat-onboard-country" placeholder="e.g. Germany"
              value={fields.country} bind:this={countryInput} data-chat-empty-action="save-location"/>
          </div>
          <div id="chat-onboard-lat" class="chat-onboard-lat gb:onboarding:min-h-4 gb:onboarding:text-xs {latitude ? 'gb:onboarding:text-success' : 'gb:onboarding:text-muted'}">{latitude}</div>
          <div class="chat-onboard-help gb:onboarding:text-muted gb:onboarding:text-[11px] gb:onboarding:leading-[1.35]">
            Latitude affects vitamin D, circadian rhythm, and seasonal health patterns.
          </div>
        </div>
      </details>
      {#if error}
        <p role="alert" class="gb:onboarding:text-danger gb:onboarding:text-xs">{error}</p>
      {/if}
      <button type="button" class="{PROFILE_NEXT} {ONBOARDING_FOCUS}" id="chat-onboard-next"
        data-chat-empty-action="save-profile-advance" disabled={!enabled || pending}>
        Continue →
      </button>
    </div>
  </div>
</div>
