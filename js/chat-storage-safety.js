// @ts-check
// chat-storage-safety.js — validation for persisted and imported chat records.

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

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function boundedString(value, maxLength, fallback = '') {
  return typeof value === 'string' ? value.slice(0, maxLength) : fallback;
}

function normalizeDisplayIcon(value) {
  return boundedString(value, 128).replace(/[<>&"'`]/g, '');
}

function safeCount(value, maximum = Number.MAX_SAFE_INTEGER) {
  const count = Number(value);
  if (!Number.isFinite(count) || count < 0) return 0;
  return Math.min(Math.trunc(count), maximum);
}

function normalizeTimestamp(value, fallback) {
  if (typeof value !== 'string' || value.length > 64) return fallback;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : fallback;
}

function normalizeCalendarDate(value) {
  const text = boundedString(value, 10).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return '';
  const parsed = new Date(`${text}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === text ? text : '';
}

export function normalizeAgentThreadHandle(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 400) return null;
  // Older Codex threads stored the upstream opaque ID directly. Preserve those
  // bounded IDs while also accepting the longer signed handles issued by the
  // companion's multi-adapter protocol.
  const isLegacyHandle = value.length <= 128 && CHAT_ID_RE.test(value);
  const isSignedHandle = /^v\d+\.[A-Za-z0-9_.:-]+$/.test(value);
  if ((!isLegacyHandle && !isSignedHandle) || INVALID_RECORD_KEYS.has(value)) return null;
  return value;
}

export function normalizeChatRecordId(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 128) return null;
  if (!CHAT_ID_RE.test(value) || INVALID_RECORD_KEYS.has(value)) return null;
  return value;
}

export function sanitizeChatThumbnailUrl(value) {
  if (typeof value !== 'string' || value.length > MAX_THUMBNAIL_LENGTH) return null;
  return THUMBNAIL_RE.test(value) ? value : null;
}

function normalizeUsage(value) {
  if (!isRecord(value)) return undefined;
  return {
    inputTokens: safeCount(value.inputTokens, 1_000_000_000),
    outputTokens: safeCount(value.outputTokens, 1_000_000_000),
  };
}

function normalizePersonaAgreement(value) {
  if (!isRecord(value) || value.accepted !== true) return undefined;
  const version = safeCount(value.version, 1000);
  const acceptedAt = normalizeTimestamp(value.acceptedAt, '');
  if (!version || !acceptedAt) return undefined;
  return {
    accepted: true,
    version,
    acceptedAt,
    host: boundedString(value.host, 255),
    statement: boundedString(value.statement, 1000),
  };
}

function normalizeLensSources(value) {
  if (!Array.isArray(value)) return undefined;
  return value.slice(0, 100).filter(isRecord).map(source => ({
    source: boundedString(source.source, 500),
    text: boundedString(source.text, 100_000),
    ...(typeof source.score === 'number' && Number.isFinite(source.score)
      ? { score: Math.max(-1, Math.min(1, source.score)) }
      : {}),
  }));
}

function normalizeAgentDraftPayload(kind, value) {
  if (!isRecord(value)) return null;
  const string = (key, max) => boundedString(value[key], max).trim();
  const numberFrom = (source, key, min, max) => {
    if (source?.[key] === undefined || source?.[key] === null || source?.[key] === '') return undefined;
    const parsed = Number(source?.[key]);
    return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : undefined;
  };
  const number = (key, min, max) => numberFrom(value, key, min, max);
  if (kind === 'note') {
    const scope = ['profile', 'marker'].includes(value.scope) ? value.scope : 'profile';
    const text = string('text', 2000);
    if (!text || (scope === 'marker' && !string('marker', 160))) return null;
    return { scope, marker: string('marker', 160), text, mode: value.mode === 'replace' ? 'replace' : 'append' };
  }
  if (kind === 'meal') {
    const name = string('name', 160);
    if (!name) return null;
    const eatenAt = string('eatenAt', 40);
    if (eatenAt && !Number.isFinite(new Date(eatenAt).getTime())) return null;
    const nutrients = {};
    for (const [key, max] of Object.entries({ energyKcal: 20000, proteinG: 2000, carbohydrateG: 3000, fatG: 2000, fiberG: 1000, fluidMl: 20000 })) {
      const amount = numberFrom(value.nutrients, key, 0, max);
      if (amount !== undefined) nutrients[key] = amount;
    }
    return {
      name,
      eatenAt,
      mealType: ['breakfast', 'brunch', 'lunch', 'dinner', 'snack', 'drink', 'other'].includes(value.mealType) ? value.mealType : 'other',
      note: string('note', 500),
      nutrients,
    };
  }
  if (kind === 'biometric') {
    const metric = ['weight', 'bp', 'rhr'].includes(value.metric) ? value.metric : '';
    if (!metric) return null;
    const rawDate = string('date', 10);
    const date = normalizeCalendarDate(rawDate);
    if (rawDate && !date) return null;
    const normalized = {
      metric,
      date,
      value: number('value', metric === 'weight' ? 1 : 20, metric === 'weight' ? 1000 : 250),
      unit: ['kg', 'lb', 'bpm'].includes(value.unit) ? value.unit : metric === 'weight' ? 'kg' : 'bpm',
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
    const type = ['supplement', 'medication'].includes(value.type) ? value.type : '';
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

function normalizeAgentDrafts(value) {
  if (!Array.isArray(value)) return undefined;
  const drafts = [];
  for (const draft of value.slice(0, 20)) {
    if (!isRecord(draft)) continue;
    const id = normalizeChatRecordId(draft.id);
    const profileId = normalizeChatRecordId(draft.profileId);
    const kind = ['note', 'meal', 'biometric', 'supplement'].includes(draft.kind) ? draft.kind : '';
    const payload = normalizeAgentDraftPayload(kind, draft.payload);
    if (!id || !profileId || !kind || !payload) continue;
    const status = ['pending', 'applied', 'discarded'].includes(draft.status) ? draft.status : 'pending';
    drafts.push({
      id, profileId, kind, payload, status,
      summary: boundedString(draft.summary, 500),
      ...(status === 'applied' ? { appliedAt: normalizeTimestamp(draft.appliedAt, '') } : {}),
    });
  }
  return drafts;
}

function normalizeDiscussionPersonas(value) {
  if (!Array.isArray(value)) return [];
  const ids = new Set();
  const personas = [];
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

export function normalizeChatMessages(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, MAX_MESSAGES_PER_THREAD).filter(isRecord).map(message => {
    const normalized = {
      ...message,
      content: boundedString(message.content, 2_000_000),
      joinIcon: normalizeDisplayIcon(message.joinIcon),
      joinName: boundedString(message.joinName, 200),
      personalityIcon: normalizeDisplayIcon(message.personalityIcon),
      personalityName: boundedString(message.personalityName, 200),
      modelDisplay: boundedString(message.modelDisplay, 200),
      modelId: boundedString(message.modelId, 200),
      provider: boundedString(message.provider, 100),
      imageCount: safeCount(message.imageCount, MAX_THUMBNAILS_PER_MESSAGE),
    };
    const thumbnails = Array.isArray(message.thumbnails)
      ? message.thumbnails
        .map(sanitizeChatThumbnailUrl)
        .filter(Boolean)
        .slice(0, MAX_THUMBNAILS_PER_MESSAGE)
      : [];
    normalized.thumbnails = thumbnails;
    normalized.hasImages = Boolean(message.hasImages) && (thumbnails.length > 0 || normalized.imageCount > 0);

    const usage = normalizeUsage(message.usage);
    if (usage) normalized.usage = usage;
    else delete normalized.usage;

    const lensSources = normalizeLensSources(message.lensSources);
    if (lensSources) normalized.lensSources = lensSources;
    else delete normalized.lensSources;

    const agentDrafts = normalizeAgentDrafts(message.agentDrafts);
    if (agentDrafts?.length) normalized.agentDrafts = agentDrafts;
    else delete normalized.agentDrafts;

    for (const flag of ['auto', 'discussion', 'discussionError', 'hidden', 'joined', 'stopped']) {
      if (message[flag] === true) normalized[flag] = true;
      else delete normalized[flag];
    }
    const discussionPersonaId = normalizeChatRecordId(message.discussionPersonaId);
    if (discussionPersonaId) normalized.discussionPersonaId = discussionPersonaId;
    else delete normalized.discussionPersonaId;

    if (Array.isArray(message.recSlots)) {
      normalized.recSlots = message.recSlots
        .map(slot => normalizeChatRecordId(slot))
        .filter(Boolean)
        .slice(0, 50);
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

export function normalizeChatThreads(value) {
  if (!Array.isArray(value)) return [];
  const fallbackTimestamp = new Date(0).toISOString();
  const ids = new Set();
  const threads = [];
  for (const thread of value) {
    if (!isRecord(thread)) continue;
    const id = normalizeChatRecordId(thread.id);
    if (!id || ids.has(id)) continue;
    ids.add(id);
    const createdAt = normalizeTimestamp(thread.createdAt, fallbackTimestamp);
    const normalized = {
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
    if (projectName) normalized.projectName = projectName;
    else delete normalized.projectName;
    if (thread.pinned === true) normalized.pinned = true;
    else delete normalized.pinned;
    const discussionPersonas = normalizeDiscussionPersonas(thread.discussionPersonas);
    const pendingPersonas = normalizeDiscussionPersonas(thread.discussionPendingPersonas);
    if (discussionPersonas.length >= 2) normalized.discussionPersonas = discussionPersonas;
    else delete normalized.discussionPersonas;
    if (pendingPersonas.length > 0) normalized.discussionPendingPersonas = pendingPersonas;
    else delete normalized.discussionPendingPersonas;
    const originalPersonality = normalizeChatRecordId(thread.discussionOriginalPersonality);
    if (originalPersonality) normalized.discussionOriginalPersonality = originalPersonality;
    else delete normalized.discussionOriginalPersonality;
    if (thread.discussionEnded === true) normalized.discussionEnded = true;
    else delete normalized.discussionEnded;
    const forkedFromThreadId = normalizeChatRecordId(thread.forkedFromThreadId);
    if (forkedFromThreadId) normalized.forkedFromThreadId = forkedFromThreadId;
    else delete normalized.forkedFromThreadId;
    if (forkedFromThreadId) normalized.forkedFromMessageIndex = safeCount(
      thread.forkedFromMessageIndex,
      MAX_MESSAGES_PER_THREAD,
    );
    else delete normalized.forkedFromMessageIndex;
    if (thread.chatBackend === 'codex') {
      normalized.chatBackend = 'codex';
      const agentThreadId = normalizeAgentThreadHandle(thread.agentThreadId);
      if (agentThreadId) normalized.agentThreadId = agentThreadId;
      else delete normalized.agentThreadId;
      const agentModel = boundedString(thread.agentModel, 160).trim();
      if (agentModel) normalized.agentModel = agentModel;
      else delete normalized.agentModel;
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

export function normalizeCustomPersonalities(value) {
  if (!Array.isArray(value)) return [];
  const ids = new Set();
  const personalities = [];
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

export function normalizeCustomPersonalityTombstones(value) {
  if (!isRecord(value)) return {};
  /** @type {Array<[string, number]>} */
  const entries = [];
  for (const [id, deletedAt] of Object.entries(value)) {
    const normalizedId = normalizeChatRecordId(id);
    const ts = Number(deletedAt);
    if (!normalizedId?.startsWith('custom_') || !Number.isFinite(ts) || ts <= 0) continue;
    entries.push([normalizedId, ts]);
  }
  entries.sort((a, b) => b[1] - a[1]);
  return Object.fromEntries(entries.slice(0, 200));
}

export function normalizeChatBackup(value) {
  if (!isRecord(value)) {
    return { threads: [], messages: {}, personality: null, customPersonalities: [], customPersonalityDeleted: {} };
  }
  const threads = normalizeChatThreads(value.threads);
  const messages = {};
  const rawMessages = isRecord(value.messages) ? value.messages : {};
  for (const thread of threads) {
    messages[thread.id] = normalizeChatMessages(rawMessages[thread.id]);
    thread.messageCount = messages[thread.id].length;
  }
  return {
    threads,
    messages,
    personality: normalizeChatRecordId(value.personality),
    customPersonalities: normalizeCustomPersonalities(value.customPersonalities),
    customPersonalityDeleted: normalizeCustomPersonalityTombstones(value.customPersonalityDeleted),
  };
}
