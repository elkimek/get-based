/** Literal presentation values; catalog selection and affiliate decisions remain in their owners. */
export const tipsText = (value: unknown): string => value == null ? '' : String(value);
export interface TipsLinkView { href: string; event: string; label: string }
export interface TipsProductView { brand: string | null; name: string | null; meta: string[]; link: TipsLinkView | null }
export interface TipsEMFProductView { name: string; vendor: string; meta: string[]; blurb: string | null; link: TipsLinkView | null }
export interface TipsCouponView { code: string; discount: string }
export interface TipsDisclosureView { region: string }
export interface TipsFormView { text: string; href: string | null }
export interface TipsFindingView {
  kind: 'finding'; icon: string; gene: string; variant: string; genotype: string; note: string;
  evidence: string; relevance: string; study: string | null; snpedia: string | null;
}
export interface TipsHintView {
  kind: 'hint'; icon: string; avoid: boolean; text: string; evidence: string; relevance: string; study: string | null;
}
export type TipsGeneticsView = TipsFindingView | TipsHintView;
export type TipsTierItem =
  | {kind: 'free' | 'food' | 'form'; text: string}
  | {kind: 'forms'; forms: TipsFormView[]}
  | {kind: 'product'; product: TipsProductView}
  | {kind: 'drug-warning'};
export interface TipsTierView { label: string; hint: string | null; items: TipsTierItem[] }
export interface TipsSectionView {
  variant: 'standard' | 'emf'; header: string; gated: boolean; banner: boolean;
  normalNote: boolean; genetics: TipsGeneticsView[]; tiers: TipsTierView[]; products: TipsEMFProductView[];
  coupon: TipsCouponView | null; suggestionHref: string | null; footer: TipsDisclosureView; disclaimer: boolean;
}
export interface TipsDetailProps { label: string; state: 'loading' | 'loaded' | 'error'; section: TipsSectionView | null }
