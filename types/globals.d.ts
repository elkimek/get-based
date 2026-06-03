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
  exportAllDataJSON?: () => Promise<void> | void;
  exportClientJSON?: (profileId: string, includeChat?: boolean) => Promise<void> | void;
  getInitialView?: () => string;
  getProfileHeight?: (profileId: string) => { height?: number | string | null; unit?: string | null };
  HAPLOGROUP_LIST?: string[];
  hasAIProvider?: () => boolean;
  importDataJSON?: (file: File) => Promise<void> | void;
  isDebugMode?: () => boolean;
  loadDemoData?: (sex?: string) => Promise<void> | void;
  loadChatHistory?: () => Promise<void> | void;
  loadChatPersonality?: () => void;
  loadChatThreads?: () => void;
  navigate?: (route: string) => void;
  nostrGetSelectedNode?: () => string | null;
  nostrSetSelectedNode?: (url: string) => void;
  openClientList?: () => void;
  closeClientList?: () => void;
  openProfileShareModal?: (profileId?: string) => void;
  renderProfileButton?: () => void;
  renderThreadList?: () => void;
  setManualHaplogroup?: (haplogroup: string) => Promise<void> | void;
  showConfirmDialog?: (message: string) => Promise<boolean> | boolean;
  showNotification?: (message: string, type?: string, timeoutMs?: number) => void;
  updateChatHeaderTitle?: () => void;
  updateDiscussButton?: () => void;
  updateHeaderDates?: () => void;
  updateHeaderRangeToggle?: () => void;
  updatePersonalityBar?: () => void;
}
