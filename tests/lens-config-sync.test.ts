import { beforeEach, expect, it } from 'vitest';
import { applyAISettings } from '../js/sync-apply.js';
import { collectAISettings } from '../js/sync-payload-collectors.js';
import { getBlob, setBlob } from '../js/blob-storage.js';
import { replaceLensConfigRaw, LENS_CONFIG_STORAGE_KEY as key, LENS_CONFIG_COMMIT_KEY as receiptKey } from '../js/lens-config-store.js';
const initial = JSON.stringify({ enabled: true, backend: 'external-server', topK: 5, multiQuery: true, url: 'https://synthetic.invalid/query', name: 'Synthetic source' });
beforeEach(async () => { localStorage.clear(); await replaceLensConfigRaw(initial); });
it('applies a selected remote configuration through the acknowledged shared owner', async () => {
  const remote = JSON.stringify({ ...JSON.parse(initial), topK: 3, multiQuery: false });
  await applyAISettings({ [key]: remote }, { preferRemote: true }); expect(localStorage.getItem(key)).toBe(remote); expect(await getBlob(receiptKey)).toMatchObject({ version: 1, raw: remote });
  const outgoing = await collectAISettings(); expect(outgoing[key]).toBe(remote); expect(outgoing).not.toHaveProperty(receiptKey);
});
it('collects fresh committed settings when a renderer has not received the peer Storage event', async () => {
  const remote = JSON.stringify({ ...JSON.parse(initial), enabled: false }); await setBlob(receiptKey, { version: 1, id: 'synthetic-peer', raw: remote }); expect(localStorage.getItem(key)).toBe(initial);
  const outgoing = await collectAISettings(); expect(outgoing[key]).toBe(remote); expect(localStorage.getItem(key)).toBe(remote); expect(outgoing).not.toHaveProperty(receiptKey);
});
