declare const Buffer: {
  from(value: ArrayBuffer | ArrayLike<number> | string, encoding?: string): {
    toString(encoding?: string): string;
  };
};

interface Window {
  _demoLoadingProfileId?: string;
  _snpTableCache?: unknown;
  buildSidebar?: () => void;
  callClaudeAPI?: (request: {
    system?: string;
    messages: Array<{ role: string; content: string }>;
    maxTokens?: number;
  }) => Promise<{ text?: string }> | { text?: string };
  cashuDestroyWalletDB?: () => Promise<void> | void;
  cashuGetMintUrl?: () => Promise<string | null> | string | null;
  cashuRestoreWalletFromSeed?: (seed: string) => Promise<void> | void;
  cashuSetMintUrl?: (url: string) => Promise<void> | void;
  destroyAllCharts?: () => void;
  ensureActiveThread?: () => void;
  getInitialView?: () => string;
  getProfileHeight?: (profileId: string) => { height?: number | string | null; unit?: string | null };
  isDebugMode?: () => boolean;
  loadChatHistory?: () => Promise<void> | void;
  loadChatPersonality?: () => void;
  loadChatThreads?: () => void;
  navigate?: (route: string) => void;
  nostrGetSelectedNode?: () => string | null;
  nostrSetSelectedNode?: (url: string) => void;
  renderProfileButton?: () => void;
  renderThreadList?: () => void;
  showConfirmDialog?: (message: string) => Promise<boolean> | boolean;
  showNotification?: (message: string, type?: string, timeoutMs?: number) => void;
  updateChatHeaderTitle?: () => void;
  updateDiscussButton?: () => void;
  updateHeaderDates?: () => void;
  updateHeaderRangeToggle?: () => void;
  updatePersonalityBar?: () => void;
}
