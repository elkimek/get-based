declare const Buffer: {
  from(value: ArrayBuffer | ArrayLike<number> | string, encoding?: string): {
    toString(encoding?: string): string;
  };
};

interface Window {
  _demoLoadingProfileId?: string;
  _snpTableCache?: unknown;
  APP_VERSION?: string;
  applyAccentOverride?: () => void;
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
  detectDNAFile?: (header: string) => string | null;
  ensureActiveThread?: () => void;
  exportAllDataJSON?: () => Promise<void> | void;
  exportClientJSON?: (profileId: string, includeChat?: boolean) => Promise<void> | void;
  getInitialView?: () => string;
  getProfileHeight?: (profileId: string) => { height?: number | string | null; unit?: string | null };
  HAPLOGROUP_LIST?: string[];
  hasAIProvider?: () => boolean;
  _labState?: { currentProfile?: string | null };
  handleDNAFile: (file: File) => Promise<void> | void;
  handleMtDNAFile?: (file: File) => Promise<void> | void;
  importDataJSON: (file: File) => Promise<void> | void;
  isDebugMode?: () => boolean;
  isImportRunning?: () => boolean;
  loadDemoData?: (sex?: string) => Promise<void> | void;
  loadChatHistory?: () => Promise<void> | void;
  loadChatPersonality?: () => void;
  loadChatThreads?: () => void;
  JSZip?: {
    loadAsync(input: ArrayBuffer | Blob): Promise<{
      files: Record<string, {
        dir: boolean;
        name: string;
        async(type: 'blob'): Promise<Blob>;
      }>;
    }>;
  };
  mammoth?: {
    extractRawText(input: { arrayBuffer: ArrayBuffer }): Promise<{ value?: string }>;
  };
  navigate?: (route: string) => void;
  nostrGetSelectedNode?: () => string | null;
  nostrSetSelectedNode?: (url: string) => void;
  openClientList?: () => void;
  closeClientList?: () => void;
  pdfjsLib?: unknown;
  openProfileShareModal?: (profileId?: string) => void;
  refreshChartThemeColors?: (options?: { batchSize?: number }) => void;
  refreshSettingsWearables?: () => void;
  renderProfileButton?: () => void;
  renderThreadList?: () => void;
  scheduleChartThemeRefresh?: () => void;
  setManualHaplogroup?: (haplogroup: string) => Promise<void> | void;
  showConfirmDialog?: (message: string) => Promise<boolean> | boolean;
  showNotification?: (message: string, type?: string, timeoutMs?: number) => void;
  _fitbitAuth?: unknown;
  _ouraAuth?: unknown;
  _polarAuth?: unknown;
  _ultrahumanAuth?: unknown;
  _whoopAuth?: unknown;
  _withingsAuth?: unknown;
  updateChatHeaderTitle?: () => void;
  updateDiscussButton?: () => void;
  updateHeaderDates?: () => void;
  updateHeaderRangeToggle?: () => void;
  updatePersonalityBar?: () => void;
  updateSettingsUI?: () => void;
  updateTweaksUI?: () => void;
}
