// Structured, capability-gated feature inference through a local CLI adapter.

import { listAgentExecutionTargets, streamAgentTurn, uploadAgentImage } from './agent-chat-client.js';
import { connectDetectedAgent, getAgentHostAgent, getAgentHostEffort, getAgentHostEndpoint, getAgentHostTarget, getAgentHostToken } from './agent-chat-settings.js';
import { AGENT_HOST_CAPABILITIES, AGENT_HOST_MAX_PROMPT_CHARS } from '../shared/agent-host-protocol.js';

export interface CodexFeatureOptions {
  files?: Blob[] | undefined;
  prompt: string;
  model: string;
  effort?: string | undefined;
  outputSchema?: Record<string, unknown> | undefined;
  signal?: AbortSignal | undefined;
  instructions?: string | undefined;
  consentKind?: string | undefined;
  onStream?: ((text: string) => void) | undefined;
}

type JsonSchema = Record<string, unknown>;

// Effort names the Codex and Claude CLIs use. Other values (such as the
// direct-API 'none' or 'minimal') fail the whole turn on newer models.
const CLI_REASONING_EFFORTS = new Set(['low', 'medium', 'high', 'xhigh', 'max', 'ultra']);
const CLI_EFFORT_AGENTS = new Set(['codex', 'claude']);

export function featureReasoningEffort(agent: string, effort: string | undefined) {
  if (!CLI_EFFORT_AGENTS.has(agent) || typeof effort !== 'string' || !effort.trim()) return effort;
  const value = effort.trim().toLowerCase();
  return CLI_REASONING_EFFORTS.has(value) ? value : 'low';
}

function isSchemaRecord(value: unknown): value is JsonSchema {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function allowsNull(schema: JsonSchema): boolean {
  const branches = [schema.anyOf, schema.oneOf].filter(Array.isArray).flat();
  if (branches.some(branch => isSchemaRecord(branch) && allowsNull(branch))) return true;
  if (Array.isArray(schema.enum) && !schema.enum.includes(null)) return false;
  if ('const' in schema) return schema.const === null;
  return schema.type === 'null' || (Array.isArray(schema.type) && schema.type.includes('null'));
}

function nullableSchema(schema: JsonSchema): JsonSchema {
  if (allowsNull(schema)) return schema;
  const { type } = schema;
  if ((typeof type === 'string' || Array.isArray(type)) && !('const' in schema) && !('properties' in schema)) {
    const types = Array.isArray(type) ? type : [type];
    const next: JsonSchema = { ...schema, type: types.includes('null') ? types : [...types, 'null'] };
    if (Array.isArray(schema.enum)) next.enum = [...schema.enum, null];
    return next;
  }
  for (const key of ['anyOf', 'oneOf']) {
    const branches = schema[key];
    if (Array.isArray(branches)) return { ...schema, [key]: [...branches, { type: 'null' }] };
  }
  return { anyOf: [schema, { type: 'null' }] };
}

function normalizeSchemaNode(node: unknown): void {
  if (Array.isArray(node)) { node.forEach(normalizeSchemaNode); return; }
  if (!isSchemaRecord(node)) return;
  for (const key of ['$defs', 'definitions']) {
    const defs = node[key];
    if (isSchemaRecord(defs)) Object.values(defs).forEach(normalizeSchemaNode);
  }
  for (const key of ['items', 'prefixItems', 'anyOf', 'oneOf', 'allOf']) normalizeSchemaNode(node[key]);
  const properties = node.properties;
  if (!isSchemaRecord(properties)) return;
  const required = new Set(Array.isArray(node.required) ? node.required : []);
  for (const [key, child] of Object.entries(properties)) {
    normalizeSchemaNode(child);
    if (!required.has(key) && isSchemaRecord(child)) properties[key] = nullableSchema(child);
  }
  node.required = Object.keys(properties);
  node.additionalProperties = false;
}

// OpenAI strict structured outputs reject any object whose `required` omits a
// property. Require every key and make formerly optional ones nullable, so the
// model can still leave them empty. The caller's (often frozen) schema is never
// mutated.
export function strictOutputSchema(schema: JsonSchema | undefined): JsonSchema | undefined {
  if (!isSchemaRecord(schema)) return schema;
  const clone = JSON.parse(JSON.stringify(schema)) as JsonSchema;
  normalizeSchemaNode(clone);
  return clone;
}

export async function callCodexFeature(options: CodexFeatureOptions) {
  if (!options.prompt?.trim()) throw new Error('The AI request is empty. Please retry.');
  if (options.prompt.trim().length > AGENT_HOST_MAX_PROMPT_CHARS) throw new Error('This AI request exceeds the Companion’s size limit. Split the assessment into smaller groups and retry.');
  const files = Array.isArray(options.files) ? options.files : [];
  if (files.length > 4) throw new Error('The CLI companion can analyze up to 4 images or rendered PDF pages at once. Split this import into smaller files.');
  const target = getAgentHostTarget();
  const agent = getAgentHostAgent();
  const effort = featureReasoningEffort(agent, options.effort ?? getAgentHostEffort());
  const outputSchema = strictOutputSchema(options.outputSchema);
  if (target !== 'local' && files.length) throw new Error('This gateway supports text explanations. Choose Local CLI for image imports.');
  await connectDetectedAgent(agent, {
    signal: options.signal,
    requiredTextFeatureTarget: target === 'local' ? undefined : target,
    requiredCapabilities: [
      AGENT_HOST_CAPABILITIES.CHAT_STREAM,
      ...(target !== 'local' ? [AGENT_HOST_CAPABILITIES.EXECUTION_TARGETS] : []),
      ...(files.length ? [AGENT_HOST_CAPABILITIES.IMAGE_UPLOAD] : []),
      ...(options.outputSchema ? [AGENT_HOST_CAPABILITIES.STRUCTURED_OUTPUT] : []),
    ],
  });
  const endpoint = getAgentHostEndpoint();
  const token = getAgentHostToken();
  if (!token) throw new Error('The selected agent is not connected.');
  if (target !== 'local') {
    const targets = await listAgentExecutionTargets({ endpoint, token, agent, signal: options.signal });
    if (!targets.some(item => item.id === target && item.supportsTextFeatureJobs === true)) {
      throw new Error('This Companion does not support text explanations on the selected gateway yet. Update the Companion in AI settings.');
    }
  }
  const { requireAIProcessingApproval } = await import('./cloud-ai-consent.js');
  await requireAIProcessingApproval(target === 'local' ? 'codex-agent' : 'personal-agent-gateway', { kind: options.consentKind || (files.length ? 'meal-photo' : 'text'), modelId: options.model });
  const imageUploadIds = await Promise.all(files.map(file => uploadAgentImage({
    endpoint,
    token,
    file,
    signal: options.signal,
  })));

  return streamAgentTurn({
    endpoint,
    token,
    agent,
    target,
    model: options.model,
    effort,
    prompt: options.prompt,
    instructions: options.instructions || (options.outputSchema
      ? 'Perform only the requested structured feature analysis. Do not use web search or external tools. Return only data matching the supplied output schema.'
      : 'Perform only the requested getbased feature analysis. Do not use web search or external tools. Return only the requested answer.'),
    imageUploadIds,
    outputSchema,
    purpose: 'feature',
    tools: [],
    signal: options.signal,
    onStream: options.onStream,
  });
}

export async function callCodexVisionFeature(options: CodexFeatureOptions) {
  const files = Array.isArray(options.files) ? options.files : [];
  if (!files.length) throw new Error('At least one image is required.');
  return callCodexFeature(options);
}
