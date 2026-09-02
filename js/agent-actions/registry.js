// @ts-check
// agent-actions/registry.js — shared semantic capability and execution boundary.

import {
  SUN_SESSION_LOG_INPUT_SCHEMA,
  validateSunSessionLogInput,
} from './schemas.js';

const agentActionDeps = {
  logCompletedSunSession: async (payload, target) => {
    const { logCompletedSession } = await import('../sun-sessions-store.js');
    return logCompletedSession(payload, target);
  },
  now: () => Date.now(),
};

/**
 * @param {Partial<typeof agentActionDeps>} [deps]
 */
export function configureAgentActionDeps(deps = {}) {
  const previous = { ...agentActionDeps };
  if (typeof deps.logCompletedSunSession === 'function') {
    agentActionDeps.logCompletedSunSession = deps.logCompletedSunSession;
  }
  if (typeof deps.now === 'function') agentActionDeps.now = deps.now;
  return previous;
}

const ACTIONS = Object.freeze({
  'sun.session.log': Object.freeze({
    id: 'sun.session.log',
    label: 'Log completed sunlight session',
    description: 'Create a completed sunlight-session record in the active profile.',
    writeLevel: 'profile',
    confirmationPolicy: 'always',
    requiresConfirmation: true,
    scopes: Object.freeze(['sun.sessions:write']),
    inputSchema: SUN_SESSION_LOG_INPUT_SCHEMA,
    validate: validateSunSessionLogInput,
  }),
});

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

export function getAgentActionManifest() {
  return Object.values(ACTIONS).map(action => cloneJson({
    id: action.id,
    label: action.label,
    description: action.description,
    writeLevel: action.writeLevel,
    confirmationPolicy: action.confirmationPolicy,
    requiresConfirmation: action.requiresConfirmation,
    scopes: action.scopes,
    inputSchema: action.inputSchema,
  }));
}

export function getAgentAction(actionId) {
  return ACTIONS[actionId] || null;
}

export function validateAgentActionInput(actionId, input) {
  const action = getAgentAction(actionId);
  if (!action) return { ok: false, value: null, errors: [`Unknown action: ${actionId}`] };
  return action.validate(input);
}

/**
 * Execute one validated semantic action.
 *
 * @param {string} actionId
 * @param {unknown} input
 * @param {{ confirmed?: boolean, actorId?: string, idempotencyKey?: string, profileId?: string, importedData?: any }} [context]
 */
export async function runAgentAction(actionId, input, context = {}) {
  const action = getAgentAction(actionId);
  if (!action) return { ok: false, code: 'unknown_action', errors: [`Unknown action: ${actionId}`] };

  const validation = action.validate(input);
  if (!validation.ok) return { ok: false, code: 'invalid_input', errors: validation.errors };
  if (actionId === 'sun.session.log' && validation.value.endedAt
      && Date.parse(validation.value.endedAt) > agentActionDeps.now() + 5 * 60_000) {
    return { ok: false, code: 'invalid_input', errors: ['endedAt cannot be in the future'] };
  }
  if (action.requiresConfirmation && context.confirmed !== true) {
    return { ok: false, code: 'confirmation_required', actionId };
  }

  if (actionId === 'sun.session.log') {
    const args = validation.value;
    const endedAt = args.endedAt ? Date.parse(args.endedAt) : agentActionDeps.now();
    const durationMs = args.durationMinutes * 60_000;
    const startedAt = endedAt - durationMs;
    const idempotencyKey = typeof context.idempotencyKey === 'string'
      && /^[A-Za-z0-9:_-]{1,128}$/.test(context.idempotencyKey)
      ? context.idempotencyKey
      : null;
    const payload = {
      durationMin: args.durationMinutes,
      startedAt,
      endedAt,
      notes: args.notes || '',
      createdBy: {
        type: 'agent',
        actorId: context.actorId || 'unknown-agent',
        actionId,
        ...(idempotencyKey ? { idempotencyKey } : {}),
      },
    };
    const hasExplicitProfileTarget = typeof context.profileId === 'string'
      && context.profileId.length > 0
      && context.importedData
      && typeof context.importedData === 'object';
    const sessionId = hasExplicitProfileTarget
      ? await agentActionDeps.logCompletedSunSession(payload, {
        profileId: context.profileId,
        importedData: context.importedData,
      })
      : await agentActionDeps.logCompletedSunSession(payload);
    return { ok: true, actionId, result: { sessionId } };
  }

  return { ok: false, code: 'not_implemented', actionId };
}
