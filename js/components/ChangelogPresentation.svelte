<script lang="ts">
  import type { ChangelogView } from '../changelog-presentation.js';
  import { changelogClasses as c } from '../changelog-classes.js';

  let { view }: { view: ChangelogView } = $props();
</script><svelte:options preserveWhitespace={true} /><div class="gb-modal-head">
    <div>
      <div class="gb-modal-title">What's New</div>
    </div>
    <button type="button" class="modal-close" aria-label="Close" data-changelog-action="close">&times;</button>
  </div>
  <div class="gb-form-body">{#each
    view.entries as entry
  }<div
    class={c('changelog-entry', 'entry')}
  ><div
    class={c('changelog-header', 'header')}
  ><span
    class={c('changelog-version', 'version')}
  >v{entry.version} — {entry.title}</span><span
    class={c('changelog-date', 'date')}
  >{entry.date}</span></div><ul
    class={c('changelog-items', 'items')}
  >{#each
    entry.items as item
  }<li
    class={c('changelog-item', 'item')}
  >{@html item}</li>{/each}</ul></div>{/each}</div>