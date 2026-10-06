export interface AiDialogOption {
  id: string;
  label: string;
  description: string;
  icon: string;
  recommended?: boolean;
  recommendation?: string;
}
export interface AiDialogContent {
  overlayId: 'ai-needed-overlay' | 'or-no-balance-overlay';
  ariaLabel: string;
  title: string;
  description: string;
  options: readonly AiDialogOption[];
  cancelId: string;
}
export interface AiDialogActions {
  choose(id: string): unknown;
  close(): void;
  retryStyles(): void;
}
export interface AiDialogComponentView { setStyleError(failed: boolean): void; }
