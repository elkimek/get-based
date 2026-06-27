// @ts-check
// agent-actions/schemas.js — shared metadata for browser-local typed agent actions.

export const AGENT_ACTION_LABELS = {
  'find-what-changed': 'Find what changed',
  'context.update': 'Update profile context',
  'supplement.update': 'Update supplement log',
  'labPlan.create': 'Draft lab plan',
  'labPlan.modify': 'Modify lab plan',
  'labPlan.fromScoreInvestigation': 'Draft lab plan from Biology Score',
  'biologyScore.investigate': 'Investigate Biology Score',
  'navigation.open': 'Open view',
};

export const AGENT_INTENT_ACTION_MAP = {
  'find-what-changed': 'find-what-changed',
  'record-context-change': 'context.update',
  'draft-lab-plan': 'labPlan.create',
  'modify-lab-plan': 'labPlan.modify',
  'investigate-score': 'biologyScore.investigate',
  navigate: 'navigation.open',
};

/** @param {string} writeLevel @param {boolean} [requiresConfirmation] */
export function actionPolicy(writeLevel, requiresConfirmation = writeLevel !== 'read-only') {
  return { writeLevel, requiresConfirmationForWrites: requiresConfirmation };
}

/** @param {any} action */
export function actionSummary(action) {
  return {
    id: action.id,
    mode: action.mode,
    label: action.label,
    description: action.description,
    writeLevel: action.writeLevel,
    requiresConfirmation: action.requiresConfirmation,
    artifactType: action.artifactType || null,
    scopes: action.scopes || [],
  };
}
