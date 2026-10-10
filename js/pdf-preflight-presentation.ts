/** Primitive presentation facts; all workflow and modal ownership stays in the controllers. */
export interface PdfDuplicateView {
  kind: 'duplicate';
  dateLabel: string;
  confirmLabel: string;
}

export interface PdfModelMismatchView {
  kind: 'model';
  previousModel: string;
  currentModel: string;
  switchModel: string;
}

export interface PdfUnsupportedLabView {
  kind: 'unsupported';
  displayType: string;
}

export type PdfPreflightView = PdfDuplicateView | PdfModelMismatchView | PdfUnsupportedLabView;

export interface PdfModelMismatchInput {
  prevModel: string;
  currentModel: unknown;
}

const literal = (value: unknown): string => value === null || value === undefined ? '' : String(value);

/** The private duplicate caller already supplies the localized primitive date. */
export function projectPdfDuplicateView(dateLabel: string, confirmLabel: unknown = 'Import Anyway'): PdfDuplicateView {
  return { kind: 'duplicate', dateLabel, confirmLabel: literal(confirmLabel) };
}

/** Keep both previous-model reads and the native split call in original evaluation order. */
export function projectPdfModelMismatchView(input: PdfModelMismatchInput): PdfModelMismatchView {
  const previousModel = literal(input.prevModel);
  const currentModel = literal(input.currentModel);
  const switchModel = literal(input.prevModel.split('/').pop());
  return { kind: 'model', previousModel, currentModel, switchModel };
}

export function projectPdfUnsupportedLabView(testType: unknown): PdfUnsupportedLabView {
  return { kind: 'unsupported', displayType: literal(testType) };
}
