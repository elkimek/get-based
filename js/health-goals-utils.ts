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

export const HEALTH_GOAL_STARTERS = [
  'Improve energy', 'Sleep better', 'Improve metabolic health', 'Reduce cardiovascular risk',
  'Optimize thyroid or hormones', 'Correct nutrient deficiencies', 'Support liver or kidney health', 'Improve training and recovery'
] as const;
export const HEALTH_GOAL_PRIORITIES = [
  { value: 'major', label: 'High' }, { value: 'mild', label: 'Medium' }, { value: 'minor', label: 'Low' }
] as const;
/** Display legacy object goals without rewriting them; an accepted edit retains their metadata. */
export function healthGoalList(value: unknown): import('../types/profile-context-data.js').HealthGoal[] {
  if (Array.isArray(value)) return structuredClone(value);
  const text = formatHealthGoalsText(value, Number.MAX_SAFE_INTEGER);
  if (!text) return [];
  const record = value && typeof value === 'object' ? value : {};
  return [{ ...record, text, severity: 'mild' }];
}
export function healthGoalRows(value: unknown) {
  const goals = healthGoalList(value);
  const indexed = goals.map((goal, index) => ({ index, text: String(goal?.text ?? ''), severity: String(goal?.severity || 'mild') }));
  return sortHealthGoalsByPriority(indexed).map(row => ({ ...row,
    priority: HEALTH_GOAL_PRIORITIES.find(option => option.value === row.severity)?.label || row.severity
  }));
}
