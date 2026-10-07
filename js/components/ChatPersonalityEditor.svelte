<script lang="ts">
  import {PERSONA_AGREEMENT_TEXT,type PersonaEditorContent,type PersonaEditorActions} from '../chat-persona-editor-contract.js';
  import {PERSONA_EDITOR,PERSONA_HEAD,PERSONA_CLOSE,PERSONA_BODY,PERSONA_LABEL,PERSONA_NAME,PERSONA_TEXT,PERSONA_FOOTER,PERSONA_AGREEMENT,PERSONA_SAVE,PERSONA_CANCEL,PERSONA_GENERATE,PERSONA_THEME_INPUT} from '../chat-personality-classes.js';
  let {content,actions}:{content:PersonaEditorContent;actions:PersonaEditorActions}=$props();
</script>
<div class={PERSONA_EDITOR} data-chat-persona-editor-view role="dialog" aria-modal="true" aria-labelledby="chat-personality-editor-title" aria-describedby="chat-personality-editor-description">
  <div class={PERSONA_HEAD}><div class="gb:persona:min-w-0">
    <div class="chat-personality-editor-kicker gb:persona:mb-1 gb:persona:text-secondary gb:persona:font-mono gb:persona:text-[10px] gb:persona:font-bold gb:persona:tracking-[.1em] gb:persona:uppercase">Custom persona</div>
    <h2 id="chat-personality-editor-title" class="gb:persona:m-0 gb:persona:text-ink gb:persona:font-display gb:persona:text-[21px] gb:persona:leading-[1.25] gb:persona:max-[600px]:text-[19px]">{content.isNew?'Create a personality':'Edit personality'}</h2>
    <p id="chat-personality-editor-description" class="gb:persona:max-w-[560px] gb:persona:mt-1.5 gb:persona:mb-0 gb:persona:text-secondary gb:persona:text-xs gb:persona:leading-[1.45]">Generate a starting point or write your own. Everything stays editable before you save.</p>
  </div><button type="button" class={PERSONA_CLOSE} data-chat-personality-action="cancel-custom" aria-label="Close personality editor" onclick={()=>actions.cancel()}>×</button></div>
  <div class={PERSONA_BODY}>
    <label class={PERSONA_LABEL} for="chat-personality-custom-name">Person, archetype, or communication style</label>
    <div class="chat-personality-custom-header gb:persona:flex gb:persona:gap-2 gb:persona:max-[600px]:flex-col">
      <input type="text" id="chat-personality-custom-name" class="{PERSONA_NAME} {PERSONA_THEME_INPUT}" placeholder="e.g. A longevity researcher" maxlength="60" value={content.name} data-chat-personality-input="mark-dirty" oninput={()=>actions.changed()}>
      <button id="chat-personality-generate-btn" class={PERSONA_GENERATE} type="button" data-chat-personality-action="generate-custom" onclick={()=>actions.generate()}>Generate draft</button>
    </div>
    <div class="chat-personality-editor-prompt-head gb:persona:flex gb:persona:items-baseline gb:persona:justify-between gb:persona:gap-3 gb:persona:mt-[18px]"><label class={PERSONA_LABEL} for="chat-personality-custom-prompt">Persona instructions</label><span class="gb:persona:text-secondary gb:persona:text-[10px]">Review and edit the generated draft</span></div>
    <textarea id="chat-personality-custom-prompt" class="{PERSONA_TEXT} {PERSONA_THEME_INPUT}" placeholder="Describe how you want the AI to communicate, or enter a name above and generate a draft..." spellcheck="true" value={content.prompt} data-chat-personality-input="resize-and-mark-dirty" oninput={()=>actions.changed()}></textarea>
  </div>
  <div class={PERSONA_FOOTER}>
    {#if content.agreementRequired}<label class={PERSONA_AGREEMENT} for="chat-personality-agreement-checkbox"><input id="chat-personality-agreement-checkbox" type="checkbox" required class="gb:persona:size-[17px] gb:persona:shrink-0 gb:persona:m-0 gb:persona:accent-accent gb:persona:cursor-pointer" data-chat-personality-input="mark-dirty" oninput={()=>actions.changed()}><span>{PERSONA_AGREEMENT_TEXT}</span></label>
    {:else}<span class="chat-personality-disclaimer gb:persona:max-w-[500px] gb:persona:text-secondary gb:persona:text-[11px] gb:persona:leading-[1.45]">Custom personas are AI-generated interpretations—not the real person or endorsed by them. Use them responsibly and do not imply a real person participated without permission.</span>{/if}
    <div class="chat-personality-editor-actions gb:persona:flex gb:persona:items-center gb:persona:gap-2 gb:persona:shrink-0 gb:persona:max-[600px]:grid gb:persona:max-[600px]:grid-cols-2">
      <button class={PERSONA_CANCEL} type="button" data-chat-personality-action="cancel-custom" onclick={()=>actions.cancel()}>Cancel</button><button class={PERSONA_SAVE} type="button" data-chat-personality-action="save-custom" disabled onclick={()=>actions.save()}>{content.isNew?'Save persona':'Save changes'}</button>
    </div>
  </div>
</div>
