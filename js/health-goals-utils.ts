// health-goals-utils.js — normalize current and legacy health-goal storage
// for prompt/context consumers.

interface HealthGoal { severity?: unknown; text?: unknown; }
const HEALTH_GOAL_PRIORITY_RANK: Record<string, number> = { major: 0, mild: 1, minor: 2 };

/**
 * Return a stable high-to-low priority view without mutating profile data.
 * Unknown legacy priorities stay after the three supported levels.
 */
export function sortHealthGoalsByPriority<T extends HealthGoal | null | undefined>(healthGoals: T[] | null | undefined): T[] {
  if (!Array.isArray(healthGoals)) return [];
  return healthGoals
    .map((goal, originalIndex) => ({ goal, originalIndex }))
    .sort((a, b) => {
      const aRank = HEALTH_GOAL_PRIORITY_RANK[a.goal?.severity as string] ?? 3;
      const bRank = HEALTH_GOAL_PRIORITY_RANK[b.goal?.severity as string] ?? 3;
      return aRank - bRank || a.originalIndex - b.originalIndex;
    })
    .map(item => item.goal);
}

export function formatHealthGoalsText(healthGoals: unknown, limit = 3): string {
  if (Array.isArray(healthGoals)) {
    return sortHealthGoalsByPriority(healthGoals as HealthGoal[])
      .map(g => g?.text == null ? '' : String(g.text).trim())
      .filter(Boolean)
      .slice(0, limit)
      .join('; ');
  }
  return (healthGoals as { goals?: unknown } | null | undefined)?.goals == null ? '' : String((healthGoals as { goals: unknown }).goals).trim();
}
