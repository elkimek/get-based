// @ts-check
// agent-actions/schemas.js — semantic input schemas and validators for app actions.

export const SUN_SESSION_LOG_INPUT_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: false,
  properties: {
    durationMinutes: {
      type: 'number',
      exclusiveMinimum: 0,
      maximum: 1440,
      description: 'Completed sunlight-session duration in minutes.',
    },
    endedAt: {
      type: 'string',
      format: 'date-time',
      description: 'When the session ended. Omit to use the current time.',
    },
    notes: {
      type: 'string',
      maxLength: 500,
      description: 'Short optional user-visible note.',
    },
  },
  required: ['durationMinutes'],
});

const SUN_SESSION_LOG_FIELDS = new Set(Object.keys(SUN_SESSION_LOG_INPUT_SCHEMA.properties));

function hasValidCalendarDate(value) {
  if (typeof value !== 'string') return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})T/u.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const probe = new Date(0);
  probe.setUTCHours(0, 0, 0, 0);
  probe.setUTCFullYear(year, month - 1, day);
  return probe.getUTCFullYear() === year
    && probe.getUTCMonth() === month - 1
    && probe.getUTCDate() === day;
}

/**
 * @param {unknown} rawInput
 * @returns {{ ok: boolean, value: Record<string, any> | null, errors: string[] }}
 */
export function validateSunSessionLogInput(rawInput) {
  const errors = [];
  if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput)) {
    return { ok: false, value: null, errors: ['Input must be an object'] };
  }

  const input = /** @type {Record<string, any>} */ (rawInput);
  for (const field of Object.keys(input)) {
    if (!SUN_SESSION_LOG_FIELDS.has(field)) errors.push(`Unknown field: ${field}`);
  }

  const durationMinutes = input.durationMinutes;
  if (typeof durationMinutes !== 'number' || !Number.isFinite(durationMinutes)
      || durationMinutes <= 0 || durationMinutes > 1440) {
    errors.push('durationMinutes must be greater than 0 and at most 1440');
  }

  let endedAt;
  if (input.endedAt != null && input.endedAt !== '') {
    const zonedIso = typeof input.endedAt === 'string'
      && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u.test(input.endedAt);
    if (!zonedIso || !hasValidCalendarDate(input.endedAt) || !Number.isFinite(Date.parse(input.endedAt))) {
      errors.push('endedAt must be a valid ISO date-time');
    } else {
      endedAt = new Date(input.endedAt).toISOString();
    }
  }

  let notes;
  if (input.notes != null && input.notes !== '') {
    if (typeof input.notes !== 'string') {
      errors.push('notes must be a string');
    } else if (input.notes.length > 500) {
      errors.push('notes must be at most 500 characters');
    } else {
      notes = input.notes.trim();
    }
  }

  if (errors.length) return { ok: false, value: null, errors };

  return {
    ok: true,
    value: {
      durationMinutes,
      ...(endedAt ? { endedAt } : {}),
      ...(notes ? { notes } : {}),
    },
    errors: [],
  };
}
