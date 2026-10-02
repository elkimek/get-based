import type * as Cashu from '@cashu/cashu-ts';
import type { EncryptedEnvelopeCheck, PassphraseEnvelope } from './wearable-storage-types.js';

export type WalletProof = Cashu.ProofLike & { _mint?: string };
export type StoredProof = (WalletProof & { _payload?: null }) | { secret: string; _payload: PassphraseEnvelope };
export interface StoredMeta { key: string; value?: unknown; _payload?: PassphraseEnvelope }
export interface WalletStorageRows { proofs: StoredProof; 'fee-proofs': StoredProof; meta: StoredMeta }
export type StorageMode = 'plain' | 'encrypted';
export type CashuStorageSdk = Pick<typeof Cashu, 'OutputData' | 'Mint'>;
export type StorageWallet = Pick<Cashu.Wallet, 'ops' | 'prepareMint' | 'completeMint' | 'checkMintQuoteBolt11' | 'groupProofsByState' | 'keyChain'> & {
  validateReturnedSignatures?: (signatures: Cashu.SerializedBlindedSignature[], outputs: Cashu.OutputDataLike[]) => void;
};
export interface CashuWalletStoreRuntime {
  getMintUrl(): Promise<string>;
  getWallet(mint: string): Promise<StorageWallet>;
  cashuLib(): Promise<CashuStorageSdk>;
  sumProofsAsNumber(sdk: CashuStorageSdk, proofs: WalletProof[]): number;
  resetWallet?: () => void;
}
export interface CashuWalletStoreCryptoDeps {
  encryptObject(value: unknown): Promise<PassphraseEnvelope | null>;
  decryptObject(value: unknown): Promise<unknown>;
  isEncryptedObject(value: unknown): EncryptedEnvelopeCheck;
  getEncryptionEnabled(): boolean;
  encryptedGetItem(key: string): Promise<string | null>;
  encryptedSetItem(key: string, value: string): Promise<unknown>;
}
export interface ProofCommit { meta?: Record<string, unknown>; feeProofs?: WalletProof[]; deleteKeys?: string[] }
export type SwapOperation = 'receive' | 'fee' | 'deposit' | 'withdraw' | 'send';
export interface SwapContext extends Record<string, unknown> {
  journalKey?: string;
  incomingToken?: string;
  incomingAmount?: unknown;
}
interface JournalBase extends SwapContext {
  version: number; mint: string; createdAt: number; keysetId: string;
  localInputs: WalletProof[]; outputs: Cashu.SerializedOutputData[];
}
export interface SwapJournal extends JournalBase {
  operation: SwapOperation;
  inputs: WalletProof[];
  unselectedProofs: WalletProof[];
  sendOutputCount: number;
}
export interface MintJournal extends JournalBase { operation: 'mint'; quoteId: string; pendingKey: string }
export type DurableJournal = SwapJournal | MintJournal;
export type PreparedSwap = Pick<Cashu.SwapPreview, 'inputs' | 'unselectedProofs' | 'keysetId' | 'sendOutputs' | 'keepOutputs'>;
export interface WalletMintBalance { mint: string; balance: number; feeBalance: number }
export interface StorageChange<Row> { previousKey: string; next: Row }

export interface PendingTokenView {
  mint?: unknown; incomingToken?: unknown; incomingAmount?: unknown;
  token?: unknown; recoveryToken?: unknown;
}
export interface PendingDeposit extends Record<string, unknown> {
  nodeUrl: string; token: string; recoveryToken?: string; localCommit?: boolean;
  existingKey?: string; candidateKey?: string; submitted?: boolean; completed?: boolean; apiKey?: string;
}
export interface FundingPoll extends Record<string, unknown> {
  paused?: unknown; failures?: unknown; retryAt?: unknown; nextAt?: unknown; attempts?: unknown;
}
export interface ApprovedWithdraw { mint: string; invoice: string; amount: number; feeReserve: number }
export interface FeeMeltJournal { mint: string; quoteId: string; outputs: Cashu.SerializedOutputData[]; inputs: WalletProof[] }
export interface NodeRefund { nodeUrl: string; key: string; createdAt: number; token?: string }

export interface RecoveryResult { recovered: number; pending: boolean; notSubmitted?: boolean; error?: string }
