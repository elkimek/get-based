import { getErrorMessage } from './caught-error.js';
import {
  PENDING_SWAP_KEY, _amountToNumber, _counterNamespaceForSeed, _createCounterSource,
  _deleteMeta, _getAllProofs, _getMeta, _getMetaEntries, _getWalletMintInventory,
  _loadMnemonic, _normalizeMintUrl, _replaceProofs, _saveMnemonic,
} from './cashu-wallet-store.js';
import type { Bip39Runtime, CashuRuntime } from './cashu-wallet-runtime-types.js';
import type { DurableJournal, PendingDeposit, WalletProof } from './cashu-wallet-storage-types.js';

export const SEED_RESTORE_KEY = 'pendingSeedRestore';

export async function restoreSeedProofs(mnemonic: string, { bip39, cashuts, getMintUrl }: {
  bip39: Bip39Runtime;
  cashuts: CashuRuntime;
  getMintUrl: () => Promise<string>;
}) {
  const valid = await bip39.validateMnemonic(mnemonic);
  if (!valid) throw new Error('Invalid mnemonic — check your words');
  const pendingRestore = await _getMeta<{ mnemonic: string; mintUrl: string; restoredCount: number }>(SEED_RESTORE_KEY);
  if (pendingRestore) {
    if (pendingRestore.mnemonic !== mnemonic) throw new Error('Retry with the same seed to finish the interrupted wallet restore.');
    await _saveMnemonic(mnemonic);
    await _deleteMeta(SEED_RESTORE_KEY);
    return { balance: _amountToNumber(cashuts.sumProofs(await _getAllProofs(pendingRestore.mintUrl))), restoredCount: pendingRestore.restoredCount };
  }
  const mintUrl = _normalizeMintUrl(await getMintUrl());
  const currentMnemonic = await _loadMnemonic();
  if (currentMnemonic && currentMnemonic !== mnemonic) {
    const [proofs, feeProofs, pendingQuotes, pendingDeposit, pendingWithdraw, pendingSwap] = await Promise.all([
      _getWalletMintInventory().then(mints => mints.filter(mint => mint.balance > 0)),
      _getWalletMintInventory().then(mints => mints.filter(mint => mint.feeBalance > 0)),
      _getMetaEntries('pending').then(entries => entries.filter(entry => entry.value)),
      (_getMeta('pendingDeposit') as Promise<PendingDeposit | string | null>),
      (_getMeta('pendingWithdraw') as Promise<string | null>),
      (_getMeta(PENDING_SWAP_KEY) as Promise<DurableJournal | null>),
    ]);
    if (proofs.length || feeProofs.length || pendingQuotes.length || pendingDeposit || pendingWithdraw || pendingSwap) {
      throw new Error('Cannot replace the wallet seed while funds or recovery records exist. Back up and empty this wallet first.');
    }
  }

  const seed = await bip39.mnemonicToSeed(mnemonic);
  const counterSource = _createCounterSource(
    await _counterNamespaceForSeed(seed),
    !currentMnemonic || currentMnemonic === mnemonic
  );
  const wallet = new cashuts.Wallet(mintUrl, { bip39seed: seed, counterSource });
  await wallet.loadMint();

  const restoredBySecret = new Map<string, WalletProof>();
  const keysets = wallet.keyChain.getKeysets();
  const failures: string[] = [];
  let completedScans = 0;
  for (const keyset of keysets) {
    try {
      const result = await wallet.batchRestore(300, 300, 0, keyset.id);
      completedScans += 1;
      if (result.lastCounterWithSignature != null) {
        await wallet.counters.advanceToAtLeast(keyset.id, result.lastCounterWithSignature + 1);
      }
      for (const proof of result.proofs || []) restoredBySecret.set(proof.secret, proof);
    } catch (e) {
      failures.push(`${keyset.id}: ${getErrorMessage(e, String(e))}`);
    }
  }
  if (!completedScans) {
    throw new Error('Wallet restore failed without changing local funds' + (failures[0] ? ': ' + failures[0] : ''));
  }
  if (failures.length) {
    throw new Error('Wallet restore was incomplete and made no proof changes: ' + failures[0]);
  }

  const restored = Array.from(restoredBySecret.values());
  const { unspent } = restored.length
    ? await wallet.groupProofsByState(restored)
    : { unspent: [] };
  const totalRestored = _amountToNumber(cashuts.sumProofs(unspent));
  await _replaceProofs([], unspent, mintUrl, { meta: {
    [SEED_RESTORE_KEY]: { mnemonic, mintUrl, restoredCount: totalRestored },
  } });
  await _saveMnemonic(mnemonic);
  await _deleteMeta(SEED_RESTORE_KEY);
  const balance = _amountToNumber(cashuts.sumProofs(await _getAllProofs(mintUrl)));
  return { balance, restoredCount: totalRestored };
}
