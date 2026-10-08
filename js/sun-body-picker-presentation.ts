// Pure SVG view projection: no profile, canvas, event or storage access.
export type BodyPickerSide = 'front' | 'back';
export interface BodyPickerInput {
  sex: 'male' | 'female'; stock: boolean; source: string; mask: string;
  overlay: string | null; overlayState: 'none' | 'pending' | 'ready';
  selected: ReadonlySet<string>; labels: ReadonlyArray<{ key: string; label: string }>;
  views: Array<{ side: BodyPickerSide; outline: string; landmarks: string[]; details: string[];
    regions: Record<string, string>; placement: { imgX: number; imgY: number; fullW: number; fullH: number } }>;
}
export function projectBodyPicker(input: BodyPickerInput) {
  return { sex: input.sex, stock: input.stock, source: input.source, mask: input.mask,
    overlay: input.overlay, overlayState: input.overlayState,
    views: input.views.map(view => ({ ...view,
      clipId: `sun-silhouette-clip-${input.sex}-${view.side}`, maskId: `sun-fig-mask-${view.side}`,
      placement: { x: view.placement.imgX.toFixed(2), y: view.placement.imgY.toFixed(2), width: view.placement.fullW.toFixed(2), height: view.placement.fullH.toFixed(2) },
      regions: Object.entries(view.regions).map(([key, path]) => {
        const label = input.labels.find(region => region.key === key)?.label || key;
        const selected = input.selected.has(key);
        return { key, path, selected, aria: /\((front|back)\)/.test(label) ? label : `${label} (${view.side})`, title: label + (selected ? ' (selected)' : '') };
      }) })) };
}
export type BodyPickerView = ReturnType<typeof projectBodyPicker>;
