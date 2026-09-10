import { beforeAll, beforeEach, afterAll, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { IDBFactory } from 'fake-indexeddb';
import * as store from '../js/cashu-wallet-store.js';
import { getCashuWalletStoreCryptoDeps } from '../js/crypto.js';
const oldSdk = globalThis.cashuts;
let sdk, wallet, mintKeys, keys, signedOutputs, failBeforeSwap;
const MINT = 'https://mint.synthetic.test';
function sign(output) {
  const signature = sdk.createBlindSignature(sdk.pointFromHex(output.B_), mintKeys.privKeys[String(output.amount)], mintKeys.keysetId);
  return { id: signature.id, amount: sdk.Amount.from(output.amount), C_: signature.C_.toHex(true) };
}
function makeProof(amount) {
  const output = sdk.OutputData.createSingleRandomData(amount, mintKeys.keysetId);
  return output.toProof(sign(output.blindedMessage), wallet.keyChain.getKeyset(mintKeys.keysetId));
}
beforeAll(async () => {
  (0, eval)(await readFile(new URL('../vendor/cashu-ts.js', import.meta.url), 'utf8'));
  sdk = globalThis.cashuts;
  mintKeys = sdk.createNewMintKeys(8, new Uint8Array(32).fill(1));
  keys = sdk.serializeMintKeys(mintKeys.pubKeys);
});
afterAll(() => { globalThis.cashuts = oldSdk; });
beforeEach(() => {
  localStorage.clear(); globalThis.indexedDB = new IDBFactory();
  signedOutputs = new Map(); failBeforeSwap = false;
  wallet = new sdk.Wallet(MINT);
  wallet.loadMintFromCache({ name: 'Synthetic mint', nuts: {} }, { keysets: [{ id: mintKeys.keysetId, unit: 'sat', active: true, input_fee_ppk: 0, keys }] });
  wallet.mint.swap = async ({ outputs }) => {
    if (failBeforeSwap) throw new Error('offline before submission');
    const signatures = outputs.map(sign);
    outputs.forEach((output, i) => signedOutputs.set(output.B_, signatures[i]));
    return { signatures };
  };
  class RecoveryMint {
    async restore({ outputs }) {
      const found = outputs.filter(o => signedOutputs.has(o.B_));
      return { outputs: found, signatures: found.map(o => signedOutputs.get(o.B_)) };
    }
  }
  store.configureCashuWalletStoreCryptoDeps(getCashuWalletStoreCryptoDeps());
  store.configureCashuWalletStore({ getMintUrl: async () => MINT, getWallet: async () => wallet,
    cashuLib: async () => ({ ...sdk, Mint: RecoveryMint }), sumProofsAsNumber: (s, proofs) => Number(s.sumProofs(proofs)) });
});
it('round-trips real SDK prepared sends through JSON and restores valid signatures without losing unselected proofs', async () => {
  const proofs = [makeProof(16), makeProof(32), makeProof(64)];
  await store._saveProofs(proofs, MINT);
  const prepared = await store._prepareDurableSwap(wallet, sdk, 'send', MINT, wallet.ops.send(4, proofs).includeFees(true), proofs);
  expect(prepared.preview.unselectedProofs.length).toBeGreaterThan(0);
  await wallet.completeSwap(prepared.preview); // crash before local commit
  expect(await store._recoverPendingSwapUnlocked()).toMatchObject({ pending: false });
  const recovered = await store._getAllProofs(MINT);
  expect(Number(sdk.sumProofs(recovered))).toBe(112);
  for (const untouched of prepared.preview.unselectedProofs) expect(recovered.some(p => p.secret === untouched.secret)).toBe(true);
  // Re-encoding and decoding uses the shipped token codec and Amount boundary.
  const decoded = sdk.getDecodedToken(sdk.getEncodedToken({ mint: MINT, proofs: recovered }), [mintKeys.keysetId]);
  expect(Number(sdk.sumProofs(decoded.proofs))).toBe(112);
});
it('replays an incoming prepared operation using the same real SDK outputs and normalized inputs', async () => {
  const token = sdk.getEncodedToken({ mint: MINT, proofs: [makeProof(16)] });
  const first = await store._prepareDurableSwap(wallet, sdk, 'receive', MINT, wallet.ops.receive(token), [], { journalKey: 'pendingReceive:test', incomingToken: token });
  failBeforeSwap = true;
  await expect(wallet.completeSwap(first.preview)).rejects.toThrow('offline');
  const stored = await store._getMeta('pendingReceive:test');
  const resumed = store._resumeDurableSwap(sdk, JSON.parse(JSON.stringify(stored)));
  expect(resumed.keepOutputs.map(o => o.blindedMessage.B_)).toEqual(first.preview.keepOutputs.map(o => o.blindedMessage.B_));
  failBeforeSwap = false;
  const result = await wallet.completeSwap(resumed);
  expect(Number(sdk.sumProofs(result.keep))).toBe(16);
  expect(result.keep.every(p => typeof p.C === 'string' && p.C.length === 66)).toBe(true);
});
