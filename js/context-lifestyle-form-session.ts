// Lifestyle presentation uses the shared captured profile/context transaction.
import { createContextFieldSession } from './context-field-session.js';
import { applyLifestyleDraft } from './context-lifestyle-form-model.js';
import type { LifestyleDraft, LifestyleFormKey } from './context-lifestyle-form-model.js';
export function createLifestyleFormSession(key: LifestyleFormKey) {
  return createContextFieldSession<LifestyleDraft | null>(key, (draft, value) => applyLifestyleDraft(draft, key, value));
}
export type LifestyleFormSession = ReturnType<typeof createLifestyleFormSession>;
