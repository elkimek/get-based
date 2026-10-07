// Light, goals, interpretive-lens, and diet-contaminant lifestyle editors.

import { openLifestyleForm, saveLifestyleForm } from './context-lifestyle-form-view.js';

// ── Light & Circadian ──
export function openLightCircadianEditor() { return openLifestyleForm('lightCircadian'); }
export function saveLightCircadian() { return saveLifestyleForm('lightCircadian'); }
export function clearLightCircadian() { return saveLifestyleForm('lightCircadian', true); }

// ── Health Goals ──
export { openHealthGoalsEditor, renderHealthGoalsModal, addHealthGoal, deleteHealthGoal, closeHealthGoals, clearHealthGoals } from './context-health-goals-view.js';

// ── Interpretive Lens ──

export function openInterpretiveLensEditor() { return openLifestyleForm('interpretiveLens'); }
export function saveInterpretiveLens() { return saveLifestyleForm('interpretiveLens'); }
export function clearInterpretiveLens() { return saveLifestyleForm('interpretiveLens', true); }

// ── Diet contaminant detail modal ──
export { showDietContaminantsModal } from './context-food-contaminants-view.js';
