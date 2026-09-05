// @ts-check
// Turn normalization shared by ACP harnesses and Claude Agent.

import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';

/** @param {any} event @param {(event: any) => void} send */
function relayACPUpdate(event, send) {
  const update = event?.params?.update || {};
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

/**
 * Starts an external adapter turn and returns a cancellation callback.
 * @param {any} options
 */
export function startExternalAgentTurn(options) {
  const abortController = new AbortController();
  let activeKey = options.requestedActiveKey;
  let temporaryKey = '';
  let mcpContext = null;
  let reusableACPSession = false;
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
    for (const [responseId, pending] of options.pendingTools) {
      if (pending.threadId !== activeKey) continue;
      clearTimeout(pending.timer);
      options.pendingTools.delete(responseId);
      try { pending.respond(cancelledToolResult); } catch { /* adapter already closed */ }
    }
  };
  const throwIfAborted = () => {
    if (!abortController.signal.aborted) return;
    const error = new Error('Agent turn cancelled.');
    error.name = 'AbortError';
    throw error;
  };
  void (async () => {
    let sessionId = options.requestedThreadId;
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
          const session = { activeKey: temporaryKey, tools: options.dynamicTools };
          mcpContext = { token: mcpToken, session };
          options.mcpSessions.set(mcpToken, session);
          options.sessionMcp.set(temporaryKey, mcpContext);
        }
      }
      throwIfAborted();
      if (mcpContext) mcpContext.session.tools = options.dynamicTools;
      const mcpEnvironment = mcpContext
        ? { GETBASED_MCP_ENDPOINT: options.origin, GETBASED_MCP_TOKEN: mcpContext.token } : null;
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
      let textPrompt = `${includeInstructionsInPrompt ? `${instructionText}${historyText}\n\nUser request:\n` : ''}${options.prompt}${schemaText}`;
      const images = await Promise.all(options.turnUploads.map(async upload => ({
        mediaType: upload.mediaType, data: (await readFile(upload.path)).toString('base64'),
      })));
      throwIfAborted();

      if (options.agent.protocol === 'acp') {
        const session = await options.agent.client.ensureSession({ requestedSessionId: sessionId, mcpServers: acpMcpServers });
        throwIfAborted();
        sessionId = session.sessionId;
        if (resumed && sessionId !== options.requestedThreadId) {
          resumed = false;
          const recoveredHistory = options.history.length
            ? `\n\nEarlier visible conversation:\n${options.history.map(item => `${item.role}: ${item.content}`).join('\n\n')}` : '';
          textPrompt = `${instructionText}${recoveredHistory}\n\nUser request:\n${options.prompt}${schemaText}`;
        }
        activeKey = `${options.agentId}:${options.targetId || 'local'}:${sessionId}`;
        if (mcpContext && temporaryKey !== activeKey) {
          options.sessionMcp.delete(temporaryKey);
          options.sessionMcp.set(activeKey, mcpContext);
        }
        if (mcpContext) mcpContext.session.activeKey = activeKey;
        await options.agent.client.configureSession(
          sessionId,
          session.configOptions,
          options.model || '',
          options.effort || '',
          session.modelState,
        );
        throwIfAborted();
        options.activeTurns.set(activeKey, { agentId: options.agentId, threadId: sessionId, turnId: activeKey, send: options.send, cleanup: options.cleanup });
        options.send({ type: 'session', threadId: options.createHandle(sessionId), turnId: activeKey, model: options.model || options.agent.name, resumed });
        reusableACPSession = true;
        const result = await options.agent.client.prompt({
          sessionId, signal: abortController.signal,
          allowedToolNames: options.dynamicTools.map(spec => spec.name),
          prompt: [{ type: 'text', text: textPrompt }, ...images.map(image => ({ type: 'image', data: image.data, mimeType: image.mediaType }))],
          onNotification: event => relayACPUpdate(event, options.send),
        });
        options.send({ type: 'done', finishReason: String(result?.stopReason || 'stop') });
      } else {
        throwIfAborted();
        sessionId ||= randomUUID();
        activeKey = `${options.agentId}:${options.targetId || 'local'}:${sessionId}`;
        if (mcpContext && temporaryKey !== activeKey) {
          options.sessionMcp.delete(temporaryKey);
          options.sessionMcp.set(activeKey, mcpContext);
        }
        if (mcpContext) mcpContext.session.activeKey = activeKey;
        options.activeTurns.set(activeKey, { agentId: options.agentId, threadId: sessionId, turnId: activeKey, send: options.send, cleanup: options.cleanup });
        let sentSession = false;
        let sentDone = false;
        await options.agent.client.prompt({
          sessionId: options.requestedThreadId || undefined, model: options.model || undefined, effort: options.effort || undefined,
          instructions: instructionText, outputSchema: options.outputSchema, mcpConfig: claudeMcpConfig,
          allowedToolNames: options.dynamicTools.map(spec => spec.name), signal: abortController.signal,
          prompt: [{ type: 'text', text: `${historyText}${options.prompt}` }, ...images.map(image => ({ type: 'image', source: { type: 'base64', media_type: image.mediaType, data: image.data } }))],
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
      options.send({ type: 'error', message: options.cleanError(error) });
    } finally {
      releaseTurn();
      if (mcpContext && (options.agent.protocol !== 'acp' || !reusableACPSession)) {
        options.mcpSessions.delete(mcpContext.token);
        if (temporaryKey) options.sessionMcp.delete(temporaryKey);
        if (activeKey && activeKey !== temporaryKey) options.sessionMcp.delete(activeKey);
      }
      options.cleanup();
      options.close();
    }
  })();
  return () => {
    abortController.abort();
    releaseTurn();
    options.cleanup();
    options.close();
  };
}
