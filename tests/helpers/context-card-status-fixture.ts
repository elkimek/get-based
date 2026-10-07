// Real authored slots replace fabricated DOM in request/cache regression fixtures.
import { renderHTML } from '../../js/components/ContextCardStatus.svelte.html.js';
import { contextCardStatusTicket } from '../../js/context-card-status.js';
import { ensureContextCardStatus } from '../../js/context-card-status-view.js';
import type { ContextCardStatusSlot } from '../../js/context-card-status.js';
let sequence = 0;
export function contextStatusFixture(host: HTMLElement, keys: readonly string[], localSummary: (key: string) => string = () => 'Local summary'): void {
  const renderId = `status-fixture-${++sequence}`, ticket = contextCardStatusTicket();
  const slots: ContextCardStatusSlot[] = ['indicator', 'summary', 'insight', 'tips'];
  const markup = keys.flatMap(cardKey => slots.map(slot => {
    const wrapper = document.createElement('div');
    wrapper.dataset.contextStatusHost = ''; wrapper.dataset.contextStatusSlot = slot; wrapper.dataset.contextStatusKey = cardKey;
    wrapper.dataset.contextStatusRender = renderId; wrapper.dataset.contextStatusTicket = ticket; wrapper.dataset.contextLocalSummary = localSummary(cardKey);
    wrapper.style.display = 'contents'; wrapper.innerHTML = renderHTML({ slot, cardKey, renderId, ticket, localSummary: localSummary(cardKey) });
    return wrapper;
  }));
  host.replaceChildren(...markup); ensureContextCardStatus();
}
export function contextStatusElement(kind: string, key: string, host: ParentNode = document): HTMLElement | null {
  const classes: Record<string, string> = { dot: 'ctx-health-dot', ai: 'ctx-ai-summary', summary: 'context-card-body', health: 'ctx-health-indicator', 'health-label': 'ctx-health-label', tips: 'context-card-tips-host' };
  const slot: Record<string, string> = { dot: 'indicator', health: 'indicator', 'health-label': 'indicator', ai: 'insight', summary: 'summary', tips: 'tips' };
  return host.querySelector<HTMLElement>(`[data-context-status-key="${key}"][data-context-status-slot="${slot[kind]}"] .${classes[kind]}`);
}
