// Every chat route receives the same bounded, user-enabled baseline context.
// Local CLI sessions can additionally query exact detail through bounded tools;
// personal gateways cannot because no local tool credential crosses them.

export function isPersonalAgentTarget(target: unknown): boolean {
  return String(target || '').trim() !== '' && String(target || '').trim() !== 'local';
}

export function buildAgentChatInstructions(instructions: string, labContext: string, target: string): string {
  const context = String(labContext || '').trim();
  const routeNote = isPersonalAgentTarget(target)
    ? 'The local getbased tool bridge is not attached to this personal gateway. Use this snapshot and say when more exact getbased data is needed.'
    : 'Use the bounded getbased tools when the question needs exact detail, longer history, navigation, or a reviewable data-change draft.';
  return `${String(instructions || '').trim()}

## Current User Health and Lab Context
This is the exact enabled getbased context snapshot for this turn. Treat it as private user data and never send it to web searches or unrelated third-party tools.
${routeNote}
${context || 'No enabled health context is available for this turn.'}`.trim();
}
