# UI heading and supporting-copy policy

Prefer one clear title per surface. A subtitle should explain something the
title, controls, or content do not already make clear.

- Keep page titles, section boundaries, field labels, disclosure summaries,
  errors, empty-state next steps, and accessible region names.
- Keep medical limitations, uncertainty, data scope, privacy/consent notices,
  and explanations of unfamiliar scores. Do not hide these behind hover text.
- Avoid category → title → paraphrased subtitle → repeated inner title stacks.
  Lens cards do not need to repeat the lens name. Dashboard categories remain
  available when organizing widgets and in the picker.
- Widget descriptions remain in the picker. The explicitly curated IDs in
  `js/dashboard-widget-copy.js` omit redundant display captions; new or unknown
  widgets retain their description by default.
- Embedded Profile Context uses its containing card's title while retaining
  its accessible region name. Standalone context forms keep their own heading.
- Do not remove a heading merely because it is small. For example, Biology
  Scores' “What this means”, core/optional markers, confidence, and evidence
  labels distinguish information; “System-level score” and “Biology overview”
  above an already named score do not.
- Remove unnecessary markup rather than globally hiding heading classes with
  CSS. Render no empty paragraph when a page does not need a subtitle.

The September 2026 pass covers shared dashboard/lens chrome and redundant
copy in Biology Scores, Labs, Body, Genome, Insight, Light, settings, context,
reports, libraries, release notes, and meal dialogs. Functional controls and
health calculations are unchanged. Future screens should be curated with the
same criteria, not subjected to blanket subtitle removal.
