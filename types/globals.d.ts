declare const Buffer: {
  from(value: ArrayBuffer | ArrayLike<number> | string, encoding?: string): {
    toString(encoding?: string): string;
  };
};

interface Window {
  _demoLoadingProfileId?: string;
  _snpTableCache?: unknown;
  buildSidebar?: () => void;
  cashuDestroyWalletDB?: () => Promise<void> | void;
  cashuGetMintUrl?: () => Promise<string | null> | string | null;
  cashuRestoreWalletFromSeed?: (seed: string) => Promise<void> | void;
  cashuSetMintUrl?: (url: string) => Promise<void> | void;
  getProfileHeight?: (profileId: string) => { height?: number | string | null; unit?: string | null };
  loadChatThreads?: () => void;
  navigate?: (route: string) => void;
  nostrGetSelectedNode?: () => string | null;
  nostrSetSelectedNode?: (url: string) => void;
  renderProfileButton?: () => void;
  updateHeaderDates?: () => void;
}
