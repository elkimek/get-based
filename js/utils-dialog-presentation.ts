/** Primitive facts only; existing utils controllers own options, hosts and promises. */
export interface UtilsConfirmFacts {
  ariaLabel: unknown; message: unknown; cancelLabel: unknown; confirmLabel: unknown;
  tone: 'danger' | 'primary';
}
export interface UtilsConfirmView {
  ariaLabel: string; message: string; cancelLabel: string; confirmLabel: string;
  tone: 'danger' | 'primary';
}
export interface UtilsPromptFacts {
  message: unknown; inputType: unknown; defaultValue: unknown; placeholder: unknown;
  cancelLabel: unknown; okLabel: unknown;
}
export interface UtilsPromptView {
  message: string; inputType: string; defaultValue: string; placeholder: string;
  inputAriaLabel: string; cancelLabel: string; okLabel: string;
}
const literal = (value: unknown): string => value === null || value === undefined ? '' : String(value);

/** Input facts are already defaulted by the public confirm controller. */
export function projectUtilsConfirm(facts: UtilsConfirmFacts): UtilsConfirmView {
  const ariaLabel = literal(facts.ariaLabel);
  const message = literal(facts.message);
  const cancelLabel = literal(facts.cancelLabel);
  const confirmLabel = literal(facts.confirmLabel);
  return { ariaLabel, message, cancelLabel, confirmLabel, tone: facts.tone };
}

/** Keep the second original message conversion for the native input aria-label. */
export function projectUtilsPrompt(facts: UtilsPromptFacts): UtilsPromptView {
  const message = literal(facts.message);
  const inputType = literal(facts.inputType);
  const defaultValue = literal(facts.defaultValue);
  const placeholder = literal(facts.placeholder);
  const inputAriaLabel = literal(facts.message);
  const cancelLabel = literal(facts.cancelLabel);
  const okLabel = literal(facts.okLabel);
  return { message, inputType, defaultValue, placeholder, inputAriaLabel, cancelLabel, okLabel };
}
