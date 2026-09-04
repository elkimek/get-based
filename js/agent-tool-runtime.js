// @ts-check
// agent-tool-runtime.js — Portable getbased agent-tool catalog and read-only execution boundary.

import {
  getAgentToolCatalog,
  MAX_AGENT_NOTE_LENGTH,
  MAX_AGENT_QUERY_LENGTH,
  MAX_AGENT_SECTION_NAME_LENGTH as MAX_SECTION_NAME_LENGTH,
} from '../shared/agent-tool-contract.js';

export {
  AGENT_TOOL_CONTRACT_VERSION, getAgentToolCatalog, getCodexDynamicTools,
} from '../shared/agent-tool-contract.js';

/**
 * @typedef {{
 *   baseName: string,
 *   name: string,
 *   metadata: string,
 *   content: string,
 * }} AgentContextSection
 */

/**
 * Parse the bounded `[section:name metadata]...[/section:name]` projection
 * produced by getbased. It intentionally does not parse arbitrary HTML or
 * inspect application storage.
 *
 * @param {string} context
 * @returns {AgentContextSection[]}
 */
export function parseAgentContextSections(context) {
  const sections = [];
  const pattern = /\[section:([A-Za-z0-9._-]+)([^\]\r\n]*)\]([\s\S]*?)\[\/section:\1\]/g;
  for (const match of String(context || '').matchAll(pattern)) {
    const baseName = match[1];
    const metadata = match[2].trim();
    sections.push({
      baseName,
      name: metadata ? `${baseName} ${metadata}` : baseName,
      metadata,
      content: match[3].trim(),
    });
  }
  return sections;
}

/**
 * Build the persisted disclosure from tools that successfully returned data to
 * the agent. Draft-only calls are excluded because they do not disclose stored
 * profile data.
 * @param {Array<{tool?: string, arguments?: unknown, success?: boolean}>} toolCalls
 * @param {Array<{label: string, detail: string}>} fullContext
 */
export function summarizeAgentToolReceipts(toolCalls, fullContext = []) {
  const successful = Array.isArray(toolCalls) ? toolCalls.filter(call => call?.success === true) : [];
  if (successful.some(call => call.tool === 'getbased_lab_context')) return fullContext;
  const clean = value => String(value || '').replace(/[\u0000-\u001F\u007F]+/g, ' ').trim().slice(0, 160);
  const receipts = successful.flatMap(call => {
    const args = call.arguments && typeof call.arguments === 'object' && !Array.isArray(call.arguments)
      ? /** @type {Record<string, unknown>} */ (call.arguments) : {};
    if (call.tool === 'getbased_section') return [{ label: 'getbased agent tool', detail: `Section: ${clean(args.section) || 'section list'}` }];
    if (call.tool === 'getbased_search_markers') return [{ label: 'Blood marker results', detail: `Search: ${clean(args.query) || 'markers'}` }];
    if (call.tool === 'getbased_marker_history') return [{ label: 'Blood marker results', detail: `History: ${clean(args.marker) || 'marker'}` }];
    if (call.tool === 'getbased_nutrition_summary') return [{ label: 'Meals & Nutrition', detail: `Summary: ${clean(args.range) || '30d'}` }];
    if (call.tool === 'getbased_wearable_series') return [{ label: 'Wearable recovery context', detail: `Series: ${clean(args.days) || '30'} days` }];
    if (call.tool === 'getbased_search_knowledge') return [{ label: 'Knowledge Base', detail: `Search: ${clean(args.query) || 'knowledge'}` }];
    if (call.tool === 'getbased_navigate' && args.marker) return [{ label: 'Blood marker results', detail: `Opened: ${clean(args.marker)}` }];
    return [];
  });
  return receipts.filter((receipt, index) => receipts.findIndex(item => (
    item.label === receipt.label && item.detail === receipt.detail
  )) === index).slice(0, 20);
}

/** @param {string} text */
function success(text) {
  return {
    success: true,
    contentItems: [{ type: 'inputText', text }],
  };
}

/** @param {unknown} value */
function successJson(value) {
  return success(JSON.stringify(value, null, 2));
}

/** @param {string} message */
function failure(message) {
  return {
    success: false,
    contentItems: [{ type: 'inputText', text: `Error: ${message}` }],
  };
}

/** @param {unknown} value */
function parseToolArguments(value) {
  if (value === undefined || value === null || value === '') return {};
  let parsed = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value);
    } catch {
      throw new Error('Tool arguments must be a JSON object.');
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Tool arguments must be an object.');
  }
  return /** @type {Record<string, unknown>} */ (parsed);
}

/**
 * @param {Record<string, unknown>} args
 * @param {string[]} allowed
 */
function rejectUnknownArguments(args, allowed) {
  const unknown = Object.keys(args).find(key => !allowed.includes(key));
  if (unknown) throw new Error(`Unknown argument: ${unknown}.`);
}

/**
 * @param {Record<string, unknown>} args
 * @param {string} key
 * @param {number} maxLength
 */
function optionalString(args, key, maxLength) {
  const value = args[key];
  if (value === undefined || value === null || value === '') return '';
  if (typeof value !== 'string') throw new Error(`${key} must be a string.`);
  const normalized = value.trim();
  if (normalized.length > maxLength) throw new Error(`${key} is too long.`);
  return normalized;
}

function requiredString(args, key, maxLength) {
  const value = optionalString(args, key, maxLength);
  if (!value) throw new Error(`${key} is required.`);
  return value;
}

function optionalInteger(args, key, { min, max, fallback }) {
  const value = args[key];
  if (value === undefined || value === null || value === '') return fallback;
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${key} must be an integer from ${min} to ${max}.`);
  }
  return value;
}

function optionalFiniteNumber(args, key, { min = -Infinity, max = Infinity } = {}) {
  const value = args[key];
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${key} must be a number from ${min} to ${max}.`);
  }
  return value;
}

function optionalDate(args, key) {
  const value = optionalString(args, key, 10);
  if (!value) return '';
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)
    || !Number.isFinite(parsed.getTime())
    || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error(`${key} must use YYYY-MM-DD.`);
  }
  return value;
}

function enumValue(args, key, allowed, fallback = '') {
  const value = optionalString(args, key, 80) || fallback;
  if (!allowed.includes(value)) throw new Error(`${key} is not supported.`);
  return value;
}

/**
 * @typedef {{context: string, profileId?: string, updatedAt?: string}} AgentContextSnapshot
 */

/** @param {unknown} value */
function normalizeSnapshot(value) {
  if (typeof value === 'string') return { context: value };
  if (!value || typeof value !== 'object' || typeof /** @type {any} */ (value).context !== 'string') {
    throw new Error('invalid_context_snapshot');
  }
  const snapshot = /** @type {any} */ (value);
  return {
    context: snapshot.context,
    profileId: typeof snapshot.profileId === 'string' ? snapshot.profileId : '',
    updatedAt: typeof snapshot.updatedAt === 'string' ? snapshot.updatedAt : '',
  };
}

/** @param {AgentContextSnapshot} snapshot */
function formatFullContext(snapshot) {
  const parts = [];
  if (snapshot.profileId) parts.push('Profile scope: active getbased profile');
  if (snapshot.updatedAt) parts.push(`Updated: ${snapshot.updatedAt}`);
  parts.push(snapshot.context || 'No context available');
  return parts.join('\n\n');
}

/** @param {AgentContextSection[]} sections */
function formatSectionIndex(sections) {
  if (sections.length === 0) return 'No sections available';
  const lines = sections.map(({ name, content }) => {
    const lineCount = content.split('\n').filter(line => line.trim()).length;
    return `  ${name}  (${lineCount} lines)`;
  });
  return `Available sections:\n\n${lines.join('\n')}`;
}

/**
 * @param {AgentContextSection[]} sections
 * @param {string} query
 */
function findSection(sections, query) {
  const normalized = query.toLowerCase();
  return sections.find(section => section.name.toLowerCase() === normalized)
    || sections.find(section => section.name.toLowerCase().startsWith(normalized))
    || null;
}

/**
 * Create a call executor shared by the future localhost/Codex adapter and the
 * existing MCP-facing semantics. `readContext` is injected so this lower-level
 * module never reaches into IndexedDB, global state, or the DOM.
 *
 * @param {{
 *   readContext: () => Promise<string|AgentContextSnapshot>|string|AgentContextSnapshot,
 *   searchMarkers?: (options: {query: string, limit: number}) => Promise<unknown>|unknown,
 *   readMarkerHistory?: (options: {marker: string, from: string, to: string, limit: number}) => Promise<unknown>|unknown,
 *   readNutritionSummary?: (options: {range: string}) => Promise<unknown>|unknown,
 *   readWearableSeries?: (options: {days: number}) => Promise<unknown>|unknown,
 *   searchKnowledge?: (options: {query: string, limit: number}) => Promise<unknown>|unknown,
 *   navigate?: (options: {view: string, marker: string}) => Promise<unknown>|unknown,
 *   onDraftCreated?: (draft: AgentDraft) => Promise<void>|void,
 *   createId?: () => string,
 * }} dependencies
 */
export function createAgentToolRuntime(dependencies) {
  const { readContext } = dependencies;
  if (typeof readContext !== 'function') throw new TypeError('readContext is required');
  /** @type {AgentDraft[]} */
  const drafts = [];

  const runDependency = async (name, options) => {
    const handler = dependencies[name];
    if (typeof handler !== 'function') throw new Error('tool_unavailable');
    return handler(options);
  };

  const createDraft = async (kind, payload, summary) => {
    const generated = typeof dependencies.createId === 'function'
      ? dependencies.createId()
      : globalThis.crypto?.randomUUID?.() || `draft-${Date.now()}-${drafts.length + 1}`;
    const draft = Object.freeze({
      id: String(generated).replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 128),
      kind,
      summary,
      payload: Object.freeze({ ...payload }),
      status: 'pending',
    });
    drafts.push(draft);
    await dependencies.onDraftCreated?.(draft);
    return successJson({ draftId: draft.id, status: 'pending_user_approval', summary });
  };

  return Object.freeze({
    tools: getAgentToolCatalog(),
    getDrafts: () => drafts.map(draft => ({ ...draft, payload: { ...draft.payload } })),

    /**
     * Execute the shape emitted by Codex app-server `item/tool/call`. Other
     * adapters only need to provide the same `tool` and `arguments` fields.
     *
     * @param {{tool?: string, arguments?: unknown, namespace?: string|null}} call
     */
    async execute(call) {
      if (!call || typeof call !== 'object') return failure('Invalid tool call.');
      if (call.namespace && call.namespace !== 'getbased') {
        return failure(`Unknown tool namespace: ${call.namespace}.`);
      }

      const tool = typeof call.tool === 'string' ? call.tool : '';
      if (!getAgentToolCatalog().some(definition => definition.name === tool)) {
        return failure(`Unknown tool: ${tool || '(missing)'}.`);
      }

      try {
        const args = parseToolArguments(call.arguments);
        if (tool === 'getbased_lab_context') {
          rejectUnknownArguments(args, []);
          const snapshot = normalizeSnapshot(await readContext());
          return success(formatFullContext(snapshot));
        }

        if (tool === 'getbased_section') {
          rejectUnknownArguments(args, ['section']);
          const section = optionalString(args, 'section', MAX_SECTION_NAME_LENGTH);
          const snapshot = normalizeSnapshot(await readContext());
          const sections = parseAgentContextSections(snapshot.context);
          if (!section) return success(formatSectionIndex(sections));

          const match = findSection(sections, section);
          if (!match) {
            const available = sections.map(item => item.baseName).join(', ');
            return failure(`Section "${section}" not found.${available ? ` Available: ${available}` : ''}`);
          }
          return success(`[${match.name}]\n\n${match.content}`);
        }

        if (tool === 'getbased_search_markers') {
          rejectUnknownArguments(args, ['query', 'limit']);
          return successJson(await runDependency('searchMarkers', {
            query: requiredString(args, 'query', MAX_AGENT_QUERY_LENGTH),
            limit: optionalInteger(args, 'limit', { min: 1, max: 25, fallback: 10 }),
          }));
        }

        if (tool === 'getbased_marker_history') {
          rejectUnknownArguments(args, ['marker', 'from', 'to', 'limit']);
          const from = optionalDate(args, 'from');
          const to = optionalDate(args, 'to');
          if (from && to && from > to) throw new Error('from must not be after to.');
          return successJson(await runDependency('readMarkerHistory', {
            marker: requiredString(args, 'marker', MAX_AGENT_QUERY_LENGTH), from, to,
            limit: optionalInteger(args, 'limit', { min: 1, max: 100, fallback: 50 }),
          }));
        }

        if (tool === 'getbased_nutrition_summary') {
          rejectUnknownArguments(args, ['range']);
          const range = enumValue(args, 'range', ['7d', '30d', '3m', '6m', '1y', 'all'], '30d');
          return successJson(await runDependency('readNutritionSummary', { range }));
        }

        if (tool === 'getbased_wearable_series') {
          rejectUnknownArguments(args, ['days']);
          const days = optionalInteger(args, 'days', { min: 7, max: 90, fallback: 30 });
          if (![7, 30, 90].includes(days)) throw new Error('days is not supported.');
          return successJson(await runDependency('readWearableSeries', { days }));
        }

        if (tool === 'getbased_search_knowledge') {
          rejectUnknownArguments(args, ['query', 'limit']);
          return successJson(await runDependency('searchKnowledge', {
            query: requiredString(args, 'query', MAX_AGENT_QUERY_LENGTH),
            limit: optionalInteger(args, 'limit', { min: 1, max: 10, fallback: 5 }),
          }));
        }

        if (tool === 'getbased_navigate') {
          rejectUnknownArguments(args, ['view', 'marker']);
          const view = optionalString(args, 'view', 40);
          const marker = optionalString(args, 'marker', MAX_AGENT_QUERY_LENGTH);
          if (!view && !marker) throw new Error('view or marker is required.');
          if (view && !['dashboard', 'labs', 'biologyScores', 'genome', 'body', 'light', 'insight', 'recommendations', 'correlations', 'compare'].includes(view)) {
            throw new Error('view is not supported.');
          }
          return successJson(await runDependency('navigate', { view, marker }));
        }

        if (tool === 'getbased_draft_note') {
          rejectUnknownArguments(args, ['scope', 'marker', 'text', 'mode']);
          const scope = enumValue(args, 'scope', ['profile', 'marker']);
          const marker = optionalString(args, 'marker', MAX_AGENT_QUERY_LENGTH);
          if (scope === 'marker' && !marker) throw new Error('marker is required for a marker note.');
          const text = requiredString(args, 'text', MAX_AGENT_NOTE_LENGTH);
          const mode = enumValue(args, 'mode', ['append', 'replace'], 'append');
          return createDraft('note', { scope, marker, text, mode }, `${scope === 'marker' ? `Marker note for ${marker}` : 'Profile note'}: ${text.slice(0, 120)}`);
        }

        if (tool === 'getbased_draft_meal') {
          rejectUnknownArguments(args, ['name', 'eatenAt', 'mealType', 'energyKcal', 'proteinG', 'carbohydrateG', 'fatG', 'fiberG', 'fluidMl', 'note']);
          const name = requiredString(args, 'name', 160);
          const eatenAt = optionalString(args, 'eatenAt', 40);
          if (eatenAt && !Number.isFinite(new Date(eatenAt).getTime())) throw new Error('eatenAt must be an ISO-8601 date-time.');
          const mealType = enumValue(args, 'mealType', ['breakfast', 'brunch', 'lunch', 'dinner', 'snack', 'drink', 'other'], 'other');
          const payload = { name, eatenAt, mealType, note: optionalString(args, 'note', 500), nutrients: {} };
          for (const [key, max] of Object.entries({ energyKcal: 20000, proteinG: 2000, carbohydrateG: 3000, fatG: 2000, fiberG: 1000, fluidMl: 20000 })) {
            const value = optionalFiniteNumber(args, key, { min: 0, max });
            if (value !== null) payload.nutrients[key] = value;
          }
          return createDraft('meal', payload, `${name}${eatenAt ? ` · ${eatenAt}` : ''}`);
        }

        if (tool === 'getbased_draft_biometric') {
          rejectUnknownArguments(args, ['metric', 'date', 'value', 'unit', 'systolic', 'diastolic', 'pulse', 'note']);
          const metric = enumValue(args, 'metric', ['weight', 'bp', 'rhr']);
          const date = optionalDate(args, 'date');
          const note = optionalString(args, 'note', 500);
          if (metric === 'bp') {
            const systolic = optionalFiniteNumber(args, 'systolic', { min: 40, max: 300 });
            const diastolic = optionalFiniteNumber(args, 'diastolic', { min: 20, max: 200 });
            const pulse = optionalFiniteNumber(args, 'pulse', { min: 20, max: 250 });
            if (systolic === null || diastolic === null) throw new Error('systolic and diastolic are required for blood pressure.');
            return createDraft('biometric', { metric, date, systolic, diastolic, pulse, note }, `Blood pressure ${systolic}/${diastolic}${pulse ? ` · pulse ${pulse}` : ''}`);
          }
          const value = optionalFiniteNumber(args, 'value', metric === 'weight' ? { min: 1, max: 1000 } : { min: 20, max: 250 });
          if (value === null) throw new Error('value is required.');
          const unit = metric === 'weight' ? enumValue(args, 'unit', ['kg', 'lb'], 'kg') : 'bpm';
          return createDraft('biometric', { metric, date, value, unit, note }, `${metric === 'weight' ? 'Weight' : 'Resting pulse'} ${value} ${unit}`);
        }

        rejectUnknownArguments(args, ['name', 'type', 'dosage', 'startDate', 'note']);
        const name = requiredString(args, 'name', 160);
        const type = enumValue(args, 'type', ['supplement', 'medication']);
        const dosage = optionalString(args, 'dosage', 160);
        const startDate = optionalDate(args, 'startDate');
        const note = optionalString(args, 'note', 500);
        return createDraft('supplement', { name, type, dosage, startDate, note }, `${type === 'medication' ? 'Medication' : 'Supplement'}: ${name}${dosage ? ` · ${dosage}` : ''}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : '';
        const safeInputError = /^(Tool arguments|Unknown argument:|[A-Za-z]+ (?:is|required|must)|from must|view or marker)/.test(message);
        return failure(safeInputError ? message : 'getbased context is temporarily unavailable.');
      }
    },
  });
}

/**
 * @typedef {{
 *   id: string,
 *   kind: 'note'|'meal'|'biometric'|'supplement',
 *   summary: string,
 *   payload: Record<string, any>,
 *   status: 'pending',
 * }} AgentDraft
 */
