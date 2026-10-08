// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderHTML } from '../js/components/ChatSummaryPresentation.svelte.html.js';
import { projectSavedSummaries, projectSummaryDialog, projectSummaryPrint } from '../js/chat-summary-presentation.js';

const literal = '<img src=x onerror=alert(1)> " &';
const content = '## Findings\nLiteral <script>alert(1)</script>\n\n- Retest ferritin\n\n[unsafe](javascript:alert(1))';
function dialog(loading = false, savedId: unknown = 'summary-literal') {
  const host = document.createElement('div');
  host.innerHTML = renderHTML({ kind: 'dialog', view: projectSummaryDialog({
    name: literal, date: '2026-06-01T00:00:00Z', model: literal, costLabel: ' · $0.01 · 150 tokens',
    content, loading, attribution: 'AI-generated', savedId,
  }) });
  return host;
}

describe('authored summary presentation contracts', () => {
  it('orders saved summaries without changing records and keeps literal names, models and IDs', () => {
    const records = Object.freeze([
      Object.freeze({ id: 'old', threadName: 'Older', createdAt: '2026-06-01T00:00:00Z' }),
      Object.freeze({ id: literal, threadName: literal, model: literal, createdAt: '2026-06-02T00:00:00Z' }),
    ]);
    const rows = projectSavedSummaries(records);
    const host = document.createElement('div');
    host.innerHTML = renderHTML({ kind: 'list', rows });
    const buttons = [...host.querySelectorAll('button')];
    expect(buttons.map(button => button.dataset.chatMessageSummaryId)).toEqual([literal, 'old']);
    expect(buttons.every(button => button.type === 'button' && button.dataset.chatMessageAction === 'view-summary')).toBe(true);
    expect(buttons[0]?.querySelector('.chat-saved-summary-name')?.textContent).toBe(literal);
    expect(buttons[0]?.querySelector('.chat-saved-summary-meta')?.textContent).toBe('Jun 2 · ' + literal);
    expect(host.querySelector('img,script,[onclick]')).toBeNull();
    expect(records.map(record => record.id)).toEqual(['old', literal]);
  });

  it('keeps the empty list empty', () => {
    const host = document.createElement('div');
    host.innerHTML = renderHTML({ kind: 'list', rows: projectSavedSummaries([]) });
    expect(host.children).toHaveLength(0);
    expect(host.textContent).toBe('');
  });

  it('retains every delegated modal action and exposes an accessible dialog', () => {
    const host = dialog();
    expect(host.querySelector('[role="dialog"]')?.getAttribute('aria-labelledby')).toBe('chat-summary-title');
    expect([...host.querySelectorAll('button')].map(button => [button.dataset.chatMessageAction, button.type])).toEqual([
      ['close-summary', 'button'], ['copy-summary', 'button'], ['download-summary', 'button'], ['print-summary', 'button'], ['delete-summary', 'button'],
    ]);
    expect(host.querySelector('[data-chat-message-action="delete-summary"]')?.getAttribute('data-chat-message-summary-id')).toBe('summary-literal');
    expect(host.querySelector('.summary-modal-meta')?.textContent).toBe(`${literal} · Jun 1, 2026 · ${literal} · $0.01 · 150 tokens`);
    expect(host.querySelector('.chat-provider-attribution')?.textContent).toBe('AI-generated');
    expect(host.querySelector('.summary-modal-actions')?.hasAttribute('hidden')).toBe(false);
  });

  it('formats Markdown through the escaping renderer, never arbitrary HTML or script URLs', () => {
    const host = dialog();
    expect(host.querySelector('#summary-modal-body .chat-h2')?.textContent).toBe('Findings');
    expect(host.querySelector('#summary-modal-body li')?.textContent).toBe('Retest ferritin');
    expect(host.querySelector('#summary-modal-body')?.textContent).toContain('<script>alert(1)</script>');
    expect(host.querySelector('script,img,[onclick],a[href^="javascript:"]')).toBeNull();
  });

  it('hides actions and attribution during streaming, with an announced loading state', () => {
    const host = dialog(true);
    expect(host.querySelector('[role="status"]')?.getAttribute('aria-label')).toBe('Generating summary');
    expect(host.querySelector('.summary-modal-actions')?.hasAttribute('hidden')).toBe(true);
    expect(host.querySelector('.chat-provider-attribution')).toBeNull();
    expect(host.querySelector('#summary-modal-body')?.textContent?.trim()).toBe('');
    expect(dialog(false, null).querySelector('[data-chat-message-action="delete-summary"]')).toBeNull();
  });

  it('prints a self-contained, escaped document with the same content, date and attribution', () => {
    const view = projectSummaryPrint({ name: literal, date: '2026-06-01T00:00:00Z', model: literal, content, attribution: 'Written with Grok' });
    const document = new DOMParser().parseFromString('<!DOCTYPE html>' + renderHTML({ kind: 'print', view }), 'text/html');
    expect(document.title).toBe(literal + ' - Summary');
    expect(document.querySelector('h1')?.textContent).toBe(literal);
    expect(document.querySelector('.meta')?.textContent).toBe('Summarized June 1, 2026 · ' + literal);
    expect(document.querySelector('.attribution')?.textContent).toBe('Written with Grok');
    expect(document.querySelector('.chat-h2')?.textContent).toBe('Findings');
    expect(document.querySelector('style')?.textContent).toContain('@media print');
    expect(document.querySelector('script,img,link,[onclick],a[href^="javascript:"]')).toBeNull();
  });
});
