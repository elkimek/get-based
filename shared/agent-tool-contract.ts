// Runtime-neutral agent definitions. Browser and host consume one contract.
export const AGENT_TOOL_CONTRACT_VERSION = 2;
export const MAX_AGENT_SECTION_NAME_LENGTH = 80;
export const MAX_AGENT_QUERY_LENGTH = 160;
export const MAX_AGENT_NOTE_LENGTH = 2000;

export interface ToolSchema {
  type: 'string' | 'integer' | 'number' | 'object';
  description?: string;
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  enum?: readonly (string | number)[];
  properties?: Readonly<Record<string, ToolSchema>>;
  required?: readonly string[];
  additionalProperties?: boolean;
}
export interface AgentToolDefinition {
  name: string;
  description: string;
  access: 'read' | 'navigate' | 'draft';
  inputSchema: ToolSchema;
}

function property(type: ToolSchema['type'], constraints: Omit<ToolSchema, 'type'> = {}): ToolSchema {
  return Object.freeze({ type, ...constraints,
    ...(constraints.enum ? { enum: Object.freeze(constraints.enum) } : {}),
  });
}
function tool(name: string, description: string, access: AgentToolDefinition['access'],
  properties: Record<string, ToolSchema> = {}, required?: readonly string[]): AgentToolDefinition {
  return Object.freeze({ name, description, access, inputSchema: Object.freeze({
    type: 'object' as const, properties: Object.freeze(properties),
    ...(required ? { required: Object.freeze(required) } : {}), additionalProperties: false,
  }) });
}
const date = property('string', { pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'Calendar date in YYYY-MM-DD format.' });
const limit = property('integer', { minimum: 1, maximum: 100 });
const catalog: readonly AgentToolDefinition[] = Object.freeze([
  tool("getbased_lab_context", "Read the user-approved getbased health context, including available lab summaries, context cards, supplements, and goals. Use for broad questions about labs, biomarkers, or health trends.", "read"),
  tool("getbased_section", "Read one section of the user-approved getbased health context. Omit section to list available section names. Section names are matched exactly, then by prefix.", "read", {
    section: property('string', {"maxLength": MAX_AGENT_SECTION_NAME_LENGTH, "description": "Optional section name, such as hormones, lipids, biometrics, supplements, genetics, or wearables."}),
  }),
  tool("getbased_search_markers", "Find biomarkers in the active getbased profile by display name, category, or stable marker key. Returns only markers that have recorded values.", "read", {
    query: property('string', {"minLength": 1, "maxLength": MAX_AGENT_QUERY_LENGTH, "description": "Marker name, category, or key fragment to search for."}),
    limit: limit,
  }, ["query"]),
  tool("getbased_marker_history", "Read dated values and ranges for one biomarker in the active getbased profile. Resolve an ambiguous name with getbased_search_markers first.", "read", {
    marker: property('string', {"minLength": 1, "maxLength": MAX_AGENT_QUERY_LENGTH, "description": "Exact stable marker key or unambiguous display name."}),
    from: date,
    to: date,
    limit: limit,
  }, ["marker"]),
  tool("getbased_nutrition_summary", "Read aggregate meal and nutrient coverage for a requested time window. Individual meal names, notes, and photos are not returned.", "read", {
    range: property('string', {"enum": ["7d", "30d", "3m", "6m", "1y", "all"], "description": "Time window. Defaults to 30d."}),
  }),
  tool("getbased_wearable_series", "Read the user-enabled daily wearable series for the active profile over 7, 30, or 90 days.", "read", {
    days: property('integer', {"enum": [7, 30, 90]}),
  }, ["days"]),
  tool("getbased_search_knowledge", "Search the active getbased Knowledge Base for user-provided sources relevant to a question.", "read", {
    query: property('string', {"minLength": 1, "maxLength": MAX_AGENT_QUERY_LENGTH}),
    limit: property('integer', {"minimum": 1, "maximum": 10}),
  }, ["query"]),
  tool("getbased_navigate", "Open a getbased view for the user. This changes only visible navigation state and never edits health data.", "navigate", {
    view: property('string', {"enum": ["dashboard", "labs", "biologyScores", "genome", "body", "light", "insight", "recommendations", "correlations", "compare"]}),
    marker: property('string', {"minLength": 1, "maxLength": MAX_AGENT_QUERY_LENGTH, "description": "Optional stable marker key or unambiguous marker name to open."}),
  }),
  tool("getbased_draft_note", "Prepare a reviewable active-profile or marker note. This does not save anything; the user must approve the draft in getbased.", "draft", {
    scope: property('string', {"enum": ["profile", "marker"]}),
    marker: property('string', {"maxLength": MAX_AGENT_QUERY_LENGTH}),
    text: property('string', {"minLength": 1, "maxLength": MAX_AGENT_NOTE_LENGTH}),
    mode: property('string', {"enum": ["append", "replace"]}),
  }, ["scope", "text"]),
  tool("getbased_draft_meal", "Prepare a reviewable manual meal entry. This does not save anything; the user must approve the draft in getbased.", "draft", {
    name: property('string', {"minLength": 1, "maxLength": 160}),
    eatenAt: property('string', {"maxLength": 40, "description": "ISO-8601 date-time."}),
    mealType: property('string', {"enum": ["breakfast", "brunch", "lunch", "dinner", "snack", "drink", "other"]}),
    energyKcal: property('number', {"minimum": 0, "maximum": 20000}),
    proteinG: property('number', {"minimum": 0, "maximum": 2000}),
    carbohydrateG: property('number', {"minimum": 0, "maximum": 3000}),
    fatG: property('number', {"minimum": 0, "maximum": 2000}),
    fiberG: property('number', {"minimum": 0, "maximum": 1000}),
    fluidMl: property('number', {"minimum": 0, "maximum": 20000}),
    note: property('string', {"maxLength": 500}),
  }, ["name"]),
  tool("getbased_draft_biometric", "Prepare a reviewable manual weight, blood-pressure, or resting-pulse entry. This does not save anything until the user approves it.", "draft", {
    metric: property('string', {"enum": ["weight", "bp", "rhr"]}),
    date: date,
    value: property('number'),
    unit: property('string', {"enum": ["kg", "lb", "bpm"]}),
    systolic: property('number', {"minimum": 40, "maximum": 300}),
    diastolic: property('number', {"minimum": 20, "maximum": 200}),
    pulse: property('number', {"minimum": 20, "maximum": 250}),
    note: property('string', {"maxLength": 500}),
  }, ["metric"]),
  tool("getbased_draft_supplement", "Prepare a reviewable supplement or medication entry. This does not save anything until the user approves it.", "draft", {
    name: property('string', {"minLength": 1, "maxLength": 160}),
    type: property('string', {"enum": ["supplement", "medication"]}),
    dosage: property('string', {"maxLength": 160}),
    startDate: date,
    note: property('string', {"maxLength": 500}),
  }, ["name", "type"]),
]);

// Return mutable JSON copies so consumers cannot alter the shared definitions.
function cloneJson<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
export function getAgentToolCatalog(): AgentToolDefinition[] { return cloneJson([...catalog]); }
export function getCodexDynamicTools() {
  return catalog.map(({ name, description, inputSchema }) => ({
    type: 'function', name, description, inputSchema: cloneJson(inputSchema),
  }));
}
