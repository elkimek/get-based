// Custom persona draft workflow; components own markup and input events.
import type { PersonaEditorLocation } from './chat-personality-policy.js';
import { state } from './state.js';
import { CHAT_PERSONALITIES } from './constants.js';
import { showNotification, showConfirmDialog } from './utils.js';
import { callAssistantFeatureAI, hasAssistantFeatureProvider } from './ai-feature-routing.js';
import { saveChatThreadIndex, renderThreadList } from './chat-threads.js';
import { renderChatMessagesRuntime, notifyCustomPersonalitySavedRuntime } from './chat-runtime.js';
import { createUniqueId } from './unique-id.js';
import { closePersonaEditorOverlay } from './chat-persona-editor-component.js';
import { getCachedCustomPersonalities, recordCustomPersonalityDeletion } from './chat-personality-storage.js';
import { getCustomPersonalities, saveCustomPersonalities, pickPersonaIcon } from './chat-personality-models.js';
import { buildPersonaAgreementRecord, getPersonaAgreementCheckbox, openPersonaEditorDialog } from './chat-personality-editor.js';
import { closePersonalityPickerView, getPersonalityPickerView } from './chat-personality-picker-view.js';

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
  revision: number; generation: number; saving: boolean;
}
let _editorOwner: PersonaEditorOwner | null = null;
function editorIsCurrent(owner: PersonaEditorOwner | null): owner is PersonaEditorOwner {
  return !!owner && _editorOwner === owner && owner.overlay.isConnected
    && document.getElementById(PERSONALITY_EDITOR_OVERLAY_ID) === owner.overlay
    && state.currentProfile === owner.profileId && state.currentThreadId === owner.threadId;
}
function closePersonalityPicker() { closePersonalityPickerView(); }
function showPersonalityPickerAfterEditor(personalityId = '') { getPersonalityPickerView()?.setOpen(true, personalityId || 'new'); }

export function closePersonalityEditor({ returnToPicker = true, personalityId = '' } = {}) {
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
  _editorOwner = { overlay, profileId: state.currentProfile, threadId: state.currentThreadId, revision: 0, generation: 0, saving: false };
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
  if (!editorIsCurrent(_editorOwner) || !_editingPersonalityId || !_personaCleanState) return false;
  const current = _getPersonaCurrentState();
  return current.name !== _personaCleanState.name
    || current.text !== _personaCleanState.text
    || current.agreementAccepted !== _personaCleanState.agreementAccepted;
}

export async function confirmDiscardPersonalityChanges() {
  if (!isPersonalityDirty()) return true;
  const owner = _editorOwner, draft = JSON.stringify(_getPersonaCurrentState());
  const discard = await showConfirmDialog('Discard your unsaved personality changes?');
  return discard && editorIsCurrent(owner) && draft === JSON.stringify(_getPersonaCurrentState());
}

export function snapshotPersonalityClean() {
  _personaCleanState = _getPersonaCurrentState();
  const saveBtn = buttonBySelector('.chat-personality-custom-save');
  if (saveBtn) saveBtn.disabled = true;
}

export function markPersonalityDirty() {
  if (_editorOwner?.saving) return;
  const saveBtn = buttonBySelector('.chat-personality-custom-save');
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
  const owner = _editorOwner; if (!editorIsCurrent(owner) || owner.saving) return;
  const textarea = textareaBySelector('.chat-personality-custom-textarea');
  const nameInput = textControlById('chat-personality-custom-name');
  if (!textarea) return;
  const name = (nameInput ? nameInput.value.trim() : '') || 'Custom Personality';
  const icon = _generatedPersonaIcon || pickPersonaIcon(name);
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
  const customs = getCustomPersonalities();
  const now = new Date().toISOString();
  let id: string;
  if (_editingPersonalityId && _editingPersonalityId !== 'new') {
    id = _editingPersonalityId;
    const idx = customs.findIndex(p => p.id === id);
    if (idx < 0) { showNotification('This personality was removed. Copy your draft before creating a new personality.', 'info'); return; }
    customs[idx] = {
      ...customs[idx]!,
      name,
      icon,
      promptText,
      createdAt: customs[idx]!.createdAt || now,
      updatedAt: now,
      ...(personaAgreement ? { personaAgreement } : {}),
    };
  } else {
    id = createUniqueId('custom_');
    customs.push({
      id,
      name,
      icon,
      promptText,
      evidenceBased: false,
      createdAt: now,
      updatedAt: now,
      ...(personaAgreement ? { personaAgreement } : {}),
    });
  }
  owner.saving = true;
  const saveButton = buttonBySelector('.chat-personality-custom-save'); if (saveButton) saveButton.disabled = true;
  try {
    await saveCustomPersonalities(customs, owner.profileId);
  } catch {
    owner.saving = false;
    if (!editorIsCurrent(owner)) return;
    markPersonalityDirty();
    showNotification('Could not save custom personality', 'error');
    return;
  }
  owner.saving = false;
  if (!editorIsCurrent(owner)) return;
  _editingPersonalityId = id;
  if (state.currentChatPersonality === id) {
    const thread = state.chatThreads.find(t => t.id === state.currentThreadId);
    if (thread) {
      thread.personality = id;
      thread.personalityName = name;
      thread.personalityIcon = icon;
      void saveChatThreadIndex();
    }
  }
  const newerEdits = JSON.stringify(acceptedDraft) !== JSON.stringify(_getPersonaCurrentState());
  if (newerEdits) { _personaCleanState = acceptedDraft; markPersonalityDirty(); presentation.refresh(); }
  else closePersonalityEditor({ personalityId: id });
  presentation.header();
  renderThreadList();
  showNotification('Custom personality saved', 'success');
}

function requestPersonalityEditor(id: string, locationLike: PersonaEditorLocation | null | undefined) {
  const owner = _editorOwner, profile = state.currentProfile, thread = state.currentThreadId;
  const open = () => { if (_editorOwner === owner && state.currentProfile === profile && state.currentThreadId === thread) openPersonalityEditor(id, locationLike); };
  if (isPersonalityDirty()) void confirmDiscardPersonalityChanges().then(discard => { if (discard) open(); }); else open();
}
export function startNewCustomPersonality(locationLike: PersonaEditorLocation | null | undefined = globalThis.location) { requestPersonalityEditor('new', locationLike); }
export function editCustomPersonality(id: string, locationLike: PersonaEditorLocation | null | undefined = globalThis.location) { requestPersonalityEditor(id, locationLike); }
export async function cancelCustomPersonalityEditor() {
  const owner = _editorOwner;
  if (!(await confirmDiscardPersonalityChanges()) || _editorOwner !== owner) return;
  closePersonalityEditor({ returnToPicker: editorIsCurrent(owner) });
}

export async function deleteCustomPersonality(id: string) {
  const profileId = state.currentProfile, threadId = state.currentThreadId;
  const customs = getCustomPersonalities();
  const cp = customs.find(p => p.id === id);
  const name = cp ? cp.name : 'personality';
  if (await showConfirmDialog(`Delete "${name}"? This cannot be undone.`)) {
    if (state.currentProfile !== profileId || state.currentThreadId !== threadId) return;
    const updated = getCachedCustomPersonalities(profileId).filter(p => p.id !== id);
    try {
      await saveCustomPersonalities(updated, profileId);
      await recordCustomPersonalityDeletion(id, profileId);
      notifyCustomPersonalitySavedRuntime(profileId);
    } catch {
      showNotification('Could not delete custom personality', 'error');
      return;
    }
    if (state.currentProfile !== profileId || state.currentThreadId !== threadId) return;
    if (state.currentChatPersonality === id) {
      state.currentChatPersonality = 'default';
      localStorage.setItem(`labcharts-${state.currentProfile}-chatPersonality`, 'default');
      _editingPersonalityId = null;
      const thread = state.chatThreads.find(t => t.id === state.currentThreadId);
      if (thread) {
        thread.personality = 'default';
        const fallback = CHAT_PERSONALITIES.find(p => p.id === 'default') || CHAT_PERSONALITIES[0]!;
        thread.personalityName = fallback?.name || 'Default';
        thread.personalityIcon = fallback?.icon || '';
        void saveChatThreadIndex();
      }
    } else if (_editingPersonalityId === id) {
      _editingPersonalityId = null;
    }
    presentation.refresh();
    presentation.header();
    renderChatMessagesRuntime();
  }
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
