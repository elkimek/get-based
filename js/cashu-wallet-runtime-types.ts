import type * as Cashu from '@cashu/cashu-ts';
import type { WalletProof } from './cashu-wallet-storage-types.js';
export type CashuRuntime = typeof Cashu;
export interface Bip39Runtime {
  generateMnemonic(strength?: number): Promise<string>;
  validateMnemonic(mnemonic: string): Promise<boolean>;
  mnemonicToSeed(mnemonic: string, passphrase?: string): Promise<Uint8Array<ArrayBuffer>>;
}
export interface FundingOptions {
  automatic?: boolean | undefined; notified?: boolean | undefined;
  subscribed?: boolean | undefined; shouldContinue?: (() => boolean) | undefined;
}
export interface RecoverFundingOptions extends Omit<FundingOptions, 'notified' | 'subscribed'> {
  notified?: { mint: string; quote: string }[];
  subscribedMints?: string[];
}
export type FundingResult =
  | { paid: true; state?: undefined; minted: number; fee: number; balance: number; recoveredFromJournal?: boolean }
  | { paid: false; state: string; retryAfterMs?: number };
export interface PendingWithdraw {
  quoteId: string | null; token?: string; recoveryToken?: string;
  localCommit?: boolean; mint?: string; savedAt?: number; source?: string;
  meltOutputs?: Cashu.SerializedOutputData[];
}
export type MeltQuote = Awaited<ReturnType<Cashu.Wallet['checkMeltQuoteBolt11']>> & { request?: string };
export interface CashuWalletTransferDeps {
  cashuLib: null | (() => Promise<CashuRuntime>);
  encodeRecoveryToken: null | ((sdk: CashuRuntime, mint: string | undefined, proofs: WalletProof[]) => string);
  extractTokenMintUrl: null | ((sdk: CashuRuntime, token: string) => string | null);
  getMintUrl: null | (() => Promise<string>);
  getWallet: null | ((mint?: string) => Promise<Cashu.Wallet>);
  getWalletBalance: null | (() => Promise<number>);
  sumProofsAsNumber: null | ((sdk: Pick<CashuRuntime, 'sumProofs'>, proofs: WalletProof[]) => number);
  withWalletLock: null | (<Value>(operation: () => Promise<Value>) => Promise<Value>);
}
