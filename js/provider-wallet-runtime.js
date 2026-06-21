// @ts-check
// provider-wallet-runtime.js - Cashu/Nostr dependencies for Routstr wallet panels

import {
  checkProofStates as cashuCheckProofStates,
  createFundingInvoice as cashuCreateFundingInvoice,
  checkFundingStatus as cashuCheckFundingStatus,
  createWithdrawQuote as cashuCreateWithdrawQuote,
  depositToNode as cashuDepositToNode,
  executeWithdraw as cashuExecuteWithdraw,
  exportWallet as cashuExportWallet,
  generateWalletSeed as cashuGenerateWalletSeed,
  getFeePct as cashuGetFeePct,
  getMintUrl as cashuGetMintUrl,
  getWalletBalance as cashuGetBalance,
  getWalletMnemonic as cashuGetWalletMnemonic,
  hasWalletSeed as cashuHasWalletSeed,
  importWallet as cashuImportWallet,
  receiveToken as cashuReceiveToken,
  recoverPendingDeposit as cashuRecoverPendingDeposit,
  restoreWalletFromSeed as cashuRestoreWalletFromSeed,
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
  cashuCheckProofStates,
  cashuCreateFundingInvoice,
  cashuCheckFundingStatus,
  cashuCreateWithdrawQuote,
  cashuDepositToNode,
  cashuExecuteWithdraw,
  cashuExportWallet,
  cashuGenerateWalletSeed,
  cashuGetBalance,
  cashuGetFeePct,
  cashuGetMintUrl,
  cashuGetWalletMnemonic,
  cashuHasWalletSeed,
  cashuImportWallet,
  cashuReceiveToken,
  cashuRecoverPendingDeposit,
  cashuRestoreWalletFromSeed,
  cashuSendAsToken,
  cashuSetMintUrl,
  cashuWithdrawToAddress,
  nostrDiscoverNodes,
  nostrGetSelectedNode,
  nostrSetSelectedNode,
};

export const walletRuntime = { ...walletRuntimeDefaults };

export function configureRoutstrWalletRuntime(overrides = {}) {
  for (const key of Object.keys(walletRuntime)) {
    if (!Object.prototype.hasOwnProperty.call(walletRuntimeDefaults, key)) delete walletRuntime[key];
  }
  Object.assign(walletRuntime, walletRuntimeDefaults, overrides);
}
