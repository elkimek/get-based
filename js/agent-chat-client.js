// @ts-check
// NDJSON streaming client for the loopback Get-based Agent Host.

import {
  AGENT_HOST_CAPABILITIES, normalizeAgentHostCapabilities, normalizeAgentHostProtocolVersion,
} from '../shared/agent-host-protocol.js';

/** @param {string} endpoint @param {string} path */
function endpointUrl(endpoint, path) {
  const url = new URL(endpoint);
  const loopback = url.hostname === '127.0.0.1' || url.hostname === 'localhost' || url.hostname === '[::1]';
  if (url.protocol !== 'http:' || !loopback) throw new Error('Agent Host must use a loopback HTTP address.');
  return `${url.origin}${path}`;
}

/** @param {Response} response */
async function responseError(response) {
  try {
    const body = await response.json();
    if (typeof body?.error === 'string') return body.error.replaceAll('_', ' ');
  } catch { /* use status fallback */ }
  return `Agent Host returned HTTP ${response.status}.`;
}

/** @param {string} capability */
export function agentHostUpgradeRequiredError(capability) {
  const feature = capability === AGENT_HOST_CAPABILITIES.IMAGE_UPLOAD ? 'image support' : 'this feature';
  const error = new Error(`The local Codex companion is outdated. Restart it to enable ${feature}.`);
  // @ts-ignore — lightweight browser error classification.
  error.code = 'agent_host_upgrade_required';
  return error;
}

/**
 * @param {{endpoint: string, token: string, signal?: AbortSignal}} options
 */
export async function checkAgentHost(options) {
  const response = await fetch(endpointUrl(options.endpoint, '/v1/status'), {
    signal: options.signal,
    cache: 'no-store',
    headers: { Authorization: `Bearer ${options.token}` },
  });
  if (!response.ok) throw new Error(await responseError(response));
  const payload = await response.json();
  if (payload?.service !== 'getbased-agent-host') throw new Error('Unexpected service on the Agent Host port.');
  return {
    ...payload,
    protocolVersion: normalizeAgentHostProtocolVersion(payload.protocolVersion),
    capabilities: normalizeAgentHostCapabilities(payload.capabilities),
  };
}

/**
 * @param {{endpoint: string, token: string, signal?: AbortSignal}} options
 */
export async function listAgentModels(options) {
  const response = await fetch(endpointUrl(options.endpoint, '/v1/models'), {
    signal: options.signal,
    cache: 'no-store',
    headers: { Authorization: `Bearer ${options.token}` },
  });
  if (response.status === 404) throw agentHostUpgradeRequiredError(AGENT_HOST_CAPABILITIES.MODEL_CATALOG);
  if (!response.ok) throw new Error(await responseError(response));
  const payload = await response.json();
  return Array.isArray(payload?.models) ? payload.models : [];
}

/**
 * Upload one image to the private loopback host. The host validates the file,
 * stores it only in its temporary workspace, and consumes it on the next turn.
 * @param {{endpoint: string, token: string, file: Blob, signal?: AbortSignal}} options
 */
export async function uploadAgentImage(options) {
  const response = await fetch(endpointUrl(options.endpoint, '/v1/uploads'), {
    method: 'POST',
    signal: options.signal,
    cache: 'no-store',
    headers: {
      Authorization: `Bearer ${options.token}`,
      'Content-Type': options.file.type || 'application/octet-stream',
    },
    body: options.file,
  });
  if (response.status === 404) throw agentHostUpgradeRequiredError(AGENT_HOST_CAPABILITIES.IMAGE_UPLOAD);
  if (!response.ok) throw new Error(await responseError(response));
  const payload = await response.json();
  const uploadId = typeof payload?.uploadId === 'string' ? payload.uploadId : '';
  if (!uploadId) throw new Error('Agent Host did not accept the image.');
  return uploadId;
}

/**
 * @param {{
 *   endpoint: string,
 *   token: string,
 *   prompt: string,
 *   threadId?: string,
 *   model?: string,
 *   effort?: string,
 *   instructions?: string,
 *   imageUploadIds?: string[],
 *   outputSchema?: Record<string, unknown>,
 *   purpose?: 'chat'|'feature',
 *   history?: Array<{role: 'user'|'assistant', content: string}>,
 *   tools: unknown[],
 *   toolRuntime?: {execute: (call: any) => Promise<any>},
 *   signal?: AbortSignal,
 *   onStream?: (text: string) => void,
 *   onEvent?: (event: any) => void,
 * }} options
 */
export async function streamAgentTurn(options) {
  const headers = { Authorization: `Bearer ${options.token}`, 'Content-Type': 'application/json' };
  const response = await fetch(endpointUrl(options.endpoint, '/v1/turns'), {
    method: 'POST',
    headers,
    body: JSON.stringify({
      prompt: options.prompt,
      threadId: options.threadId || undefined,
      model: options.model || undefined,
      effort: options.effort || undefined,
      instructions: options.instructions || undefined,
      imageUploadIds: options.imageUploadIds || undefined,
      outputSchema: options.outputSchema || undefined,
      purpose: options.purpose || 'chat',
      history: options.history || undefined,
      tools: options.tools,
    }),
    signal: options.signal,
  });
  if (response.status === 404) throw agentHostUpgradeRequiredError(AGENT_HOST_CAPABILITIES.CHAT_STREAM);
  if (!response.ok) throw new Error(await responseError(response));
  if (!response.body) throw new Error('Agent Host returned an empty response.');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  let threadId = options.threadId || '';
  let model = options.model || 'Codex';
  let finishReason = '';
  let usage;
  const toolCalls = [];
  const webSearches = [];

  const processEvent = async event => {
    options.onEvent?.(event);
    if (event?.type === 'session') {
      threadId = String(event.threadId || threadId);
      model = String(event.model || model);
    } else if (event?.type === 'model' && typeof event.model === 'string') {
      model = event.model;
    } else if (event?.type === 'activity' && event.activity === 'web_search') {
      webSearches.push({ status: String(event.status || ''), query: String(event.query || '') });
    } else if (event?.type === 'text_delta' && typeof event.delta === 'string') {
      text += event.delta;
      options.onStream?.(text);
    } else if (event?.type === 'usage') {
      usage = { inputTokens: Number(event.inputTokens || 0), outputTokens: Number(event.outputTokens || 0) };
    } else if (event?.type === 'tool_call') {
      if (!options.toolRuntime) throw new Error('Codex requested a tool that is not available for this feature.');
      toolCalls.push({ tool: String(event.tool || ''), arguments: event.arguments });
      const result = await options.toolRuntime.execute({
        tool: event.tool,
        namespace: event.namespace,
        arguments: event.arguments,
      });
      const toolResponse = await fetch(endpointUrl(options.endpoint, `/v1/responses/${encodeURIComponent(event.responseId)}`), {
        method: 'POST', headers, body: JSON.stringify(result), signal: options.signal,
      });
      if (!toolResponse.ok) throw new Error(await responseError(toolResponse));
    } else if (event?.type === 'done') {
      finishReason = String(event.finishReason || 'stop');
    } else if (event?.type === 'error') {
      throw new Error(String(event.message || 'Codex response failed.'));
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    if (buffer.length > 1_100_000) throw new Error('Agent Host sent an oversized stream event.');
    let newline;
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line) await processEvent(JSON.parse(line));
    }
  }
  const finalLine = `${buffer}${decoder.decode()}`.trim();
  if (finalLine) await processEvent(JSON.parse(finalLine));
  if (!finishReason) throw new Error('Agent Host disconnected before Codex completed the response.');
  return { text, threadId, model, finishReason, usage, toolCalls, webSearches };
}
