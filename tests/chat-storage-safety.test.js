import { describe, expect, it } from 'vitest';

import {
  normalizeChatBackup,
  normalizeChatMessages,
  normalizeChatRecordId,
  normalizeCustomPersonalities,
  sanitizeChatThumbnailUrl,
} from '../js/chat-storage-safety.js';

const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

describe('chat storage safety', () => {
  it('accepts app identifiers and rejects storage/prototype hazards', () => {
    expect(normalizeChatRecordId('t_safe-1.example')).toBe('t_safe-1.example');
    expect(normalizeChatRecordId('__proto__')).toBeNull();
    expect(normalizeChatRecordId('thread\"><img src=x>')).toBeNull();
    expect(normalizeChatRecordId('')).toBeNull();
  });

  it('only permits bounded raster data thumbnails', () => {
    expect(sanitizeChatThumbnailUrl(TINY_PNG)).toBe(TINY_PNG);
    expect(sanitizeChatThumbnailUrl('data:image/svg+xml,<svg onload=alert(1)>')).toBeNull();
    expect(sanitizeChatThumbnailUrl('x\" onerror=\"alert(1)')).toBeNull();
    expect(sanitizeChatThumbnailUrl('https://attacker.example/tracker.png')).toBeNull();
  });

  it('normalizes imported threads, messages, counters, and personas', () => {
    const chat = normalizeChatBackup({
      threads: [
        {
          id: 't_safe',
          name: 'Safe thread',
          createdAt: '2026-07-01T12:00:00Z',
          updatedAt: 'not-a-date',
          messageCount: '<img onerror=alert(1)>',
          personalityIcon: '<img src=x onerror=alert(1)>',
          discussionPersonas: [
            { id: 'default', name: 'Analyst', icon: 'A' },
            { id: 'custom_safe', name: 'Coach', icon: '<svg>' },
          ],
          discussionPendingPersonas: [
            { id: 'custom_safe', name: 'Coach', icon: 'C' },
          ],
          discussionOriginalPersonality: 'default',
          discussionEnded: true,
          forkedFromThreadId: 't_parent',
          forkedFromMessageIndex: 7,
        },
        { id: '__proto__', name: 'Rejected' },
      ],
      messages: {
        t_safe: [{
          role: 'assistant',
          content: 'Hello',
          personalityIcon: '<svg onload=alert(1)>',
          imageCount: 'not-a-number',
          hasImages: true,
          thumbnails: [TINY_PNG, 'data:image/svg+xml,<svg onload=alert(1)>'],
          usage: { inputTokens: '<img>', outputTokens: 12 },
          recSlots: ['sleep.light'],
          recOpen: true,
          recNew: true,
          discussion: true,
          discussionError: false,
          discussionPersonaId: 'custom_safe',
          auto: true,
        }],
      },
      personality: 'default',
      customPersonalities: [
        {
          id: 'custom_safe',
          name: 'Coach',
          icon: '<img src=x onerror=alert(1)>',
          promptText: 'Be concise',
          createdAt: '2026-08-08T09:00:00Z',
          updatedAt: '2026-08-08T10:00:00Z',
          personaAgreement: {
            accepted: true,
            version: 1,
            acceptedAt: '2026-08-08T10:00:00Z',
            host: 'app.getbased.health',
            statement: 'I agree.',
          },
        },
        { id: 'default', name: 'Cannot shadow built-ins' },
      ],
      customPersonalityDeleted: {
        custom_old: Date.parse('2026-08-07T10:00:00Z'),
        __proto__: Date.now(),
      },
    });

    expect(chat.threads).toHaveLength(1);
    expect(chat.threads[0]).toMatchObject({
      id: 't_safe',
      messageCount: 1,
      updatedAt: '2026-07-01T12:00:00.000Z',
      discussionPersonas: [
        { id: 'default', name: 'Analyst', icon: 'A' },
        { id: 'custom_safe', name: 'Coach', icon: 'svg' },
      ],
      discussionPendingPersonas: [{ id: 'custom_safe', name: 'Coach', icon: 'C' }],
      discussionOriginalPersonality: 'default',
      discussionEnded: true,
      forkedFromThreadId: 't_parent',
      forkedFromMessageIndex: 7,
    });
    expect(chat.messages.t_safe[0]).toMatchObject({
      content: 'Hello',
      personalityIcon: 'svg onload=alert(1)',
      imageCount: 0,
      thumbnails: [TINY_PNG],
      usage: { inputTokens: 0, outputTokens: 12 },
      recSlots: ['sleep.light'],
      recOpen: true,
      recNew: true,
      discussion: true,
      discussionPersonaId: 'custom_safe',
      auto: true,
    });
    expect(chat.messages.t_safe[0]).not.toHaveProperty('discussionError');
    expect(chat.customPersonalities).toHaveLength(1);
    expect(chat.customPersonalities[0].id).toBe('custom_safe');
    expect(chat.customPersonalities[0].icon).toBe('img src=x onerror=alert(1)');
    expect(chat.customPersonalities[0].updatedAt).toBe('2026-08-08T10:00:00.000Z');
    expect(chat.customPersonalities[0].personaAgreement).toEqual({
      accepted: true,
      version: 1,
      acceptedAt: '2026-08-08T10:00:00.000Z',
      host: 'app.getbased.health',
      statement: 'I agree.',
    });
    expect(chat.customPersonalityDeleted).toEqual({
      custom_old: Date.parse('2026-08-07T10:00:00Z'),
    });
  });

  it('drops malformed records instead of passing type-confused values to renderers', () => {
    expect(normalizeChatMessages([null, 'message', { content: { html: '<img>' } }]))
      .toEqual([expect.objectContaining({ content: '', thumbnails: [], imageCount: 0 })]);
    expect(normalizeCustomPersonalities([{ id: 'custom_safe', name: 42 }, null]))
      .toEqual([expect.objectContaining({ id: 'custom_safe', name: 'Custom Personality' })]);
  });
});
