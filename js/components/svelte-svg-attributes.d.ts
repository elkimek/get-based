// Standard SVG presentation attribute omitted by Svelte's mask declaration.
import 'svelte/elements';
declare module 'svelte/elements' {
  interface SVGAttributes<T extends EventTarget> { 'mask-type'?: 'alpha' | 'luminance' | null | undefined; }
}
