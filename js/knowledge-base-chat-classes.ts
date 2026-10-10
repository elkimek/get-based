/** Knowledge Base chat utilities; selectors and lazy stylesheet ownership preserve the existing cascade. */
export const chatClasses: Readonly<Record<string, string>> = {
  "kb-doc-delete": [
    "gb:kb-chat-doc-delete:[flex-shrink:0]",
    "gb:kb-chat-doc-delete:[background:none]",
    "gb:kb-chat-doc-delete:[border:none]",
    "gb:kb-chat-doc-delete:[color:var(--text-muted)]",
    "gb:kb-chat-doc-delete:[font-size:18px]",
    "gb:kb-chat-doc-delete:[line-height:1]",
    "gb:kb-chat-doc-delete:[cursor:pointer]",
    "gb:kb-chat-doc-delete:[padding:0_6px]",
    "gb:kb-chat-doc-delete:[border-radius:4px]",
    "gb:kb-chat-doc-delete:[transition:color_0.15s,_background_0.15s]",
    "gb:kb-chat-doc-delete-hover:[color:var(--red)]",
    "gb:kb-chat-doc-delete-hover:[background:var(--bg-hover)]",
  ].join(' '),
};
