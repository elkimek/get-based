<script lang="ts">
  import ChatProviderChoice from './ChatProviderChoice.svelte';
  import { ONBOARDING_FOCUS, QUIZ_BACK, QUIZ_LINK, QUIZ_SETUP } from '../chat-onboarding-classes.js';
  let { branch, name }: { branch: string; name: string } = $props();
  const knownBranches = ['cli', 'card', 'local', 'bitcoin'];
</script>
<div class="chat-provider-quiz" data-chat-provider-view>
  {#if knownBranches.includes(branch)}
    <button type="button" class="chat-quiz-back {QUIZ_BACK} {ONBOARDING_FOCUS}" data-chat-onboarding-action="back-to-provider-quiz" aria-label="Back to provider options">← Back</button>
  {/if}
  {#if branch === 'cli'}
    <p><strong>Use an existing AI account → CLI agents</strong></p>
    <p class="gb:onboarding:text-[13px]">getbased scans this computer for configured agents such as Codex, OpenCode, Hermes, Grok, and OpenClaw. You need a supported CLI installed and signed in, plus getbased Companion. We’ll check for an existing Companion connection first and guide you through any missing setup.</p>
    <button type="button" class="chat-setup-btn {QUIZ_SETUP} {ONBOARDING_FOCUS}" data-chat-onboarding-action="open-provider-settings" data-chat-provider="cli">Find my installed agents →</button>
    <p class="gb:onboarding:text-[11px] gb:onboarding:text-muted gb:onboarding:mt-2.5">Choose any ready agent, then pick its model and reasoning level directly in getbased. Health-data changes always remain reviewable drafts.</p>
  {:else if branch === 'card'}
    <p><strong>Pay with a card → OpenRouter</strong></p>
    <p class="gb:onboarding:text-[13px]">Click below — log in with Google or email, top up with your card, you’re done. You’ll come right back here.</p>
    <button type="button" class="or-oauth-btn {ONBOARDING_FOCUS} gb:onboarding:w-full gb:onboarding:min-h-11 gb:onboarding:py-2.5 gb:onboarding:px-4 gb:onboarding:border-0 gb:onboarding:rounded-[var(--radius)] gb:onboarding:bg-transparent gb:onboarding:bg-[image:var(--accent-gradient)] gb:onboarding:text-white gb:onboarding:font-semibold gb:onboarding:text-sm gb:onboarding:[font-family:inherit] gb:onboarding:cursor-pointer gb:onboarding:transition-[transform,box-shadow] gb:onboarding:duration-200 gb:onboarding:hover:-translate-y-px gb:onboarding:hover:shadow-[var(--shadow-glow)] gb:onboarding:motion-reduce:transition-none"
      data-chat-onboarding-action="start-openrouter-oauth">Connect with OpenRouter</button>
    <div class="gb:onboarding:text-[11px] gb:onboarding:text-muted gb:onboarding:mt-2.5 gb:onboarding:text-center">
      <button type="button" class="chat-quiz-link {QUIZ_LINK} {ONBOARDING_FOCUS}" data-chat-onboarding-action="open-provider-settings" data-chat-provider="openrouter">or paste a key manually</button>
    </div>
  {:else if branch === 'local'}
    <p><strong>Runs on your computer → Local AI</strong></p>
    <p class="gb:onboarding:text-[13px]">Install <a href="https://ollama.com" target="_blank" rel="noopener" class="gb:onboarding:text-accent">Ollama</a>, <a href="https://lmstudio.ai" target="_blank" rel="noopener" class="gb:onboarding:text-accent">LM Studio</a>, or <a href="https://jan.ai" target="_blank" rel="noopener" class="gb:onboarding:text-accent">Jan</a> on your computer — they run AI models locally. Nothing leaves your machine, free forever. After install, point getbased at it.</p>
    <button type="button" class="chat-setup-btn {QUIZ_SETUP} {ONBOARDING_FOCUS}" data-chat-onboarding-action="open-provider-settings" data-chat-provider="ollama">Open Local AI setup →</button>
  {:else if branch === 'bitcoin'}
    <p><strong>Pay with Bitcoin → 2 options</strong></p>
    <div class="chat-quiz-options gb:onboarding:flex gb:onboarding:flex-col gb:onboarding:gap-2 gb:onboarding:mt-2 gb:onboarding:mb-2.5">
      <ChatProviderChoice action="open-provider-settings" provider="routstr" title="Routstr" detail="Lightning + Cashu eCash. No account. Top up with a QR code."/>
      <ChatProviderChoice action="open-provider-settings" provider="ppq" title="PPQ" detail="300+ models. Pay with BTC, Lightning, Monero, or Litecoin."/>
    </div>
  {:else}
    <p>Welcome, {name}! Next, pick how you want to power the AI:</p>
    <div class="chat-quiz-options gb:onboarding:flex gb:onboarding:flex-col gb:onboarding:gap-2 gb:onboarding:mt-3 gb:onboarding:mb-2.5">
      <ChatProviderChoice action="set-provider-branch" branch="card" icon="💳" title="Easiest — pay with a card" detail="One-click login through OpenRouter." recommended/>
      <ChatProviderChoice action="set-provider-branch" branch="cli" icon="terminal" title="Use an AI subscription I already have" detail="Requires an installed CLI, sign-in, and getbased Companion."/>
      <ChatProviderChoice action="set-provider-branch" branch="local" icon="🔒" title="Most private — runs on my computer" detail="No internet calls, free forever. Needs a desktop app."/>
      <ChatProviderChoice action="set-provider-branch" branch="bitcoin" icon="₿" title="No account — pay with Bitcoin" detail="Anonymous. Top up with sats or eCash."/>
      <ChatProviderChoice action="open-ai-settings" icon="🔑" title="Advanced: I have an API key" detail="Skip ahead to AI settings to paste it."/>
    </div>
    <div class="chat-quiz-skip gb:onboarding:text-center gb:onboarding:mt-3.5">
      <button type="button" class="chat-quiz-skip-btn {ONBOARDING_FOCUS} gb:onboarding:bg-transparent gb:onboarding:border gb:onboarding:border-line gb:onboarding:rounded-lg gb:onboarding:text-secondary gb:onboarding:py-2 gb:onboarding:px-3.5 gb:onboarding:text-[12.5px] gb:onboarding:cursor-pointer gb:onboarding:transition-colors gb:onboarding:duration-150 gb:onboarding:[font-family:inherit] gb:onboarding:hover:border-accent gb:onboarding:hover:text-accent gb:onboarding:motion-reduce:transition-none"
        data-chat-onboarding-action="skip-provider-setup">Try the app first — I’ll connect AI later</button>
    </div>
  {/if}
</div>
