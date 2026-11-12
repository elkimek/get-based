<script lang="ts">
  let {date, cutoff, announcementUrl, recovery = false}: {date: string; cutoff: string; announcementUrl: string | null; recovery?: boolean} = $props();
</script>
{#if recovery}
  <dialog id="hosted-cutoff-dialog" class="hosted-cutoff-dialog" aria-labelledby="hosted-cutoff-title">
    <h1 id="hosted-cutoff-title">Personal use here has ended</h1>
    <p>This address remains available for recovery. Text drafts are saved before opening recovery. Your saved browser records stay here.</p>
    <p data-cutoff-error role="status" aria-live="polite">Saving pending work…</p>
    <div data-cutoff-work hidden>
      <p>Download each unsaved copy below before leaving. These copies are unencrypted. Keep them private, then paste the text or reattach the images in your own installation.</p>
      <ul data-cutoff-files></ul>
      <label data-cutoff-confirm-label><input type="checkbox" data-cutoff-confirm /> I have saved every unsaved copy shown here.</label>
    </div>
    <div class="hosted-cutoff-actions">
      <button type="button" data-cutoff-retry>Save drafts and open recovery</button>
      <button type="button" data-cutoff-continue disabled>Continue after saving copies</button>
      <a href="https://docs.getbased.health/guides/move-to-self-hosting" target="_blank" rel="noopener">Recovery guide</a>
    </div>
    <p>Keep this window open if saving fails. Nothing here clears the original records.</p>
  </dialog>
{:else}
  <aside id="hosted-transition-banner" class="hosted-transition-banner" aria-label="Move to self-hosting">
    <span><strong>getbased is moving to self-hosting.</strong> Personal use here ends <time datetime={cutoff}>{date}</time>. Recovery stays available at this address.</span>
    <button type="button">Start migration</button>
    <a href="https://docs.getbased.health/guides/move-to-self-hosting" target="_blank" rel="noopener">Migration guide</a>
    {#if announcementUrl}<a href={announcementUrl} target="_blank" rel="noopener">Announcement</a>{/if}
  </aside>
{/if}
