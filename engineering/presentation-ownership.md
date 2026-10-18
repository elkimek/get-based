# Presentation ownership

Use this guide to find a feature's presentation entry points and the controller
contracts that outlive them. The complete import/file inventory is generated in
[MODULE_MAP.md](../MODULE_MAP.md); shared dependency, source, styling and lifecycle
rules remain in [ARCHITECTURE.md](../ARCHITECTURE.md). Child components and test
lists belong beside their owners rather than in a second exhaustive inventory.

## Feature entry points

Components project display data and compose typed children. Listed services and
controllers retain domain decisions, persistence and action lifetimes.

| Area | Presentation entry points | Controllers/projections | Boundary |
| --- | --- | --- | --- |
| Shell and navigation | [`AppShell.svelte`](../js/components/AppShell.svelte), [`SidebarNavigation.svelte`](../js/components/SidebarNavigation.svelte), [`HeaderDateSummary.svelte`](../js/components/HeaderDateSummary.svelte), [`FooterCommitLink.svelte`](../js/components/FooterCommitLink.svelte) | [`app-shell-component.ts`](../js/app-shell-component.ts), [`nav.ts`](../js/nav.ts), [`header-date-range.ts`](../js/header-date-range.ts), [`commit-hash.ts`](../js/commit-hash.ts) | Shared native/Kit shell, mutable route/modal hosts and delegated navigation. |
| Consent, updates and tours | [`AnalyticsConsentBody.svelte`](../js/components/AnalyticsConsentBody.svelte), [`VersionUpdateBody.svelte`](../js/components/VersionUpdateBody.svelte), [`TourPresentation.svelte`](../js/components/TourPresentation.svelte) | [`utils.ts`](../js/utils.ts), [`service-worker-update.ts`](../js/service-worker-update.ts), [`tour.ts`](../js/tour.ts) | Consent/startup gates, activation/reload choice, positioning and delayed navigation. |
| Dialogs, feedback and changelog | [`UtilsConfirmPresentation.svelte`](../js/components/UtilsConfirmPresentation.svelte), [`UtilsPromptPresentation.svelte`](../js/components/UtilsPromptPresentation.svelte), [`FeedbackPresentation.svelte`](../js/components/FeedbackPresentation.svelte), [`ChangelogPresentation.svelte`](../js/components/ChangelogPresentation.svelte) | [`utils.ts`](../js/utils.ts), [`feedback.ts`](../js/feedback.ts), [`changelog.ts`](../js/changelog.ts) | Native form defaults, promises, focus/backdrop/Escape and terminal cleanup. |
| Dashboard pages and frames | [`DesktopDashboardPage.svelte`](../js/components/DesktopDashboardPage.svelte), [`MobileDashboardPage.svelte`](../js/components/MobileDashboardPage.svelte), [`DashboardWidgetFrame.svelte`](../js/components/DashboardWidgetFrame.svelte), [`DashboardWidgetBody.svelte`](../js/components/DashboardWidgetBody.svelte) | [`dashboard-widget-presentation.ts`](../js/dashboard-widget-presentation.ts), [`dashboard-view-composition.ts`](../js/dashboard-view-composition.ts), [`dashboard-page-owner.ts`](../js/dashboard-page-owner.ts) | Registry filters before reading selected feature views; whole-page hydration and stable controls. |
| Dashboard controls and loading | [`DashboardPickerPresentation.svelte`](../js/components/DashboardPickerPresentation.svelte), [`DashboardActionBar.svelte`](../js/components/DashboardActionBar.svelte), [`DashboardGreeting.svelte`](../js/components/DashboardGreeting.svelte), [`DashboardWelcome.svelte`](../js/components/DashboardWelcome.svelte) | [`dashboard-widget-controls.ts`](../js/dashboard-widget-controls.ts), [`dashboard-welcome-presentation.ts`](../js/dashboard-welcome-presentation.ts) | Organization, preference writes, profile reset, reminders and readiness lifecycle. |
| Lens pages and recommendations | [`LensWidgetBody.svelte`](../js/components/LensWidgetBody.svelte), [`LensPageContent.svelte`](../js/components/LensPageContent.svelte), [`RecommendationPage.svelte`](../js/components/RecommendationPage.svelte), [`TipsSection.svelte`](../js/components/TipsSection.svelte) | [`lens-page-shell.ts`](../js/lens-page-shell.ts), [`lens-content-presentation.ts`](../js/lens-content-presentation.ts), [`recommendations.ts`](../js/recommendations.ts) | Finite feature union, ordering, preferences, matching, affiliate/source policy and actions. |
| Biology Scores | [`BiologyScoresPage.svelte`](../js/components/BiologyScoresPage.svelte), [`BiologyCardPresentation.svelte`](../js/components/BiologyCardPresentation.svelte), [`BiologyOverviewPresentation.svelte`](../js/components/BiologyOverviewPresentation.svelte), [`BiologyContextPresentation.svelte`](../js/components/BiologyContextPresentation.svelte) | [`biology-page-view.ts`](../js/biology-page-view.ts), [`biology-score-render.ts`](../js/biology-score-render.ts), [`biology-score-sections.ts`](../js/biology-score-sections.ts) | Deterministic scores, collection policy, context review, scoped AI/cache/save and public summary facades. |
| Category pages and tables | [`CategoryPageChrome.svelte`](../js/components/CategoryPageChrome.svelte), [`CategoryDataTable.svelte`](../js/components/CategoryDataTable.svelte), [`CategoryRangeRail.svelte`](../js/components/CategoryRangeRail.svelte), [`CategoryChartCard.svelte`](../js/components/CategoryChartCard.svelte) | [`category-page-view.ts`](../js/category-page-view.ts), [`category-view-renderers.ts`](../js/category-view-renderers.ts) | Range math, filtering, charts, ordering and native date/layer delegates. |
| Compare and correlations | [`CompareDatesPage.svelte`](../js/components/CompareDatesPage.svelte), [`CorrelationsSelectionPage.svelte`](../js/components/CorrelationsSelectionPage.svelte), [`CorrelationWorkspaceChrome.svelte`](../js/components/CorrelationWorkspaceChrome.svelte), [`CorrelationWorkspaceControls.svelte`](../js/components/CorrelationWorkspaceControls.svelte) | [`compare-dates-presentation.ts`](../js/compare-dates-presentation.ts), [`compare-correlations.ts`](../js/compare-correlations.ts), [`correlation-workspace-chrome-presentation.ts`](../js/correlation-workspace-chrome-presentation.ts) | Date swaps, selection/search, dose/statistics math, chart state and disclosure postprocessing. |
| Therapy and pair details | [`TherapyComparisonResults.svelte`](../js/components/TherapyComparisonResults.svelte), [`MarkerPairComparison.svelte`](../js/components/MarkerPairComparison.svelte) | [`therapy-comparison-presentation.ts`](../js/therapy-comparison-presentation.ts), [`therapy-comparison-presentation.ts`](../js/therapy-comparison-presentation.ts) | Dose/source/status calculations, raw public serializers and escaped first-party date/formatter data. |
| Marker detail and editing | [`MarkerDetailModal.svelte`](../js/components/MarkerDetailModal.svelte), [`MarkerDetailHistory.svelte`](../js/components/MarkerDetailHistory.svelte), [`MarkerDetailRange.svelte`](../js/components/MarkerDetailRange.svelte), [`MarkerReferenceEditor.svelte`](../js/components/MarkerReferenceEditor.svelte) | [`marker-detail-view.ts`](../js/marker-detail-view.ts), [`marker-detail-manual-entry.ts`](../js/marker-detail-manual-entry.ts), [`marker-detail-placement.ts`](../js/marker-detail-placement.ts) | Validation, unit/range conversion, provenance, paging, storage rollback and delegates. |
| Custom markers | [`CustomMarkerForm.svelte`](../js/components/CustomMarkerForm.svelte), [`CustomMarkerOptions.svelte`](../js/components/CustomMarkerOptions.svelte) | [`custom-marker-presentation.ts`](../js/custom-marker-presentation.ts), [`marker-detail-custom-markers.ts`](../js/marker-detail-custom-markers.ts) | Identity, canonical categories, validation, save and delayed focus. |
| Genetics and import previews | [`GeneticsSection.svelte`](../js/components/GeneticsSection.svelte), [`ManualSnpDialog.svelte`](../js/components/ManualSnpDialog.svelte), [`DnaImportPreview.svelte`](../js/components/DnaImportPreview.svelte), [`MtDnaImportPreview.svelte`](../js/components/MtDnaImportPreview.svelte) | [`dna-ui.ts`](../js/dna-ui.ts), [`dna.ts`](../js/dna.ts), [`genetics-section-presentation.ts`](../js/genetics-section-presentation.ts) | Catalog/evidence classification, draft binding, normalization, explicit profile saves and rollback. |
| PDF import and review | [`ImportProgressPresentation.svelte`](../js/components/ImportProgressPresentation.svelte), [`PdfPreflightPresentation.svelte`](../js/components/PdfPreflightPresentation.svelte), [`PdfImageModePresentation.svelte`](../js/components/PdfImageModePresentation.svelte), [`ImportReviewPresentation.svelte`](../js/components/ImportReviewPresentation.svelte) | [`pdf-import.ts`](../js/pdf-import.ts), [`pdf-import-review.ts`](../js/pdf-import-review.ts), [`import-progress-presentation.ts`](../js/import-progress-presentation.ts) | Classification/privacy, unit normalization, original marker indexing, drafts, timers and persistence. |
| Import mapping and benchmarks | [`ImportMarkerMapPresentation.svelte`](../js/components/ImportMarkerMapPresentation.svelte), [`ImportBenchmarks.svelte`](../js/components/ImportBenchmarks.svelte), [`ImportBenchmarkEntry.svelte`](../js/components/ImportBenchmarkEntry.svelte) | [`import-marker-map-presentation.ts`](../js/import-marker-map-presentation.ts), [`import-benchmark-controller.ts`](../js/import-benchmark-controller.ts), [`import-benchmark-run.ts`](../js/import-benchmark-run.ts) | Scoring/search, nested modal locks, captured selection/deletion and independent accepted background runs. |
| Reports and PII review | [`ReportBuilderPresentation.svelte`](../js/components/ReportBuilderPresentation.svelte), [`PIIReviewModal.svelte`](../js/components/PIIReviewModal.svelte) | [`export-report-builder.ts`](../js/export-report-builder.ts), [`pii-review.ts`](../js/pii-review.ts) | Captured note/AI selections, synchronous preview reservation, scrub review, streaming/retry and export. |
| Settings, Display and Privacy | [`SettingsShell.svelte`](../js/components/SettingsShell.svelte), [`DisplaySettings.svelte`](../js/components/DisplaySettings.svelte), [`PrivacySettings.svelte`](../js/components/PrivacySettings.svelte), [`TweaksPresentation.svelte`](../js/components/TweaksPresentation.svelte) | [`settings-display-panel.ts`](../js/settings-display-panel.ts), [`settings-privacy.ts`](../js/settings-privacy.ts), [`settings-tweaks.ts`](../js/settings-tweaks.ts) | Preference writes, consent/analytics, theme scheduling and lifecycle adapters. |
| AI/provider Settings | [`AiSettings.svelte`](../js/components/AiSettings.svelte), [`OpenRouterSettings.svelte`](../js/components/OpenRouterSettings.svelte), [`VeniceSettings.svelte`](../js/components/VeniceSettings.svelte), [`PpqSettings.svelte`](../js/components/PpqSettings.svelte), [`RoutstrSettings.svelte`](../js/components/RoutstrSettings.svelte) | [`ai-settings-component.ts`](../js/ai-settings-component.ts), [`provider-key-controller.ts`](../js/provider-key-controller.ts), [`provider-settings-classes.ts`](../js/provider-settings-classes.ts) | Stable child slots and private credential ports; provider/domain services own validation, persistence and catalogs. |
| CLI, Local AI and custom API | [`CliAgentSettings.svelte`](../js/components/CliAgentSettings.svelte), [`CliAgentModels.svelte`](../js/components/CliAgentModels.svelte), [`LocalAiSettings.svelte`](../js/components/LocalAiSettings.svelte), [`CustomSettings.svelte`](../js/components/CustomSettings.svelte) | [`cli-agent-settings-controller.ts`](../js/cli-agent-settings-controller.ts), [`local-ai-settings-controller.ts`](../js/local-ai-settings-controller.ts), [`custom-settings-controller.ts`](../js/custom-settings-controller.ts) | Captured connection/endpoint identity, management authority, single-flight validation and consent. |
| Wallet operations | [`WalletFunding.svelte`](../js/components/WalletFunding.svelte), [`WalletMintPicker.svelte`](../js/components/WalletMintPicker.svelte), [`WalletExport.svelte`](../js/components/WalletExport.svelte), [`WalletNode.svelte`](../js/components/WalletNode.svelte), [`WalletWithdraw.svelte`](../js/components/WalletWithdraw.svelte), [`WalletSeed.svelte`](../js/components/WalletSeed.svelte) | [`cashu-funding-monitor.ts`](../js/cashu-funding-monitor.ts), [`cashu-wallet-mint-requests.ts`](../js/cashu-wallet-mint-requests.ts), [`routstr-account-controller.ts`](../js/routstr-account-controller.ts) | Payment/recovery locks and journals stay domain-owned; detailed invariants below. |
| Sync and Agent Access | [`SyncSettings.svelte`](../js/components/SyncSettings.svelte), [`SyncDialog.svelte`](../js/components/SyncDialog.svelte), [`AgentAccessSettings.svelte`](../js/components/AgentAccessSettings.svelte), [`SyncIndicatorPresentation.svelte`](../js/components/SyncIndicatorPresentation.svelte), [`SyncPopoverPresentation.svelte`](../js/components/SyncPopoverPresentation.svelte) | [`settings-sync-view.ts`](../js/settings-sync-view.ts), [`sync-dialog-controller.ts`](../js/sync-dialog-controller.ts), [`settings-agent-access-mutation.ts`](../js/settings-agent-access-mutation.ts), [`sync-ui.ts`](../js/sync-ui.ts) | Identity/recovery secrets, setup/restore lifetime, clipboard clearing and per-profile credential commits. |
| Security and backup | [`EncryptionSettings.svelte`](../js/components/EncryptionSettings.svelte), [`BackupSettings.svelte`](../js/components/BackupSettings.svelte), [`FolderBackupSettings.svelte`](../js/components/FolderBackupSettings.svelte), [`PassphraseDialog.svelte`](../js/components/PassphraseDialog.svelte) | [`crypto-ui.ts`](../js/crypto-ui.ts), [`backup.ts`](../js/backup.ts), [`passphrase-controller.ts`](../js/passphrase-controller.ts) | Keys, backup payloads and directory handles stay outside display snapshots; failure-safe operations below. |
| Records and feature-model Settings | [`DataEntriesSettings.svelte`](../js/components/DataEntriesSettings.svelte), [`AIUsageSettings.svelte`](../js/components/AIUsageSettings.svelte), [`NutritionAISettings.svelte`](../js/components/NutritionAISettings.svelte), [`VoiceSettings.svelte`](../js/components/VoiceSettings.svelte), [`WearablesSettings.svelte`](../js/components/WearablesSettings.svelte) | [`settings-records-view.ts`](../js/settings-records-view.ts), [`nutrition-ai-settings.ts`](../js/nutrition-ai-settings.ts), [`wearables-settings-panel.ts`](../js/wearables-settings-panel.ts) | Canonical provenance/usage, route capability evidence and scoped provider/import operations. |
| Context catalog, status and notes | [`ContextCardCatalog.svelte`](../js/components/ContextCardCatalog.svelte), [`ContextCardStatus.svelte`](../js/components/ContextCardStatus.svelte), [`ContextNotes.svelte`](../js/components/ContextNotes.svelte), [`ContextCardTips.svelte`](../js/components/ContextCardTips.svelte) | [`context-card-status.ts`](../js/context-card-status.ts), [`context-notes-session.ts`](../js/context-notes-session.ts), [`context-card-tips-presentation.ts`](../js/context-card-tips-presentation.ts) | Profile/fact fingerprints, debounced transactional notes, retry/conflict UI and recommendation tickets. |
| Context forms and hub | [`LifestyleContextForm.svelte`](../js/components/LifestyleContextForm.svelte), [`ContextHub.svelte`](../js/components/ContextHub.svelte), [`ContextHealthGoals.svelte`](../js/components/ContextHealthGoals.svelte), [`ContextMedicalHistory.svelte`](../js/components/ContextMedicalHistory.svelte) | [`context-field-session.ts`](../js/context-field-session.ts), [`context-hub-session.ts`](../js/context-hub-session.ts), [`context-health-goals-session.ts`](../js/context-health-goals-session.ts) | Isolated drafts, observed-field transactions, history/tombstones, source preferences and captured modal ownership. |
| Context links and protection setup | [`ContextEMFLauncher.svelte`](../js/components/ContextEMFLauncher.svelte), [`ContextFoodContaminants.svelte`](../js/components/ContextFoodContaminants.svelte), [`ContextNutritionLink.svelte`](../js/components/ContextNutritionLink.svelte), [`DataProtectionPicker.svelte`](../js/components/DataProtectionPicker.svelte) | [`context-food-contaminants-view.ts`](../js/context-food-contaminants-view.ts), [`data-protection-picker-view.ts`](../js/data-protection-picker-view.ts) | Safe source links, delayed tool/Chat handoffs and supported/configured setup actions. |
| Nutrition entry and history | [`NutritionEntry.svelte`](../js/components/NutritionEntry.svelte), [`NutritionTargets.svelte`](../js/components/NutritionTargets.svelte), [`NutritionFluidLog.svelte`](../js/components/NutritionFluidLog.svelte), [`NutritionHistory.svelte`](../js/components/NutritionHistory.svelte), [`NutritionDashboard.svelte`](../js/components/NutritionDashboard.svelte) | [`nutrition-entry-session.ts`](../js/nutrition-entry-session.ts), [`nutrition-history-view.ts`](../js/nutrition-history-view.ts), [`nutrition-render.ts`](../js/nutrition-render.ts) | Registry/calendar display, captured writes, canonical/encrypted meal storage and route retirement. |
| Nutrition editor and details | [`NutritionMealEditor.svelte`](../js/components/NutritionMealEditor.svelte), [`NutritionMealDetail.svelte`](../js/components/NutritionMealDetail.svelte), [`NutritionMealResponse.svelte`](../js/components/NutritionMealResponse.svelte) | [`nutrition.ts`](../js/nutrition.ts), [`nutrition-review-ui.ts`](../js/nutrition-review-ui.ts), [`nutrition-meal-detail-session.ts`](../js/nutrition-meal-detail-session.ts) | Analysis, corrections, provenance, changed-meal guards, review and accepted saves. |
| Nutrition benchmarks | [`NutritionBenchmark.svelte`](../js/components/NutritionBenchmark.svelte), [`NutritionComparisonResults.svelte`](../js/components/NutritionComparisonResults.svelte), [`NutritionComparisonTable.svelte`](../js/components/NutritionComparisonTable.svelte) | [`nutrition-benchmark-workspace.ts`](../js/nutrition-benchmark-workspace.ts), [`nutrition-comparison-ui.ts`](../js/nutrition-comparison-ui.ts), [`nutrition-comparison-results-model.ts`](../js/nutrition-comparison-results-model.ts) | Request/cancel/storage owners, exact ranking/zero semantics and real editor-node suspension. |
| Light route, channels and conditions | [`LightPagePresentation.svelte`](../js/components/LightPagePresentation.svelte), [`LightConditionsPresentation.svelte`](../js/components/LightConditionsPresentation.svelte), [`LightChannelDetail.svelte`](../js/components/LightChannelDetail.svelte), [`LightChannelPills.svelte`](../js/components/LightChannelPills.svelte) | [`light-page-view.ts`](../js/light-page-view.ts), [`light-conditions-now.ts`](../js/light-conditions-now.ts), [`light-channel-view.ts`](../js/light-channel-view.ts) | Provider/cache refresh, channel calculations, source attribution and ordered style loading. |
| Light setup and AI verdicts | [`LightSetupPresentation.svelte`](../js/components/LightSetupPresentation.svelte), [`LightOnboardingAI.svelte`](../js/components/LightOnboardingAI.svelte), [`LightSessionAI.svelte`](../js/components/LightSessionAI.svelte), [`LightEnvironmentAI.svelte`](../js/components/LightEnvironmentAI.svelte), [`LightReviewAI.svelte`](../js/components/LightReviewAI.svelte) | [`sun-defaults-session.ts`](../js/sun-defaults-session.ts), [`ai-verdict-engine.ts`](../js/ai-verdict-engine.ts), [`ai-verdict-owner.ts`](../js/ai-verdict-owner.ts), [`ai-verdict-write.ts`](../js/ai-verdict-write.ts) | Atomic setup/skin mirror, captured target fingerprints and durable result publication. |
| Environment and audits | [`LightEnvironmentPresentation.svelte`](../js/components/LightEnvironmentPresentation.svelte), [`LightEnvironmentScreen.svelte`](../js/components/LightEnvironmentScreen.svelte), [`LightAuditCard.svelte`](../js/components/LightAuditCard.svelte), [`LightAuditCompare.svelte`](../js/components/LightAuditCompare.svelte) | [`light-env.ts`](../js/light-env.ts), [`light-env-editor.ts`](../js/light-env-editor.ts), [`light-env-audits.ts`](../js/light-env-audits.ts) | Room/screen grading, per-day overrides, historical snapshots, comparisons and saved audits. |
| Light tools and cameras | [`LightToolPresentation.svelte`](../js/components/LightToolPresentation.svelte), [`LightCameraPresentation.svelte`](../js/components/LightCameraPresentation.svelte), [`LightAimingGuide.svelte`](../js/components/LightAimingGuide.svelte) | [`light-tools.ts`](../js/light-tools.ts), [`light-tool-camera.ts`](../js/light-tool-camera.ts), [`light-camera-presentation.ts`](../js/light-camera-presentation.ts) | Sensors, sampling/calibration/confidence, walkthrough binding, saves and teardown. |
| Sun/device sessions and body picker | [`LightSessionPresentation.svelte`](../js/components/LightSessionPresentation.svelte), [`LightSessionDetail.svelte`](../js/components/LightSessionDetail.svelte), [`LightActiveSession.svelte`](../js/components/LightActiveSession.svelte), [`SunStartSessionForm.svelte`](../js/components/SunStartSessionForm.svelte), [`SunBodyPicker.svelte`](../js/components/SunBodyPicker.svelte) | [`light-session-presentation.ts`](../js/light-session-presentation.ts), [`light-active-session-presentation.ts`](../js/light-active-session-presentation.ts), [`sun-body-silhouette.ts`](../js/sun-body-silhouette.ts) | Dose/paused-time integration, body geometry, mode validation, canonical writes and asset/blob lifecycle. |
| EMF editor and interpretation | [`EMFEditor.svelte`](../js/components/EMFEditor.svelte), [`EMFImportPreview.svelte`](../js/components/EMFImportPreview.svelte), [`EMFComparison.svelte`](../js/components/EMFComparison.svelte), [`EMFAssessmentDetail.svelte`](../js/components/EMFAssessmentDetail.svelte) | [`emf-editor.ts`](../js/emf-editor.ts), [`emf-interpretation-presentation.ts`](../js/emf-interpretation-presentation.ts), [`emf-comparison-presentation.ts`](../js/emf-comparison-presentation.ts) | Assessment/room state, parsing, saving, stale meter suggestions and Markdown-only rich content. |
| Wearables and cycles | [`WearableStripBody.svelte`](../js/components/WearableStripBody.svelte), [`WearableDetailChrome.svelte`](../js/components/WearableDetailChrome.svelte), [`CycleEditorPresentation.svelte`](../js/components/CycleEditorPresentation.svelte), [`CycleOverviewPresentation.svelte`](../js/components/CycleOverviewPresentation.svelte) | [`wearables-detail-modal.ts`](../js/wearables-detail-modal.ts), [`wearables-strip-actions.ts`](../js/wearables-strip-actions.ts), [`cycle.ts`](../js/cycle.ts) | Raw device rows, derived summaries, ranges, manual entry and cycle conflict/save logic. |
| Client profiles and sharing | [`ClientListOverview.svelte`](../js/components/ClientListOverview.svelte), [`ClientListFormPresentation.svelte`](../js/components/ClientListFormPresentation.svelte), [`ProfileShareBody.svelte`](../js/components/ProfileShareBody.svelte) | [`client-list-impl.ts`](../js/client-list-impl.ts), [`client-list-form.ts`](../js/client-list-form.ts), [`profile-share.ts`](../js/profile-share.ts) | Search/sort/profile edits, avatar/location processing and encrypted link lifecycle. |
| Chat shell and conversation | [`ChatShell.svelte`](../js/components/ChatShell.svelte), [`ChatComposer.svelte`](../js/components/ChatComposer.svelte), [`ChatThreadNavigation.svelte`](../js/components/ChatThreadNavigation.svelte), [`ChatHeader.svelte`](../js/components/ChatHeader.svelte) | [`chat-composer.ts`](../js/chat-composer.ts), [`chat-threads.ts`](../js/chat-threads.ts), [`chat-thread-search.ts`](../js/chat-thread-search.ts), [`chat-layout.ts`](../js/chat-layout.ts) | Stable transcript hosts, per-conversation drafts, CRUD/search, splitters, persisted geometry and closed-rail inert/focus ownership and explicit mobile-opening focus. |
| Chat transcript and streaming | [`ChatTranscript.svelte`](../js/components/ChatTranscript.svelte), [`ChatMessage.svelte`](../js/components/ChatMessage.svelte), [`ChatLiveMessage.svelte`](../js/components/ChatLiveMessage.svelte), [`ChatMessageEditor.svelte`](../js/components/ChatMessageEditor.svelte) | [`chat-transcript-component.ts`](../js/chat-transcript-component.ts), [`chat-send.ts`](../js/chat-send.ts), [`chat-render.ts`](../js/chat-render.ts), [`chat-message-edit.ts`](../js/chat-message-edit.ts) | Sanitized body content, keyed messages, generation identity, usage/persistence and edit rollback. |
| Chat actions and attachments | [`ChatMessageActions.svelte`](../js/components/ChatMessageActions.svelte), [`ChatAgentDraftCards.svelte`](../js/components/ChatAgentDraftCards.svelte), [`ChatAttachmentPreview.svelte`](../js/components/ChatAttachmentPreview.svelte), [`ChatAttestationBadge.svelte`](../js/components/ChatAttestationBadge.svelte) | [`chat-message-actions-view.ts`](../js/chat-message-actions-view.ts), [`chat-images.ts`](../js/chat-images.ts), [`chat-attestation.ts`](../js/chat-attestation.ts) | Single action dispatch, private file decoding, safe URLs, proposal review and tooltip lifecycle. |
| Chat onboarding, context and summaries | [`ChatProviderSetup.svelte`](../js/components/ChatProviderSetup.svelte), [`ChatProfileSetup.svelte`](../js/components/ChatProfileSetup.svelte), [`ChatOptionalSetup.svelte`](../js/components/ChatOptionalSetup.svelte), [`ChatEmptyState.svelte`](../js/components/ChatEmptyState.svelte), [`ChatSummaryDialog.svelte`](../js/components/ChatSummaryDialog.svelte) | [`chat-onboarding.ts`](../js/chat-onboarding.ts), [`chat-profile-onboarding-controller.ts`](../js/chat-profile-onboarding-controller.ts), [`chat-summaries.ts`](../js/chat-summaries.ts) | Captured provider/profile/history handoffs, transactional profile entry and summary generation/export. |
| Chat models, persona and discussion | [`ChatModelPicker.svelte`](../js/components/ChatModelPicker.svelte), [`ChatPersonalityPicker.svelte`](../js/components/ChatPersonalityPicker.svelte), [`ChatPersonalityEditor.svelte`](../js/components/ChatPersonalityEditor.svelte), [`ChatDiscussion.svelte`](../js/components/ChatDiscussion.svelte) | [`chat-model-controls.ts`](../js/chat-model-controls.ts), [`chat-personality-editing.ts`](../js/chat-personality-editing.ts), [`chat-discussion-origin.ts`](../js/chat-discussion-origin.ts), [`chat-discussion-round-state.ts`](../js/chat-discussion-round-state.ts) | Latest model choice, hosted-use policy, draft revisions, round cancellation and serialized encrypted history. |
| Voice controls and engines | [`ChatVoiceButton.svelte`](../js/components/ChatVoiceButton.svelte), [`ChatSpeechButton.svelte`](../js/components/ChatSpeechButton.svelte), [`VoiceSettings.svelte`](../js/components/VoiceSettings.svelte) | [`chat-voice-view.ts`](../js/chat-voice-view.ts), [`voice-controller.ts`](../js/voice-controller.ts), [`voice-capture.ts`](../js/voice-capture.ts) | Ephemeral recording, explicit recipients/model installation and independent capture/playback lifetime. |
| Knowledge Base | [`KnowledgeBasePanel.svelte`](../js/components/KnowledgeBasePanel.svelte), [`KnowledgeBaseLibraryCreate.svelte`](../js/components/KnowledgeBaseLibraryCreate.svelte) | [`knowledge-base-presentation.ts`](../js/knowledge-base-presentation.ts), [`knowledge-base-library-presentation.ts`](../js/knowledge-base-library-presentation.ts), [`lens-library.ts`](../js/lens-library.ts) | Serialized local API operations, worker/parsers/model catalogs, document config and modal ownership. |

## Credentials, identities and payment operations

General-purpose display snapshots must not contain keys, tokens, recovery words,
invoices, private destinations, raw provider metadata or directory handles.
Dedicated live ports supply only the controls that need them and scrub retained
nodes on close or replacement. Refreshes preserve draft fields, selector identity
and focus.

The existing explicit reveal/copy screens have narrow compatibility contracts:
[`Sync identity rotation`](../js/sync-diagnose-presentation.ts) serializes the
selected recovery words and generated QR, and
[`profile sharing`](../js/profile-share-presentation.ts) serializes its share
password in dedicated user-visible controls. These sensitive owner views are not
general display snapshots; never use them as diagnostics, analytics or unrelated
persistence input. Preserving those original serializers does not establish that
all secrets are universally absent from rendered HTML.

- **AI/provider Settings:** the parent retains a stable child slot and disposes
  children before replacement. Lazy replies check root/epoch/child identity;
  declined consent restores the previous CLI choice. Extension callbacks receive
  the actual button and cannot override a later choice. Validation and catalog
  work checks initiating view, provider, credential and request order. Accepted
  encrypted writes can finish after close; catalog/UI publication cannot target
  the next account. Unavailable saved models remain explicit; a missing private
  catalog preserves private intent without advertising regular models as private.
  Venice keeps encryption preference and full evidence/source limitations visible.
- **PPQ:** account creation and payment polling have separate captured account,
  credit, key and request identities. Accepted anonymous accounts persist after
  close. Recovery details become privately available before later work can fail;
  invoices/QR/results cannot revive expired, paid or replaced requests. Polling is
  single-flight; closure cancels countdown/polling/onboarding and scrubs fields.
  Funded-account removal confirms, then rechecks ownership.
- **CLI agents:** shared single-flight management survives remounts. Dispatch
  rechecks private host identity, discovery authority, owner/backend and choices.
  Accepted writes/actions finish without publishing to another view; pausing a
  still-selected matching host returns it to direct inference. Embedded sizing
  trusts only the bound frame's source and loopback origin; URLs retain the
  discovered port and contain no credentials.
- **Local AI:** explicit tests capture draft and saved configuration, model,
  provider/backend and view before discovery, same-machine VRAM release and
  activation. Failed/denied checks preserve saved connection/selection; passive
  discovery never activates. Hardware advice checks request order/model/override.
  Switching retains unload-before-switch; PII's independently stored key is separate.
- **Custom API:** serialize encrypted credential publication before endpoint/cache
  publication and restore the previous credential on failure. Endpoint changes
  invalidate catalog/vision caches but retain the chosen model ID. Removal clears
  model/connection metadata only after key removal succeeds. Catalog writes check
  saved endpoint/key, latest request and optional view. Endpoint-specific consent
  and browser-direct fixed synthetic compatibility probes remain required.
- **Routstr accounts:** view/provider/backend/node/credential/draft checks precede
  validation and activation. A converted session is recoverable before catalog
  work; a failed catalog cannot discard it. Account imports retain journal-before-
  HTTP and validated-key commit; save/remove uses encrypted compare-and-set.
  Discovery cannot select a default node for a replaced owner. Balance/catalog
  publication checks request order and original account; saved deposit and outgoing
  recovery notices never replace an open operation. Recovery checks the exact saved
  token and single-flights across remounts before domain reconciliation.
- **Wallet funding/mints:** creation captures the mint under the wallet lock.
  Minimum amounts, seed prerequisites and duplicate-submit guards precede effects.
  QR replies cannot revive retired invoices. Saved balances precede optional node
  discovery and stay usable offline. Mint selection rechecks the expected mint
  under lock and preserves original-mint proofs/recovery journals. Durable mint
  cooldowns apply to proof, funding and recovery requests.
- **Wallet export/withdraw:** bind operations to the initiating mint inside wallet
  locks, including separate Lightning-address quote/payment steps. Quotes/maxima
  check unchanged drafts; fees require explicit approval. A paid receipt needs a
  confirmed result. Export rechecks the mint before copy; failed forced verification
  cannot mark an offline fallback balance verified. Clipboard failure retains manual
  copy. Copy/render never clears outgoing journals; only verified reconciliation
  does. Private fields scrub on close while accepted writes and clipboard clearing finish.
- **Node deposits/refunds:** capture account/session/mint before preflight and
  recheck under lock. Saved refunds retain record generation and original account
  across later sessions; credentials/tokens/generations stay private. Accepted work
  finishes after closure, and uncommitted receipts remain recoverable without
  replacing newer controls.
- **Wallet seed:** masked words stay absent from DOM until explicit reveal and
  never enter generic snapshots or action/clipboard attributes. Continuation needs
  the originating view's acknowledgement. Duplicate generation/restore shares or
  defers to accepted work. Closing suppresses private presentation without cancelling
  locked restore/clipboard cleanup. Cashu retains encrypted 12-word storage and
  funded-seed replacement protection; 24-word Sync recovery is separate.
  Wallet-wide reconciliation, cross-tab leadership and backoff outlive funding views;
  cold launch resumes durable journals and matching recovery retires cached invoices.
- **Sync:** relay/digest replies check view, request sequence, public identity and
  original relay; an unresolved identity cannot copy an earlier code. Recovery words
  are fetched only for explicit reveal/copy and remasked on refresh/disposal. Pending
  joins/restores reject duplicates, replacement and dismissal; cancelling generation
  awaits its owned attempt. Only its still-matching temporary identity may be disabled;
  configured identities survive cancellation. Restore checks its Evolu runtime after
  awaited steps, clears values and locks successful reload. Failures stay retryable
  and expose no exception/seed text in UI or logs.
- **Agent Access:** per-profile credential intent stays outside live state until
  scoped storage commits; concurrent saves cannot include provisional credentials.
  Failures roll back only changed credential/preferences and retain later edits.
  Signing/revocation holds the originating profile, relay and owner key privately;
  context preparation rechecks after awaits. A post-commit relay failure cannot undo
  saved credentials. Legacy-source ownership binds to one profile, survives failed
  saves/reloads and yields to durable credentials/revoke tombstones. Generated secrets
  are never mirrored as plaintext. Profile deletion retires its source only after
  canonical databases/blobs are removed; blocked deletion retains it.
- **Protection and backup:** non-secret snapshots exclude passwords, payloads and
  handles. One passphrase owner retains initial focus, trap, scroll lock, cleanup
  and trigger restoration. Duplicate operations are rejected; late replies cannot
  close another dialog. After encryption initializes, a failed migration keeps the
  original credentials/cancellation locked for Retry. Incomplete erasure cannot clear
  the session or reload. Reminders yield to active dialogs.

## Captured edits, asynchronous content and focus

- **Context forms/hub/goals:** isolate history/drafts and commit through captured
  profile transactions, checking observed scalar fields and relevant arrays inside
  the storage lock. Accepted writes finish on the original profile; failures/conflicts
  keep editable drafts and unrelated live edits. Source preferences resolve this tab's
  loaded profile before shared selection; mirrors cannot silence a committed update.
  Goals preserve original indices/metadata, deletion/restore intent and tie-safe order.
  Lens Save/Clear uses the same transaction; Cancel/Back does not persist a draft.
  Clearing circadian habits keeps Light setup; stored skin and display fallback remain
  separate. Nutrition retains metric storage, legacy estimates and detailed-data priority.
- **Notes and assessments:** debounced notes writes atomically check saved baselines,
  including restores; failed reads block writes. Conflicts expose newer text, with
  explicit draft retry or discard without write. Status/history publish after commit.
  Failed idle sessions retain drafts without retaining whole profiles. Catalog rebuilds
  preserve notes inputs, unique label IDs and subscriptions. Assessment fingerprints
  include facts/demographics/route so stale analysis cannot return. Recommendation
  loads capture enabled state, bridge/ticket and connected controls.
- **Context tool handoffs:** EMF returns and lazy opens check profile/form/modal
  ownership; failures leave drafts editable. Contaminant links allow only HTTP/HTTPS.
  Chat handoffs check profile/thread/history through both opening and delay. Configured
  protection cards close without rerunning setup; unavailable folder backup is hidden.
- **Nutrition:** entry/detail commits capture profile and observed meal/settings;
  changed meals, failed reads and retired controls cannot submit. Canonical/encrypted
  commits and summary updates do not depend on optional persistence permission;
  permission requests share pending work. Same-route DOM refresh is not navigation.
  Benchmark mode suspends actual editor nodes, retaining drafts and file handles,
  and cleans object URLs. Initial-focus handoff respects a newer focus target.
- **Labs/Biology:** scoring, collection policy, range/delta math, normalization,
  provenance, paging and chart construction remain domain-owned. Card keyboard
  delegates respect the nearest action, so marker activation does not also navigate
  the ancestor score card. Date/layer controls preserve native selection order and
  read/coercion/fault chronology; explicit public raw serializers remain distinct
  from typed first-party children.
- **Import/report/benchmark:** preserve marker normalization/indexing, unit/default
  values and pending draft ownership. Nested pickers retain the parent's scroll lock.
  PDF warning decisions settle once and release Escape ownership through Tab; a pending
  native confirmation is not replaced. Report preview reserves its destination
  synchronously; blur refresh cannot replace the pressed action text node. Mobile
  Reports closes the drawer first. Accepted benchmark runs persist independently of
  their dialog; stale confirmations cannot delete and locked answer keys never enter
  the deletion port.
- **Profile/client/wearable edits:** search redraw retains toolbar, composition and
  caret; deferred focus yields to newer search. Tag data is direct text, not nested
  Remove controls/comments. OAuth, confirmation, row counts and imports capture
  profile/view/sequence; Apple Health persists against a merge baseline, then derives
  only for its active owner. Queued Google Health disconnect rechecks after its lock.
  Closing wearable detail invalidates pending range work before it can reopen a modal.
- **Light setup/verdicts:** commit setup and mirrored skin atomically against both
  fields. Location replies belong to the requesting dialog. Verdicts capture profile/
  root/epoch, target and input fingerprint before concurrency waits or auto-fire queues;
  same IDs in other profiles do not deduplicate. Re-resolve current targets before
  writing. Stage success/error/orphan cleanup privately and publish only after scoped
  storage commits; unrelated live fields stay untouched. Accepted old-profile writes
  do not notify/push the replacement owner. Same-route refresh preserves an open drawer.
- **Sun/device history:** controllers retain dose, body geometry, source/mode coupling,
  spectrum/unit calculations, validation and writes. Space activation completes its
  native click before dismissal; native buttons are not also handled on keydown.
  Entering UV modes requires fresh goggle confirmation and conservative defaults.
  Ticker updates preserve controls and chip focus; region-map/blob completion does
  not steal focus. Cold recovery starts from saved `resumedAt` and exposure slices,
  never replays unknown paused time; duration edits retire timed boundaries. Final
  exposure is committed before capturing stop time. Device links keep HTTP validation.
- **Environment/cameras:** domain owners retain room/screen per-day overrides,
  historical screen identity, grading, comparison/deadband and walkthrough pause/room
  binding. Disclosure controls sit beside other actions, not around them. Audit redraw
  keeps explicit open state and only restores focus if the user did not move it.
  Sensor/calibration/sampling/confidence/save/teardown stay in camera controllers;
  failed walkthrough capture offers Retry audit.
- **Chat hosts and messages:** preserve transcript/summary hosts on reopen, keyed
  message controls, citations, editor drafts and selection on same-conversation
  refreshes. Draft services check originating input/profile/thread revisions. Public
  plain-text streaming hosts retire before replacement; late generation/clipboard
  completion cannot touch another message. Edits retain transactional rollback and
  the separate unsent composer draft. Recommendations capture message identity,
  animate only new completions, respect reduced motion and release observers/frames.
  Attachment drops capture OS handles before awaiting; file decoding remains service-owned.
- **Chat onboarding/models/personas/discussion:** provider handoffs check ownership
  before and after Settings. Profile onboarding serializes captured writes, merges
  the canonical kilogram row via shared conversion, and rolls back only failed weight
  data; country latitude is local, without geocoding/write-on-mount. DNA confirmations
  use captured baselines, persist before notification and remain retryable; saved
  confirmation survives remount only for its matching SNP fingerprint. Context insight
  requests deduplicate captured inputs, retire on route/consent/profile changes and
  attribute dispatched usage to the original provider/model/profile. Catalog choices
  check backend/target/config/view and latest request. Persona editing guards draft
  revisions; per-profile serialized storage preserves newer optimistic catalogs and
  dirty edits; editor-origin dismissal cannot close a picker reopened by cancellation.
  Sync notifications retain their originating profile, loading inactive durable data
  as needed. Discussion captures persona/context/model before knowledge lookup,
  checks cancellation after lookup/provider completion, and rejects changed CLI
  agent/target/model. Background rounds persist only through their originating
  conversation's serialized encrypted history; deletion cannot resurrect a body.
- **Voice and layout:** capture holds input/profile/thread, disclosed provider/settings,
  abort signal and timers. Late permission grants release tracks before recording;
  stale transcription cannot insert elsewhere. Capture and playback cancellation
  are separate owners. Model downloads require confirmation; voice preferences,
  portable voice preferences/cloud keys use encrypted settings/sync while consent
  remains browser-local. Provider choice, local model/hardware and local-server URL/key
  remain device-local; full backups omit device-wrapped keys unless passphrase
  protection makes them portable. One Voice schema owns those allowlists.
  Splitter cancellation covers capture loss, blur, close, fullscreen, rail/mobile
  transitions and disposal, without changing another owner's preferences.

UI refreshes also preserve same-profile Dashboard roots on no-op sync and do not
let a dismissed onboarding timer reopen Chat over a new route. Settings layout
keeps native role-specific desktop density and separate coarse-pointer targets;
verify themes, keyboard/focus and narrow containment when changing shared controls.

## Lazy resources and stable URLs

First-use loaders wait for required modules and styles before showing a surface.
They share concurrent loads, remove failed links for retry, preserve HTML cascade
anchors and retain declared service-worker assets for offline first use. Eager
cross-feature styles must stay with their shared startup owner.

| Surface | Loading boundary | Preserved behavior |
| --- | --- | --- |
| Light/Sun | `light-sun-loader` → `app-light-sun-modules` | Loads on route/widget, active-session recovery or needed Chat context; awaits ordered Light sheets. Picker figure/mask remain explicit offline assets. |
| Settings/Tweaks | `settings-loader` + `/css/settings.css` | First shell/deep-link/action; theme accent and cold Light data-source delegates stay independently initialized. |
| Optional themes | `theme` + `/themes-extra.css` | Dark/light skip it; saved optional theme loads before paint. Failure restores core dark and retries; final shared/sunset modes retain their later eager position. |
| Chat | `chat-loader`/`app-chat-hooks` + ordered open-panel sheets | Closed launcher/shell stays eager; load on action/prompt/shortcut/deep-link. Retry the stylesheet group before redesign overrides. |
| Voice | `voice-loader` | Engines load on dictation, Listen or auto-read. Workers are precached; large remote models are not. |
| Provider transports | `api` metadata + lazy transports | Startup selection/key/model availability stays synchronous; browser-direct inference has no hosted generic fallback. |
| Wearables/Cycle | `wearables-runtime` / `cycle-runtime` | Detail/manual/settings and female overview/editor/import paths wait for their sheets; local stores stay separate. |
| Genome | `dna-runtime` + `/css/genetics.css` | Behavior stays module-eager; route/preview/manual UI waits for CSS; dashboard tiles stay eager. |
| Category/Compare/Correlations | `category-page-runtime` + `/css/category-views.css` | Route behavior remains eager; shared Dashboard date controls/alerts keep eager styles. |
| Client List | public facade → implementation + `/css/client-list.css` | Shell/profile/location entry points wait for the same first-use load. |
| Import | `import-loader` + `/css/import.css` | File/drop, restored draft or cycle preview; shared status/drop-zone/buttons remain eager. |
| Marker detail | eager adapter + `/css/marker-detail-modal.css` | Detail/manual/custom first modal waits for CSS before Recommendations' cascade anchor. |
| EMF | `emf-runtime` / `emf-interpretation-runtime` + `/css/emf.css` | Load implementation and editor styles together; cold close never fetches UI. Streams retain request/profile/data/view ownership; launchers keep eager cross-feature styles. |
| Biology | `biology-page-loader` + `category-page-runtime` | Calculations, Dashboard projection and shared review contracts remain eager; page/AI first use awaits module and CSS with route/profile/request/root guards. Startup awaits the saved route. |
| Profile Share | `profile-share-loader` | Load on direct action or shared-link startup/hash; validation/encryption/import remain controller-owned. |

## External content and portable output

All stored/user/provider labels are literal escaped data. Rich Chat/Biology/EMF
content uses the established Markdown sanitizer and URL checks; it never becomes
arbitrary component markup. Trusted extension/public renderer slots retain their
named contracts and DOM-sink policy membership. First-party composition uses
readonly models and genuine children, including context catalogs in Chat and
attestation badges in message usage.

Reports/summary print documents keep explicit self-contained styles for offline
synchronous printing. Profile sharing remains browser-encrypted: the service
handler owns envelope/TTL/size/origin/management-token/abuse checks. Operated ids
use `vps1_`; old Vercel Blob reads/deletes stop after their configured at-most-31-day
window, without copying records. Temporary share storage has no retained backup,
so deleted/expired links cannot reappear through restoration. See
[optional integration boundaries](optional-integrations.md),
[static distribution](static-sveltekit.md) and the [testing policy](testing-policy.md).
