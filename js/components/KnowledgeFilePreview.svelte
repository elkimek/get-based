<script lang="ts">
  import { AI_DIALOG_PANEL, AI_DIALOG_BUTTON, AI_DIALOG_COPY } from '../ai-action-dialog-classes.js';
  interface Props { files: readonly { name: string; text: string }[]; close(): void }
  let { files, close }: Props = $props();
  let selected = $state(0), page = $state(0);
  const size=100000;
  const text=$derived(files[selected]?.text??'');
  const pages=$derived(Math.max(1,Math.ceil(text.length/size)));
</script>
<div class={AI_DIALOG_PANEL} role="dialog" aria-modal="true" aria-label="Local extracted document text" data-knowledge-file-preview>
  <h2 class="gb:ai-dialog:mt-0 gb:ai-dialog:text-lg">Local extracted text</h2>
  <p class={AI_DIALOG_COPY}>This preview stays on this device. Closing it does not apply the import.</p>
  <label class={AI_DIALOG_COPY} for="knowledge-file-preview-source">Document</label>
  <select id="knowledge-file-preview-source" class="{AI_DIALOG_BUTTON} gb:ai-dialog:w-full gb:ai-dialog:min-w-0" value={selected} onchange={event=>{selected=Number(event.currentTarget.value);page=0;}}>
    {#each files as file,index}<option value={index}>{file.name}</option>{/each}
  </select>
  <textarea aria-label="Extracted source text" readonly rows="12" class="gb:ai-dialog:box-border gb:ai-dialog:w-full gb:ai-dialog:max-h-[50vh] gb:ai-dialog:overflow-y-auto gb:ai-dialog:whitespace-pre-wrap gb:ai-dialog:break-words gb:ai-dialog:text-xs" value={text.slice(page*size,(page+1)*size)}></textarea>
  <p class={AI_DIALOG_COPY} aria-live="polite">Page {page+1} of {pages}</p>
  <button type="button" class={AI_DIALOG_BUTTON} disabled={page===0} onclick={()=>page--}>Previous text page</button>
  <button type="button" class={AI_DIALOG_BUTTON} disabled={page+1>=pages} onclick={()=>page++}>Next text page</button>
  <button type="button" class={AI_DIALOG_BUTTON} data-knowledge-preview-close onclick={close}>Close preview</button>
</div>
