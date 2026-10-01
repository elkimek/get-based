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
