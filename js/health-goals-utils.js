// @ts-check
// health-goals-utils.js — normalize current and legacy health-goal storage
// for prompt/context consumers.

/**
 * @param {any} healthGoals
 * @param {number} [limit]
 * @returns {string}
 */
export function formatHealthGoalsText(healthGoals, limit = 3) {
  if (Array.isArray(healthGoals)) {
    return healthGoals
      .map(g => g?.text == null ? '' : String(g.text).trim())
      .filter(Boolean)
      .slice(0, limit)
      .join('; ');
  }
  return healthGoals?.goals == null ? '' : String(healthGoals.goals).trim();
}
