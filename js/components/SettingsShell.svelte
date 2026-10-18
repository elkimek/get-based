<script lang="ts">
  import { onDestroy, onMount, untrack } from 'svelte';
  import SettingsPanels from './SettingsPanels.svelte';
  import AppExtensionSlot from './AppExtensionSlot.svelte';
  import { SETTINGS_TABS, SETTINGS_TAB_CLASS } from '../settings-shell-contract.js';
  import type { SettingsShellProps } from '../settings-shell-contract.js';
  let { initialTab, panels, extensionTabs, onNavigateTab }: SettingsShellProps = $props();
  let activeTab = $state(untrack(() => initialTab));
  let orientation = $state<'vertical' | 'horizontal'>('vertical');
  let keyboardRequest = 0;
  let keyboardDestination: string | null = null;
  export function selectTab(id: string): void {
    if (id !== keyboardDestination) ++keyboardRequest;
    activeTab = id;
  }
  onDestroy(() => { ++keyboardRequest; });
  onMount(() => {
    const media = matchMedia('(min-width: 721px)');
    const update = () => { orientation = media.matches ? 'vertical' : 'horizontal'; };
    update(); media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  });
  function navigateWithKeyboard(event: KeyboardEvent): void {
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[role="tab"]') : null;
    if (!target) return;
    const bar = target.closest('[role="tablist"]');
    const buttons = Array.from(bar?.querySelectorAll<HTMLButtonElement>('[role="tab"]:not([disabled])') ?? []);
    const index = buttons.indexOf(target as HTMLButtonElement);
    const previous = orientation === 'vertical' ? 'ArrowUp' : 'ArrowLeft';
    const next = orientation === 'vertical' ? 'ArrowDown' : 'ArrowRight';
    let destination: HTMLButtonElement | undefined;
    if (event.key === previous) destination = buttons[(index - 1 + buttons.length) % buttons.length];
    else if (event.key === next) destination = buttons[(index + 1) % buttons.length];
    else if (event.key === 'Home') destination = buttons[0];
    else if (event.key === 'End') destination = buttons.at(-1);
    if (!destination?.dataset.settingsTab) return;
    event.preventDefault();
    const id = destination.dataset.settingsTab;
    keyboardDestination = id;
    const request = ++keyboardRequest;
    const sourceFocus = document.activeElement;
    const selected = destination;
    void Promise.resolve(onNavigateTab(id)).then(result => {
      if (request !== keyboardRequest) return;
      keyboardDestination = null;
      if (result !== false && bar?.isConnected && target.isConnected && selected.isConnected
        && target.closest('[role="tablist"]') === bar && selected.closest('[role="tablist"]') === bar
        && (document.activeElement === sourceFocus || document.activeElement === selected)) selected.focus();
    });
  }
</script>

<div class="
    settings-modal-head gb:settings:flex gb:settings:shrink-0 gb:settings:items-center
    gb:settings:justify-between gb:settings:gap-[18px] gb:settings:px-[26px] gb:settings:py-[22px]
    gb:settings:border-b gb:settings:border-line gb:settings:bg-dialog-head gb:settings:max-[720px]:px-4
    gb:settings:max-[720px]:py-3.5
  ">
  <h2 id="settings-title" class="
    gb:settings:m-0 gb:settings:mt-[3px] gb:settings:text-ink gb:settings:font-display gb:settings:text-[22px]
    gb:settings:font-bold gb:settings:tracking-normal gb:settings:max-[720px]:text-xl
  ">Settings</h2>
  <button type="button" aria-label="Close" data-settings-action="close" class="
    gb:settings:static gb:settings:inline-flex gb:settings:items-center gb:settings:justify-center
    gb:settings:w-[34px] gb:settings:h-[34px] gb:settings:shrink-0 gb:settings:p-0 gb:settings:border
    gb:settings:border-line gb:settings:rounded-control gb:settings:bg-surface gb:settings:text-muted
    gb:settings:text-[22px] gb:settings:leading-none gb:settings:cursor-pointer gb:settings:hover:text-ink
    gb:settings:hover:border-accent gb:settings:hover:bg-hover gb:settings:focus-visible:outline-2
    gb:settings:focus-visible:outline-offset-2 gb:settings:focus-visible:outline-accent
    gb:settings:[@media(pointer:coarse)]:min-w-11 gb:settings:[@media(pointer:coarse)]:min-h-11
  ">×</button>
</div>
<div class="
    settings-layout gb:settings:grid gb:settings:grid-cols-[200px_minmax(0,1fr)]
    gb:settings:h-[min(560px,calc(90dvh-78px))] gb:settings:min-h-0 gb:settings:max-h-[calc(90dvh-78px)]
    gb:settings:gap-0 gb:settings:max-[720px]:flex gb:settings:max-[720px]:flex-col
    gb:settings:max-[720px]:flex-auto gb:settings:max-[720px]:max-h-none gb:settings:max-[720px]:overflow-hidden
  ">
  <div class="
    settings-tabs-bar gb:settings:static gb:settings:top-auto gb:settings:z-2 gb:settings:flex
    gb:settings:flex-col gb:settings:gap-[3px] gb:settings:m-0 gb:settings:px-3.5 gb:settings:py-[18px]
    gb:settings:border-r gb:settings:border-b-0 gb:settings:border-line gb:settings:bg-secondary-surface
    gb:settings:overflow-y-auto gb:settings:max-[720px]:relative gb:settings:max-[720px]:flex-none
    gb:settings:max-[720px]:flex-row gb:settings:max-[720px]:items-center gb:settings:max-[720px]:min-h-[58px]
    gb:settings:max-[720px]:overflow-x-auto gb:settings:max-[720px]:overflow-y-hidden
    gb:settings:max-[720px]:border-r-0 gb:settings:max-[720px]:border-b gb:settings:max-[720px]:gap-1.5
    gb:settings:max-[720px]:px-2.5 gb:settings:max-[720px]:pt-2 gb:settings:max-[720px]:pb-2.5
    gb:settings:max-[720px]:scroll-px-2.5 gb:settings:max-[720px]:overscroll-x-contain
    gb:settings:max-[600px]:[scrollbar-width:none] gb:settings:max-[600px]:[&::-webkit-scrollbar]:hidden
  " role="tablist" aria-label="Settings sections" aria-orientation={orientation} tabindex="-1" onkeydown={navigateWithKeyboard}>
    {#each SETTINGS_TABS as tab (tab.id)}
      {#if tab.id === 'privacy'}<AppExtensionSlot html={extensionTabs}/>{/if}
      <button type="button" role="tab" id="settings-nav-{tab.id}" aria-selected={activeTab === tab.id} aria-controls="settings-tab-{tab.id}" tabindex={activeTab === tab.id ? 0 : -1} class="{SETTINGS_TAB_CLASS}{activeTab === tab.id ? ' active' : ''}" data-tab={tab.id} data-settings-tab={tab.id} data-settings-shell-tab>
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          {#if tab.id === 'display'}<circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
          {:else if tab.id === 'ai'}<path d="M12 2a4 4 0 0 0-4 4v2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2h-2V6a4 4 0 0 0-4-4z"/><circle cx="9" cy="14" r="1"/><circle cx="15" cy="14" r="1"/>
          {:else if tab.id === 'voice'}<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3M8 22h8"/>
          {:else if tab.id === 'privacy'}<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          {:else if tab.id === 'data'}<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          {:else if tab.id === 'wearables'}<circle cx="12" cy="12" r="6"/><path d="M12 9v3l2 2M9 2h6M9 22h6"/>
          {:else if tab.id === 'agent'}<circle cx="7" cy="14" r="4"/><path d="m10.5 11 7.5-7.5M17 6l3 3M14 9l3 3"/>{/if}
        </svg>{tab.label}
      </button>
    {/each}
  </div>
  <div class="
    settings-content gb:settings:relative gb:settings:z-1 gb:settings:min-w-0 gb:settings:min-h-0
    gb:settings:overflow-y-auto gb:settings:overflow-x-hidden gb:settings:px-6 gb:settings:pt-[18px]
    gb:settings:pb-6 gb:settings:max-[720px]:flex-auto gb:settings:max-[720px]:px-4 gb:settings:max-[720px]:pb-4
  ">
    <SettingsPanels {panels}/>
  </div>
</div>
