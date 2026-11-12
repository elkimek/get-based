<script lang="ts">
  let {date, cutoff, announcementUrl}: {date: string; cutoff: string; announcementUrl: string | null} = $props();
</script>
<aside id="hosted-transition-banner" class="hosted-transition-banner" aria-label="Move to self-hosting">
  <span><strong>getbased is moving to self-hosting.</strong> Personal use here ends <time datetime={cutoff}>{date}</time>. Recovery stays available at this address.</span>
  <button type="button">Start migration</button>
  <a href="https://docs.getbased.health/guides/move-to-self-hosting" target="_blank" rel="noopener">Migration guide</a>
  {#if announcementUrl}<a href={announcementUrl} target="_blank" rel="noopener">Announcement</a>{/if}
</aside>
