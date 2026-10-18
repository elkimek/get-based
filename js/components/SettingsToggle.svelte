<script lang="ts">
  let { id, label, help, checked, action, voiceSetting, syncAction, disabled = false, compact = false, providerChange, touch = false, agent, className = '', onToggle }: {
    id: string; label: string; help?: string; checked: boolean; action?: string;
    voiceSetting?: string; syncAction?: string; disabled?: boolean; compact?: boolean; providerChange?: string; touch?: boolean | 'coarse';
    agent?: string; className?: string; onToggle?: (checked: boolean) => unknown;
  } = $props();

  function handleChange(event: Event): void {
    if (!onToggle) return;
    event.stopPropagation();
    const input = event.currentTarget as HTMLInputElement;
    const next = input.checked;
    // Keep the last accepted value until the owner publishes its persisted state.
    input.checked = checked;
    onToggle(next);
  }
</script>
<label class="{className} toggle-switch gb:settings:relative {touch === 'coarse' ? 'gb:settings:inline-block' : 'gb:settings:inline-flex'} gb:settings:shrink-0 gb:settings:cursor-pointer gb:privacy:max-[720px]:mt-0.5 gb:voice:max-[720px]:mt-0.5 {touch === 'coarse' ? 'gb:settings:w-9 gb:settings:h-5 gb:settings:[@media(pointer:coarse)]:w-11 gb:settings:[@media(pointer:coarse)]:h-11' : touch ? 'gb:settings:w-11 gb:settings:h-11' : compact ? 'gb:settings:w-8 gb:settings:h-7' : 'gb:settings:w-9 gb:settings:h-5'}">
  <input type="checkbox" {id} aria-label={label} aria-describedby={help} {checked} {disabled} data-settings-action={action} data-voice-setting={voiceSetting} data-sync-action={syncAction} data-provider-panel-change={providerChange} data-agent={agent} onclick={event => { if (onToggle) event.stopPropagation(); }} onchange={handleChange} class="gb:peer gb:settings:absolute gb:settings:inset-0 gb:settings:m-0 gb:settings:w-full gb:settings:h-full gb:settings:opacity-0 gb:settings:cursor-pointer">
  <span aria-hidden="true" class="gb:settings:pointer-events-none gb:settings:absolute gb:settings:rounded-[20px] gb:settings:bg-line gb:settings:transition-colors gb:settings:peer-checked:bg-accent gb:settings:peer-disabled:opacity-45 gb:settings:peer-focus-visible:outline-2 gb:settings:peer-focus-visible:outline-offset-2 gb:settings:peer-focus-visible:outline-accent gb:settings:motion-reduce:transition-none gb:settings:before:content-[''] gb:settings:before:absolute gb:settings:before:w-3.5 gb:settings:before:h-3.5 gb:settings:before:rounded-full gb:settings:before:transition-[transform,background] gb:settings:motion-reduce:before:transition-none {compact ? 'gb:settings:inset-x-0 gb:settings:top-[5px] gb:settings:h-[18px] gb:settings:before:left-0.5 gb:settings:before:bottom-0.5 gb:settings:before:bg-[var(--bg-primary)] gb:settings:peer-checked:before:translate-x-3.5' : `${touch === 'coarse' ? 'gb:settings:inset-0 gb:settings:[@media(pointer:coarse)]:inset-x-1 gb:settings:[@media(pointer:coarse)]:top-3 gb:settings:[@media(pointer:coarse)]:bottom-auto gb:settings:[@media(pointer:coarse)]:h-5' : touch ? 'gb:settings:inset-x-1 gb:settings:top-3 gb:settings:h-5' : 'gb:settings:inset-0'} gb:settings:before:left-[3px] gb:settings:before:bottom-[3px] gb:settings:before:bg-secondary gb:settings:peer-checked:before:translate-x-4 gb:settings:peer-checked:before:bg-white`}"></span>
</label>
