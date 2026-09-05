// @ts-check
// NDJSON streaming client for the loopback getbased Agent Host.

import {
  AGENT_HOST_CAPABILITIES, normalizeAgentHostCapabilities, normalizeAgentHostProtocolVersion,
} from '../shared/agent-host-protocol.js';

const MAX_AGENT_RESPONSE_CHARS = 2_000_000;
const MAX_AGENT_TOOL_CALLS = 100;
const MAX_AGENT_WEB_SEARCH_EVENTS = 200;

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
  const feature = capability === AGENT_HOST_CAPABILITIES.IMAGE_UPLOAD
    ? 'image support'
    : capability === AGENT_HOST_CAPABILITIES.COMPANION_CONTROL
      ? 'companion controls'
      : capability === AGENT_HOST_CAPABILITIES.EXECUTION_TARGETS
        ? 'personal gateway targets'
    : capability === AGENT_HOST_CAPABILITIES.STRUCTURED_HEALTH_TOOLS
      ? 'the latest getbased tools'
      : 'this feature';
  const error = new Error(`The local getbased Companion is outdated. Update it in AI settings to enable ${feature}.`);
  // @ts-ignore — lightweight browser error classification.
  error.code = 'agent_host_upgrade_required';
  return error;
}

/**
 * @param {{endpoint: string, token: string, agent?: string, signal?: AbortSignal}} options
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
 * @param {{endpoint: string, token: string, action: 'pause'|'resume'|'install'|'restart'|'restart-companion'|'update'|'uninstall', signal?: AbortSignal}} options
 */
export async function controlAgentHost(options) {
  const response = await fetch(endpointUrl(options.endpoint, '/v1/control'), {
    method: 'POST',
    signal: options.signal,
    cache: 'no-store',
    headers: {
      Authorization: `Bearer ${options.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action: options.action }),
  });
  if (response.status === 404 || response.status === 501) {
    throw agentHostUpgradeRequiredError(AGENT_HOST_CAPABILITIES.COMPANION_CONTROL);
  }
  if (!response.ok) throw new Error(await responseError(response));
  return response.json();
}

/**
 * @param {{endpoint: string, token: string, agent?: string, target?: string, model?: string, refresh?: boolean, signal?: AbortSignal}} options
 */
export async function listAgentModels(options) {
  const query = new URLSearchParams();
  if (options.agent) query.set('agent', options.agent);
  if (options.target) query.set('target', options.target);
  if (options.model) query.set('model', options.model);
  if (options.refresh) query.set('refresh', 'true');
  const suffix = query.size ? `?${query}` : '';
  const response = await fetch(endpointUrl(options.endpoint, `/v1/models${suffix}`), {
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
 * @param {{endpoint: string, token: string, agent?: string, signal?: AbortSignal}} options
 */
export async function listAgentExecutionTargets(options) {
  const query = new URLSearchParams();
  if (options.agent) query.set('agent', options.agent);
  const response = await fetch(endpointUrl(options.endpoint, `/v1/targets?${query}`), {
    signal: options.signal,
    cache: 'no-store',
    headers: { Authorization: `Bearer ${options.token}` },
  });
  if (response.status === 404) throw agentHostUpgradeRequiredError(AGENT_HOST_CAPABILITIES.EXECUTION_TARGETS);
  if (!response.ok) throw new Error(await responseError(response));
  const payload = await response.json();
  return Array.isArray(payload?.targets) ? payload.targets : [];
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
 *   agent?: string,
 *   target?: string,
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
      agent: options.agent || undefined,
      target: options.target || undefined,
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
  let model = options.model || 'CLI agent';
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
      if (webSearches.length < MAX_AGENT_WEB_SEARCH_EVENTS) {
        webSearches.push({ status: String(event.status || ''), query: String(event.query || '') });
      }
    } else if (event?.type === 'text_delta' && typeof event.delta === 'string') {
      if (text.length + event.delta.length > MAX_AGENT_RESPONSE_CHARS) {
        throw new Error('CLI agent response exceeded the safe size limit.');
      }
      text += event.delta;
      options.onStream?.(text);
    } else if (event?.type === 'usage') {
      usage = { inputTokens: Number(event.inputTokens || 0), outputTokens: Number(event.outputTokens || 0) };
    } else if (event?.type === 'tool_call') {
      if (!options.toolRuntime) throw new Error('The CLI agent requested a tool that is not available for this feature.');
      if (toolCalls.length >= MAX_AGENT_TOOL_CALLS) {
        throw new Error('CLI agent requested too many tools in one response.');
      }
      const recordedCall = { tool: String(event.tool || ''), arguments: event.arguments, success: false };
      toolCalls.push(recordedCall);
      const result = await options.toolRuntime.execute({
        tool: event.tool,
        namespace: event.namespace,
        arguments: event.arguments,
      });
      recordedCall.success = result?.success === true;
      const toolResponse = await fetch(endpointUrl(options.endpoint, `/v1/responses/${encodeURIComponent(event.responseId)}`), {
        method: 'POST', headers, body: JSON.stringify(result), signal: options.signal,
      });
      if (!toolResponse.ok) throw new Error(await responseError(toolResponse));
    } else if (event?.type === 'done') {
      finishReason = String(event.finishReason || 'stop');
    } else if (event?.type === 'error') {
      throw new Error(String(event.message || 'CLI agent response failed.'));
    }
  };

  try {
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
  } catch (error) {
    try { await reader.cancel(error); } catch { /* already closed */ }
    throw error;
  }
  if (!finishReason) throw new Error('The companion disconnected before the CLI agent completed the response.');
  return { text, threadId, model, finishReason, usage, toolCalls, webSearches };
}
