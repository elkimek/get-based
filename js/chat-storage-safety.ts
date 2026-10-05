import type { ChatThread } from '../types/chat-data.js';

export interface StoredCustomPersonality {
  id: string;
  name: string;
  icon: string;
  promptText: string;
  evidenceBased: boolean;
  createdAt?: string;
  updatedAt?: string;
  personaAgreement?: NonNullable<ReturnType<typeof normalizePersonaAgreement>>;
}
interface StoredAgentDraft {
  id: string;
  profileId: string;
  kind: 'note' | 'meal' | 'biometric' | 'supplement';
  payload: NonNullable<ReturnType<typeof normalizeAgentDraftPayload>>;
  status: 'pending' | 'applied' | 'discarded' | 'failed';
  summary: string;
  appliedAt?: string;
}

/** Metadata extensions survive import; only the fields below are normalized. */
export interface StoredChatMessage extends Record<string, unknown> {
  content: string;
  joined?: true;
  joinIcon: string;
  joinName: string;
  personalityIcon: string;
  personalityName: string;
  modelDisplay: string;
  modelId: string;
  provider: string;
  agentId: string;
  imageCount: number;
  thumbnails?: string[];
  hasImages?: boolean;
  usage?: { inputTokens: number; outputTokens: number };
  lensSources?: Array<{ source: string; text: string; score?: number }>;
  agentDrafts?: ReturnType<typeof normalizeAgentDrafts>;
  discussionPersonaId?: string;
  recSlots?: string[];
  recOpen?: boolean;
  recNew?: boolean;
}

// chat-storage-safety.ts — validation for persisted and imported chat records.

// This is a hostile/corrupt-import guard, not a product retention policy.
// Chat must never silently discard a legitimate user's older conversations.
const MAX_THREADS = 5000;
const MAX_MESSAGES_PER_THREAD = 5000;
const MAX_CUSTOM_PERSONALITIES = 50;
const MAX_THUMBNAILS_PER_MESSAGE = 10;
const MAX_THUMBNAIL_LENGTH = 750_000;
const INVALID_RECORD_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const CHAT_ID_RE = /^[A-Za-z0-9_.:-]+$/;
const THUMBNAIL_RE = /^data:image\/(?:png|jpeg|gif|webp);base64,[A-Za-z0-9+/]+={0,2}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function boundedString(value: unknown, maxLength: number, fallback = '') {
  return typeof value === 'string' ? value.slice(0, maxLength) : fallback;
}

function normalizeDisplayIcon(value: unknown) {
  return boundedString(value, 128).replace(/[<>&"'`]/g, '');
}

function safeCount(value: unknown, maximum = Number.MAX_SAFE_INTEGER) {
  const count = Number(value);
  if (!Number.isFinite(count) || count < 0) return 0;
  return Math.min(Math.trunc(count), maximum);
}

function normalizeTimestamp(value: unknown, fallback: string) {
  if (typeof value !== 'string' || value.length > 64) return fallback;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : fallback;
}

function normalizeCalendarDate(value: unknown) {
  const text = boundedString(value, 10).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return '';
  const parsed = new Date(`${text}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === text ? text : '';
}

export function normalizeAgentThreadHandle(value: unknown) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 400) return null;
  // Older Codex threads stored the upstream opaque ID directly. Preserve those
  // bounded IDs while also accepting the longer signed handles issued by the
  // companion's multi-adapter protocol.
  const isLegacyHandle = value.length <= 128 && CHAT_ID_RE.test(value);
  const isSignedHandle = /^v\d+\.[A-Za-z0-9_.:-]+$/.test(value);
  if ((!isLegacyHandle && !isSignedHandle) || INVALID_RECORD_KEYS.has(value)) return null;
  return value;
}

export function normalizeChatRecordId(value: unknown) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 128) return null;
  if (!CHAT_ID_RE.test(value) || INVALID_RECORD_KEYS.has(value)) return null;
  return value;
}

export function sanitizeChatThumbnailUrl(value: unknown) {
  if (typeof value !== 'string' || value.length > MAX_THUMBNAIL_LENGTH) return null;
  return THUMBNAIL_RE.test(value) ? value : null;
}

/** Delete stale imported metadata when its normalized value is absent. */
function setOptionalChatField<T, Key extends keyof T>(target: T, key: Key, value: T[Key] | null | undefined, keep: unknown = value) {
  if (keep) target[key] = value as T[Key];
  else delete target[key];
}

function normalizeUsage(value: unknown) {
  if (!isRecord(value)) return undefined;
  return {
    inputTokens: safeCount(value.inputTokens, 1_000_000_000),
    outputTokens: safeCount(value.outputTokens, 1_000_000_000),
  };
}

function normalizePersonaAgreement(value: unknown) {
  if (!isRecord(value) || value.accepted !== true) return undefined;
  const version = safeCount(value.version, 1000);
  const acceptedAt = normalizeTimestamp(value.acceptedAt, '');
  if (!version || !acceptedAt) return undefined;
  return {
    accepted: true as const,
    version,
    acceptedAt,
    host: boundedString(value.host, 255),
    statement: boundedString(value.statement, 1000),
  };
}

function normalizeLensSources(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  return value.slice(0, 100).filter(isRecord).map(source => ({
    source: boundedString(source.source, 500),
    text: boundedString(source.text, 100_000),
    ...(typeof source.score === 'number' && Number.isFinite(source.score)
      ? { score: Math.max(-1, Math.min(1, source.score)) }
      : {}),
  }));
}

function normalizeAgentDraftPayload(kind: unknown, value: unknown) {
  if (!isRecord(value)) return null;
  const string = (key: string, max: number) => boundedString(value[key], max).trim();
  const numberFrom = (source: Record<string, unknown> | null | undefined, key: string, min: number, max: number) => {
    if (source?.[key] === undefined || source?.[key] === null || source?.[key] === '') return undefined;
    const parsed = Number(source?.[key]);
    return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : undefined;
  };
  const number = (key: string, min: number, max: number) => numberFrom(value, key, min, max);
  if (kind === 'note') {
    const scope = ['profile', 'marker'].includes(value.scope as string) ? value.scope : 'profile';
    const text = string('text', 2000);
    if (!text || (scope === 'marker' && !string('marker', 160))) return null;
    return { scope, marker: string('marker', 160), text, mode: value.mode === 'replace' ? 'replace' : 'append' };
  }
  if (kind === 'meal') {
    const name = string('name', 160);
    if (!name) return null;
    const eatenAt = string('eatenAt', 40);
    if (eatenAt && !Number.isFinite(new Date(eatenAt).getTime())) return null;
    const nutrients: Record<string, number> = {};
    for (const [key, max] of Object.entries({ energyKcal: 20000, proteinG: 2000, carbohydrateG: 3000, fatG: 2000, fiberG: 1000, fluidMl: 20000 })) {
      const amount = numberFrom(value.nutrients as Record<string, unknown> | null | undefined, key, 0, max);
      if (amount !== undefined) nutrients[key] = amount;
    }
    return {
      name,
      eatenAt,
      mealType: ['breakfast', 'brunch', 'lunch', 'dinner', 'snack', 'drink', 'other'].includes(value.mealType as string) ? value.mealType : 'other',
      note: string('note', 500),
      nutrients,
    };
  }
  if (kind === 'biometric') {
    const metric = ['weight', 'bp', 'rhr'].includes(value.metric as string) ? value.metric : '';
    if (!metric) return null;
    const rawDate = string('date', 10);
    const date = normalizeCalendarDate(rawDate);
    if (rawDate && !date) return null;
    const normalized = {
      metric,
      date,
      value: number('value', metric === 'weight' ? 1 : 20, metric === 'weight' ? 1000 : 250),
      unit: ['kg', 'lb', 'bpm'].includes(value.unit as string) ? value.unit : metric === 'weight' ? 'kg' : 'bpm',
      systolic: number('systolic', 40, 300),
      diastolic: number('diastolic', 20, 200),
      pulse: number('pulse', 20, 250),
      note: string('note', 500),
    };
    if (metric === 'bp' && (normalized.systolic === undefined || normalized.diastolic === undefined)) return null;
    if (metric !== 'bp' && normalized.value === undefined) return null;
    return normalized;
  }
  if (kind === 'supplement') {
    const name = string('name', 160);
    const type = ['supplement', 'medication'].includes(value.type as string) ? value.type : '';
    if (!name || !type) return null;
    const rawStartDate = string('startDate', 10);
    const startDate = normalizeCalendarDate(rawStartDate);
    if (rawStartDate && !startDate) return null;
    return {
      name, type, dosage: string('dosage', 160), note: string('note', 500),
      startDate,
    };
  }
  return null;
}

function normalizeAgentDrafts(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  const drafts: StoredAgentDraft[] = [];
  for (const draft of value.slice(0, 20)) {
    if (!isRecord(draft)) continue;
    const id = normalizeChatRecordId(draft.id);
    const profileId = normalizeChatRecordId(draft.profileId);
    const kind = ['note', 'meal', 'biometric', 'supplement'].includes(draft.kind as string) ? draft.kind as StoredAgentDraft['kind'] : '';
    const payload = normalizeAgentDraftPayload(kind, draft.payload);
    if (!id || !profileId || !kind || !payload) continue;
    // A persisted in-flight mutation has an uncertain outcome after reload.
    const status = draft.status === 'applying' ? 'failed'
      : ['pending', 'applied', 'discarded', 'failed'].includes(draft.status as string) ? draft.status as StoredAgentDraft['status'] : 'pending';
    drafts.push({
      id, profileId, kind, payload, status,
      summary: boundedString(draft.summary, 500),
      ...(status === 'applied' ? { appliedAt: normalizeTimestamp(draft.appliedAt, '') } : {}),
    });
  }
  return drafts;
}

function normalizeDiscussionPersonas(value: unknown) {
  if (!Array.isArray(value)) return [];
  const ids = new Set();
  const personas: Array<{ id: string; name: string; icon: string }> = [];
  for (const persona of value) {
    if (!isRecord(persona)) continue;
    const id = normalizeChatRecordId(persona.id);
    if (!id || ids.has(id)) continue;
    ids.add(id);
    personas.push({
      id,
      name: boundedString(persona.name, 200),
      icon: normalizeDisplayIcon(persona.icon),
    });
    if (personas.length >= 50) break;
  }
  return personas;
}

export function normalizeChatMessages(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, MAX_MESSAGES_PER_THREAD).filter(isRecord).map(message => {
    const normalized: StoredChatMessage = {
      ...message,
      content: boundedString(message.content, 2_000_000),
      joinIcon: normalizeDisplayIcon(message.joinIcon),
      joinName: boundedString(message.joinName, 200),
      personalityIcon: normalizeDisplayIcon(message.personalityIcon),
      personalityName: boundedString(message.personalityName, 200),
      modelDisplay: boundedString(message.modelDisplay, 200),
      modelId: boundedString(message.modelId, 200),
      provider: boundedString(message.provider, 100),
      agentId: boundedString(message.agentId, 40),
      imageCount: safeCount(message.imageCount, MAX_THUMBNAILS_PER_MESSAGE),
    };
    const thumbnails = Array.isArray(message.thumbnails)
      ? message.thumbnails
        .map(sanitizeChatThumbnailUrl)
        .filter(Boolean)
        .slice(0, MAX_THUMBNAILS_PER_MESSAGE) as string[]
      : [];
    normalized.thumbnails = thumbnails;
    normalized.hasImages = Boolean(message.hasImages) && (thumbnails.length > 0 || normalized.imageCount > 0);

    const usage = normalizeUsage(message.usage);
    setOptionalChatField(normalized, 'usage', usage);

    const lensSources = normalizeLensSources(message.lensSources);
    setOptionalChatField(normalized, 'lensSources', lensSources);

    const agentDrafts = normalizeAgentDrafts(message.agentDrafts);
    setOptionalChatField(normalized, 'agentDrafts', agentDrafts, agentDrafts?.length);

    for (const flag of ['auto', 'discussion', 'discussionError', 'hidden', 'joined', 'stopped']) {
      if (message[flag] === true) normalized[flag] = true;
      else delete normalized[flag];
    }
    const discussionPersonaId = normalizeChatRecordId(message.discussionPersonaId);
    setOptionalChatField(normalized, 'discussionPersonaId', discussionPersonaId);

    if (Array.isArray(message.recSlots)) {
      normalized.recSlots = message.recSlots
        .map(slot => normalizeChatRecordId(slot))
        .filter(Boolean)
        .slice(0, 50) as string[];
      normalized.recOpen = message.recOpen === true;
      normalized.recNew = message.recNew === true;
    } else {
      delete normalized.recSlots;
      delete normalized.recOpen;
      delete normalized.recNew;
    }
    return normalized;
  });
}

export function normalizeChatThreads(value: unknown) {
  if (!Array.isArray(value)) return [];
  const fallbackTimestamp = new Date(0).toISOString();
  const ids = new Set();
  const threads: ChatThread[] = [];
  for (const thread of value) {
    if (!isRecord(thread)) continue;
    const id = normalizeChatRecordId(thread.id);
    if (!id || ids.has(id)) continue;
    ids.add(id);
    const createdAt = normalizeTimestamp(thread.createdAt, fallbackTimestamp);
    const normalized: ChatThread = {
      ...thread,
      id,
      name: boundedString(thread.name || thread.title, 60, 'Imported Conversation'),
      createdAt,
      updatedAt: normalizeTimestamp(thread.updatedAt, createdAt),
      messageCount: safeCount(thread.messageCount, MAX_MESSAGES_PER_THREAD),
      personality: normalizeChatRecordId(thread.personality) || 'default',
      personalityName: boundedString(thread.personalityName, 200),
      personalityIcon: normalizeDisplayIcon(thread.personalityIcon),
    };
    const projectName = boundedString(thread.projectName, 60).trim();
    setOptionalChatField(normalized, 'projectName', projectName);
    setOptionalChatField(normalized, 'pinned', true, thread.pinned === true);
    const discussionPersonas = normalizeDiscussionPersonas(thread.discussionPersonas);
    const pendingPersonas = normalizeDiscussionPersonas(thread.discussionPendingPersonas);
    setOptionalChatField(normalized, 'discussionPersonas', discussionPersonas, discussionPersonas.length >= 2);
    setOptionalChatField(normalized, 'discussionPendingPersonas', pendingPersonas, pendingPersonas.length > 0);
    const originalPersonality = normalizeChatRecordId(thread.discussionOriginalPersonality);
    setOptionalChatField(normalized, 'discussionOriginalPersonality', originalPersonality);
    setOptionalChatField(normalized, 'discussionEnded', true, thread.discussionEnded === true);
    const forkedFromThreadId = normalizeChatRecordId(thread.forkedFromThreadId);
    setOptionalChatField(normalized, 'forkedFromThreadId', forkedFromThreadId);
    if (forkedFromThreadId) normalized.forkedFromMessageIndex = safeCount(
      thread.forkedFromMessageIndex,
      MAX_MESSAGES_PER_THREAD,
    );
    else delete normalized.forkedFromMessageIndex;
    if (thread.chatBackend === 'codex') {
      normalized.chatBackend = 'codex';
      const agentThreadId = normalizeAgentThreadHandle(thread.agentThreadId);
      setOptionalChatField(normalized, 'agentThreadId', agentThreadId);
      const agentModel = boundedString(thread.agentModel, 160).trim();
      setOptionalChatField(normalized, 'agentModel', agentModel);
    } else {
      delete normalized.chatBackend;
      delete normalized.agentThreadId;
      delete normalized.agentModel;
    }
    threads.push(normalized);
    if (threads.length >= MAX_THREADS) break;
  }
  return threads;
}

export function normalizeCustomPersonalities(value: unknown) {
  if (!Array.isArray(value)) return [];
  const ids = new Set();
  const personalities: StoredCustomPersonality[] = [];
  for (const personality of value) {
    if (!isRecord(personality)) continue;
    const id = normalizeChatRecordId(personality.id);
    if (!id || !id.startsWith('custom_') || ids.has(id)) continue;
    ids.add(id);
    const personaAgreement = normalizePersonaAgreement(personality.personaAgreement);
    const createdAt = normalizeTimestamp(personality.createdAt, '');
    const updatedAt = normalizeTimestamp(personality.updatedAt, '');
    personalities.push({
      id,
      name: boundedString(personality.name, 60, 'Custom Personality'),
      icon: normalizeDisplayIcon(personality.icon) || '✏️',
      promptText: boundedString(personality.promptText, 50_000),
      evidenceBased: Boolean(personality.evidenceBased),
      ...(createdAt ? { createdAt } : {}),
      ...(updatedAt ? { updatedAt } : {}),
      ...(personaAgreement ? { personaAgreement } : {}),
    });
    if (personalities.length >= MAX_CUSTOM_PERSONALITIES) break;
  }
  return personalities;
}

export function normalizeCustomPersonalityTombstones(value: unknown) {
  if (!isRecord(value)) return {};
  const entries: Array<[string, number]> = [];
  for (const [id, deletedAt] of Object.entries(value)) {
    const normalizedId = normalizeChatRecordId(id);
    const ts = Number(deletedAt);
    if (!normalizedId?.startsWith('custom_') || !Number.isFinite(ts) || ts <= 0) continue;
    entries.push([normalizedId, ts]);
  }
  entries.sort((a, b) => b[1] - a[1]);
  return Object.fromEntries(entries.slice(0, 200));
}

export function normalizeChatBackup(value: unknown) {
  if (!isRecord(value)) {
    return { threads: [], messages: {}, personality: null, customPersonalities: [], customPersonalityDeleted: {} };
  }
  const threads = normalizeChatThreads(value.threads);
  const messages: Record<string, StoredChatMessage[]> = {};
  const rawMessages = isRecord(value.messages) ? value.messages : {};
  for (const thread of threads) {
    messages[thread.id] = normalizeChatMessages(rawMessages[thread.id]);
    thread.messageCount = messages[thread.id]!.length;
  }
  return {
    threads,
    messages,
    personality: normalizeChatRecordId(value.personality),
    customPersonalities: normalizeCustomPersonalities(value.customPersonalities),
    customPersonalityDeleted: normalizeCustomPersonalityTombstones(value.customPersonalityDeleted),
  };
}
