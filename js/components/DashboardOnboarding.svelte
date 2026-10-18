<svelte:options preserveWhitespace={true} /><script lang="ts">
  import type {DashboardOnboardingView} from "../dashboard-welcome-presentation.js";
  let {view}: {view: DashboardOnboardingView} = $props();
</script>{#if view.mode === 'banner'}<div class="onboarding-banner" id="onboarding-banner">
    <div class="onboarding-steps">
      <span class="onboarding-step completed">✓</span>
      <span class="onboarding-step-line"></span>
      <span class="onboarding-step active">2</span>
      <span class="onboarding-step-line"></span>
      <span class="onboarding-step">3</span>
    </div>
    <div class="onboarding-step-labels">
      <span class="onboarding-step-label">Import</span>
      <span class="onboarding-step-label active">Profile</span>
      <span class="onboarding-step-label">Ready</span>
    </div>
    <h3 class="onboarding-title">Set up your profile</h3>
    <p class="onboarding-subtitle">Sex and date of birth pick the right reference ranges for your results.</p>
    <div class="onboarding-form">
      <div class="onboarding-field">
        <!-- svelte-ignore a11y_label_has_associated_control (Retain legacy native label/form attributes; controller owns this synchronous SSR form.) --><label class="onboarding-label">Sex</label>
        <div class="onboarding-sex-toggle">
          <button type="button" class="onboarding-sex-btn{view.maleClass}" data-onboarding-action="set-sex" data-onboarding-sex="male">Male</button>
          <button type="button" class="onboarding-sex-btn{view.femaleClass}" data-onboarding-action="set-sex" data-onboarding-sex="female">Female</button>
        </div>
      </div>
      <div class="onboarding-field">
        <!-- svelte-ignore a11y_label_has_associated_control (Retain legacy native label/form attributes; controller owns this synchronous SSR form.) --><label class="onboarding-label">Date of Birth</label>
        <input type="date" class="onboarding-dob-input" id="onboarding-dob" value="{view.dob}" />
      </div>
      <div class="onboarding-actions">
        <button type="button" class="onboarding-file-btn" data-onboarding-action="import-file">Import data file</button>
        <button type="button" class="onboarding-save-btn" data-onboarding-action="save-profile">Save & Continue</button>
        <button type="button" class="onboarding-skip-btn" data-onboarding-action="dismiss-profile">Skip for now</button>
      </div>
    </div>
  </div>{:else if view.mode === 'reminder'}<div class="ai-reminder-banner" id="ai-reminder-banner" role="region" aria-label="Connect AI to unlock lab analysis">
    <span class="ai-reminder-icon" aria-hidden="true">&#129504;</span>
    <span class="ai-reminder-body">
      <strong>Connect AI to unlock lab analysis</strong>
      <span>PDF import, trend insights, and chat all need an AI provider. About 30 seconds.</span>
    </span>
    <button type="button" class="ai-reminder-cta" data-onboarding-action="open-provider-quiz">Connect now</button>
    <button type="button" class="ai-reminder-dismiss" data-onboarding-action="dismiss-ai-reminder" aria-label="Dismiss">&times;</button>
  </div>{/if}