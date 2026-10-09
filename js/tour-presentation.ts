/** Literal view for one guided-tour step; navigation stays in the tour controller. */
export interface TourButtonView {
  label: 'Skip' | 'Back' | 'Next' | 'Done';
  action: 'end' | 'go';
  index?: number;
}

export interface TourPresentationProps {
  title: string;
  text: string;
  dots: boolean[];
  back: TourButtonView;
  next: TourButtonView;
}

export function projectTourPresentation(
  step: {title: string; text: string},
  index: number,
  stepCount: number,
): TourPresentationProps {
  return {
    title: step.title,
    text: step.text,
    dots: Array.from({length: stepCount}, (_, dotIndex) => dotIndex === index),
    back: index === 0
      ? {label: 'Skip', action: 'end'}
      : {label: 'Back', action: 'go', index: index - 1},
    next: index === stepCount - 1
      ? {label: 'Done', action: 'end'}
      : {label: 'Next', action: 'go', index: index + 1},
  };
}
