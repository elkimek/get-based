import type { AIActionName } from './ai-action-delegates.js';
import type { AIVerdictStatus } from './ai-verdict-engine.js';

/** Presentation-only attributes shared by authored verdict controls. */
export interface VerdictControlView {
  readonly mode: 'inline' | 'detail';
  readonly status: AIVerdictStatus;
  readonly action: AIActionName;
  readonly targetId: string;
  readonly targetIdPresent?: boolean;
  readonly actionOwner: string;
}
