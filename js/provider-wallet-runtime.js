// @ts-check
// provider-wallet-runtime.js - Cashu/Nostr dependencies for Routstr wallet panels

import {
  refundNodeToToken as cashuRefundNodeToToken,
  finishNodeRefund as cashuFinishNodeRefund,
  getPendingNodeRefund as cashuGetPendingNodeRefund,
  checkProofStates as cashuCheckProofStates,
  createFundingInvoice as cashuCreateFundingInvoice,
  checkFundingStatus as cashuCheckFundingStatus,
  recoverPendingFunding as cashuRecoverPendingFunding,
  recoverPendingWalletOperation as cashuRecoverPendingWalletOperation,
  createWithdrawQuote as cashuCreateWithdrawQuote,
  depositToNode as cashuDepositToNode,
  executeWithdraw as cashuExecuteWithdraw,
  exportWallet as cashuExportWallet,
  generateWalletSeed as cashuGenerateWalletSeed,
  getFeePct as cashuGetFeePct,
  getMintUrl as cashuGetMintUrl,
  getWalletMints as cashuGetWalletMints,
  getMaxWithdrawable as cashuGetMaxWithdrawable,
  getWalletBalance as cashuGetBalance,
  getLocalWalletBalance as cashuGetLocalBalance,
  subscribeFundingQuotes as cashuSubscribeFundingQuotes,
  getWalletMnemonic as cashuGetWalletMnemonic,
  hasWalletSeed as cashuHasWalletSeed,
  importWallet as cashuImportWallet,
  receiveToken as cashuReceiveToken,
  recoverPendingDeposit as cashuRecoverPendingDeposit,
  clearPendingDeposit as cashuClearPendingDeposit,
  recoverPendingWithdraw as cashuRecoverPendingWithdraw,
  clearPendingWithdraw as cashuClearPendingWithdraw,
  restoreWalletFromSeed as cashuRestoreWalletFromSeed,
  savePendingWithdrawToken as cashuSavePendingWithdrawToken,
  sendAsToken as cashuSendAsToken,
  setMintUrl as cashuSetMintUrl,
  withdrawToAddress as cashuWithdrawToAddress,
} from './cashu-wallet.js';
import {
  discoverNodes as nostrDiscoverNodes,
  getSelectedNodeUrl as nostrGetSelectedNode,
  setSelectedNodeUrl as nostrSetSelectedNode,
} from './nostr-discovery.js';

const walletRuntimeDefaults = {
  cashuRefundNodeToToken, cashuFinishNodeRefund, cashuGetPendingNodeRefund,
  cashuCheckProofStates,
  cashuCreateFundingInvoice,
  cashuCheckFundingStatus,
  cashuRecoverPendingFunding,
  cashuRecoverPendingWalletOperation,
  cashuCreateWithdrawQuote,
  cashuDepositToNode,
  cashuExecuteWithdraw,
  cashuExportWallet,
  cashuGenerateWalletSeed,
  cashuGetBalance,
  cashuGetLocalBalance,
  cashuSubscribeFundingQuotes,
  cashuGetFeePct,
  cashuGetMintUrl,
  cashuGetWalletMints,
  cashuGetMaxWithdrawable,
  cashuGetWalletMnemonic,
  cashuHasWalletSeed,
  cashuImportWallet,
  cashuReceiveToken,
  cashuRecoverPendingDeposit,
  cashuClearPendingDeposit,
  cashuRecoverPendingWithdraw,
  cashuClearPendingWithdraw,
  cashuRestoreWalletFromSeed,
  cashuSavePendingWithdrawToken,
  cashuSendAsToken,
  cashuSetMintUrl,
  cashuWithdrawToAddress,
  nostrDiscoverNodes,
  nostrGetSelectedNode,
  nostrSetSelectedNode,
};

export const walletRuntime = { ...walletRuntimeDefaults };

export function configureRoutstrWalletRuntime(overrides = {}) {
  const previous = { ...walletRuntime };
  for (const key of Object.keys(walletRuntime)) {
    if (!Object.prototype.hasOwnProperty.call(walletRuntimeDefaults, key)) delete walletRuntime[key];
  }
  Object.assign(walletRuntime, walletRuntimeDefaults, overrides);
  return previous;
}
