// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { projectChatContext, projectChatSummary, projectChatTitle } from '../js/chat-header-contract.js';
import { projectAttestationBadge, attestationTooltip } from '../js/chat-attestation-presentation.js';
import { ownChatHeader, configureChatHeaderRefresh, renderChatHeader, configureChatHeaderActions, chatHeaderActions } from '../js/chat-header-view.js';

describe('Chat header projections', () => {
  it('retains distinct perspective names and literal custom metadata', () => {
    const history = [{ role: 'assistant', personalityName: '<img>', personalityIcon: '🌿' }, { role: 'assistant', personalityName: 'House' }, { role: 'assistant', personalityName: 'House' }, { role: 'user', personalityName: 'Ignored' }];
    expect(projectChatTitle(history, 'Current')).toEqual({ title: '🌿 <img> + 1 perspective', titleDescription: '🌿 <img>,  House' });
    expect(projectChatTitle(history.slice(0, 1), 'Current')).toEqual({ title: 'Current' });
  });
  it('counts only eligible messages and permits existing summaries', () => {
    expect(projectChatSummary([{ hidden: true }, { joined: true }, {}, {}], null).canSummarize).toBe(false);
    expect(projectChatSummary([{}, {}, {}, {}], null).summaryLabel).toBe('Summarize this conversation');
    expect(projectChatSummary([], {})).toEqual({ hasSummary: true, canSummarize: true, summaryLabel: 'View summary' });
  });
  it('distinguishes active, pending and failed Knowledge Base and clears unavailable context', () => {
    expect(projectChatContext([], ['KB empty'], '', true)).toMatchObject({ pending: true, error: false, announcement: '' });
    const error = projectChatContext(['<Knowledge Base>', 'Lens'], [], '<failure>', true);
    expect(error.label).toBe('AI Context: <Knowledge Base> + Lens');
    expect(error.announcement).toContain('<failure>'); expect(error.error).toBe(true);
    expect(projectChatContext(['Lens'], [], 'failure', false).label).toBe('');
    expect(projectChatContext([], [], '', true).label).toBe('');
  });
  it.each([
    [{}, 'failed'], [{ nonceVerified: true, signingKeyBound: true }, 'basic'],
    [{ nonceVerified: true, signingKeyBound: true, dcapVerified: true }, 'TEE'],
    [{ nonceVerified: true, signingKeyBound: true, dcapVerified: true, gpuVerified: true, gpu: { tokensVerified: true } }, 'TEE + GPU'],
    [{ securityVerified: true }, 'verified'], [{ securityVerified: false }, 'failed'],
    [{ nonceVerified: true, signingKeyBound: true, debugMode: true }, 'failed'],
    [{ nonceVerified: true, signingKeyBound: true, errors: ['error'] }, 'failed'],
  ])('preserves receipt status without promoting claims: %j', (receipt, mark) => {
    expect(projectAttestationBadge(receipt)?.mark).toBe(mark);
  });
  it('preserves absent receipts and explicit verification limitations', () => {
    expect(projectAttestationBadge(null)).toBeNull(); expect(attestationTooltip(null)).toBe('TEE attestation: no data');
    const text = attestationTooltip({ nonceVerified: true, signingKeyBound: true, dcapVerified: true, gpuVerified: true, gpu: { tokensVerified: true } });
    expect(text).toContain('not proven to run together'); expect(text).toContain('source of each response is not independently verified'); expect(text).toContain('measurements are not independently checked');
  });
});

it('routes updates and actions only to the current header and releases replaced listeners', async () => {
  const root = () => { const div = document.createElement('div'); div.dataset.chatHeaderView = ''; div.innerHTML = '<span class="chat-header-model"></span>'; return div; };
  const first = root(); document.body.replaceChildren(first);
  const refresh = vi.fn(), oldRender = vi.fn(), nextRender = vi.fn(); configureChatHeaderRefresh(refresh);
  const old = ownChatHeader(first, oldRender, vi.fn()); await Promise.resolve(); refresh.mockClear();
  const act = vi.fn(); configureChatHeaderActions({ act, webSearch: vi.fn() });
  expect(chatHeaderActions(first)?.act('close')).toBeUndefined(); expect(act).toHaveBeenCalledOnce();
  const next = root(); document.body.replaceChildren(next); const owner = ownChatHeader(next, nextRender, vi.fn()); await Promise.resolve(); refresh.mockClear();
  first.querySelector('span')!.dispatchEvent(new Event('e2ee-attestation')); expect(refresh).not.toHaveBeenCalled();
  next.querySelector('span')!.dispatchEvent(new Event('e2ee-attestation')); expect(refresh).toHaveBeenCalledOnce();
  renderChatHeader({ title: 'Current' }); expect(nextRender).toHaveBeenCalledWith({ title: 'Current' }); expect(oldRender).not.toHaveBeenCalled(); expect(chatHeaderActions(first)).toBeNull();
  old.destroy(); expect(chatHeaderActions(next)).not.toBeNull(); owner.destroy(); refresh.mockClear();
  window.dispatchEvent(new Event('getbased:chat-backend-changed')); expect(refresh).not.toHaveBeenCalled(); expect(chatHeaderActions(next)).toBeNull();
});

it('disposes the shared tooltip when its host is removed and adopts a replacement once', async () => {
  const { installAttestationTooltips } = await import('../js/chat-attestation-component.js');
  document.body.replaceChildren();
  expect(installAttestationTooltips()).toBe(true);
  expect(installAttestationTooltips()).toBe(false);
  const badge = document.createElement('button');
  badge.className = 'e2ee-attestation-badge'; badge.dataset.attestationTooltip = '<literal receipt>';
  document.body.appendChild(badge); badge.focus();
  expect(document.getElementById('e2ee-attestation-tooltip')?.hidden).toBe(false);
  document.querySelector('[data-chat-attestation-host]')!.remove(); await Promise.resolve();
  expect(badge.getAttribute('aria-expanded')).toBe('false');
  expect(installAttestationTooltips()).toBe(true); expect(document.querySelectorAll('#e2ee-attestation-tooltip')).toHaveLength(1);
  badge.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
  expect(document.getElementById('e2ee-attestation-tooltip')?.textContent).toBe('<literal receipt>');
  document.querySelector('[data-chat-attestation-host]')!.remove(); await Promise.resolve();
});
