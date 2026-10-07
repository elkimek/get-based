// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { presentProviderStatus } from '../js/provider-status-component.js';
afterEach(() => document.body.replaceChildren());
it('preserves the public status container and child identity while updating escaped accessible text', () => {
  const host = document.body.appendChild(document.createElement('span')); host.id = 'routstr-node-balance';
  presentProviderStatus(host, { text: 'Balance: 10 sats', tone: 'primary' }, { emphasis: true }); const root = host.firstElementChild;
  presentProviderStatus(host, { text: '<svg onload=unsafe>', tone: 'warning' });
  expect(document.getElementById('routstr-node-balance')).toBe(host); expect(host.firstElementChild).toBe(root); expect(host.querySelector('svg,[onload]')).toBeNull(); expect(root?.getAttribute('role')).toBe('status'); expect(root?.textContent).toBe('<svg onload=unsafe>'); expect(root?.className).toContain('text-warning');
});
it('rejects obsolete status ports after the root is replaced or removed', () => {
  const host = document.body.appendChild(document.createElement('span')); const old = presentProviderStatus(host, { text: 'Original', tone: 'secondary' });
  host.replaceChildren(); const next = presentProviderStatus(host, { text: 'New', tone: 'success' }); old.setStatus({ text: 'STALE', tone: 'danger' });
  expect(old.isCurrent()).toBe(false); expect(host.textContent).toBe('New'); host.remove(); next.setStatus({ text: 'DETACHED', tone: 'danger' }); expect(host.textContent).toBe('New');
});
it('keeps the passive mint label monospace without unsolicited announcements', () => {
  const host = document.body.appendChild(document.createElement('span')); presentProviderStatus(host, { text: 'mint.synthetic.test', tone: 'secondary' }, { monospace: true, announce: false });
  expect(host.firstElementChild?.getAttribute('role')).toBeNull(); expect(host.firstElementChild?.className).toContain('font-mono');
});
