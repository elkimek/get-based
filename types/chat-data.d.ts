/** Persisted conversation data; extension values require narrowing. */
interface ChatMessageMetadata {
  usage?: { inputTokens: number; outputTokens: number };
  context?: Array<{ label: string; detail?: string }>;
  personality?: string;
  lensSources?: Array<{ source: string; text: string; score?: number }>;
  agentDrafts?: Array<{ id: string; profileId: string; kind: string; status: string; summary?: string; payload: Record<string, unknown>; appliedAt?: string }>;

  personalityName?: string;
  personalityIcon?: string;
  provider?: string;
  agentId?: string;
  modelId?: string;
  modelDisplay?: string;
  thumbnails?: string[];
  imageCount?: number;
  hasImages?: boolean;
  auto?: boolean;
  discussion?: boolean;
  discussionError?: boolean;
  hidden?: boolean;

  stopped?: boolean;
  joinIcon?: string;
  joinName?: string;
  discussionPersonaId?: string;
  recSlots?: string[];
  recMeta?: Record<string, unknown>;
  [key: string]: unknown;
}

export type ChatMessage = ChatMessageMetadata & (
  { role: string; content: string; joined?: false }
  | { joined: true; role?: string; content?: string }
);

export interface DiscussionPersona { id: string; name: string; icon?: string; }

export interface ChatThread {
  summary?: string;
  summaryDate?: string;
  summaryModel?: string;
  summaryCost?: { provider: string; modelId: string; modelDisplay?: string; inputTokens: number; outputTokens: number };
  discussionPersonas?: DiscussionPersona[];
  discussionPendingPersonas?: DiscussionPersona[];
  discussionOriginalPersonality?: string;
  discussionEnded?: boolean;
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  personality?: string;
  personalityName?: string;
  personalityIcon?: string;
  projectName?: string;
  chatBackend?: string;
  agentThreadId?: string;
  agentModel?: string;
  forkedFromThreadId?: string;
  forkedFromMessageIndex?: number;
  [key: string]: unknown;
}
