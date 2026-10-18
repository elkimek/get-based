// Shared persisted Biology context review contract; no provider or view lifecycle.
interface ContextSuggestion { flag: string; value?: boolean; confidence: string; reason?: string; evidence?: string[]; affects?: string[] }
export interface BiologyContextReview {
  summary?: string; suggestions?: ContextSuggestion[]; profileId?: string; updatedAt?: number; range?: string;
  fingerprint?: string; fingerprintsByRange?: Record<string, string>; contextSignature?: string;
  contextSignaturesByRange?: Record<string, string>; unlockedRanges?: string[]; dismissed?: string[];
  generation?: { provider: string; modelId: string; generatedAt: number; usage?: unknown };
}

// This ordered range contract is also consumed by Sync merge.
export const CONTEXT_REVIEW_RANGES = ['all', '1y', '6m', '3m'];
