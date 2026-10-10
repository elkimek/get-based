import { renderHTML as renderConfirmHTML } from './components/UtilsConfirmPresentation.svelte.html.js';
import { renderHTML as renderPromptHTML } from './components/UtilsPromptPresentation.svelte.html.js';
import { projectUtilsConfirm, projectUtilsPrompt, type UtilsConfirmFacts, type UtilsPromptFacts } from './utils-dialog-presentation.js';

/** Only markup serialization; no utils import cycle or modal/event/data ownership. */
export function renderUtilsConfirm(facts: UtilsConfirmFacts): string {
  return renderConfirmHTML({ view: projectUtilsConfirm(facts) });
}
export function renderUtilsPrompt(facts: UtilsPromptFacts): string {
  return renderPromptHTML({ view: projectUtilsPrompt(facts) });
}
