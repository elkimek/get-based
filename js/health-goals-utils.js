// @ts-check
// health-goals-utils.js — normalize current and legacy health-goal storage
// for prompt/context consumers.

const HEALTH_GOAL_PRIORITY_RANK = { major: 0, mild: 1, minor: 2 };

/**
 * Return a stable high-to-low priority view without mutating profile data.
 * Unknown legacy priorities stay after the three supported levels.
 *
 * @param {any[]} healthGoals
 * @returns {any[]}
 */
export function sortHealthGoalsByPriority(healthGoals) {
  if (!Array.isArray(healthGoals)) return [];
  return healthGoals
    .map((goal, originalIndex) => ({ goal, originalIndex }))
    .sort((a, b) => {
      const aRank = HEALTH_GOAL_PRIORITY_RANK[a.goal?.severity] ?? 3;
      const bRank = HEALTH_GOAL_PRIORITY_RANK[b.goal?.severity] ?? 3;
      return aRank - bRank || a.originalIndex - b.originalIndex;
    })
    .map(item => item.goal);
}

/**
 * @param {any} healthGoals
 * @param {number} [limit]
 * @returns {string}
 */
export function formatHealthGoalsText(healthGoals, limit = 3) {
  if (Array.isArray(healthGoals)) {
    return sortHealthGoalsByPriority(healthGoals)
      .map(g => g?.text == null ? '' : String(g.text).trim())
      .filter(Boolean)
      .slice(0, limit)
      .join('; ');
  }
  return healthGoals?.goals == null ? '' : String(healthGoals.goals).trim();
}
