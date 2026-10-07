// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { ChatAttachmentDrafts, type AttachmentReservation } from '../js/chat-attachment-drafts.js';
import { ownChatAttachments, publishChatAttachments, configureChatAttachmentActions, chatAttachmentActions, chatAttachmentImageURL, pasteChatAttachments, dropChatAttachments } from '../js/chat-attachment-view.js';
const reserved = (value: AttachmentReservation | string): AttachmentReservation => { expect(typeof value).toBe('object'); return value as AttachmentReservation; };
describe('ephemeral attachment drafts', () => {
  it('reserves slots before overlapping reads and releases failures', () => {
    const drafts = new ChatAttachmentDrafts();
    const reads = Array.from({ length: 5 }, () => reserved(drafts.reserve('a', 1, 5, 18)));
    expect(drafts.reserve('a', 1, 5, 18)).toBe('count');
    drafts.release(reads[1]!); expect(typeof drafts.reserve('a', 1, 5, 18)).toBe('object');
    expect(drafts.commit(reads[0]!, { name: 'original', sizeBytes: 1 }, 5, 18)).toBe(true);
    expect(drafts.commit(reads[0]!, { name: 'duplicate', sizeBytes: 1 }, 5, 18)).toBe(false);
    expect(drafts.get('a').map(item => item.name)).toEqual(['original']);
  });
  it('accounts for bytes in queued originals and in-flight reservations', () => {
    const drafts = new ChatAttachmentDrafts(); drafts.get('a').push({ sizeBytes: 10 });
    const read = reserved(drafts.reserve('a', 8, 5, 18));
    expect(drafts.reserve('a', 1, 5, 18)).toBe('bytes');
    drafts.release(read); expect(drafts.reserve('a', 9, 5, 18)).toBe('bytes');
    for (const bytes of [0, -1, Infinity, NaN]) expect(drafts.reserve('a', bytes, 5, 18)).toBe('bytes');
  });
  it.each(['delete', 'replace'] as const)('retires pending reads after %s without reviving a discarded draft', action => {
    const drafts = new ChatAttachmentDrafts(); const read = reserved(drafts.reserve('profile:thread', 2, 5, 18));
    if (action === 'delete') drafts.delete(read.key); else drafts.replace(read.key, [{ name: 'retry' }]);
    expect(drafts.commit(read, { name: 'stale', sizeBytes: 2 }, 5, 18)).toBe(false);
    expect(drafts.get(read.key).map(item => item.name)).toEqual(action === 'delete' ? [] : ['retry']);
  });
  it('consumes submitted identities while keeping new items and pending reads', () => {
    const drafts = new ChatAttachmentDrafts(), submitted = { name: 'submitted' }, later = { name: 'later' };
    drafts.get('a').push(submitted, later); const read = reserved(drafts.reserve('a', 2, 5, 18));
    drafts.consume('a', [submitted]); expect(drafts.current(read)).toBe(true);
    expect(drafts.commit(read, { name: 'reading', sizeBytes: 2 }, 5, 18)).toBe(true);
    expect(drafts.get('a').map(item => item.name)).toEqual(['later', 'reading']); expect(drafts.get('other')).toEqual([]);
  });
  it('revalidates limits after opaque programmatic additions and route changes', () => {
    const drafts = new ChatAttachmentDrafts(); const read = reserved(drafts.reserve('a', 2, 5, 18));
    drafts.get('a').push({ sizeBytes: 17 }); expect(drafts.commit(read, { sizeBytes: 2 }, 5, 18)).toBe(false);
    drafts.get('a').splice(0); drafts.get('a').push(...Array.from({ length: 4 }, () => ({ sizeBytes: 1 })));
    expect(drafts.commit(read, { sizeBytes: 2 }, 4, 18)).toBe(false);
  });
});
it('only sends provider updates/actions into the current component and disposes subscriptions', async () => {
  const root = document.createElement('div'); root.dataset.chatAttachmentView = ''; document.body.replaceChildren(root);
  const refresh = vi.fn(), render = vi.fn(), files = vi.fn(async () => { }), drop = vi.fn(async () => { }), remove = vi.fn();
  configureChatAttachmentActions({ files, drop, remove }, refresh); const first = ownChatAttachments(root, render); await Promise.resolve(); refresh.mockClear();
  window.dispatchEvent(new Event('getbased:chat-backend-changed')); expect(refresh).toHaveBeenCalledOnce();
  const replacement = root.cloneNode() as HTMLElement; document.body.replaceChildren(replacement);
  const nextRender = vi.fn(); const next = ownChatAttachments(replacement, nextRender); await Promise.resolve();
  const view = { scope: 'a', attachments: [], limit: 5, canAttach: true }; publishChatAttachments(view);
  expect(nextRender).toHaveBeenCalledWith(view); expect(render).not.toHaveBeenCalled(); expect(chatAttachmentActions(root)).toBeNull();
  first.destroy(); expect(chatAttachmentActions(replacement)).not.toBeNull(); next.destroy(); refresh.mockClear();
  window.dispatchEvent(new Event('getbased:chat-backend-changed')); expect(refresh).not.toHaveBeenCalled();
});
it('acquires OS drop handles synchronously and routes pasted images through capability-aware file handling', () => {
  const root = document.createElement('div'); root.className = 'chat-panel-conversation';
  const input = document.createElement('textarea'); input.id = 'chat-input'; root.appendChild(input); document.body.replaceChildren(root);
  const source = {} as DataTransfer, drop = vi.fn(async () => { }), files = vi.fn(async () => { }); configureChatAttachmentActions({ drop, files, remove: vi.fn() }, vi.fn());
  dropChatAttachments(root, source); expect(drop).toHaveBeenCalledWith(source);
  const file = new File(['bytes'], 'image.png', { type: 'image/png' }), event = new Event('paste', { cancelable: true }) as ClipboardEvent;
  Object.defineProperty(event, 'clipboardData', { value: { items: [{ type: file.type, getAsFile: () => file }] } });
  pasteChatAttachments(input, event); expect(event.defaultPrevented).toBe(true); expect(files).toHaveBeenCalledWith([file]);
  input.remove(); files.mockClear(); pasteChatAttachments(input, event); expect(files).not.toHaveBeenCalled();
});
it('rejects active content and opaque URLs while preserving supported image sources', () => {
  for (const url of ['javascript:alert(1)', 'data:text/html,Hi', 'data:image/svg+xml,<svg/>', 42, '//remote/asset']) expect(chatAttachmentImageURL(url)).toBeUndefined();
  for (const url of ['data:image/png;base64,abc', 'blob:local', 'https://example.test/a.png', '/images/a.png']) expect(chatAttachmentImageURL(url)).toBe(url);
});
it('releases lightbox focus/scroll resources after external host removal', async () => {
  const { openChatImageLightbox } = await import('../js/chat-image-lightbox-component.js');
  const trigger = document.createElement('button'); document.body.replaceChildren(trigger); trigger.focus(); const overflow = document.body.style.overflow;
  openChatImageLightbox('data:image/png;base64,abc'); expect(document.querySelectorAll('.chat-lightbox')).toHaveLength(1);
  expect(document.body.style.overflow).toBe('hidden');
  document.querySelector('[data-chat-image-lightbox-host]')!.remove(); await Promise.resolve();
  expect(document.body.style.overflow).toBe(overflow); expect(document.querySelector('.chat-lightbox')).toBeNull();
  openChatImageLightbox('data:image/png;base64,abc'); openChatImageLightbox('data:image/png;base64,xyz');
  expect(document.querySelectorAll('.chat-lightbox')).toHaveLength(1);
  document.querySelector<HTMLButtonElement>('.chat-lightbox-close')!.click(); expect(document.body.style.overflow).toBe(overflow);
});
