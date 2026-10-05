# Engineering guidance

These documents describe maintained behavior and verification contracts that
contributors need alongside the source. Public user and developer documentation
live at [docs.getbased.health](https://docs.getbased.health).

- [Testing policy](testing-policy.md): scoped local checks, CI selection,
  coverage floors, and release evidence.
- [Biology Scores AI lifecycle](biology-ai-lifecycle.md): inference triggers,
  costs, persistence, and privacy boundaries.
- [Google Health OAuth scope justification](integrations/google-health-scope-justification.md):
  the provider-review explanation for implemented read-only scopes.

A [compatibility link](../google-health-scope-justification.md) at the original
Google Health document path keeps existing self-hosting guides working.

The [architecture contract](../ARCHITECTURE.md), [generated module map](../MODULE_MAP.md),
[contributing guide](../CONTRIBUTING.md), and [agent instructions](../AGENTS.md)
remain at the repository root. Branding lives in the [brand manual](../brands/BRAND.md).
Deployment instructions stay beside the [compatibility proxy](../deploy/compat-proxy/README.md)
and [profile-share service](../deploy/profile-share/README.md).

Task progress, checkpoints, temporary plans, and audit journals stay local in
`.local-notes/`, which Git ignores. Do not add them here. Stable decisions should
be incorporated into the relevant maintained contract, with change-specific
summaries and verification evidence in PRs and CI artifacts.
