import type { callCodexFeature } from './agent-feature-inference.js';
import { callAssistantFeatureAI } from './ai-feature-routing.js';
import { waitForAbort } from './api-transport.js';

export const REPORT_VENICE_GENERATION_TIMEOUT_MS = 120000;
type ReportAIResult = Partial<Pick<Awaited<ReturnType<typeof callCodexFeature>>, 'text' | 'usage'>> | null | undefined;

/** The caller completes consent first; this owner bounds only inference work. */
export async function requestReportAIOverview(provider: string, system: string, prompt: string, signal?: AbortSignal): Promise<ReportAIResult> {
  const venice = provider === 'venice', controller = new AbortController();
  const cancel = () => controller.abort(signal?.reason ?? new DOMException('Report generation cancelled.', 'AbortError'));
  if (signal?.aborted) throw signal.reason;
  signal?.addEventListener('abort', cancel, {once: true});
  const timer = venice ? setTimeout(() => controller.abort(new DOMException(
    'Venice report generation timed out after 120 seconds. Try again or preview without the AI overview.',
    'TimeoutError')), REPORT_VENICE_GENERATION_TIMEOUT_MS) : null;
  try {
    // Venice E2EE collects its verified stream into one final result. Other
    // providers retain the report's existing non-streaming request contract.
    return await waitForAbort(callAssistantFeatureAI({
      system,
      messages: [{role: 'user', content: prompt}],
      maxTokens: 900,
      consentKind: 'report',
      forceNonStream: !venice,
      signal: controller.signal,
      ...(venice ? {requestRetries: 0, requestTimeoutMs: REPORT_VENICE_GENERATION_TIMEOUT_MS} : {}),
    }), controller.signal) as ReportAIResult;
  } finally {
    if (timer !== null) clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
  }
}
