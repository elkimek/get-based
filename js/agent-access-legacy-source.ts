// One-shot legacy storage names and retirement; no UI, identity or live-state dependency.
export const MESSENGER_TOKEN_KEY = 'labcharts-messenger-token';
export const MESSENGER_ENABLED_KEY = 'labcharts-messenger-enabled';
export const MESSENGER_CONTEXT_KEY_KEY = 'labcharts-agent-context-key';
export const AGENT_ACCESS_MIGRATION_PROFILE_KEY = 'labcharts-agent-access-migration-profile';

export function retireAgentAccessLegacySource(profileId: string): boolean {
  if (typeof localStorage === 'undefined') return false;
  const owner = localStorage.getItem(AGENT_ACCESS_MIGRATION_PROFILE_KEY);
  if (owner && owner !== profileId) return false;
  // Storage failures propagate; callers decide whether cleanup can be retried
  // silently after a commit or must report an incomplete explicit deletion.
  localStorage.removeItem(MESSENGER_TOKEN_KEY);
  localStorage.removeItem(MESSENGER_CONTEXT_KEY_KEY);
  localStorage.removeItem(AGENT_ACCESS_MIGRATION_PROFILE_KEY);
  return true;
}
