import type { AIActionName } from './ai-action-delegates.js';
import type { AIVerdictStatus } from './ai-verdict-engine.js';

/** Presentation-only attributes shared by authored verdict controls. */
export interface VerdictControlView {
  mode: 'inline' | 'detail';
  status: AIVerdictStatus;
  action: AIActionName;
  targetId: string;
  actionOwner: string;
}
