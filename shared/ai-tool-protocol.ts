// Provider transport data only. Execution and approval stay in the browser runtime.
import type { AgentToolDefinition } from './agent-tool-contract.js';

export interface AIFunctionTool { type: 'function'; function: { name: string; description: string; parameters: AgentToolDefinition['inputSchema'] } }
export interface AIToolCall { id: string; type: 'function'; function: { name: string; arguments: string } }
export interface AIChatMessage {
  role?: unknown; content?: unknown;
  tool_calls?: AIToolCall[]; tool_call_id?: string;
  reasoning_content?: string; reasoning_details?: unknown[];
}
export const MAX_AI_TOOL_CALLS = 16;
const MAX_TOOL_ARGUMENT_CHARS = 32000;
const MAX_TOOL_RESPONSE_CHARS = 128000;

export function normalizeAIToolCalls(value: unknown): AIToolCall[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > MAX_AI_TOOL_CALLS || JSON.stringify(value).length > MAX_TOOL_RESPONSE_CHARS) throw new Error('Invalid or oversized AI tool calls.');
  const ids = new Set<string>();
  return value.map(raw => {
    if (!raw || typeof raw !== 'object') throw new Error('Invalid AI tool call.');
    const call = raw as Record<string, unknown>, fn = call.function as Record<string, unknown> | undefined;
    if (call.type !== 'function' || typeof call.id !== 'string' || !/^[A-Za-z0-9_.:-]{1,128}$/.test(call.id) || ids.has(call.id)
      || !fn || typeof fn.name !== 'string' || !/^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(fn.name)
      || typeof fn.arguments !== 'string' || fn.arguments.length > MAX_TOOL_ARGUMENT_CHARS) throw new Error('Invalid AI tool call.');
    let args: unknown;
    try { args = JSON.parse(fn.arguments); } catch { throw new Error('AI tool arguments are incomplete or invalid JSON.'); }
    if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('AI tool arguments must be an object.');
    ids.add(call.id);
    return { id: call.id, type: 'function', function: { name: fn.name, arguments: fn.arguments } };
  });
}

/** SSE function names, IDs and JSON arguments can each span multiple deltas. */
export function createAIToolCallAccumulator() {
  const calls = new Map<number, { id: string; type: string; function: { name: string; arguments: string } }>();
  let chars = 0;
  return {
    append(value: unknown) {
      if (!Array.isArray(value) || value.length > MAX_AI_TOOL_CALLS) throw new Error('Invalid AI tool stream.');
      for (const raw of value) {
        if (!raw || typeof raw !== 'object') throw new Error('Invalid AI tool stream.');
        const part = raw as Record<string, unknown>;
        if (!Number.isInteger(part.index) || Number(part.index) < 0 || Number(part.index) >= MAX_AI_TOOL_CALLS) throw new Error('Invalid AI tool stream index.');
        const index = Number(part.index), call = calls.get(index) || { id: '', type: 'function', function: { name: '', arguments: '' } };
        if (part.type !== undefined && part.type !== 'function') throw new Error('Unsupported AI tool type.');
        const fn = part.function as Record<string, unknown> | undefined;
        const append = (previous: string, fragment: unknown) => {
          if (fragment === undefined || fragment === null) return previous;
          if (typeof fragment !== 'string') throw new Error('Invalid AI tool stream fragment.');
          chars += fragment.length;
          if (chars > MAX_TOOL_RESPONSE_CHARS) throw new Error('AI tool stream exceeded its size limit.');
          return previous + fragment;
        };
        call.id = append(call.id, part.id);
        call.function.name = append(call.function.name, fn?.name);
        call.function.arguments = append(call.function.arguments, fn?.arguments);
        calls.set(index, call);
      }
    },
    finish: () => normalizeAIToolCalls([...calls].sort(([a], [b]) => a - b).map(([, call]) => call)),
  };
}

export class AIToolsUnsupportedError extends Error { readonly code = 'ai_tools_unsupported'; }
