// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { projectChatCitations, projectChatStoredImages } from '../js/chat-message-content-contract.js';
import { renderChatCitations, renderChatStoredImages } from '../js/chat-message-content.js';
import { createChatThinkingIndicator, startChatThinkingStatus, stopChatThinkingStatus } from '../js/chat-thinking-status.js';
import { state } from '../js/state.js';
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
afterEach(() => { document.body.replaceChildren(); vi.useRealTimers(); });
describe('one authored transcript content view', () => {
  it('projects source defaults and literal multiline excerpts without changing raw input', () => {
    const chunks = [{ source: '<script>alert(1)</script>', score: .934, text: 'First <img src=x>\nSecond & third' }, { text: '' }];
    const original = JSON.stringify(chunks);
    expect(projectChatCitations(chunks, '<Vault>')).toEqual({ label: '<Vault>', chunks: [{ source: '<script>alert(1)</script>', score: '0.93', lines: ['First <img src=x>', 'Second & third'] }, { source: 'excerpt 2', score: null, lines: [''] }] });
    const host = document.createElement('div'); host.innerHTML = renderChatCitations(chunks, '<Vault>');
    expect(host.querySelector('script,img')).toBeNull(); expect(host.querySelector('.chat-lens-source-name')?.textContent).toBe('<script>alert(1)</script>');
    expect(host.querySelector('.chat-lens-source-text')?.textContent).toBe('First <img src=x>Second & third'); expect(host.querySelectorAll('br')).toHaveLength(1);
    expect(host.querySelector('.chat-lens-sources-summary')?.textContent).toBe('📎 2 excerpts from <Vault>'); expect(JSON.stringify(chunks)).toBe(original);
  });
  it.each([null, undefined, {}, [], 'source'])('preserves empty/nonarray citation compatibility for %s', value => {
    expect(projectChatCitations(value)).toBeNull(); expect(renderChatCitations(value)).toBe('');
  });
  it('retains numeric score formatting, including legacy nonfinite numbers', () => {
    expect(projectChatCitations([{ score: NaN }, { score: Infinity }, { score: '0.9' }])?.chunks.map(chunk => chunk.score)).toEqual(['NaN', 'Infinity', null]);
  });
  it('filters unsafe stored thumbnails and gives each image a native keyboard button', () => {
    const input = { hasImages: true, thumbnails: [png, 'javascript:alert(1)', 'https://external.example/patient.png', 'data:text/html,<script>'], imageCount: 9 };
    expect(projectChatStoredImages(input)).toEqual({ thumbnails: [png], count: 9 });
    const host = document.createElement('div'); host.innerHTML = renderChatStoredImages(input);
    expect(host.querySelectorAll('img')).toHaveLength(1); expect(host.querySelector('img')?.getAttribute('src')).toBe(png);
    expect(host.querySelector('button')?.getAttribute('aria-label')).toBe('Open attached image 1 of 1'); expect(host.querySelector('button')?.dataset.chatMessageSrc).toBe(png);
    expect(host.querySelector('button')?.dataset.chatMessageAction).toBe('open-image-lightbox');
  });
  it.each([[1.9, '1 image attached'], [-4, '0 images attached'], [Infinity, '0 images attached'], ['2', '2 images attached']])('preserves count-only image disclosure for %s', (count, expected) => {
    const host = document.createElement('div'); host.innerHTML = renderChatStoredImages({ hasImages: true, imageCount: count }); expect(host.textContent).toContain(expected);
  });
  it('does not render images for a message without its persisted image flag', () => { expect(renderChatStoredImages({ thumbnails: [png] })).toBe(''); });
});
describe('owned thinking-status lifetime', () => {
  it('restarts an existing indicator without replacing its phrase or dot nodes', () => {
    vi.useFakeTimers(); const indicator = createChatThinkingIndicator(); document.body.appendChild(indicator);
    const phrase = indicator.querySelector('.chat-thinking-text');
    startChatThinkingStatus(indicator, { phrases: ['Preparing', 'Responding'], durations: [500] });
    expect(phrase?.textContent).toBe('Preparing'); vi.advanceTimersByTime(500); expect(phrase?.textContent).toBe('Responding'); expect(indicator.querySelector('.chat-thinking-text')).toBe(phrase);
    stopChatThinkingStatus(indicator); expect(vi.getTimerCount()).toBe(0);
  });
  it.each(['profile', 'thread'])('retires a late visual clock after %s changes', boundary => {
    vi.useFakeTimers(); state.currentProfile = 'origin'; state.currentThreadId = 'origin'; const indicator = createChatThinkingIndicator(); document.body.appendChild(indicator);
    if (boundary === 'profile') state.currentProfile = 'next'; else state.currentThreadId = 'next'; vi.advanceTimersByTime(6000);
    expect(vi.getTimerCount()).toBe(0); expect(indicator.isConnected).toBe(false); startChatThinkingStatus(indicator); expect(vi.getTimerCount()).toBe(0);
  });
  it('disposes a stopped view when its sender removes it, without reviving its timer', async () => {
    vi.useFakeTimers(); const indicator = createChatThinkingIndicator(); document.body.appendChild(indicator);
    stopChatThinkingStatus(indicator); indicator.remove(); await Promise.resolve();
    startChatThinkingStatus(indicator); expect(vi.getTimerCount()).toBe(0);
  });
  it('releases a removed indicator even when insertion and removal share one task', async () => {
    vi.useFakeTimers(); const indicator = createChatThinkingIndicator(); document.body.appendChild(indicator); indicator.remove(); await Promise.resolve(); expect(vi.getTimerCount()).toBe(0);
  });
});
