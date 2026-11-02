// Turn normalization shared by ACP harnesses and Claude Agent.

import type { ExternalAgentTurnOptions, McpContext, McpSession, ACPUpdateEnvelope } from './agent-host-turn-state.js';
import { cancelPendingHostTools } from './agent-host-turn-state.js';
import { formatAgentApplicationContext } from './agent-host-boundary.js';

import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';

function relayACPUpdate(event: unknown, send: (event: unknown) => void) {
  const update = (event as ACPUpdateEnvelope | null | undefined)?.params?.update || {};
  const kind = String(update.sessionUpdate || update.type || '');
  const content = update.content || update.message?.content;
  if (kind === 'agent_message_chunk' && content?.type === 'text' && typeof content.text === 'string') {
    send({ type: 'text_delta', delta: content.text });
  } else if (kind.includes('tool_call')) {
    send({ type: 'activity', activity: 'tool', status: kind.includes('update') ? 'updated' : 'started', query: String(update.title || '').slice(0, 500) });
  } else if (kind === 'usage_update' || update.usage) {
    const usage = update.usage || update;
    send({ type: 'usage', inputTokens: Number(usage.inputTokens || usage.input_tokens || 0), outputTokens: Number(usage.outputTokens || usage.output_tokens || 0) });
  }
}

export function startExternalAgentTurn(options: ExternalAgentTurnOptions) {
  const abortController = new AbortController();
  let activeKey = options.requestedActiveKey;
  let temporaryKey = '';
  let mcpContext: McpContext | null | undefined = null;
  let reusableACPSession = false;
  let promptStarted = false;
  let closeTurnClient: (() => Promise<void>) | undefined;
  const closeDedicatedClient = () => { void closeTurnClient?.(); };
  const localToolsEnabled = options.agent.target?.supportsLocalTools !== false;
  const cancelledToolResult = {
    success: false,
    contentItems: [{ type: 'inputText', text: 'Error: The agent turn was cancelled.' }],
  };
  let released = false;
  const releaseTurn = () => {
    if (released) return;
    released = true;
    if (activeKey) options.activeTurns.delete(activeKey);
    cancelPendingHostTools(() => options.pendingTools, () => activeKey, () => cancelledToolResult);
  };
  const throwIfAborted = () => {
    if (!abortController.signal.aborted) return;
    const error = new Error('Agent turn cancelled.');
    error.name = 'AbortError';
    throw error;
  };
  void (async () => {
    let sessionId = options.requestedThreadId;
    const bindSession = () => {
      activeKey = `${options.agentId}:${options.targetId || 'local'}:${sessionId}`;
      if (mcpContext && temporaryKey !== activeKey) {
        options.sessionMcp.delete(temporaryKey);
        options.sessionMcp.set(activeKey, mcpContext);
      }
      if (mcpContext) mcpContext.session.activeKey = activeKey;
    };
    try {
      temporaryKey = `${options.agentId}:${options.targetId || 'local'}:${sessionId || randomUUID()}`;
      if (localToolsEnabled) {
        mcpContext = options.sessionMcp.get(temporaryKey);
        if (!mcpContext) {
          while (options.sessionMcp.size >= options.maxMcpSessions) {
            const oldestKey = options.sessionMcp.keys().next().value;
            if (!oldestKey) break;
            const oldest = options.sessionMcp.get(oldestKey);
            options.sessionMcp.delete(oldestKey);
            if (oldest) options.mcpSessions.delete(oldest.token);
          }
          const mcpToken = `${randomUUID()}${randomUUID()}`;
          let markCatalogDelivered!: () => void;
          const catalogDelivered = new Promise<void>(resolve => { markCatalogDelivered = resolve; });
          const session: McpSession = { activeKey: temporaryKey, tools: options.dynamicTools, catalogDelivered, markCatalogDelivered };
          mcpContext = { token: mcpToken, session };
          options.mcpSessions.set(mcpToken, session);
          options.sessionMcp.set(temporaryKey, mcpContext);
        }
      }
      throwIfAborted();
      if (mcpContext) mcpContext.session.tools = options.dynamicTools;
      const mcpEnvironment = mcpContext
        ? { GETBASED_MCP_ENDPOINT: options.origin, GETBASED_MCP_TOKEN: mcpContext.token,
          ...(options.agent.protocol === 'acp' && options.agent.createTurnClient ? { GETBASED_MCP_NOTIFY_READY: '1' } : {}) } : null;
      const acpMcpServers = mcpEnvironment ? [{
        name: 'getbased', command: process.execPath, args: [options.bridgePath, 'mcp-bridge'],
        env: Object.entries(mcpEnvironment).map(([name, value]) => ({ name, value })),
      }] : [];
      const claudeMcpConfig = { mcpServers: mcpEnvironment ? { getbased: {
        type: 'stdio', command: process.execPath, args: [options.bridgePath, 'mcp-bridge'], env: mcpEnvironment,
      } } : {} };
      let resumed = Boolean(options.requestedThreadId);
      const instructionText = `${options.baseInstructions}${options.requestedInstructions ? `\n\n${options.requestedInstructions}` : ''}`;
      // OpenClaw's safe headless entry point is intentionally one-shot. Keep
      // the browser-owned conversation continuous by replaying visible history.
      const includeHistory = !resumed
        || (options.agent.protocol === 'openclaw' && options.agent.target?.kind !== 'gateway');
      const historyText = includeHistory && options.history.length
        ? `\n\nEarlier visible conversation:\n${options.history.map(item => `${item.role}: ${item.content}`).join('\n\n')}` : '';
      const schemaText = options.outputSchema && options.agent.protocol === 'acp'
        ? `\n\nReturn only JSON matching this schema: ${JSON.stringify(options.outputSchema)}` : '';
      // ACP has no separate per-turn system-instruction channel. Repeat the
      // current bounded snapshot on resumed turns so changed getbased data and
      // context toggles take effect immediately, just as they do for API routes.
      const includeInstructionsInPrompt = options.agent.protocol === 'acp' || !resumed;
      const turnRequest = `${formatAgentApplicationContext(options.applicationContext || '')}${options.applicationContext ? 'User request:\n' : ''}${options.prompt}`;
      let textPrompt = `${includeInstructionsInPrompt ? `${instructionText}${historyText}\n\nUser request:\n` : ''}${turnRequest}${schemaText}`;
      const images = await Promise.all(options.turnUploads.map(async upload => ({
        mediaType: upload.mediaType, data: (await readFile(upload.path)).toString('base64'),
      })));
      throwIfAborted();

      if (options.agent.protocol === 'acp') {
        const dedicated = options.agent.createTurnClient?.(acpMcpServers);
        const client = dedicated?.client || options.agent.client;
        if (dedicated) {
          closeTurnClient = dedicated.close;
          abortController.signal.addEventListener('abort', closeDedicatedClient, { once: true });
        }
        let session = await client.ensureSession({
          requestedSessionId: dedicated ? '' : sessionId,
          mcpServers: dedicated ? [] : acpMcpServers,
        });
        throwIfAborted();
        if (dedicated && mcpContext?.session.catalogDelivered) {
          // OpenCode can return session/new before its MCP catalog arrives.
          // Do not send the user's first prompt with an empty editing tool set.
          let timer: ReturnType<typeof setTimeout> | undefined;
          let fail = () => {};
          await new Promise<void>((resolve, reject) => {
            fail = () => reject(new Error('Agent turn cancelled.'));
            timer = setTimeout(() => reject(new Error('The agent did not finish loading getbased editing tools. Check the Companion connection and retry.')), 30_000);
            abortController.signal.addEventListener('abort', fail, { once: true });
            void mcpContext!.session.catalogDelivered!.then(resolve);
          }).finally(() => {
            clearTimeout(timer);
            abortController.signal.removeEventListener('abort', fail);
          });
          throwIfAborted();
          if (dedicated.afterCatalog) session = await dedicated.afterCatalog(session);
          throwIfAborted();
        }
        sessionId = session.sessionId;
        if (resumed && sessionId !== options.requestedThreadId) {
          resumed = false;
          const recoveredHistory = options.history.length
            ? `\n\nEarlier visible conversation:\n${options.history.map(item => `${item.role}: ${item.content}`).join('\n\n')}` : '';
          textPrompt = `${instructionText}${recoveredHistory}\n\nUser request:\n${turnRequest}${schemaText}`;
        }
        bindSession();
        await client.configureSession(
          sessionId,
          session.configOptions,
          options.model || '',
          options.effort || '',
          session.modelState,
        );
        throwIfAborted();
        options.activeTurns.set(activeKey, { agentId: options.agentId, threadId: sessionId, turnId: activeKey, send: options.send, cleanup: options.cleanup });
        options.send({ type: 'session', threadId: options.createHandle(sessionId), turnId: activeKey, model: options.model || options.agent.name, resumed });
        reusableACPSession = !dedicated;
        promptStarted = true;
        const result = await client.prompt({
          sessionId, signal: abortController.signal,
          allowedToolNames: options.dynamicTools.map(spec => spec.name),
          prompt: [{ type: 'text', text: textPrompt }, ...images.map(image => ({ type: 'image', data: image.data, mimeType: image.mediaType }))],
          onNotification: event => relayACPUpdate(event, options.send),
        });
        options.send({ type: 'done', finishReason: String((result as { stopReason?: unknown } | null | undefined)?.stopReason || 'stop') });
      } else {
        throwIfAborted();
        sessionId ||= randomUUID();
        bindSession();
        options.activeTurns.set(activeKey, { agentId: options.agentId, threadId: sessionId, turnId: activeKey, send: options.send, cleanup: options.cleanup });
        let sentSession = false;
        let sentDone = false;
        promptStarted = true;
        await options.agent.client.prompt({
          sessionId: options.requestedThreadId || undefined, model: options.model || undefined, effort: options.effort || undefined,
          instructions: instructionText, outputSchema: options.outputSchema, mcpConfig: claudeMcpConfig,
          allowedToolNames: options.dynamicTools.map(spec => spec.name), signal: abortController.signal,
          prompt: [{ type: 'text', text: `${historyText}${turnRequest}` }, ...images.map(image => ({ type: 'image', source: { type: 'base64', media_type: image.mediaType, data: image.data } }))],
          onEvent(event) {
            if (event.type === 'session') {
              sentSession = true;
              options.send({ type: 'session', threadId: options.createHandle(event.sessionId || sessionId), turnId: activeKey, model: event.model || options.model || options.agent.name, resumed });
            } else if (event.type === 'text_delta' || event.type === 'usage') options.send(event);
            else if (event.type === 'error') { sentDone = true; options.send({ type: 'error', message: event.message }); }
            else if (event.type === 'done') {
              sentDone = true;
              if (event.usage) options.send({ type: 'usage', inputTokens: Number(event.usage.input_tokens || 0), outputTokens: Number(event.usage.output_tokens || 0) });
              options.send({ type: 'done', finishReason: event.finishReason || 'stop' });
            }
          },
        });
        if (!sentSession) options.send({ type: 'session', threadId: options.createHandle(sessionId), turnId: activeKey, model: options.model || options.agent.name, resumed });
        if (!sentDone) options.send({ type: 'done', finishReason: 'stop' });
      }
    } catch (error) {
      options.send({ type: 'error', message: promptStarted && !abortController.signal.aborted
        ? 'The selected agent could not complete this response. Try another model or check the agent’s provider connection.'
        : options.cleanError(error) });
    } finally {
      abortController.signal.removeEventListener('abort', closeDedicatedClient);
      releaseTurn();
      if (mcpContext && (options.agent.protocol !== 'acp' || !reusableACPSession)) {
        options.mcpSessions.delete(mcpContext.token);
        if (temporaryKey) options.sessionMcp.delete(temporaryKey);
        if (activeKey && activeKey !== temporaryKey) options.sessionMcp.delete(activeKey);
      }
      options.cleanup();
      options.close();
      await closeTurnClient?.();
    }
  })();
  return () => {
    abortController.abort();
    releaseTurn();
    options.cleanup();
    options.close();
  };
}
