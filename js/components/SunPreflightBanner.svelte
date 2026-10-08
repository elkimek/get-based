<script lang="ts">
  import type { SunPreflightBannerView } from '../light-session-presentation.js';
  let { view }: { view: SunPreflightBannerView } = $props();
  const tone = $derived(view.className === 'sun-uvi-extreme' ? 'gb:light-session:bg-[var(--red-bg)] gb:light-session:border-danger' : view.className === 'sun-uvi-veryhigh' ? 'gb:light-session:bg-[var(--orange-bg)] gb:light-session:border-warning' : 'gb:light-session:bg-[var(--yellow-bg)] gb:light-session:border-warning');
</script>
<div class={`${view.className} ${tone} gb:light-session:block gb:light-session:px-3.5 gb:light-session:py-2.5 gb:light-session:rounded-control gb:light-session:text-[13px] gb:light-session:leading-normal gb:light-session:border gb:light-session:text-ink gb:light-session:wrap-anywhere`} data-light-session-presentation><strong class="gb:light-session:text-ink"><span aria-hidden="true">{view.icon}</span>{' '}{view.title}</strong>{' '}{view.text}{' Use shade, clothing, and suitable sun protection; shorten or skip the session when warnings apply.'}</div>
