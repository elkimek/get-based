import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentTurnOptions, AgentHostConnection, AgentExecutionTarget } from '../js/agent-chat-client.js';
import type { AgentConnectionOptions } from '../js/agent-host-discovery.js';
import type { AIProcessingApprovalOptions } from '../js/cloud-ai-consent.js';

const mocks = vi.hoisted(() => ({
  agent: 'codex', effort: '', target: 'local',
  connect: vi.fn<(agent: string, options?: AgentConnectionOptions) => Promise<unknown>>(), stream: vi.fn<(options: AgentTurnOptions) => Promise<unknown>>(), approval: vi.fn<(provider: string, options?: AIProcessingApprovalOptions) => Promise<unknown>>(), targets: vi.fn<(options: AgentHostConnection) => Promise<Partial<AgentExecutionTarget>[]>>(),
}));
vi.mock('../js/agent-chat-settings.js', () => ({
  connectDetectedAgent: mocks.connect,
  getAgentHostAgent: () => mocks.agent,
  getAgentHostEffort: () => mocks.effort,
  getAgentHostTarget: () => mocks.target,
  getAgentHostEndpoint: () => 'http://127.0.0.1:8324',
  getAgentHostToken: () => 'test-connection-token',
}));
vi.mock('../js/agent-chat-client.js', () => ({ streamAgentTurn: mocks.stream, uploadAgentImage: vi.fn<(options: AgentHostConnection & {file: Blob}) => Promise<string>>(), listAgentExecutionTargets: mocks.targets }));
vi.mock('../js/cloud-ai-consent.js', () => ({ requireAIProcessingApproval: mocks.approval }));
import { callCodexFeature, featureReasoningEffort, strictOutputSchema } from '../js/agent-feature-inference.js';

describe('CLI feature request preferences', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.agent = 'codex'; mocks.effort = ''; mocks.target = 'local'; });
  it('rejects oversized feature requests locally before connecting or sending profile text', async () => {
    await expect(callCodexFeature({ prompt: 'x'.repeat(100_001), model: 'test-model' })).rejects.toThrow('size limit');
    expect(mocks.connect).not.toHaveBeenCalled(); expect(mocks.stream).not.toHaveBeenCalled();
  });
  it('routes a text explanation to a capable Hermes gateway as a fresh feature request', async () => {
    mocks.agent = 'hermes'; mocks.target = 'gateway-home';
    mocks.targets.mockResolvedValue([{ id: 'gateway-home', supportsTextFeatureJobs: true }]);
    await callCodexFeature({ prompt: 'Synthetic score explanation', model: 'remote-model' });
    expect(mocks.stream).toHaveBeenCalledWith(expect.objectContaining({ agent: 'hermes', target: 'gateway-home', purpose: 'feature', tools: [], prompt: 'Synthetic score explanation' }));
    expect(mocks.stream.mock.calls[0]![0].threadId).toBeUndefined();
    expect(mocks.approval).toHaveBeenCalledWith('personal-agent-gateway', expect.objectContaining({ kind: 'text' }));
  });
  it('reports an outdated gateway capability before sending any profile text', async () => {
    mocks.target = 'gateway-home'; mocks.targets.mockResolvedValue([{ id: 'gateway-home' }]);
    await expect(callCodexFeature({ prompt: 'Synthetic score', model: 'remote-model' })).rejects.toThrow('Update the Companion');
    expect(mocks.stream).not.toHaveBeenCalled();
  });
  it('keeps unsupported remote images blocked', async () => {
    mocks.target = 'gateway-home';
    await expect(callCodexFeature({ prompt: 'Image', files: [new Blob(['image'])], model: 'remote-model' })).rejects.toThrow('Local CLI for image imports');
    expect(mocks.stream).not.toHaveBeenCalled();
  });
  it('keeps default reasoning unset instead of forcing low', async () => {
    await callCodexFeature({ prompt: 'Synthetic analysis', model: 'test-model' });
    expect(mocks.stream).toHaveBeenCalledWith(expect.objectContaining({ effort: '', agent: 'codex' }));
  });
  it('captures the agent and its reasoning before discovery and approval', async () => {
    mocks.effort = 'high';
    mocks.connect.mockImplementationOnce(async () => { mocks.agent = 'hermes'; mocks.effort = 'low'; });
    await callCodexFeature({ prompt: 'Synthetic analysis', model: 'test-model' });
    expect(mocks.connect).toHaveBeenCalledWith('codex', expect.anything());
    expect(mocks.stream).toHaveBeenCalledWith(expect.objectContaining({ agent: 'codex', effort: 'high' }));
  });
  it('preserves an explicit default even if the main model has a saved effort', async () => {
    mocks.effort = 'high';
    await callCodexFeature({ prompt: 'Synthetic analysis', model: 'test-model', effort: '' });
    expect(mocks.stream).toHaveBeenCalledWith(expect.objectContaining({ effort: '' }));
  });
});

const at = (value: unknown, ...path: string[]): unknown => path.reduce<unknown>((node, key) => (node as Record<string, unknown>)[key], value);

describe('CLI structured output schema', () => {
  const importSchema = () => Object.freeze({
    type: 'object',
    additionalProperties: false,
    properties: {
      testType: { type: ['string', 'null'] },
      labName: { type: ['string', 'null'] },
      markers: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            rawName: { type: 'string' },
            suggestedKey: { type: ['string', 'null'] },
            flag: { type: 'string', enum: ['H', 'L'] },
            note: { type: 'string' },
          },
          required: ['rawName'],
        },
      },
    },
    required: ['testType', 'markers'],
  });

  it('requires every property key at every object level and closes the objects', () => {
    const normalized = strictOutputSchema(importSchema());
    expect(at(normalized, 'required')).toEqual(['testType', 'labName', 'markers']);
    expect(at(normalized, 'additionalProperties')).toBe(false);
    expect(at(normalized, 'properties', 'markers', 'items', 'required')).toEqual(['rawName', 'suggestedKey', 'flag', 'note']);
    expect(at(normalized, 'properties', 'markers', 'items', 'additionalProperties')).toBe(false);
  });
  it('makes only formerly optional, non-nullable keys nullable', () => {
    const normalized = strictOutputSchema(importSchema());
    const items = at(normalized, 'properties', 'markers', 'items', 'properties');
    expect(at(normalized, 'properties', 'labName')).toEqual({ type: ['string', 'null'] });
    expect(at(items, 'rawName')).toEqual({ type: 'string' });
    expect(at(items, 'suggestedKey')).toEqual({ type: ['string', 'null'] });
    expect(at(items, 'note')).toEqual({ type: ['string', 'null'] });
    expect(at(items, 'flag')).toEqual({ type: ['string', 'null'], enum: ['H', 'L', null] });
  });
  it('wraps optional objects, refs and consts in a null branch and recurses through combinators and defs', () => {
    const normalized = strictOutputSchema({
      type: 'object',
      properties: {
        label: { type: 'object', properties: { size: { type: 'number' } } },
        unit: { $ref: '#/$defs/unit' },
        kind: { const: 'lab' },
        choice: { anyOf: [{ type: 'object', properties: { a: { type: 'string' } } }, { type: 'number' }] },
        nullableChoice: { anyOf: [{ type: 'string' }, { type: 'null' }] },
      },
      required: [],
      $defs: { unit: { type: 'object', properties: { name: { type: 'string' } } } },
    });
    expect(at(normalized, 'properties', 'label')).toEqual({ anyOf: [
      { type: 'object', properties: { size: { type: ['number', 'null'] } }, required: ['size'], additionalProperties: false },
      { type: 'null' },
    ] });
    expect(at(normalized, 'properties', 'unit')).toEqual({ anyOf: [{ $ref: '#/$defs/unit' }, { type: 'null' }] });
    expect(at(normalized, 'properties', 'kind')).toEqual({ anyOf: [{ const: 'lab' }, { type: 'null' }] });
    expect(at(normalized, 'properties', 'choice', 'anyOf')).toEqual([
      { type: 'object', properties: { a: { type: ['string', 'null'] } }, required: ['a'], additionalProperties: false },
      { type: 'number' },
      { type: 'null' },
    ]);
    expect(at(normalized, 'properties', 'nullableChoice')).toEqual({ anyOf: [{ type: 'string' }, { type: 'null' }] });
    expect(at(normalized, '$defs', 'unit', 'required')).toEqual(['name']);
    expect(at(normalized, '$defs', 'unit', 'additionalProperties')).toBe(false);
  });
  it('leaves an already strict schema unchanged and never mutates the caller schema', () => {
    const strict = { type: 'object', additionalProperties: false, properties: { a: { type: 'string' } }, required: ['a'] };
    expect(strictOutputSchema(strict)).toEqual(strict);
    const original = importSchema();
    const snapshot = JSON.parse(JSON.stringify(original));
    const normalized = strictOutputSchema(original);
    expect(original).toEqual(snapshot);
    expect(normalized).not.toBe(original);
    expect(strictOutputSchema(undefined)).toBeUndefined();
  });
});

describe('CLI feature reasoning effort', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.agent = 'codex'; mocks.effort = ''; mocks.target = 'local'; });
  it('maps direct-API efforts the Codex and Claude CLIs reject to low', () => {
    for (const agent of ['codex', 'claude']) {
      expect(featureReasoningEffort(agent, 'none')).toBe('low');
      expect(featureReasoningEffort(agent, 'minimal')).toBe('low');
      expect(featureReasoningEffort(agent, 'off')).toBe('low');
    }
  });
  it('keeps supported efforts and an unset default', () => {
    for (const effort of ['low', 'medium', 'high', 'xhigh', 'max', 'ultra']) expect(featureReasoningEffort('codex', effort)).toBe(effort);
    expect(featureReasoningEffort('codex', ' High ')).toBe('high');
    expect(featureReasoningEffort('codex', '')).toBe('');
    expect(featureReasoningEffort('codex', undefined)).toBeUndefined();
  });
  it('leaves other agents\' effort names alone', () => {
    expect(featureReasoningEffort('hermes', 'none')).toBe('none');
  });
  it('sends the mapped effort and the strict schema to the Companion', async () => {
    const schema = Object.freeze({ type: 'object', properties: { testType: { type: 'string' }, labName: { type: ['string', 'null'] } }, required: ['testType'] });
    await callCodexFeature({ prompt: 'Synthetic report', model: 'test-model', effort: 'none', outputSchema: schema });
    const sent = mocks.stream.mock.calls[0]![0];
    expect(sent.effort).toBe('low');
    expect(sent.outputSchema).toEqual({ type: 'object', properties: { testType: { type: 'string' }, labName: { type: ['string', 'null'] } }, required: ['testType', 'labName'], additionalProperties: false });
    expect(schema.required).toEqual(['testType']);
  });
});
