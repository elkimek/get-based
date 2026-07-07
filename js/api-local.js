// @ts-check
// api-local.js - Ollama/LM Studio/Jan provider adapters.

import { readWithStallTimeout } from './api-transport.js';
import { getOllamaMainModel } from './api-provider-storage.js';
import { getOllamaConfigRuntime } from './api-runtime.js';
import { callOpenAICompatibleAPI } from './api-openai-compatible.js';

export async function callOllamaChat({ system, messages, maxTokens, onStream, signal }) {
  const config = getOllamaConfigRuntime();
  const model = getOllamaMainModel();
  const ollamaMessages = [];
  if (system) ollamaMessages.push({ role: 'system', content: system });
  for (const msg of messages) {
    if (Array.isArray(msg.content)) {
      let text = '';
      const images = [];
      for (const block of msg.content) {
        if (block.type === 'text') text = block.text;
        else if (block.type === 'image' && block.source?.data) images.push(block.source.data);
        else if (block.type === 'image_url' && block.image_url?.url) {
          const match = block.image_url.url.match(/^data:[^;]+;base64,(.+)$/);
          if (match) images.push(match[1]);
        }
      }
      const ollamaMsg = { role: msg.role, content: text };
      if (images.length > 0) ollamaMsg.images = images;
      ollamaMessages.push(ollamaMsg);
    } else {
      ollamaMessages.push({ role: msg.role, content: msg.content });
    }
  }

  const body = { model, messages: ollamaMessages, stream: !!onStream };
  if (maxTokens) body.options = { num_predict: maxTokens };

  let res;
  try {
    res = await fetch(`${config.url}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal
    });
  } catch (e) {
    if (e instanceof TypeError || /Failed to fetch|Load failed|NetworkError/.test(e.message || '')) {
      const ua = navigator.userAgent || '';
      const hint = /Mac/i.test(ua) ? 'Ollama: launchctl setenv OLLAMA_ORIGINS "*" and restart. LM Studio: Settings -> Enable CORS'
        : /Win/i.test(ua) ? 'Ollama: set OLLAMA_ORIGINS=* as system env var and restart. LM Studio: Settings -> Enable CORS'
        : 'Ollama: OLLAMA_ORIGINS=* ollama serve. LM Studio: Settings -> Enable CORS';
      throw new Error(`Cannot reach local server - CORS blocked. ${hint}`);
    }
    throw new Error(`Cannot reach local server. Check that it's running. (${e.message})`);
  }

  if (!res.ok) {
    let errMsg = `Local server error (${res.status})`;
    try { const errBody = await res.json(); errMsg += `: ${errBody.error || JSON.stringify(errBody)}`; } catch {}
    throw new Error(errMsg);
  }

  if (onStream) {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullText = '';
    let inputTokens = 0;
    let outputTokens = 0;
    const handleNdjsonLine = (line, boundary) => {
      if (!line.trim()) return;
      try {
        const event = JSON.parse(line);
        if (event.error) throw new Error(event.error);
        if (event.message?.content) {
          fullText += event.message.content;
          onStream(fullText);
        }
        if (event.done === true) {
          inputTokens = event.prompt_eval_count || 0;
          outputTokens = event.eval_count || 0;
        }
      } catch (parseErr) {
        if (boundary && parseErr instanceof SyntaxError) return;
        throw parseErr;
      }
    };
    while (true) {
      const { done, value } = await readWithStallTimeout(reader, 'Local AI stream');
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) handleNdjsonLine(line, true);
    }
    if (buffer.trim()) handleNdjsonLine(buffer, false);
    return { text: fullText, usage: { inputTokens, outputTokens } };
  }

  const data = await res.json();
  return {
    text: data.message?.content || '',
    usage: { inputTokens: data.prompt_eval_count || 0, outputTokens: data.eval_count || 0 }
  };
}

export async function callOpenAICompatibleLocalAPI(opts) {
  const config = getOllamaConfigRuntime();
  const model = getOllamaMainModel();
  const url = config.url.replace(/\/+$/, '');
  const key = config.apiKey || 'not-needed';
  return callOpenAICompatibleAPI(`${url}/v1/chat/completions`, key, model, 'Local AI', opts, {}, { useProxy: false });
}
