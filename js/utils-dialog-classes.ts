/** Logical utility recipes for public utils-owned native dialog receivers. */
const utilities = {
  panel: "gb:utils-dialog-panel:utils-dialog-panel gb:utils-dialog-panel:utils-dialog-phone:[padding:22px_18px]",
  message: "gb:utils-dialog-message:utils-dialog-message",
  input: "gb:utils-dialog-input:utils-dialog-input gb:utils-dialog-input-focus:utils-dialog-input-focus",
  actions: "gb:utils-dialog-actions:utils-dialog-actions",
  cancel: "gb:utils-dialog-cancel:utils-dialog-cancel gb:utils-dialog-cancel-hover:utils-dialog-cancel-hover",
  danger: "gb:utils-dialog-danger:utils-dialog-danger gb:utils-dialog-danger-hover:utils-dialog-danger-hover",
  primary: "gb:utils-dialog-primary:utils-dialog-primary gb:utils-dialog-primary-hover:utils-dialog-primary-hover",
} as const;
export type UtilsDialogReceiver = keyof typeof utilities;
export function utilsDialogClasses(nativeClasses: string, receiver: UtilsDialogReceiver): string {
  return `${nativeClasses} ${utilities[receiver]}`;
}
