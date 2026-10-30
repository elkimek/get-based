// Custom persona draft workflow; components own markup and input events.
import type { PersonaEditorLocation } from './chat-personality-policy.js';
import { state } from './state.js';
import { showNotification, showConfirmDialog } from './utils.js';
import { callAssistantFeatureAI, hasAssistantFeatureProvider } from './ai-feature-routing.js';
import { renderThreadList } from './chat-threads.js';
import { renderChatMessagesRuntime, notifyCustomPersonalitySavedRuntime, isChatRuntimeStreaming } from './chat-runtime.js';
import { closePersonaEditorOverlay } from './chat-persona-editor-component.js';
import { captureCustomPersonalityDeletion, commitCustomPersonalityDeletion, releaseCustomPersonalityDeletion, captureCustomPersonalityEdit, commitCustomPersonalityEdit, releaseCustomPersonalityEdit, PersonaStorageConflict } from './chat-personality-storage.js';
import { getCustomPersonalities, pickPersonaIcon } from './chat-personality-models.js';
import { buildPersonaAgreementRecord, getPersonaAgreementCheckbox, openPersonaEditorDialog } from './chat-personality-editor.js';
import { closePersonalityPickerView, getPersonalityPickerView } from './chat-personality-picker-view.js';
import { parsePersonaEditorDraft, type PersonaEditorDraft } from '../shared/persona-control-contract.js';
import { capturePersonaSelection, commitPersonaSelection, capturePersonaMetadataRefresh, commitPersonaMetadataRefresh, releasePersonaMetadataRefresh } from './chat-personality-selection.js';

let presentation = { refresh: () => { }, header: () => { } };
export function configurePersonaEditing(next: typeof presentation): void { presentation = next; }
export function getPersonaEditorIdentity(): object | null { return _editorOwner; }

function textControlById(id: string) {
  return (_editorOwner?.overlay.querySelector(`#${id}`) as HTMLInputElement | HTMLTextAreaElement | null);
}

function textareaBySelector(selector: string) {
  return (_editorOwner?.overlay.querySelector(selector) as HTMLTextAreaElement | null);
}

function buttonBySelector(selector: string) {
  return (_editorOwner?.overlay.querySelector(selector) as HTMLButtonElement | null);
}

function buttonById(id: string) {
  return (_editorOwner?.overlay.querySelector(`#${id}`) as HTMLButtonElement | null);
}

let _editingPersonalityId: string | null = null;
let _generatedPersonaIcon: string | null = null;
let _personaCleanState: ReturnType<typeof _getPersonaCurrentState> | null = null;
const PERSONALITY_EDITOR_OVERLAY_ID = 'chat-personality-editor-overlay';

interface PersonaEditorOwner {
  overlay: HTMLElement; profileId: typeof state.currentProfile; threadId: typeof state.currentThreadId;
  root: typeof state.importedData; history: typeof state.chatHistory;
  revision: number; generation: number; saving: boolean; uncertain: boolean; targetId: string | null;
  baseline: { name: string; promptText: string; icon: string } | undefined;
  lease: ReturnType<typeof captureCustomPersonalityEdit> | null;
}
let _editorOwner: PersonaEditorOwner | null = null;
function editorViewIsCurrent(owner: PersonaEditorOwner | null): owner is PersonaEditorOwner {
  return !!owner && _editorOwner === owner && owner.overlay.isConnected
    && document.getElementById(PERSONALITY_EDITOR_OVERLAY_ID) === owner.overlay;
}
function editorIsCurrent(owner: PersonaEditorOwner | null): owner is PersonaEditorOwner {
  return editorViewIsCurrent(owner) && state.currentProfile === owner.profileId && state.currentThreadId === owner.threadId && state.importedData === owner.root && state.chatHistory === owner.history;
}
function readEditorLease(owner: PersonaEditorOwner) {
  const pending = captureCustomPersonalityEdit(owner.targetId, owner.profileId, owner.baseline);
  void pending.catch(() => {}); return pending;
}
function releaseEditorLease(owner: PersonaEditorOwner | null) {
  if (owner?.lease) { void owner.lease.then(value => releaseCustomPersonalityEdit(value.leaseId), () => {}); owner.lease = null; }
}
function closePersonalityPicker() { closePersonalityPickerView(); }
function showPersonalityPickerAfterEditor(personalityId = '') { getPersonalityPickerView()?.setOpen(true, personalityId || 'new'); }

export function closePersonalityEditor({ returnToPicker = true, personalityId = '' } = {}) {
  releaseEditorLease(_editorOwner);
  const overlay = document.getElementById(PERSONALITY_EDITOR_OVERLAY_ID);
  if (overlay) closePersonaEditorOverlay(overlay);
  _editorOwner = null;
  _editingPersonalityId = null;
  _generatedPersonaIcon = null;
  _personaCleanState = null;
  presentation.refresh();
  if (returnToPicker) showPersonalityPickerAfterEditor(personalityId);
  else (document.querySelector('.chat-personality-current') as HTMLElement | null)?.focus();
}

function openPersonalityEditor(id: string, locationLike: PersonaEditorLocation | null | undefined = globalThis.location) {
  releaseEditorLease(_editorOwner);
  const previous = document.getElementById(PERSONALITY_EDITOR_OVERLAY_ID);
  if (previous) closePersonaEditorOverlay(previous, false);
  const isNew = id === 'new';
  const personality = isNew ? null : getCustomPersonalities().find(item => item.id === id);
  if (!isNew && !personality) return;

  _editingPersonalityId = id;
  _generatedPersonaIcon = null;
  closePersonalityPicker();
  const overlay = openPersonaEditorDialog({
    isNew,
    personality: personality!,
    locationLike,
    actions: { generate: generateCustomPersonality, save: saveCustomPersonality, changed: () => { if (_editorOwner) _editorOwner.revision++; markPersonalityDirty(); } },
    onCancel: cancelCustomPersonalityEditor,
  });
  _editorOwner = { overlay, profileId: state.currentProfile, threadId: state.currentThreadId, root: state.importedData, history: state.chatHistory,
    revision: 0, generation: 0, saving: false, uncertain: false, targetId: isNew ? null : id,
    baseline: personality ? { name: personality.name, promptText: personality.promptText, icon: personality.icon } : undefined, lease: null };
  _editorOwner.lease = readEditorLease(_editorOwner);
  autoResizePersonaTextarea();
  snapshotPersonalityClean();
}

function _getPersonaCurrentState() {
  const nameInput = textControlById('chat-personality-custom-name');
  const textarea = textareaBySelector('.chat-personality-custom-textarea');
  return {
    name: nameInput ? nameInput.value : '',
    text: textarea ? textarea.value : '',
    agreementAccepted: getPersonaAgreementCheckbox()?.checked === true,
  };
}

export function isPersonalityDirty() {
  if (!editorViewIsCurrent(_editorOwner) || !_editingPersonalityId || !_personaCleanState) return false;
  const current = _getPersonaCurrentState();
  return current.name !== _personaCleanState.name
    || current.text !== _personaCleanState.text
    || current.agreementAccepted !== _personaCleanState.agreementAccepted;
}

export async function confirmDiscardPersonalityChanges() {
  if (!isPersonalityDirty()) return true;
  const owner = _editorOwner, draft = JSON.stringify(_getPersonaCurrentState());
  const discard = await showConfirmDialog('Discard your unsaved personality changes?');
  return discard && editorViewIsCurrent(owner) && draft === JSON.stringify(_getPersonaCurrentState());
}

export function snapshotPersonalityClean() {
  _personaCleanState = _getPersonaCurrentState();
  const saveBtn = buttonBySelector('.chat-personality-custom-save');
  if (saveBtn) saveBtn.disabled = true;
}

export function markPersonalityDirty() {
  if (_editorOwner?.saving) return;
  const saveBtn = buttonBySelector('.chat-personality-custom-save');
  if (_editorOwner?.uncertain) { if (saveBtn) saveBtn.disabled = true; return; }
  const agreementCheckbox = getPersonaAgreementCheckbox();
  const agreementSatisfied = !agreementCheckbox || agreementCheckbox.checked;
  if (!saveBtn || !_personaCleanState) {
    if (saveBtn) saveBtn.disabled = !agreementSatisfied;
    return;
  }
  const cur = _getPersonaCurrentState();
  const dirty = cur.name !== _personaCleanState.name || cur.text !== _personaCleanState.text;
  const agreementChanged = cur.agreementAccepted !== _personaCleanState.agreementAccepted;
  saveBtn.disabled = !(dirty || agreementChanged) || !agreementSatisfied;
}

export function autoResizePersonaTextarea() {
  const textarea = textareaBySelector('.chat-personality-custom-textarea');
  if (!textarea) return;
  if (textarea.closest('.chat-personality-editor')) return;
  textarea.style.height = 'auto';
  textarea.style.height = Math.min(textarea.scrollHeight, 300) + 'px';
}

export async function saveCustomPersonality() {
  const owner = _editorOwner; if (!editorIsCurrent(owner) || owner.saving || owner.uncertain) return;
  const metadataRequired = !!owner.targetId && state.currentChatPersonality === owner.targetId;
  const textarea = textareaBySelector('.chat-personality-custom-textarea');
  const nameInput = textControlById('chat-personality-custom-name');
  if (!textarea) return;
  const name = (nameInput ? nameInput.value.trim() : '') || 'Custom Personality';
  const icon = _generatedPersonaIcon || (owner.targetId ? undefined : pickPersonaIcon(name));
  const promptText = textarea.value.trim();
  if (!promptText) {
    showNotification('Describe how this personality should communicate before saving.', 'info');
    textarea.focus();
    return;
  }
  const agreementCheckbox = getPersonaAgreementCheckbox();
  if (agreementCheckbox && !agreementCheckbox.checked) {
    showNotification('Accept the persona use agreement before saving.', 'info', 5000);
    agreementCheckbox.focus();
    return;
  }
  const editorOverlay = document.getElementById(PERSONALITY_EDITOR_OVERLAY_ID);
  const personaAgreement = (buildPersonaAgreementRecord(editorOverlay));
  const acceptedDraft = _getPersonaCurrentState();
  const lease = owner.lease || readEditorLease(owner); owner.lease = null;
  owner.saving = true;
  const saveButton = buttonBySelector('.chat-personality-custom-save'); if (saveButton) saveButton.disabled = true;
  let saved: Awaited<ReturnType<typeof commitCustomPersonalityEdit>>;
  let metadataLease: string | null = null;
  try {
    if (metadataRequired) {
      try { metadataLease = (await capturePersonaMetadataRefresh(owner.targetId!)).leaseId; } catch { /* A failed label review cannot prevent a separately valid definition save. */ }
    }
    const snapshot = await lease;
    if (!editorIsCurrent(_editorOwner) || _editorOwner !== owner) { if (metadataLease) releasePersonaMetadataRefresh(metadataLease); owner.saving = false; return; }
    saved = await commitCustomPersonalityEdit(snapshot.leaseId, { name, promptText, ...(icon ? { icon } : {}), ...(personaAgreement ? { personaAgreement } : {}) }, {
      canCommit: () => editorIsCurrent(owner) && (!agreementCheckbox || agreementCheckbox.checked && getPersonaAgreementCheckbox() === agreementCheckbox),
    });
  } catch (error) {
    if (metadataLease) releasePersonaMetadataRefresh(metadataLease);
    owner.saving = false;
    owner.uncertain = error instanceof PersonaStorageConflict && error.persistenceUncertain;
    if (!editorIsCurrent(owner)) return;
    markPersonalityDirty();
    showNotification(error instanceof PersonaStorageConflict ? error.message : 'Could not save custom personality. Your draft is still open.', 'error');
    return;
  }
  let metadataConfirmed = false, metadataRefreshed = false;
  if (metadataLease) {
    try { metadataRefreshed = (await commitPersonaMetadataRefresh(metadataLease, saved, { canCommit: () => editorIsCurrent(owner) })).refreshed; metadataConfirmed = true; }
    catch { /* The verified definition remains saved; report its separate label outcome below. */ }
    finally { releasePersonaMetadataRefresh(metadataLease); }
  }
  owner.saving = false;
  let syncNotified = true;
  try { notifyCustomPersonalitySavedRuntime(owner.profileId); } catch { syncNotified = false; }
  if (!editorIsCurrent(owner)) return;
  const id = saved.id;
  owner.targetId = id; owner.baseline = { name, promptText, icon: saved.icon };
  owner.lease = saved.leaseId ? Promise.resolve({ leaseId: saved.leaseId, id }) : null;
  _editingPersonalityId = id;
  const metadataWarning = state.currentChatPersonality === id && !metadataConfirmed;
  const viewWarning = state.currentChatPersonality === id && metadataConfirmed && !metadataRefreshed;
  const newerEdits = JSON.stringify(acceptedDraft) !== JSON.stringify(_getPersonaCurrentState());
  try {
    if (newerEdits) { _personaCleanState = acceptedDraft; markPersonalityDirty(); presentation.refresh(); }
    else closePersonalityEditor({ personalityId: id });
    presentation.header(); renderThreadList();
  } catch { /* Optional view refresh cannot negate either verified save. */ }
  showNotification(metadataWarning ? 'Persona saved. The conversation label update was not confirmed.' : viewWarning ? 'Persona and conversation label saved. Reopen the conversation to refresh its view.' : syncNotified ? 'Custom personality saved' : 'Custom personality saved on this device. Sync could not be notified.', metadataWarning || viewWarning ? 'info' : 'success');
}

function requestPersonalityEditor(id: string, locationLike: PersonaEditorLocation | null | undefined) {
  const owner = _editorOwner, profile = state.currentProfile, thread = state.currentThreadId;
  const open = () => { if (_editorOwner === owner && state.currentProfile === profile && state.currentThreadId === thread) openPersonalityEditor(id, locationLike); };
  if (isPersonalityDirty()) void confirmDiscardPersonalityChanges().then(discard => { if (discard) open(); }); else open();
}
export function startNewCustomPersonality(locationLike: PersonaEditorLocation | null | undefined = globalThis.location) { requestPersonalityEditor('new', locationLike); }
export function editCustomPersonality(id: string, locationLike: PersonaEditorLocation | null | undefined = globalThis.location) { requestPersonalityEditor(id, locationLike); }
/** Prepare only native input values. The existing native Save owner retains all persistence authority. */
export function openPreparedPersonaEditor(id: string | null, input: PersonaEditorDraft, canOpen: () => boolean, locationLike: PersonaEditorLocation | null | undefined = globalThis.location): boolean {
  const draft = parsePersonaEditorDraft(input), target = id ? getCustomPersonalities().find(item => item.id === id) : null;
  if (!draft || id && !target || !id && (!draft.promptText || draft.promptMode === 'append') || !canOpen() || isPersonalityDirty()) return false;
  const text = draft.promptText === undefined ? undefined : draft.promptMode === 'append' && target?.promptText
    ? `${target.promptText}\n\n${draft.promptText}` : draft.promptText;
  if (text && text.length > 50_000) return false;
  openPersonalityEditor(id || 'new', locationLike);
  const owner = _editorOwner;
  if (!editorIsCurrent(owner) || owner.targetId !== id) return false;
  const name = textControlById('chat-personality-custom-name'), prompt = textareaBySelector('.chat-personality-custom-textarea');
  if (!name || !prompt) return false;
  if (draft.name !== undefined) name.value = draft.name;
  if (text !== undefined) prompt.value = text;
  owner.revision++; markPersonalityDirty();
  return true;
}
export async function cancelCustomPersonalityEditor() {
  const owner = _editorOwner;
  if (!(await confirmDiscardPersonalityChanges()) || _editorOwner !== owner) return;
  closePersonalityEditor({ returnToPicker: editorIsCurrent(owner) });
}

export interface PersonaDeletionOutcome { status: 'deleted' | 'cancelled' | 'conflict' | 'failed' | 'unconfirmed'; selection: 'unchanged' | 'default' | 'unconfirmed' }
let deletionReviewOwner: object | null = null;
/** Opening returns immediately; only the native confirmation can resolve the private completion. */
export async function openCustomPersonaDeletionReview(id: string, canOpen: () => boolean = () => true) {
  const rejected = (status: PersonaDeletionOutcome['status'] = 'conflict') => ({ opened: false, completion: Promise.resolve<PersonaDeletionOutcome>({ status, selection: 'unchanged' }) });
  if (!canOpen() || isPersonalityDirty() || document.querySelector('.confirm-overlay.show')) return rejected();
  const profileId = state.currentProfile, threadId = state.currentThreadId;
  const editor = _editorOwner, draft = JSON.stringify(_getPersonaCurrentState()), root = state.importedData, history = state.chatHistory;
  const threads = state.chatThreads, selected = state.currentChatPersonality, prefKey = `labcharts-${profileId}-chatPersonality`, preference = localStorage.getItem(prefKey);
  const token = {}, originCurrent = () => state.currentProfile === profileId && state.currentThreadId === threadId && state.importedData === root && state.chatHistory === history
    && _editorOwner === editor && JSON.stringify(_getPersonaCurrentState()) === draft;
  let review: Awaited<ReturnType<typeof captureCustomPersonalityDeletion>>;
  try { review = await captureCustomPersonalityDeletion(id, profileId); }
  catch { showNotification('Could not read the personality safely. Reopen the persona editor before deleting.', 'error'); return rejected('failed'); }
  if (!originCurrent() || !canOpen() || document.querySelector('.confirm-overlay.show')) { releaseCustomPersonalityDeletion(review.leaseId); return rejected(); }
  deletionReviewOwner = token;
  const decision = showConfirmDialog(`Delete "${review.name}"? This cannot be undone.`, { confirmLabel: 'Delete persona', ariaLabel: 'Delete persona' });
  const overlay = document.getElementById('confirm-dialog-overlay'), button = overlay?.querySelector('#confirm-ok');
  const canDelete = () => deletionReviewOwner === token && originCurrent() && !!overlay && document.getElementById('confirm-dialog-overlay') === overlay && !!button && overlay.contains(button);
  const selectionCurrent = () => canDelete() && state.chatThreads === threads && state.currentChatPersonality === selected && (preference === selected || preference === null) && localStorage.getItem(prefKey) === preference;
  const completion = (async (): Promise<PersonaDeletionOutcome> => {
    let deleted = false;
    try {
      if (!await decision) return { status: 'cancelled', selection: 'unchanged' };
      if (!canDelete() || isChatRuntimeStreaming()) { showNotification('The persona review changed or a reply is still running. Nothing was deleted. Request a fresh review.', 'info'); return { status: 'conflict', selection: 'unchanged' }; }
      try { await commitCustomPersonalityDeletion(review.leaseId, { canCommit: () => canDelete() && !isChatRuntimeStreaming() }); }
      catch (error) {
        showNotification(error instanceof PersonaStorageConflict ? error.message : 'Could not delete custom personality. Check the native editor before retrying.', 'error');
        return { status: error instanceof PersonaStorageConflict && error.persistenceUncertain ? 'unconfirmed' : 'failed', selection: 'unchanged' };
      }
      deleted = true;
      let selection: PersonaDeletionOutcome['selection'] = 'unchanged';
      if (selected === id && selectionCurrent()) {
        try {
          const fallback = await capturePersonaSelection('default');
          await commitPersonaSelection(fallback.leaseId, { canCommit: selectionCurrent }); selection = 'default';
        } catch (error) { selection = error instanceof Error && 'noChangeApplied' in error && error.noChangeApplied === true ? 'unchanged' : 'unconfirmed'; }
      }
      let notified = true;
      try { notifyCustomPersonalitySavedRuntime(profileId); } catch { notified = false; }
      if (canDelete()) {
        if (_editingPersonalityId === id) _editingPersonalityId = null;
        try { presentation.refresh(); presentation.header(); renderChatMessagesRuntime(); } catch { /* Persistence remains committed when a view cannot refresh. */ }
      }
      showNotification(selected === id && selection !== 'default' ? 'Persona deleted. Choose a chat persona in the native picker; its saved selection could not be confirmed.' : notified ? 'Custom personality deleted' : 'Custom personality deleted on this device. Sync could not be notified.', 'success');
      return { status: 'deleted', selection };
    } catch {
      try { showNotification(deleted ? 'Persona deleted. Check the native picker for its current chat selection.' : 'The persona deletion outcome is unconfirmed. Check the native picker before trying again.', 'info'); } catch { /* A failed notification cannot reverse a saved deletion. */ }
      return { status: deleted ? 'deleted' : 'unconfirmed', selection: 'unconfirmed' };
    } finally {
      releaseCustomPersonalityDeletion(review.leaseId);
      if (deletionReviewOwner === token) deletionReviewOwner = null;
    }
  })();
  return { opened: !!overlay?.classList.contains('show') && !!button, completion };
}
export async function deleteCustomPersonality(id: string) {
  const review = await openCustomPersonaDeletionReview(id);
  await review.completion;
}

export async function generateCustomPersonality() {
  const owner = _editorOwner; if (!editorIsCurrent(owner) || owner.saving) return;
  if (!hasAssistantFeatureProvider()) {
    showNotification('AI provider not configured. Open Settings first.', 'info');
    return;
  }
  const nameInput = textControlById('chat-personality-custom-name');
  const textarea = textareaBySelector('.chat-personality-custom-textarea');
  const genBtn = buttonById('chat-personality-generate-btn');
  if (!nameInput || !textarea) return;
  const name = nameInput.value.trim();
  if (!name) {
    showNotification('Enter a name first (e.g. "A longevity researcher")', 'info');
    nameInput.focus();
    return;
  }
  const previousText = textarea.value;
  let lastWritten = previousText;
  const generation = ++owner.generation, revision = owner.revision;
  const ownsGeneration = () => editorIsCurrent(owner) && owner.generation === generation;
  const mayWrite = () => ownsGeneration() && !owner.saving && owner.revision === revision && nameInput.value.trim() === name && textarea.value === lastWritten;
  if (genBtn) { genBtn.disabled = true; genBtn.textContent = 'Generating\u2026'; }
  textarea.placeholder = `Generating ${name} persona\u2026`;

  try {
    const systemPrompt = `You are a persona designer for a health and blood-work AI chat assistant called getbased. The user will give you a real person, fictional character, archetype, or intellectual framework. Create a thorough, vivid, editable persona draft that genuinely reflects the requested communication style and worldview when discussing lab results and health data.

Write in second person ("You are..."). Output a rich persona description covering ALL of the following:

1. **Identity & Background**: Who this persona is, the intellectual lineage that shaped their worldview, and what they are known for. Do not fabricate precise credentials, quotations, biography, or positions.
2. **Communication Style**: Exact tone, vocabulary, formality level. Specific signature phrases, verbal tics, metaphors, or rhetorical patterns they'd use. How do they open conversations? How do they deliver bad news vs good news?
3. **Medical & Health Philosophy**: Their core framework for interpreting lab data. What do they emphasize that mainstream medicine overlooks? What conventional advice do they challenge or dismiss? What biomarkers excite them and why?
4. **Analytical Approach**: How they connect dots between markers. Do they focus on ratios, trends, context, root causes? What patterns do they look for first? How do they weigh reference ranges vs optimal ranges?
5. **Lifestyle & Optimization Lens**: What lifestyle factors do they always ask about? Diet, light exposure, sleep, environment, hormones — what's their hierarchy? What interventions do they champion?
6. **Character & Personality**: Temperament, humor style, patience level. How they handle disagreement, uncertainty, or when a patient pushes back. What makes them passionate or frustrated?
7. **Signature Recommendations**: Tests, supplements, protocols, or lifestyle changes genuinely associated with this person or framework. Do not invent endorsements or protocols merely to make the persona more specific.
8. **Unconventional Views**: Where their views diverge from mainstream medical consensus and how they express that disagreement naturally in their own voice. Preserve controversial and anti-establishment positions rather than diluting them.

Be extremely specific and capture characteristic phrases, real concepts, genuine intellectual positions, and recognizable reasoning patterns. Aim for 400-500 words. Do not add boilerplate health disclaimers, repetitive warnings, or out-of-character safety language.

When evidence is limited, disputed, or uncertain, express that naturally in the persona's own voice. The persona may strongly disagree with mainstream medical consensus, but should distinguish established evidence, personal interpretation, and speculation when that distinction is relevant. If precise knowledge is unavailable, create a faithful interpretation of the broader philosophy rather than inventing specifics.

Write only the persona instructions. Do not include commentary about these generation rules.

IMPORTANT: On the very first line, output ONLY a single emoji that best captures this specific person's identity or what they're most known for — not just their profession. Think about what makes them unique (e.g. ☀️ for someone known for sun exposure protocols, 🧊 for a cold therapy advocate, 🍖 for a carnivore diet proponent). Then a blank line, then the persona description.`;

    const { text } = await callAssistantFeatureAI({
      system: systemPrompt,
      messages: [{ role: 'user', content: `Create a comprehensive persona for: ${name}` }],
      maxTokens: 2048,
      onStream(text) {
        if (!mayWrite()) return;
        textarea.value = text; lastWritten = text;
        autoResizePersonaTextarea();
      }
    }) as { text: unknown; };
    if (!mayWrite()) return;
    const lines = String(text).split('\n');
    const firstLine = lines[0]!.trim();
    const emojiMatch = firstLine.match(/^(\p{Emoji_Presentation}|\p{Emoji}\uFE0F?(\u200D(\p{Emoji_Presentation}|\p{Emoji}\uFE0F?))*)/u);
    if (emojiMatch && emojiMatch[0] && firstLine.length <= 4) {
      _generatedPersonaIcon = emojiMatch[0];
      const rest = lines.slice(1).join('\n').replace(/^\n+/, '');
      textarea.value = rest;
    } else {
      (textarea as { value: unknown; }).value = text;
    }
    autoResizePersonaTextarea();
    markPersonalityDirty();
    textarea.placeholder = 'Describe how you want the AI to communicate, or enter a name above and generate a draft...';
  } catch (err) {
    if (!mayWrite()) return;
    const error = err as { message?: unknown; };
    textarea.placeholder = 'Describe how you want the AI to communicate, or enter a name above and generate a draft...';
    textarea.value = previousText;
    autoResizePersonaTextarea();
    showNotification(`Generation failed: ${error.message}`, 'error');
  } finally {
    if (ownsGeneration()) {
      textarea.placeholder = 'Describe how you want the AI to communicate, or enter a name above and generate a draft...';
      if (genBtn) { genBtn.disabled = false; genBtn.textContent = 'Generate draft'; }
      markPersonalityDirty();
    }
  }
}
