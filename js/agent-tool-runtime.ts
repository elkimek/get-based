import { createChatTurnOutcome, MAX_CHAT_DATA_REVIEWS, CHAT_REVIEW_LIMIT_NOTICE } from '../shared/chat-turn-outcome.js';
import { normalizeChatToolActivity, type ChatToolActivity } from '../shared/chat-tool-activity.js';
import { validateAppNavigation } from '../shared/app-navigation-contract.js';
import type { AppNavigationRequest } from '../shared/app-navigation-contract.js';
import { chatNavigationAllowed, CHAT_HEALTH_NAVIGATION_FIELDS, chatDataReadAllowed, chatDataPatchAllowed, CHAT_DATA_OPERATIONS, CHAT_NATIVE_UI_NOTICE } from '../shared/chat-control-policy.js';
import { AGENT_DATA_RESOURCES, normalizeAgentDataProposal } from '../shared/agent-data-contract.js';
import type { AgentDataResource, AgentDataOperation, AgentLegacyDraftKind } from '../shared/agent-data-contract.js';
// agent-tool-runtime.js — Portable getbased agent-tool catalog and read-only execution boundary.

import {
  getAgentToolCatalog,
  AGENT_CONTEXT_CARDS,
  normalizeAgentContextProposal,
  MAX_AGENT_QUERY_LENGTH,
  MAX_AGENT_SECTION_NAME_LENGTH as MAX_SECTION_NAME_LENGTH,
} from '../shared/agent-tool-contract.js';
import type { AgentContextCard, AgentContextChange } from '../shared/agent-tool-contract.js';

export {
  AGENT_TOOL_CONTRACT_VERSION, getAgentToolCatalog, getCodexDynamicTools,
} from '../shared/agent-tool-contract.js';


export interface AgentContextSection {baseName: string; name: string; metadata: string; content: string}
export interface AgentContextSnapshot {context: string; profileId?: string; updatedAt?: string}
export interface AgentContextReceipt {label: unknown; detail: string}
export interface AgentToolReceipt {tool?: string | undefined; arguments?: unknown; success?: boolean | undefined}
export interface AgentToolInvocation {tool?: unknown; arguments?: unknown; namespace?: unknown}
export interface AgentDraft {
  id: string;
  kind: 'note' | 'meal' | 'biometric' | 'supplement' | 'context' | 'data';
  summary: string;
  payload: Readonly<Record<string, unknown>>;
  status: 'pending';
}
export interface AgentToolReadOptions {
  searchConversations: { query: string; offset: number; limit: number };
  listAppActions: Record<string, never>;
  readAppState: { action: string; query?: string; offset?: number; limit?: number; connectionId?: string; profileId?: string; scopeId?: string };
  prepareAppControl: { action: string; snapshotId: string; parameters: string; reason: string; evidence: string };
  prepareLegacyDraft: { kind: AgentLegacyDraftKind; payload: Record<string, unknown>; evidence: string };
  readData: { resource: AgentDataResource | ''; recordId: string; create: boolean; query: string; offset: number; limit: number };
  prepareDataChange: { resource: AgentDataResource; snapshotId: string; operation: AgentDataOperation; patch: string; reason: string; evidence: string };
  searchMarkers: {query: string; limit: number; includeUnrecorded?: boolean};
  readMarkerHistory: {marker: string; from: string; to: string; limit: number};
  readNutritionSummary: {range: string};
  readWearableSeries: {days: number};
  searchKnowledge: {query: string; limit?: number};
  readKnowledge: {libraryId: string; query: string; offset: number; limit: number};
  navigate: AppNavigationRequest;
  readContextCard: {card: AgentContextCard | ''};
  prepareContextChange: {card: AgentContextCard; snapshotId: string; changes: AgentContextChange[]; reason: string; evidence: string};
}
type ToolReader<Options> = (options: Options) => unknown | Promise<unknown>;
export type AgentToolDependencies = {
  [Key in keyof AgentToolReadOptions]?: ToolReader<AgentToolReadOptions[Key]>;
} & {
  readContext: () => string | AgentContextSnapshot | Promise<string | AgentContextSnapshot>;
  userMessage?: string;
  canUseTools?: () => boolean;
  onToolActivity?: ((activity: ChatToolActivity) => void) | undefined;
  onDraftCreated?: (draft: AgentDraft) => void | Promise<void>;
  canDiscloseDraftReview?: (draft: AgentDraft) => boolean;
  createId?: () => string;
};
interface ToolResult {success: boolean; contentItems: [{type: 'inputText'; text: string}]}

function uniqueReceipts(receipts: AgentContextReceipt[], limit: number) {
  return receipts.filter((receipt, index) => receipts.findIndex(item => (
    item.label === receipt.label && item.detail === receipt.detail
  )) === index).slice(0, limit);
}

/**
 * Parse the bounded `[section:name metadata]...[/section:name]` projection
 * produced by getbased. It intentionally does not parse arbitrary HTML or
 * inspect application storage.
 */
export function parseAgentContextSections(context: string) {
  const sections: AgentContextSection[] = [];
  const pattern = /\[section:([A-Za-z0-9._-]+)([^\]\r\n]*)\]([\s\S]*?)\[\/section:\1\]/g;
  for (const match of String(context || '').matchAll(pattern)) {
    const baseName = match[1]!;
    const metadata = match[2]!.trim();
    sections.push({
      baseName,
      name: metadata ? `${baseName} ${metadata}` : baseName,
      metadata,
      content: match[3]!.trim(),
    });
  }
  return sections;
}

/**
 * Build the persisted disclosure from tools that successfully returned data to
 * the agent. Draft-only calls are excluded because they do not disclose stored
 * profile data.
 */
export function summarizeAgentToolReceipts(toolCalls: AgentToolReceipt[], fullContext: AgentContextReceipt[] = []) {
  const successful = Array.isArray(toolCalls) ? toolCalls.filter(call => call?.success === true) : [];
  const broad = successful.some(call => call.tool === 'getbased_lab_context');
  const clean = (value: unknown) => String(value || '').replace(/[\u0000-\u001F\u007F]+/g, ' ').trim().slice(0, 160);
  const receipts = successful.flatMap(call => {
    const args = call.arguments && typeof call.arguments === 'object' && !Array.isArray(call.arguments)
      ?  (call.arguments as Record<string, unknown>) : {};
    if (call.tool === 'getbased_section') return [{ label: 'getbased agent tool', detail: `Section: ${clean(args.section) || 'section list'}` }];
    if (call.tool === 'getbased_search_markers') return [{ label: args.includeUnrecorded ? 'Lab Marker Definitions' : 'Blood marker results', detail: `Search: ${clean(args.query) || 'markers'}` }];
    if (call.tool === 'getbased_marker_history') return [{ label: 'Blood marker results', detail: `History: ${clean(args.marker) || 'marker'}` }];
    if (call.tool === 'getbased_nutrition_summary') return [{ label: 'Meals & Nutrition', detail: `Summary: ${clean(args.range) || '30d'}` }];
    if (call.tool === 'getbased_wearable_series') return [{ label: 'Wearable recovery context', detail: `Series: ${clean(args.days) || '30'} days` }];
    if (call.tool === 'getbased_read_knowledge') return [{ label: 'Knowledge Base', detail: args.libraryId ? 'Saved document inventory' : 'Saved library inventory' }];
    if (call.tool === 'getbased_search_knowledge') return [{ label: 'Knowledge Base', detail: `Search: ${clean(args.query) || 'knowledge'}` }];
    if (call.tool === 'getbased_search_conversations' || call.tool === 'getbased_read_app' && args.action === 'conversations.search') return [{ label: 'Prior conversations', detail: 'Bounded historical excerpts' }];
    if (broad && !(call.tool === 'getbased_read_app' && args.action === 'wearables.sources')) return [];
    if (call.tool === 'getbased_read_app' && args.action === 'wearables.sources') return [{ label: 'Configured health sources', detail: 'Source freshness metadata' }];
    if (call.tool === 'getbased_read_context_card') return [{ label: 'Insight Context Cards', detail: `Card: ${clean(args.card) || 'card list'}` }];
    if (call.tool === 'getbased_read_data' && args.resource === 'knowledgeSettings' && !args.create) return [{ label: 'Knowledge Base Preferences', detail: 'Browser-wide retrieval preferences' }];
    if (call.tool === 'getbased_read_data' && AGENT_DATA_RESOURCES.includes(args.resource as AgentDataResource) && !args.create) return [{ label: args.resource === 'knowledgeLibraries' || args.resource === 'knowledgeDocuments' || args.resource === 'knowledgeImports' ? 'Knowledge Base' : args.resource === 'labSamples' || args.resource === 'labResults' || args.resource === 'markerNotes' || args.resource === 'markerValueNotes' ? 'Lab Markers' : args.resource === 'manualReadings' ? 'Wearables & Manual Readings' : args.resource === 'supplements' ? 'Supplements & Medications' : args.resource === 'nutritionTargets' || args.resource === 'meals' ? 'Meals & Nutrition' : args.resource === 'profile' ? 'Profile Details' : 'Insight Context Cards', detail: `Resource: ${clean(args.resource)}` }];
    if (call.tool === 'getbased_navigate' && args.marker) return [{ label: 'Blood marker results', detail: `Opened: ${clean(args.marker)}` }];
    return [];
  });
  if (broad && !receipts.length) return fullContext;
  return uniqueReceipts([...receipts, ...(broad ? fullContext : [])], 20);
}

/**
 * Every chat provider receives the enabled baseline projection. Append any
 * narrower tool lookups that disclosed additional data without dropping that
 * baseline receipt.
 */
export function mergeAgentContextReceipts(toolCalls: AgentToolReceipt[], fullContext: AgentContextReceipt[] = []) {
  const toolReceipts = summarizeAgentToolReceipts(toolCalls, fullContext);
  const combined = [...fullContext, ...toolReceipts];
  return uniqueReceipts(combined, 30);
}

function success(text: string): ToolResult {
  return {
    success: true,
    contentItems: [{ type: 'inputText', text }],
  };
}

function successJson(value: unknown) {
  if (value && typeof value === 'object' && 'available' in value && value.available === false) {
    return failure('reason' in value && typeof value.reason === 'string' ? value.reason : 'This data source is unavailable.');
  }
  return success(JSON.stringify(value, null, 2));
}

function failure(message: string): ToolResult {
  return {
    success: false,
    contentItems: [{ type: 'inputText', text: `Error: ${message}` }],
  };
}

function parseToolArguments(value: unknown) {
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
  return (parsed as Record<string, unknown>);
}

function rejectUnknownArguments(args: Record<string, unknown>, allowed: string[]) {
  const unknown = Object.keys(args).find(key => !allowed.includes(key));
  if (unknown) throw new Error(`Unknown argument: ${unknown}.`);
}

function optionalString(args: Record<string, unknown>, key: string, maxLength: number) {
  const value = args[key];
  if (value === undefined || value === null || value === '') return '';
  if (typeof value !== 'string') throw new Error(`${key} must be a string.`);
  const normalized = value.trim();
  if (normalized.length > maxLength) throw new Error(`${key} is too long.`);
  return normalized;
}

function requiredString(args: Record<string, unknown>, key: string, maxLength: number) {
  const value = optionalString(args, key, maxLength);
  if (!value) throw new Error(`${key} is required.`);
  return value;
}

function optionalInteger(args: Record<string, unknown>, key: string, { min, max, fallback }: {min: number; max: number; fallback: number}) {
  const value = args[key];
  if (value === undefined || value === null || value === '') return fallback;
  if (!Number.isInteger(value) || (value as number) < min || (value as number) > max) {
    throw new Error(`${key} must be an integer from ${min} to ${max}.`);
  }
  return value as number;
}

function optionalDate(args: Record<string, unknown>, key: string) {
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

function enumValue(args: Record<string, unknown>, key: string, allowed: string[], fallback = '') {
  const value = optionalString(args, key, 80) || fallback;
  if (!allowed.includes(value)) throw new Error(`${key} is not supported.`);
  return value;
}

function normalizeSnapshot(value: unknown): AgentContextSnapshot {
  if (typeof value === 'string') return { context: value };
  if (!value || typeof value !== 'object' || typeof (value as {context?: unknown}).context !== 'string') {
    throw new Error('invalid_context_snapshot');
  }
  const snapshot = (value as {context: string; profileId?: unknown; updatedAt?: unknown});
  return {
    context: snapshot.context,
    profileId: typeof snapshot.profileId === 'string' ? snapshot.profileId : '',
    updatedAt: typeof snapshot.updatedAt === 'string' ? snapshot.updatedAt : '',
  };
}

function formatFullContext(snapshot: AgentContextSnapshot) {
  const parts: string[] = [];
  if (snapshot.profileId) parts.push('Profile scope: active getbased profile');
  if (snapshot.updatedAt) parts.push(`Updated: ${snapshot.updatedAt}`);
  parts.push(snapshot.context || 'No context available');
  return parts.join('\n\n');
}

function formatSectionIndex(sections: AgentContextSection[]) {
  if (sections.length === 0) return 'No sections available';
  const lines = sections.map(({ name, content }) => {
    const lineCount = content.split('\n').filter(line => line.trim()).length;
    return `  ${name}  (${lineCount} lines)`;
  });
  return `Available sections:\n\n${lines.join('\n')}`;
}

function findSection(sections: AgentContextSection[], query: string) {
  const normalized = query.toLowerCase();
  return sections.find(section => section.name.toLowerCase() === normalized)
    || sections.find(section => section.name.toLowerCase().startsWith(normalized))
    || null;
}

/**
 * Create a call executor shared by the future localhost/Codex adapter and the
 * existing MCP-facing semantics. `readContext` is injected so this lower-level
 * module never reaches into IndexedDB, global state, or the DOM.
 */
export function createAgentToolRuntime(dependencies: AgentToolDependencies) {
  const permitted = () => dependencies.canUseTools?.() !== false;
  const assertPermitted = () => { if (!permitted()) throw new Error('Chat controls are disabled or the tool session expired.'); };
  const { readContext: read } = dependencies;
  const readContext = async () => { assertPermitted(); const value = await read(); assertPermitted(); return value; };
  if (typeof read !== 'function') throw new TypeError('readContext is required');

  const tools = getAgentToolCatalog(binding => typeof dependencies[binding] === 'function', 'current');
  const supported = new Set(tools.map(tool => tool.name));
  const drafts: AgentDraft[] = [];
  const outcome = createChatTurnOutcome();

  const runDependency = async <Key extends keyof AgentToolReadOptions>(name: Key, options: AgentToolReadOptions[Key]) => {
    const handler = dependencies[name] as ToolReader<AgentToolReadOptions[Key]> | undefined;
    if (typeof handler !== 'function') throw new Error('tool_unavailable');
    assertPermitted();
    const result = await handler(options); assertPermitted(); return result;
  };

  const createDraft = async (kind: AgentDraft['kind'], payload: Record<string, unknown>, summary: string, publicReview?: unknown) => {
    assertPermitted();
    if (drafts.length >= MAX_CHAT_DATA_REVIEWS) return failure(CHAT_REVIEW_LIMIT_NOTICE);
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
    assertPermitted(); drafts.push(draft);
    if (kind === 'context' || kind === 'data') outcome.review(draft.id, kind, kind === 'context' ? payload.card : payload.resource);
    await dependencies.onDraftCreated?.(draft); assertPermitted();
    if (publicReview !== undefined && dependencies.canDiscloseDraftReview?.(draft)) {
      const response = { draftId: draft.id, status: 'pending_user_approval', summary, review: publicReview };
      const encoded = JSON.stringify(response);
      if (encoded.length <= 64000) return success(encoded);
      return successJson({ draftId: draft.id, status: 'pending_user_approval', summary, reviewNotice: 'The full effect review is available in the proposal card. Do not invent omitted effects.' });
    }
    return successJson({ draftId: draft.id, status: 'pending_user_approval', summary });
  };
  const runtime = Object.freeze({
    tools: permitted() ? tools : [],
    getDrafts: () => permitted() ? drafts.map(draft => ({ ...draft, payload: { ...draft.payload } })) : [],
    getOutcome: () => { const result = outcome.snapshot(); return permitted() ? result : { ...result, reviews: [] }; },

    /**
 * Execute the shape emitted by Codex app-server `item/tool/call`. Other
 * adapters only need to provide the same `tool` and `arguments` fields.
 */
    async execute(call: AgentToolInvocation | null | undefined) {
      if (!permitted()) return failure('Chat controls are disabled or the tool session expired.');
      if (!call || typeof call !== 'object') return failure('Invalid tool call.');
      if (call.namespace && call.namespace !== 'getbased') {
        return failure(`Unknown tool namespace: ${call.namespace}.`);
      }

      const tool = typeof call.tool === 'string' ? call.tool : '';
      if (!supported.has(tool)) {
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
          rejectUnknownArguments(args, ['query', 'limit', 'includeUnrecorded']);
          if (args.includeUnrecorded !== undefined && typeof args.includeUnrecorded !== 'boolean') throw new Error('includeUnrecorded must be a boolean.');
          return successJson(await runDependency('searchMarkers', {
            query: requiredString(args, 'query', MAX_AGENT_QUERY_LENGTH),
            limit: optionalInteger(args, 'limit', { min: 1, max: 25, fallback: 10 }),
            ...(args.includeUnrecorded === true ? { includeUnrecorded: true } : {}),
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
          if (args.limit !== undefined && !Number.isInteger(args.limit)) throw new Error('limit must be an integer from 1 to 10.');
          const result = await runDependency('searchKnowledge', {
            query: requiredString(args, 'query', MAX_AGENT_QUERY_LENGTH),
            ...(args.limit === undefined ? {} : { limit: optionalInteger(args, 'limit', { min: 1, max: 10, fallback: 5 }) }),
          }) as { available?: boolean; reason?: string } | null;
          return result?.available === false ? failure(result.reason || 'Knowledge Base search is unavailable.') : successJson(result);
        }

        if (tool === 'getbased_read_context_card') {
          rejectUnknownArguments(args, ['card']);
          const card = optionalString(args, 'card', 80);
          if (card && !AGENT_CONTEXT_CARDS.includes(card as AgentContextCard)) throw new Error('card is not supported.');
          const result = await runDependency('readContextCard', { card: card as AgentContextCard | '' }) as { available?: boolean; reason?: string } | null;
          if (result?.available === false) return failure(result.reason || 'This context card is unavailable.');
          return successJson(result);
        }

        if (tool === 'getbased_draft_context') {
          rejectUnknownArguments(args, ['card', 'snapshotId', 'changes', 'reason', 'evidence']);
          const card = enumValue(args, 'card', [...AGENT_CONTEXT_CARDS]) as AgentContextCard;
          const snapshotId = requiredString(args, 'snapshotId', 128);
          const reason = requiredString(args, 'reason', 500);
          const evidence = requiredString(args, 'evidence', 1000);
          if (dependencies.userMessage !== undefined && !dependencies.userMessage.includes(evidence)) {
            throw new Error('evidence must quote the current user message exactly.');
          }
          if (!Array.isArray(args.changes)) throw new Error('changes must be a nonempty array of fields.');
          for (const change of args.changes) rejectUnknownArguments(parseToolArguments(change), ['field', 'value', 'values', 'operation', 'index', 'record']);
          const input = normalizeAgentContextProposal({ card, baseline: 'null', changes: args.changes, reason, evidence });
          if (!input) throw new Error('changes must contain distinct fields with either value or values.');
          const result = await runDependency('prepareContextChange', { card, snapshotId, changes: input.changes, reason, evidence }) as {
            available?: boolean; reason?: string; payload?: unknown; summary?: string;
          } | null;
          if (!result?.available) return failure(result?.reason || 'Context changes are unavailable.');
          const payload = normalizeAgentContextProposal(result.payload);
          if (!payload) return failure('The context proposal is invalid.');
          return createDraft('context', { ...payload }, result.summary || 'Update profile context');
        }

        if (tool === 'getbased_search_conversations') {
          rejectUnknownArguments(args, ['query', 'offset', 'limit']);
          const query = requiredString(args, 'query', 160);
          if (query.length < 2) throw new Error('Use a literal conversation search phrase of 2–160 characters.');
          return successJson(await runDependency('searchConversations', { query,
            offset: optionalInteger(args, 'offset', { min: 0, max: 100000, fallback: 0 }),
            limit: optionalInteger(args, 'limit', { min: 1, max: 25, fallback: 5 }),
          }));
        }
        if (tool === 'getbased_read_data') {
          rejectUnknownArguments(args, ['resource', 'recordId', 'create', 'query', 'offset', 'limit']);
          const resource = optionalString(args, 'resource', 80);
          if (resource && !chatDataReadAllowed(resource)) return failure(CHAT_NATIVE_UI_NOTICE);
          if (args.create !== undefined && typeof args.create !== 'boolean') throw new Error('create must be a boolean.');
          return successJson(await runDependency('readData', { resource: resource as AgentDataResource | '',
            recordId: optionalString(args, 'recordId', 160), create: args.create === true, query: optionalString(args, 'query', 160),
            offset: optionalInteger(args, 'offset', { min: 0, max: 100000, fallback: 0 }), limit: optionalInteger(args, 'limit', { min: 1, max: 25, fallback: 10 }),
          }));
        }
        if (tool === 'getbased_draft_data') {
          rejectUnknownArguments(args, ['resource', 'snapshotId', 'operation', 'patch', 'reason', 'evidence']);
          if (!chatDataPatchAllowed(requiredString(args, 'resource', 80), requiredString(args, 'operation', 80), JSON.parse(requiredString(args, 'patch', 16000)))) return failure(CHAT_NATIVE_UI_NOTICE);
          const evidence = requiredString(args, 'evidence', 1000);
          if (dependencies.userMessage !== undefined && !dependencies.userMessage.includes(evidence)) throw new Error('evidence must quote the current user message exactly.');
          const result = await runDependency('prepareDataChange', {
            resource: enumValue(args, 'resource', [...AGENT_DATA_RESOURCES]) as AgentDataResource,
            snapshotId: requiredString(args, 'snapshotId', 128), operation: enumValue(args, 'operation', [...CHAT_DATA_OPERATIONS]) as AgentDataOperation,
            patch: requiredString(args, 'patch', 16000), reason: requiredString(args, 'reason', 500), evidence,
          }) as { available?: boolean; reason?: string; payload?: unknown; summary?: string; publicReview?: unknown } | null;
          const payload = normalizeAgentDataProposal(result?.payload);
          if (!result?.available || !payload) return failure(result?.reason || 'Invalid data proposal.');
          return createDraft('data', { ...payload }, result.summary || 'Update application data', result.publicReview);
        }

        if (tool === 'getbased_navigate') {
          rejectUnknownArguments(args, [...CHAT_HEALTH_NAVIGATION_FIELDS]);
          const view = optionalString(args, 'view', 40);
          const marker = optionalString(args, 'marker', MAX_AGENT_QUERY_LENGTH);
          const request: AppNavigationRequest = { view, marker };
          if (Object.hasOwn(args, 'category')) request.category = requiredString(args, 'category', 160);
          if (Object.hasOwn(args, 'card')) request.card = enumValue(args, 'card', [...AGENT_CONTEXT_CARDS]);
          if (Object.hasOwn(args, 'recordId')) request.recordId = requiredString(args, 'recordId', 160);
          if (!chatNavigationAllowed(request)) return failure(CHAT_NATIVE_UI_NOTICE);
          validateAppNavigation(request);
          try {
            const receipt = await runDependency('navigate', request);
            outcome.navigation(receipt); return successJson(receipt);
          } catch (error) {
            if (!error || typeof error !== 'object' || !('noChangeApplied' in error) || error.noChangeApplied !== true) outcome.unconfirmed();
            throw error;
          }
        }

        return failure('This tool is unavailable for health conversations.');
      } catch (error) {
        const message = error instanceof Error ? error.message : '';
        const safeInputError = /^(Tool arguments|Unknown argument:|[A-Za-z]+ (?:is|required|must)|from must|view or marker)/.test(message);
        return failure(safeInputError ? message : 'getbased context is temporarily unavailable.');
      }
    },
  });
  let sequence = 0;
  return Object.freeze({ ...runtime, async execute(call: AgentToolInvocation | null | undefined) {
    let card: unknown; try { card = parseToolArguments(call?.arguments).card; } catch { /* The executor reports invalid arguments. */ }
    const record = normalizeChatToolActivity([{ id: String(++sequence), tool: call?.tool, card, status: 'running' }], true)[0];
    const publish = (status: ChatToolActivity['status']) => { if (record) try { dependencies.onToolActivity?.({ ...record, status }); } catch { /* UI must not alter execution. */ } };
    publish('running');
    try {
      const result = await runtime.execute(call);
      publish(result.success ? 'completed' : 'failed'); return result;
    }
    catch (error) { publish('failed'); throw error; }
  } });

}
