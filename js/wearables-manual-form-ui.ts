
import {renderWearableTagChips, renderWearableNoteField} from './wearables-entry-presentation.js';

const WEARABLE_LOG_ACTION_ATTR = 'data-wearable-log-action';
const wearableManualFormDelegateRoots = new WeakSet<EventTarget>();

// Shared presentation uses the same authored manual component as both form owners.
export function _renderTagChips(metricId: unknown) {
  return renderWearableTagChips(metricId);
}

export function toggleManualLogChip(btn: Pick<Element, 'classList'>, event?: Pick<Event, 'stopPropagation'> | null) {
  if (event) event.stopPropagation();
  btn.classList.toggle('active');
}

function closestWearableLogAction(target: EventTarget | null) {
  if (!target || typeof (target as Partial<Pick<Element, 'closest'>>).closest !== 'function') return null;
  return (target as Element).closest(`[${WEARABLE_LOG_ACTION_ATTR}]`);
}

function handleWearableLogActionClick(event: Event) {
  const actionEl = closestWearableLogAction(event.target);
  if (!actionEl || !(event.currentTarget as Node | null)?.contains?.(actionEl)) return;
  if (actionEl.getAttribute(WEARABLE_LOG_ACTION_ATTR) === 'toggle-chip') {
    toggleManualLogChip(actionEl, event);
  }
}

export function installWearablesManualFormDelegates(root: EventTarget | null = (typeof document !== 'undefined' ? document : null)) {
  if (!root || wearableManualFormDelegateRoots.has(root)) return;
  wearableManualFormDelegateRoots.add(root);
  root.addEventListener('click', handleWearableLogActionClick);
}

if (typeof document !== 'undefined') {
  installWearablesManualFormDelegates(document);
}

export function _collectActiveChips(card: ParentNode) {
  return Array.from(card.querySelectorAll('.wearable-log-chip.active')).map(b => (b as HTMLElement).dataset.tag);
}

export function inputValueFromElement(el: unknown) {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return el.value;
  return '';
}

export function inputValueById(id: string) {
  return inputValueFromElement(document.getElementById(id));
}

// Shared note-textarea snippet for both manual-log forms. The `idSuffix`
// disambiguates dashboard-card (`wl-...-note`) vs detail-modal (`wlad-note`).
export function _renderNoteField(idSuffix: unknown = 'wl-note') {
  return renderWearableNoteField(idSuffix);
}
