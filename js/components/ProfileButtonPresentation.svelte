<script lang="ts">
  import type { ProfileButtonView } from '../profile-button-presentation.js';
  let { view }: { view: ProfileButtonView } = $props();

  const buttonClass = [
    'profile-compact-btn',
    'gb:profile-button-app-button:profile-button-app-button-block',
    'gb:profile-button-app-button-hover:profile-button-app-button-hover-block',
    'gb:profile-button-app-button-phone:profile-button-app-button-phone-block',
    'gb:profile-button-redesign-button:profile-button-redesign-button-block',
    'gb:profile-button-redesign-button-small:profile-button-redesign-button-small-block',
    'gb:profile-button-redesign-button-touch:profile-button-redesign-button-touch-block',
  ].join(' ');
  const dotClass = [
    'profile-compact-dot',
    'gb:profile-button-app-dot:profile-button-app-dot-block',
    'gb:profile-button-app-dot-phone:profile-button-app-dot-phone-block',
  ].join(' ');
  const imageClass = [
    'profile-compact-dot',
    'profile-compact-img',
    'gb:profile-button-app-dot:profile-button-app-dot-block',
    'gb:profile-button-app-dot-phone:profile-button-app-dot-phone-block',
    'gb:profile-button-app-image:profile-button-app-image-block',
  ].join(' ');
  const nameClass = [
    'profile-compact-name',
    'gb:profile-button-app-name:profile-button-app-name-block',
    'gb:profile-button-app-hidden:profile-button-app-hidden-block',
  ].join(' ');
  const arrowClass = [
    'profile-compact-arrow',
    'gb:profile-button-app-arrow:profile-button-app-arrow-block',
    'gb:profile-button-app-hidden:profile-button-app-hidden-block',
  ].join(' ');
</script><svelte:options preserveWhitespace={true} /><button class={buttonClass} data-nav-action="open-client-list" title="Manage clients">
    {#if view.badge.kind === 'image'}<img class={imageClass} src={view.badge.source} alt="">{:else}<span class={dotClass} style={'background:' + view.badge.background}>{view.badge.initial}</span>{/if}
    <span class={nameClass}>{view.name}</span>
    <span class={arrowClass}>▼</span>
  </button>