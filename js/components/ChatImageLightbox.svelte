<script lang="ts">
  let { src, close }: { src: string; close(): void ;} = $props();
  function escape(event: KeyboardEvent) {
    if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); close(); }
  }
</script>
<svelte:document onkeydowncapture={escape}/>
<div class="chat-lightbox gb:attachment:fixed gb:attachment:inset-0 gb:attachment:z-[10000] gb:attachment:bg-black/85 gb:attachment:flex gb:attachment:items-center gb:attachment:justify-center" data-chat-attachment-view-dialog role="dialog" aria-modal="true" aria-label="Attached image preview" tabindex="-1" onclick={event=>{if(event.target===event.currentTarget)close();}} onkeydown={event=>{if(event.key==='Escape')escape(event);}}>
  <img {src} alt="Attachment preview" class="gb:attachment:max-w-[90vw] gb:attachment:max-h-[90dvh] gb:attachment:rounded-lg gb:attachment:shadow-[0_0_40px_rgba(0,0,0,.5)]"/>
  <button type="button" class="chat-lightbox-close gb:attachment:fixed gb:attachment:top-[max(18px,env(safe-area-inset-top))] gb:attachment:right-[18px] gb:attachment:size-11 gb:attachment:border gb:attachment:border-white/35 gb:attachment:rounded-full gb:attachment:bg-black/55 gb:attachment:text-white gb:attachment:text-[28px] gb:attachment:leading-none gb:attachment:cursor-pointer gb:attachment:focus-visible:outline-[3px] gb:attachment:focus-visible:outline-white gb:attachment:focus-visible:outline-offset-[3px]" aria-label="Close image preview" onclick={close}>×</button>
</div>
