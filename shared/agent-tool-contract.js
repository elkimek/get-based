// @ts-check
// Runtime-neutral getbased agent tool definitions shared by browser and host.

export const AGENT_TOOL_CONTRACT_VERSION = 2;
export const MAX_AGENT_SECTION_NAME_LENGTH = 80;
export const MAX_AGENT_QUERY_LENGTH = 160;
export const MAX_AGENT_NOTE_LENGTH = 2000;

const DATE_PROPERTY = Object.freeze({
  type: 'string',
  pattern: '^\\d{4}-\\d{2}-\\d{2}$',
  description: 'Calendar date in YYYY-MM-DD format.',
});

const LIMIT_PROPERTY = Object.freeze({
  type: 'integer',
  minimum: 1,
  maximum: 100,
});

const AGENT_TOOL_CATALOG = Object.freeze([
  Object.freeze({
    name: 'getbased_lab_context',
    description: 'Read the user-approved getbased health context, including available lab summaries, context cards, supplements, and goals. Use for broad questions about labs, biomarkers, or health trends.',
    access: /** @type {const} */ ('read'),
    inputSchema: Object.freeze({
      type: 'object',
      properties: Object.freeze({}),
      additionalProperties: false,
    }),
  }),
  Object.freeze({
    name: 'getbased_section',
    description: 'Read one section of the user-approved getbased health context. Omit section to list available section names. Section names are matched exactly, then by prefix.',
    access: /** @type {const} */ ('read'),
    inputSchema: Object.freeze({
      type: 'object',
      properties: Object.freeze({
        section: Object.freeze({
          type: 'string',
          maxLength: MAX_AGENT_SECTION_NAME_LENGTH,
          description: 'Optional section name, such as hormones, lipids, biometrics, supplements, genetics, or wearables.',
        }),
      }),
      additionalProperties: false,
    }),
  }),
  Object.freeze({
    name: 'getbased_search_markers',
    description: 'Find biomarkers in the active getbased profile by display name, category, or stable marker key. Returns only markers that have recorded values.',
    access: /** @type {const} */ ('read'),
    inputSchema: Object.freeze({
      type: 'object',
      properties: Object.freeze({
        query: Object.freeze({
          type: 'string',
          minLength: 1,
          maxLength: MAX_AGENT_QUERY_LENGTH,
          description: 'Marker name, category, or key fragment to search for.',
        }),
        limit: LIMIT_PROPERTY,
      }),
      required: Object.freeze(['query']),
      additionalProperties: false,
    }),
  }),
  Object.freeze({
    name: 'getbased_marker_history',
    description: 'Read dated values and ranges for one biomarker in the active getbased profile. Resolve an ambiguous name with getbased_search_markers first.',
    access: /** @type {const} */ ('read'),
    inputSchema: Object.freeze({
      type: 'object',
      properties: Object.freeze({
        marker: Object.freeze({
          type: 'string',
          minLength: 1,
          maxLength: MAX_AGENT_QUERY_LENGTH,
          description: 'Exact stable marker key or unambiguous display name.',
        }),
        from: DATE_PROPERTY,
        to: DATE_PROPERTY,
        limit: LIMIT_PROPERTY,
      }),
      required: Object.freeze(['marker']),
      additionalProperties: false,
    }),
  }),
  Object.freeze({
    name: 'getbased_nutrition_summary',
    description: 'Read aggregate meal and nutrient coverage for a requested time window. Individual meal names, notes, and photos are not returned.',
    access: /** @type {const} */ ('read'),
    inputSchema: Object.freeze({
      type: 'object',
      properties: Object.freeze({
        range: Object.freeze({
          type: 'string',
          enum: Object.freeze(['7d', '30d', '3m', '6m', '1y', 'all']),
          description: 'Time window. Defaults to 30d.',
        }),
      }),
      additionalProperties: false,
    }),
  }),
  Object.freeze({
    name: 'getbased_wearable_series',
    description: 'Read the user-enabled daily wearable series for the active profile over 7, 30, or 90 days.',
    access: /** @type {const} */ ('read'),
    inputSchema: Object.freeze({
      type: 'object',
      properties: Object.freeze({
        days: Object.freeze({ type: 'integer', enum: Object.freeze([7, 30, 90]) }),
      }),
      required: Object.freeze(['days']),
      additionalProperties: false,
    }),
  }),
  Object.freeze({
    name: 'getbased_search_knowledge',
    description: 'Search the active getbased Knowledge Base for user-provided sources relevant to a question.',
    access: /** @type {const} */ ('read'),
    inputSchema: Object.freeze({
      type: 'object',
      properties: Object.freeze({
        query: Object.freeze({
          type: 'string',
          minLength: 1,
          maxLength: MAX_AGENT_QUERY_LENGTH,
        }),
        limit: Object.freeze({ type: 'integer', minimum: 1, maximum: 10 }),
      }),
      required: Object.freeze(['query']),
      additionalProperties: false,
    }),
  }),
  Object.freeze({
    name: 'getbased_navigate',
    description: 'Open a getbased view for the user. This changes only visible navigation state and never edits health data.',
    access: /** @type {const} */ ('navigate'),
    inputSchema: Object.freeze({
      type: 'object',
      properties: Object.freeze({
        view: Object.freeze({
          type: 'string',
          enum: Object.freeze(['dashboard', 'labs', 'biologyScores', 'genome', 'body', 'light', 'insight', 'recommendations', 'correlations', 'compare']),
        }),
        marker: Object.freeze({
          type: 'string',
          minLength: 1,
          maxLength: MAX_AGENT_QUERY_LENGTH,
          description: 'Optional stable marker key or unambiguous marker name to open.',
        }),
      }),
      additionalProperties: false,
    }),
  }),
  Object.freeze({
    name: 'getbased_draft_note',
    description: 'Prepare a reviewable active-profile or marker note. This does not save anything; the user must approve the draft in getbased.',
    access: /** @type {const} */ ('draft'),
    inputSchema: Object.freeze({
      type: 'object',
      properties: Object.freeze({
        scope: Object.freeze({ type: 'string', enum: Object.freeze(['profile', 'marker']) }),
        marker: Object.freeze({ type: 'string', maxLength: MAX_AGENT_QUERY_LENGTH }),
        text: Object.freeze({ type: 'string', minLength: 1, maxLength: MAX_AGENT_NOTE_LENGTH }),
        mode: Object.freeze({ type: 'string', enum: Object.freeze(['append', 'replace']) }),
      }),
      required: Object.freeze(['scope', 'text']),
      additionalProperties: false,
    }),
  }),
  Object.freeze({
    name: 'getbased_draft_meal',
    description: 'Prepare a reviewable manual meal entry. This does not save anything; the user must approve the draft in getbased.',
    access: /** @type {const} */ ('draft'),
    inputSchema: Object.freeze({
      type: 'object',
      properties: Object.freeze({
        name: Object.freeze({ type: 'string', minLength: 1, maxLength: 160 }),
        eatenAt: Object.freeze({ type: 'string', maxLength: 40, description: 'ISO-8601 date-time.' }),
        mealType: Object.freeze({ type: 'string', enum: Object.freeze(['breakfast', 'brunch', 'lunch', 'dinner', 'snack', 'drink', 'other']) }),
        energyKcal: Object.freeze({ type: 'number', minimum: 0, maximum: 20000 }),
        proteinG: Object.freeze({ type: 'number', minimum: 0, maximum: 2000 }),
        carbohydrateG: Object.freeze({ type: 'number', minimum: 0, maximum: 3000 }),
        fatG: Object.freeze({ type: 'number', minimum: 0, maximum: 2000 }),
        fiberG: Object.freeze({ type: 'number', minimum: 0, maximum: 1000 }),
        fluidMl: Object.freeze({ type: 'number', minimum: 0, maximum: 20000 }),
        note: Object.freeze({ type: 'string', maxLength: 500 }),
      }),
      required: Object.freeze(['name']),
      additionalProperties: false,
    }),
  }),
  Object.freeze({
    name: 'getbased_draft_biometric',
    description: 'Prepare a reviewable manual weight, blood-pressure, or resting-pulse entry. This does not save anything until the user approves it.',
    access: /** @type {const} */ ('draft'),
    inputSchema: Object.freeze({
      type: 'object',
      properties: Object.freeze({
        metric: Object.freeze({ type: 'string', enum: Object.freeze(['weight', 'bp', 'rhr']) }),
        date: DATE_PROPERTY,
        value: Object.freeze({ type: 'number' }),
        unit: Object.freeze({ type: 'string', enum: Object.freeze(['kg', 'lb', 'bpm']) }),
        systolic: Object.freeze({ type: 'number', minimum: 40, maximum: 300 }),
        diastolic: Object.freeze({ type: 'number', minimum: 20, maximum: 200 }),
        pulse: Object.freeze({ type: 'number', minimum: 20, maximum: 250 }),
        note: Object.freeze({ type: 'string', maxLength: 500 }),
      }),
      required: Object.freeze(['metric']),
      additionalProperties: false,
    }),
  }),
  Object.freeze({
    name: 'getbased_draft_supplement',
    description: 'Prepare a reviewable supplement or medication entry. This does not save anything until the user approves it.',
    access: /** @type {const} */ ('draft'),
    inputSchema: Object.freeze({
      type: 'object',
      properties: Object.freeze({
        name: Object.freeze({ type: 'string', minLength: 1, maxLength: 160 }),
        type: Object.freeze({ type: 'string', enum: Object.freeze(['supplement', 'medication']) }),
        dosage: Object.freeze({ type: 'string', maxLength: 160 }),
        startDate: DATE_PROPERTY,
        note: Object.freeze({ type: 'string', maxLength: 500 }),
      }),
      required: Object.freeze(['name', 'type']),
      additionalProperties: false,
    }),
  }),
]);

/** @param {unknown} value */
function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

export function getAgentToolCatalog() {
  return cloneJson(AGENT_TOOL_CATALOG);
}

export function getCodexDynamicTools() {
  return AGENT_TOOL_CATALOG.map(({ name, description, inputSchema }) => ({
    type: 'function',
    name,
    description,
    inputSchema: cloneJson(inputSchema),
  }));
}
