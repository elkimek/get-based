<script lang="ts">
  import { COMMON_AUDIT_ROOMS, type AuditPauseRowView } from '../light-tools-presentation.js';
  import { lightToolClasses as c } from '../light-tools-classes.js';
  let { rows }: { rows: AuditPauseRowView[] } = $props();
</script>
{#each rows as row}
  <li data-light-tool-view class={c('audit-pause-row')}>
    <span class={c('audit-pause-level')}>{row.reading}</span>
    <input type="text" class={c('audit-room-label-input tool-control')} aria-label={row.ariaLabel} data-idx={row.index} placeholder={row.placeholder} value={row.value} list={row.list}/>
    <datalist id={row.list}>{#each COMMON_AUDIT_ROOMS as room}<option value={room}></option>{/each}</datalist>
  </li>
{/each}
