// @ts-check
// export-runtime.js - Browser runtime adapters for export/import flows.

function getRuntimeWindow() {
  return typeof window !== 'undefined'
    ? /** @type {any} */ (window)
    : /** @type {any} */ (globalThis);
}

export async function getWalletBundleSettings() {
  const runtime = getRuntimeWindow();
  const mintUrl = typeof runtime.cashuGetMintUrl === 'function'
    ? await runtime.cashuGetMintUrl()
    : null;
  const nodeUrl = typeof runtime.nostrGetSelectedNode === 'function'
    ? runtime.nostrGetSelectedNode()
    : null;
  return { mintUrl, nodeUrl };
}

export async function restoreWalletBundleSettings(wallet) {
  if (!wallet) return;
  const runtime = getRuntimeWindow();
  if (wallet.mnemonic && typeof runtime.cashuRestoreWalletFromSeed === 'function') {
    await runtime.cashuRestoreWalletFromSeed(wallet.mnemonic);
  }
  if (wallet.mintUrl && typeof runtime.cashuSetMintUrl === 'function') {
    await runtime.cashuSetMintUrl(wallet.mintUrl);
  }
  if (wallet.nodeUrl && typeof runtime.nostrSetSelectedNode === 'function') {
    runtime.nostrSetSelectedNode(wallet.nodeUrl);
  }
}

export async function destroyWalletRuntimeDB() {
  const runtime = getRuntimeWindow();
  if (typeof runtime.cashuDestroyWalletDB !== 'function') return;
  await runtime.cashuDestroyWalletDB();
}

export function markDemoLoadingProfile(profileId) {
  getRuntimeWindow()._demoLoadingProfileId = profileId;
}

export function isDemoLoadingProfile(profileId) {
  return getRuntimeWindow()._demoLoadingProfileId === profileId;
}

export function clearDemoLoadingProfile(profileId) {
  const runtime = getRuntimeWindow();
  if (profileId && runtime._demoLoadingProfileId !== profileId) return;
  delete runtime._demoLoadingProfileId;
}

export async function refreshImportRuntimeShell(options = {}) {
  const { chat = false, profileButton = false, route = 'dashboard' } = options;
  const [
    chatThreads,
    nav,
    data,
    views,
  ] = await Promise.all([
    chat ? import('./chat-threads.js').catch(() => null) : Promise.resolve(null),
    import('./nav.js').catch(() => null),
    import('./data.js').catch(() => null),
    import('./views.js').catch(() => null),
  ]);

  chatThreads?.loadChatThreads?.();
  nav?.buildSidebar?.();
  data?.updateHeaderDates?.();
  if (profileButton) nav?.renderProfileButton?.();
  views?.navigate?.(route);
}

export function publishExportGlobals(api) {
  Object.assign(getRuntimeWindow(), api);
}
