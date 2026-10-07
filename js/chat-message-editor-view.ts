interface ComposerEditOwner {
  root: HTMLElement;
  render(value: boolean): void;
}
let editing = false;
let owner: ComposerEditOwner | null = null;

export function isChatMessageEditing(): boolean {
  return editing;
}

export function publishChatMessageEditing(value: boolean): void {
  editing = value;
  if (owner?.root.isConnected) owner.render(value);
}

export function ownChatMessageEditComposer(root: HTMLElement, render: ComposerEditOwner['render']): { destroy(): void } {
  const entry = { root, render };
  owner = entry;
  render(editing);
  return {
    destroy() {
      if (owner === entry) owner = null;
    },
  };
}
