export interface ChatThreadRow {
  id: string; name: string; date: string; icon: string; personalityName: string;
  active: boolean; messageCount: number; pinned: boolean; projectName: string;
}
export interface ChatThreadGroup { id: string; label: string; icon: 'pin' | 'folder' | null; projectName: string | null; threads: ChatThreadRow[] }
export interface ChatThreadNavigationState { query: string; groups: ChatThreadGroup[]; projects: string[]; empty: boolean }
export interface ChatThreadSearchResult {
  threadId: string; threadName: string; msgIndex: number; role: unknown;
  pre: string; match: string; post: string; contentPrefix: string;
}
export interface ChatThreadSearchState { phase: 'idle' | 'pending' | 'done'; progress: string; results: ChatThreadSearchResult[]; truncated: boolean }
export interface ChatThreadNavigationActions {
  switch(id: string): unknown; pin(id: string): unknown; rename(id: string): unknown; delete(id: string): unknown;
  move(id: string, project: string): unknown; renameProject(project: string): unknown; deleteProject(project: string): unknown;
  jump(result: ChatThreadSearchResult): unknown;
}
export interface ChatThreadNavigationComponentView {
  setState(next: ChatThreadNavigationState): void;
  setSearch(next: ChatThreadSearchState): void;
  clear(): void;
}
export interface ChatThreadNavigationView extends ChatThreadNavigationComponentView { isCurrent(): boolean }
