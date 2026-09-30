// Loopback HTTP boundary between the getbased PWA and Codex app-server.

import type {
  AgentHostServiceOptions, HostAgent, HostRoute, HostUpload, ActiveHostTurn,
  PendingHostTool, McpSession, McpContext, CodexHostMessage, CodexNotificationParams,
  CodexThreadResult, CodexTurnResult, HostControlAction,
} from './agent-host-turn-state.js';
import { cancelPendingHostTools } from './agent-host-turn-state.js';

import { randomUUID } from 'node:crypto';
import { unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  AGENT_HOST_CAPABILITY_LIST, AGENT_HOST_PROTOCOL_VERSION, AGENT_HOST_MAX_PROMPT_CHARS, isAllowedCompanionManagementParent,
} from '../shared/agent-host-protocol.js';
import { startExternalAgentTurn } from './agent-host-external-turn.js';
import { createCompanionManagement } from './companion-management.js';
import {
  AGENT_BASE_INSTRUCTIONS, DEFAULT_TOOL_TIMEOUT_MS, DISCOVERY_SESSION_TTL_MS,
  IMAGE_EXTENSIONS, MAX_DISCOVERY_SESSIONS, MAX_IMAGE_BYTES, MAX_IMAGES_PER_TURN,
  MAX_MCP_SESSIONS, MAX_REQUESTED_INSTRUCTIONS_CHARS, PERSONAL_AGENT_BASE_INSTRUCTIONS,
  UPLOAD_TTL_MS, cleanError, corsHeaders, createThreadHandle, declinedResult,
  hasImageSignature, isAllowedAgentHostOrigin, isAllowedAgentTool, isLoopbackOrigin, isRecord,
  jsonResponse, readJson, readThreadHandle, sanitizeDynamicTools, sanitizeHistory,
  sanitizeModelCatalog, sanitizeOutputSchema, sanitizeToolResult, tokenMatches,
} from './agent-host-boundary.js';

export { getAgentHostToolSpecs, isAllowedAgentHostOrigin } from './agent-host-boundary.js';

export function createAgentHostService(options: AgentHostServiceOptions) {
  const { appServer, token, workspaceRoot } = options;
  const configuredAgents = options.agents?.length ? options.agents : [{
    id: 'codex', name: 'Codex CLI', description: 'OpenAI official CLI',
    status: 'available', compatible: true, protocol: ('codex' as const), client: appServer,
  }];
  const agents = new Map((configuredAgents.filter(agent => agent?.id && agent.client) as HostAgent[]).map(agent => [agent.id, agent]));
  const instanceId = randomUUID();
  const startedAt = new Date().toISOString();
  const toolTimeoutMs = options.toolTimeoutMs || DEFAULT_TOOL_TIMEOUT_MS;
  let paused = false;
  const allowedOrigins = (options.allowedOrigins || []).map(origin => {
    try { return new URL(origin).origin; } catch { return ''; }
  }).filter(Boolean);
  const pendingTools = new Map<string, PendingHostTool>();
  const pendingUploads = new Map<string, HostUpload>();
  const discoverySessions = new Map<string, { origin: string; expiresAt: number }>();
  const activeTurns = new Map<string, ActiveHostTurn>();
  const startingOrActiveTurns = new Set<string>();
  const mcpSessions = new Map<string, McpSession>();
  const sessionMcp = new Map<string, McpContext>();

  const publicRoute = (route: HostRoute) => ({
    id: String(route.id || '').slice(0, 80),
    label: String(route.label || route.id || '').slice(0, 140),
    description: String(route.description || '').slice(0, 300),
    kind: route.kind === 'gateway' ? 'gateway' : 'local',
    status: route.status === 'unavailable' ? 'unavailable' : 'available',
    ...(route.message ? { message: String(route.message).slice(0, 300) } : {}),
    ...(route.profile ? { profile: String(route.profile).slice(0, 100) } : {}),
    ...(route.gatewayLabel ? { gatewayLabel: String(route.gatewayLabel).slice(0, 100) } : {}),
    supportsLocalTools: route.supportsLocalTools !== false,
    supportsFeatureJobs: route.supportsFeatureJobs !== false,
    supportsTextFeatureJobs: route.supportsTextFeatureJobs === true,
  });

  async function listExecutionTargets(agent: HostAgent) {
    const local = {
      id: 'local', label: 'Local CLI', description: 'Run a separate, restricted getbased session on this computer.',
      kind: 'local', status: 'available', supportsLocalTools: true, supportsFeatureJobs: true,
      client: agent.client, protocol: agent.protocol,
    };
    const staticRoutes = Array.isArray(agent.routes) ? agent.routes : [];
    let dynamicRoutes: HostRoute[] = [];
    try { dynamicRoutes = agent.routeProvider ? await agent.routeProvider.listRoutes() : []; }
    catch { dynamicRoutes = []; }
    return [local, ...staticRoutes, ...dynamicRoutes].filter(route => route?.id);
  }

  async function resolveExecutionTarget(agent: HostAgent, targetId: string): Promise<HostAgent> {
    if (!targetId || targetId === 'local') return {
      ...agent, target: { id: 'local', kind: 'local', supportsLocalTools: true, supportsFeatureJobs: true },
    };
    let route: HostRoute | null | undefined = (Array.isArray(agent.routes) ? agent.routes : []).find(item => item?.id === targetId);
    if (!route && agent.routeProvider) route = await agent.routeProvider.resolve(targetId);
    if (!route) throw new Error('This execution target is no longer available.');
    if (route.status === 'unavailable' || !route.client) throw new Error((route.message || 'This execution target is not ready.') as string);
    return {
      ...agent,
      client: route.client,
      protocol: route.protocol || agent.protocol,
      target: route,
    } as HostAgent;
  }

  function createDiscoverySession(origin: string) {
    const now = Date.now();
    for (const [key, session] of discoverySessions) {
      if (session.expiresAt <= now) discoverySessions.delete(key);
    }
    while (discoverySessions.size >= MAX_DISCOVERY_SESSIONS) {
      const oldest = discoverySessions.keys().next().value;
      if (!oldest) break;
      discoverySessions.delete(oldest);
    }
    const sessionToken = randomUUID();
    const expiresAt = now + DISCOVERY_SESSION_TTL_MS;
    discoverySessions.set(sessionToken, { origin, expiresAt });
    return { token: sessionToken, expiresAt: new Date(expiresAt).toISOString() };
  }

  function isAuthorized(receivedToken: string, origin: string | null) {
    // The installation token is used only by the same-machine dev server and
    // explicit companion diagnostics. Hosted discovery receives a short-lived,
    // origin-bound token instead.
    if (tokenMatches(receivedToken, token) && isLoopbackOrigin(origin)) return true;
    const session = discoverySessions.get(receivedToken);
    if (!session) return false;
    if (session.expiresAt <= Date.now()) {
      discoverySessions.delete(receivedToken);
      return false;
    }
    return !!origin && session.origin === origin;
  }

  function cleanupUploads(uploads: HostUpload[]) {
    for (const upload of uploads) {
      clearTimeout(upload.timer);
      void unlink(upload.path).catch(() => {});
    }
  }

  function cancelPendingTools(threadId: string, message = 'Error: The agent turn ended before this tool completed.') {
    cancelPendingHostTools(() => pendingTools, () => threadId, () => ({ success: false, contentItems: [{ type: 'inputText', text: message }] }));
  }
  function handleServerRequest(request: CodexHostMessage) {
    const method = String(request?.method || '');
    if (method !== 'item/tool/call') {
      appServer!.respond(request.id as string | number, declinedResult(method));
      return;
    }
    const params = isRecord(request.params) ? request.params : {};
    const tool = String(params.tool || '');
    const threadId = String(params.threadId || '');
    const turnId = String(params.turnId || '');
    const active = activeTurns.get(threadId);
    if (!active || active.turnId !== turnId || !isAllowedAgentTool(tool)) {
      appServer!.respond(request.id as string | number, {
        success: false,
        contentItems: [{ type: 'inputText', text: 'Error: This getbased tool is not available.' }],
      });
      return;
    }
    const responseId = randomUUID();
    const timer = setTimeout(() => {
      pendingTools.delete(responseId);
      appServer!.respond(request.id as string | number, {
        success: false,
        contentItems: [{ type: 'inputText', text: 'Error: getbased tool response timed out.' }],
      });
    }, toolTimeoutMs);
    pendingTools.set(responseId, {
      threadId, timer, respond: result => appServer!.respond(request.id as string | number, result),
    });
    active.send({
      type: 'tool_call',
      responseId,
      callId: String(params.callId || ''),
      tool,
      namespace: typeof params.namespace === 'string' ? params.namespace : null,
      arguments: params.arguments,
    });
  }

  function handleNotification(notification: CodexHostMessage) {
    const params = (isRecord(notification?.params) ? notification.params : {}) as CodexNotificationParams;
    const threadId = String(params.threadId || '');
    const active = activeTurns.get(threadId);
    if (!active) return;
    const turnId = String(params.turnId || params.turn?.id || '');
    if (turnId && active.turnId !== turnId) return;
    if (notification.method === 'item/agentMessage/delta' && typeof params.delta === 'string') {
      active.send({ type: 'text_delta', delta: params.delta });
    } else if (notification.method === 'thread/tokenUsage/updated') {
      const last = isRecord(params.tokenUsage?.last) ? params.tokenUsage.last : {};
      active.send({
        type: 'usage',
        inputTokens: Number(last.inputTokens || 0),
        outputTokens: Number(last.outputTokens || 0),
      });
    } else if (notification.method === 'model/rerouted') {
      active.send({ type: 'model', model: String(params.toModel || '') });
    } else if ((notification.method === 'item/started' || notification.method === 'item/completed')
      && isRecord(params.item) && params.item.type === 'webSearch') {
      active.send({
        type: 'activity',
        activity: 'web_search',
        status: notification.method === 'item/completed' ? 'completed' : 'started',
        query: String(params.item.query || '').slice(0, 500),
      });
    } else if (notification.method === 'turn/completed') {
      const status = String(params.turn?.status || 'completed');
      active.send({ type: 'done', finishReason: status === 'completed' ? 'stop' : status });
      active.cleanup();
      activeTurns.delete(threadId);
      cancelPendingTools(threadId);
    }
  }

  if (appServer?.on) {
    appServer.on('serverRequest', handleServerRequest);
    appServer.on('notification', handleNotification);
    appServer.on('exit', error => {
      for (const [key, active] of activeTurns) {
        if (active.agentId !== 'codex') continue;
        active.send({ type: 'error', message: cleanError(error) });
        active.cleanup();
        activeTurns.delete(key);
        cancelPendingTools(key, 'Error: The Codex connection stopped before this tool completed.');
      }
    });
  }

  const statusPayload = () => ({
    ok: true,
    service: 'getbased-agent-host',
    agent: agents.has('codex') ? 'codex' : agents.keys().next().value || '',
    state: paused ? 'paused' : 'running',
    paused,
    protocolVersion: AGENT_HOST_PROTOCOL_VERSION,
    capabilities: AGENT_HOST_CAPABILITY_LIST,
    instanceId,
    startedAt,
    ...(options.runtimeInfo?.() || {}),
  });

  async function executeControl(request: Request, cors: Record<string, string> = {}) {
    let body;
    try { body = await readJson(request); } catch (error) {
      return jsonResponse({ error: cleanError(error) }, 400, cors);
    }
    const action = String(body.action || '');
    if (!['pause', 'resume', 'install', 'restart', 'restart-companion', 'update', 'uninstall'].includes(action)) {
      return jsonResponse({ error: 'unsupported_control_action' }, 400, cors);
    }
    if (['pause', 'install', 'restart', 'restart-companion', 'update', 'uninstall'].includes(action) && startingOrActiveTurns.size) {
      return jsonResponse({ error: 'finish_the_active_response_first' }, 409, cors);
    }
    if (action === 'pause' || action === 'resume') {
      paused = action === 'pause';
      return jsonResponse(statusPayload(), 200, cors);
    }
    if (!options.controlHandler) return jsonResponse({ error: 'companion_control_unavailable' }, 501, cors);
    try {
      const result = await options.controlHandler(
        (action as HostControlAction),
        { origin: request.headers.get('Origin') || '' },
      );
      return jsonResponse({ ...statusPayload(), ...result }, 200, cors);
    } catch (error) {
      return jsonResponse({ error: cleanError(error) }, 500, cors);
    }
  }
  const manage = createCompanionManagement({
    status: statusPayload, control: executeControl,
    allowParentOrigin: isAllowedCompanionManagementParent,
  });

  async function handleRequest(request: Request) {
    const managementResponse = await manage(request);
    if (managementResponse) return managementResponse;
    const cors = corsHeaders(request, allowedOrigins);
    const origin = request.headers.get('Origin');
    if (origin && !isAllowedAgentHostOrigin(origin, allowedOrigins)) return jsonResponse({ error: 'origin_not_allowed' }, 403);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    const url = new URL(request.url);
    if (url.pathname.startsWith('/internal/mcp/')) {
      if (origin) return jsonResponse({ error: 'origin_not_allowed' }, 403);
      const authorization = request.headers.get('Authorization') || '';
      const received = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
      const session = mcpSessions.get(received);
      if (!session) return jsonResponse({ error: 'unauthorized' }, 401);
      if (url.pathname === '/internal/mcp/tools' && request.method === 'GET') {
        return jsonResponse({ tools: session.tools.map(spec => ({
          name: spec.name, description: spec.description, inputSchema: spec.inputSchema,
        })) });
      }
      if (url.pathname === '/internal/mcp/call' && request.method === 'POST') {
        let body;
        try { body = await readJson(request); } catch (error) {
          return jsonResponse({ error: cleanError(error) }, 400);
        }
        const tool = String(body.name || '');
        const active = activeTurns.get(session.activeKey);
        if (!active || !session.tools.some(spec => spec.name === tool)) {
          return jsonResponse({ content: [{ type: 'text', text: 'Error: This getbased tool is not available.' }], isError: true });
        }
        const result = await new Promise(resolve => {
          const responseId = randomUUID();
          const timer = setTimeout(() => {
            pendingTools.delete(responseId);
            resolve({ success: false, contentItems: [{ type: 'inputText', text: 'Error: getbased tool response timed out.' }] });
          }, toolTimeoutMs);
          pendingTools.set(responseId, { threadId: session.activeKey, timer, respond: resolve });
          active.send({
            type: 'tool_call', responseId, callId: randomUUID(), tool,
            namespace: 'getbased', arguments: isRecord(body.arguments) ? body.arguments : {},
          });
        });
        const normalized = sanitizeToolResult(result);
        return jsonResponse({
          content: normalized.contentItems.map(item => ({ type: 'text', text: item.text })),
          isError: !normalized.success,
        });
      }
      return jsonResponse({ error: 'not_found' }, 404);
    }
    if (url.pathname === '/health' && request.method === 'GET') {
      return jsonResponse({ ok: true, service: 'getbased-agent-host' }, 200, cors);
    }
    if (url.pathname === '/v1/discovery' && request.method === 'GET') {
      if (!origin) return jsonResponse({ error: 'origin_required' }, 403, cors);
      const discovery = createDiscoverySession(origin);
      // Discovery has a short browser deadline. Gateway profile enumeration
      // belongs to /v1/targets, so an offline remote cannot hide local CLIs.
      const discoveredAgents = configuredAgents.map(agent => ({
        id: agent.id, name: agent.name, description: agent.description, version: agent.version || '',
        status: paused && agent.status === 'available' ? 'paused' : (agent.status || 'available'),
        compatible: agent.compatible !== false,
        protocolVersion: AGENT_HOST_PROTOCOL_VERSION,
        capabilities: AGENT_HOST_CAPABILITY_LIST,
        protocol: agent.protocol,
        ...(agent.message ? { message: agent.message } : {}),
      }));
      return jsonResponse({
        ...statusPayload(),
        controlAuthorized: false,
        endpoint: url.origin,
        token: discovery.token,
        tokenExpiresAt: discovery.expiresAt,
        agents: discoveredAgents,
      }, 200, cors);
    }
    const authorization = request.headers.get('Authorization') || '';
    const receivedToken = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
    if (!isAuthorized(receivedToken, origin)) return jsonResponse({ error: 'unauthorized' }, 401, cors);
    if (url.pathname === '/v1/control' && request.method === 'POST') {
      // Discovery authorizes chat only, never process or installation changes.
      if (!tokenMatches(receivedToken, token) || !isLoopbackOrigin(origin)) {
        return jsonResponse({ error: 'companion_control_requires_installation_token' }, 403, cors);
      }
      return executeControl(request, cors);
    }
    if (url.pathname === '/v1/uploads' && request.method === 'POST') {
      if (paused) return jsonResponse({ error: 'companion_paused' }, 503, cors);
      const mediaType = String(request.headers.get('Content-Type') || '').split(';')[0]!.trim().toLowerCase();
      const extension = IMAGE_EXTENSIONS[mediaType as keyof typeof IMAGE_EXTENSIONS];
      if (!extension) return jsonResponse({ error: 'unsupported_image_type' }, 415, cors);
      const declaredSize = Number(request.headers.get('Content-Length') || 0);
      if (Number.isFinite(declaredSize) && declaredSize > MAX_IMAGE_BYTES) return jsonResponse({ error: 'image_too_large' }, 413, cors);
      const bytes = new Uint8Array(await request.arrayBuffer());
      if (!bytes.byteLength || bytes.byteLength > MAX_IMAGE_BYTES) return jsonResponse({ error: 'image_too_large' }, 413, cors);
      if (!hasImageSignature(bytes, mediaType)) return jsonResponse({ error: 'invalid_image' }, 400, cors);
      const uploadId = randomUUID();
      const path = join(workspaceRoot, `image-${uploadId}.${extension}`);
      await writeFile(path, bytes, { mode: 0o600, flag: 'wx' });
      const timer = setTimeout(() => {
        const expired = pendingUploads.get(uploadId);
        if (!expired) return;
        pendingUploads.delete(uploadId);
        cleanupUploads([expired]);
      }, UPLOAD_TTL_MS);
      timer.unref?.();
      pendingUploads.set(uploadId, { path, mediaType, timer });
      return jsonResponse({ uploadId }, 201, cors);
    }
    if (url.pathname === '/v1/status' && request.method === 'GET') {
      return jsonResponse(statusPayload(), 200, cors);
    }
    if (url.pathname === '/v1/targets' && request.method === 'GET') {
      if (paused) return jsonResponse({ error: 'companion_paused' }, 503, cors);
      const agentId = String(url.searchParams.get('agent') || 'codex').slice(0, 40);
      const agent = agents.get(agentId);
      if (!agent || agent.compatible === false) return jsonResponse({ error: 'agent_unavailable' }, 404, cors);
      return jsonResponse({ targets: (await listExecutionTargets(agent)).map(publicRoute) }, 200, cors);
    }
    if (url.pathname === '/v1/models' && request.method === 'GET') {
      if (paused) return jsonResponse({ error: 'companion_paused' }, 503, cors);
      const agentId = String(url.searchParams.get('agent') || 'codex').slice(0, 40);
      const agent = agents.get(agentId);
      if (!agent || agent.compatible === false) return jsonResponse({ error: 'agent_unavailable' }, 404, cors);
      if (agent.status === 'login_required') return jsonResponse({ error: agent.message || 'agent_login_required' }, 401, cors);
      try {
        const targetId = String(url.searchParams.get('target') || 'local').trim().slice(0, 80);
        const routedAgent = await resolveExecutionTarget(agent, targetId);
        let catalog;
        const selectedModel = String(url.searchParams.get('model') || '').trim().slice(0, 160);
        const refresh = url.searchParams.get('refresh') === 'true';
        if (routedAgent.protocol === 'codex') {
          await routedAgent.client.initialize();
          const result = await routedAgent.client.request<{data?: unknown} | null>('model/list', { limit: 100, includeHidden: false });
          catalog = result?.data;
        } else catalog = await routedAgent.client.getModelCatalog({
          ...(selectedModel ? { model: selectedModel } : {}),
          ...(refresh ? { refresh: true } : {}),
        });
        return jsonResponse({ models: sanitizeModelCatalog(catalog) }, 200, cors);
      } catch (error) {
        return jsonResponse({ error: cleanError(error) }, 503, cors);
      }
    }

    const responseMatch = url.pathname.match(/^\/v1\/responses\/([0-9a-f-]+)$/i);
    if (responseMatch && request.method === 'POST') {
      const pending = pendingTools.get(responseMatch[1]!);
      if (!pending) return jsonResponse({ error: 'unknown_tool_response' }, 404, cors);
      let body;
      try { body = await readJson(request); } catch (error) {
        return jsonResponse({ error: cleanError(error) }, 400, cors);
      }
      pendingTools.delete(responseMatch[1]!);
      clearTimeout(pending.timer);
      pending.respond(sanitizeToolResult(body));
      return jsonResponse({ ok: true }, 200, cors);
    }

    if (url.pathname !== '/v1/turns' || request.method !== 'POST') {
      return jsonResponse({ error: 'not_found' }, 404, cors);
    }
    if (paused) return jsonResponse({ error: 'companion_paused' }, 503, cors);

    let body;
    try { body = await readJson(request); } catch (error) {
      return jsonResponse({ error: cleanError(error) }, 400, cors);
    }
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
    if (!prompt || prompt.length > AGENT_HOST_MAX_PROMPT_CHARS) return jsonResponse({ error: 'invalid_prompt' }, 400, cors);
    const model = typeof body.model === 'string' && body.model.trim() ? body.model.trim().slice(0, 160) : null;
    const effort = typeof body.effort === 'string' && body.effort.trim() ? body.effort.trim().slice(0, 40) : null;
    const requestedInstructions = typeof body.instructions === 'string'
      ? body.instructions.trim().slice(0, MAX_REQUESTED_INSTRUCTIONS_CHARS)
      : '';
    const requestedThreadHandle = typeof body.threadId === 'string' ? body.threadId.trim() : '';
    const requestedSession = requestedThreadHandle ? readThreadHandle(requestedThreadHandle, token, instanceId) : null;
    if (requestedThreadHandle && !requestedSession) {
      return jsonResponse({ error: 'invalid_thread_session' }, 400, cors);
    }
    const agentId = String(body.agent || requestedSession?.agent || 'codex').trim().slice(0, 40);
    const agent = agents.get(agentId);
    if (!agent || agent.compatible === false) return jsonResponse({ error: 'agent_unavailable' }, 404, cors);
    if (agent.status === 'login_required') return jsonResponse({ error: agent.message || 'agent_login_required' }, 401, cors);
    if (requestedSession && requestedSession.agent !== agentId) {
      return jsonResponse({ error: 'thread_agent_mismatch' }, 400, cors);
    }
    const targetId = String(body.target || requestedSession?.target || 'local').trim().slice(0, 80);
    if (!/^[a-z0-9-]{1,80}$/.test(targetId)) return jsonResponse({ error: 'invalid_execution_target' }, 400, cors);
    if (requestedSession && requestedSession.target !== targetId) {
      return jsonResponse({ error: 'thread_target_mismatch' }, 400, cors);
    }
    let routedAgent;
    try { routedAgent = await resolveExecutionTarget(agent, targetId); }
    catch (error) { return jsonResponse({ error: cleanError(error) }, 503, cors); }
    const requestedThreadId = requestedSession?.threadId || '';
    const requestedActiveKey = agentId === 'codex' && targetId === 'local'
      ? requestedThreadId : `${agentId}:${targetId}:${requestedThreadId}`;
    if (requestedThreadId && activeTurns.has(requestedActiveKey)) {
      return jsonResponse({ error: 'thread_turn_already_active' }, 409, cors);
    }
    const dynamicTools = sanitizeDynamicTools(body.tools);
    const purpose = body.purpose === 'feature' ? 'feature' : 'chat';
    if (purpose === 'chat' && dynamicTools.length === 0) return jsonResponse({ error: 'no_allowed_tools' }, 400, cors);
    if (purpose === 'feature' && routedAgent.target?.supportsFeatureJobs === false
      && !(routedAgent.target?.supportsTextFeatureJobs === true && !(body.imageUploadIds as { length?: unknown } | null | undefined)?.length && dynamicTools.length === 0)) {
      return jsonResponse({ error: 'This gateway supports text explanations only. Choose Local CLI for image imports or tool-enabled feature jobs.' }, 400, cors);
    }
    let outputSchema;
    try { outputSchema = sanitizeOutputSchema(body.outputSchema); } catch (error) {
      return jsonResponse({ error: cleanError(error) }, 400, cors);
    }
    const history = sanitizeHistory(body.history);
    const uploadIds = (Array.isArray(body.imageUploadIds)
      ? [...new Set(body.imageUploadIds.map(String))].slice(0, MAX_IMAGES_PER_TURN)
      : []) as string[];
    if (Array.isArray(body.imageUploadIds) && body.imageUploadIds.length > MAX_IMAGES_PER_TURN) {
      return jsonResponse({ error: 'too_many_images' }, 400, cors);
    }
    if (uploadIds.some(id => !/^[0-9a-f-]{36}$/i.test(id) || !pendingUploads.has(id))) {
      return jsonResponse({ error: 'invalid_image_upload' }, 400, cors);
    }
    // Reserve the conversation before any adapter initialization awaits. A
    // second tab or a restart click must not race session setup.
    const reservationKey = requestedThreadId ? requestedActiveKey : randomUUID();
    if (startingOrActiveTurns.has(reservationKey)) {
      return jsonResponse({ error: 'thread_turn_already_active' }, 409, cors);
    }
    startingOrActiveTurns.add(reservationKey);
    const turnUploads = uploadIds.map(id => pendingUploads.get(id)).filter(Boolean) as HostUpload[];
    for (const id of uploadIds) pendingUploads.delete(id);
    let cleanedUp = false;
    const cleanupTurnUploads = () => {
      if (cleanedUp) return;
      cleanedUp = true;
      startingOrActiveTurns.delete(reservationKey);
      request.signal.removeEventListener('abort', handleStreamCancel);
      cleanupUploads(turnUploads);
    };

    const encoder = new TextEncoder();
    let streamController: ReadableStreamDefaultController<Uint8Array>;
    let closed = false;
    let handleStreamCancel = () => {};
    const stream = new ReadableStream<Uint8Array>({
      start(controller) { streamController = controller; },
      cancel() { closed = true; handleStreamCancel(); },
    });
    let threadIdForAbort = '';
    let turnIdForAbort = '';
    const send = (event: unknown) => {
      if (closed) return;
      try { streamController.enqueue(encoder.encode(`${JSON.stringify(event)}\n`)); } catch { closed = true; }
      if (isRecord(event) && (event.type === 'done' || event.type === 'error')) close();
    };
    const close = () => {
      if (closed) return;
      closed = true;
      try { streamController.close(); } catch { /* stream already closed */ }
    };

    if (routedAgent.protocol !== 'codex') {
      const abort = startExternalAgentTurn({
        agent: routedAgent, agentId, targetId, requestedThreadId, requestedActiveKey, dynamicTools,
        sessionMcp, mcpSessions, maxMcpSessions: MAX_MCP_SESSIONS,
        activeTurns, pendingTools, turnUploads, cleanup: cleanupTurnUploads,
        origin: url.origin, bridgePath: options.bundlePath || process.argv[1],
        baseInstructions: routedAgent.target?.kind === 'gateway' ? PERSONAL_AGENT_BASE_INSTRUCTIONS : AGENT_BASE_INSTRUCTIONS,
        requestedInstructions, history, outputSchema, prompt, model, effort, send, close, cleanError,
        createHandle: sessionId => createThreadHandle(sessionId, token, agentId, instanceId, targetId),
      });
      handleStreamCancel = abort;
      if (request.signal.aborted) abort();
      else request.signal.addEventListener('abort', abort, { once: true });
      return new Response(stream, {
        status: 200,
        headers: { ...cors, 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store' },
      });
    }

    const abort = () => {
      if (threadIdForAbort) {
        activeTurns.delete(threadIdForAbort);
        cancelPendingTools(threadIdForAbort, 'Error: The Codex turn was cancelled.');
        void appServer!.request('turn/interrupt', { threadId: threadIdForAbort, turnId: turnIdForAbort }).catch(() => {});
      }
      cleanupTurnUploads();
      close();
    };
    handleStreamCancel = abort;

    void (async () => {
      let threadId = '';
      const threadPolicy = () => ({
        model, cwd: workspaceRoot, sandbox: 'read-only', approvalPolicy: 'never',
        approvalsReviewer: 'user', runtimeWorkspaceRoots: [],
      });
      try {
        await appServer!.initialize();
        if (closed) return;
        let threadResult;
        let resumed = false;
        if (requestedThreadId) {
          try {
            threadResult = await appServer!.request<CodexThreadResult | null>('thread/resume', {
              threadId: requestedThreadId,
              ...threadPolicy(),
              baseInstructions: AGENT_BASE_INSTRUCTIONS,
              developerInstructions: requestedInstructions || null,
            });
            resumed = true;
          } catch {
            threadResult = null;
          }
        }
        if (!threadResult) {
          threadResult = await appServer!.request<CodexThreadResult | null>('thread/start', {
            ...threadPolicy(),
            environments: [],
            dynamicTools,
            baseInstructions: AGENT_BASE_INSTRUCTIONS,
            developerInstructions: requestedInstructions || null,
            selectedCapabilityRoots: [],
            serviceName: 'getbased-agent-chat',
          });
        }
        if (closed) return;
        threadId = String(threadResult?.thread?.id || '');
        if (!threadId) throw new Error('Codex did not return a thread ID.');
        if (!resumed && history.length) {
          await appServer!.request('thread/inject_items', {
            threadId,
            items: history.map(item => ({
              type: 'message',
              role: item.role,
              content: [{ type: item.role === 'assistant' ? 'output_text' : 'input_text', text: item.content }],
            })),
          });
        }
        if (closed) return;
        const turnResult = await appServer!.request<CodexTurnResult | null>('turn/start', {
          threadId,
          input: [
            ...turnUploads.map(upload => ({ type: 'localImage', path: upload.path })),
            { type: 'text', text: prompt },
          ],
          environments: [],
          model,
          effort,
          ...(outputSchema ? { outputSchema } : {}),
          approvalPolicy: 'never',
          approvalsReviewer: 'user',
        });
        const turnId = String(turnResult?.turn?.id || '');
        if (!turnId) throw new Error('Codex did not return a turn ID.');
        if (closed) {
          await appServer!.request('turn/interrupt', { threadId, turnId }).catch(() => {});
          return;
        }
        threadIdForAbort = threadId;
        turnIdForAbort = turnId;
        activeTurns.set(threadId, { agentId: 'codex', threadId, turnId, send, cleanup: cleanupTurnUploads });
        send({
          type: 'session',
          threadId: createThreadHandle(threadId, token),
          turnId,
          model: String(threadResult?.model || model || 'Codex'),
          resumed,
        });
      } catch (error) {
        send({ type: 'error', message: cleanError(error) });
        if (threadId) {
          activeTurns.delete(threadId);
          cancelPendingTools(threadId);
        }
        cleanupTurnUploads();
        close();
      }
    })();

    if (request.signal.aborted) abort();
    else request.signal.addEventListener('abort', abort, { once: true });
    return new Response(stream, {
      status: 200,
      headers: { ...cors, 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }

  return { handleRequest };
}
