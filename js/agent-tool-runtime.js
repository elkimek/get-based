// @ts-check
// agent-tool-runtime.js — Portable Get-based agent-tool catalog and read-only execution boundary.

import {
  getAgentToolCatalog,
  MAX_AGENT_PROFILE_ID_LENGTH as MAX_PROFILE_ID_LENGTH,
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
 * produced by Get-based. It intentionally does not parse arbitrary HTML or
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

/** @param {string} text */
function success(text) {
  return {
    success: true,
    contentItems: [{ type: 'inputText', text }],
  };
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
  if (snapshot.profileId) parts.push(`Profile: ${snapshot.profileId}`);
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
 *   readContext: (options: {profile: string}) => Promise<string|AgentContextSnapshot>|string|AgentContextSnapshot,
 * }} dependencies
 */
export function createAgentToolRuntime({ readContext }) {
  if (typeof readContext !== 'function') throw new TypeError('readContext is required');

  return Object.freeze({
    tools: getAgentToolCatalog(),

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
          rejectUnknownArguments(args, ['profile']);
          const profile = optionalString(args, 'profile', MAX_PROFILE_ID_LENGTH);
          const snapshot = normalizeSnapshot(await readContext({ profile }));
          if (profile && snapshot.profileId !== profile) throw new Error('profile_unavailable');
          return success(formatFullContext(snapshot));
        }

        rejectUnknownArguments(args, ['section', 'profile']);
        const section = optionalString(args, 'section', MAX_SECTION_NAME_LENGTH);
        const profile = optionalString(args, 'profile', MAX_PROFILE_ID_LENGTH);
        const snapshot = normalizeSnapshot(await readContext({ profile }));
        if (profile && snapshot.profileId !== profile) throw new Error('profile_unavailable');
        const sections = parseAgentContextSections(snapshot.context);
        if (!section) return success(formatSectionIndex(sections));

        const match = findSection(sections, section);
        if (!match) {
          const available = sections.map(item => item.baseName).join(', ');
          return failure(`Section "${section}" not found.${available ? ` Available: ${available}` : ''}`);
        }
        return success(`[${match.name}]\n\n${match.content}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : '';
        const safeInputError = /^(Tool arguments|Unknown argument:|profile |section )/.test(message);
        return failure(safeInputError ? message : 'Get-based context is temporarily unavailable.');
      }
    },
  });
}
