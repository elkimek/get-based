// Svelte's generic HTML declaration omits the attribute used to protect seed entry.
import 'svelte/elements';
declare module 'svelte/elements' {
  interface HTMLAttributes<T extends EventTarget> { autocorrect?: 'on' | 'off' | '' | null | undefined; }
}
