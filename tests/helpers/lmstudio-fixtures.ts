import type { inferWithLMStudioNativeProvider, loadLMStudioModelWithContext } from '../../js/local-ai-provider-lmstudio.js';

interface ModelMetadata {
  max_context_length?: number;
  capabilities?: { reasoning: { allowed_options: string[]; default: string } };
}

export function lmStudioModel(
  key: string,
  loaded_instances: Array<{ id: string; config: { context_length: number } }>,
  metadata: ModelMetadata = {},
) {
  return { type: 'llm', key, loaded_instances, ...metadata };
}

export function largeLocalImportOptions() {
  return {
    system: 'Extract the report as JSON.',
    messages: [{ role: 'user', content: 'x'.repeat(25_000) }],
    maxTokens: 4096,
    jsonMode: true,
    reasoningEffort: 'none',
    preferNativeContext: true,
  };
}

export function lmStudioLoadFixture(modelDetail: Parameters<typeof loadLMStudioModelWithContext>[0]['modelDetail']) {
  return { baseUrl: 'http://lmstudio.test', model: 'big-model', modelDetail, contextLength: 16384 };
}

export function lmStudioInferenceFixture(maxTokens: number, contextLength: number) {
  return {
    config: { url: 'http://lmstudio.test', apiKey: '' },
    model: 'local-model',
    opts: { messages: [{ role: 'user', content: 'extract' }], requestTimeoutMs: 1000 },
    plan: { maxTokens }, contextLength, modelDetail: null,
  } satisfies Parameters<typeof inferWithLMStudioNativeProvider>[0];
}
