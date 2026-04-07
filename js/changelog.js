// changelog.js — What's New modal, version tracking, auto-trigger on update
// APP_VERSION comes from /version.js (loaded as classic script before modules)

import { escapeHTML } from './utils.js';

const CHANGELOG = [
  {
    version: '1.16.0', date: '2026-04-07', title: 'Decentralized Routstr',
    items: [
      'Decentralized AI \u2014 discover Routstr nodes via Nostr relays, connect to any node directly from your browser',
      'In-app Cashu wallet \u2014 BIP-39 seed, Lightning deposit/withdraw, Cashu token send/receive, mint selection',
      'Node picker \u2014 browse online nodes, deposit sats, withdraw back to wallet, auto-mint compatibility',
      'Wallet recovery \u2014 seed phrase restore, pending deposit/withdraw recovery, encrypted backup via sync',
    ]
  },
  {
    version: '1.15.0', date: '2026-04-05', title: 'PPQ + Wallet Topups',
    items: [
      'New AI provider: PPQ \u2014 300+ models, no KYC. Bitcoin, crypto + Bitrefill topup',
      'In-app wallet topup \u2014 fund Routstr (Lightning QR + Cashu) and PPQ (Lightning, Bitcoin, Monero, Litecoin, Aqua) directly in getbased',
      'Balance display for OpenRouter, Routstr, PPQ, and Venice in settings',
      'Removed Anthropic direct provider \u2014 Claude models available via OpenRouter, PPQ, Venice, Routstr',
      'Bugfixes and improvements',
    ]
  },
  {
    version: '1.14.0', date: '2026-04-01', title: 'Routstr + Tor + Audit',
    items: [
      'New AI provider: Routstr \u2014 pay with Bitcoin eCash or Lightning. No account, no subscription',
      'Tor hidden service \u2014 full app accessible via .onion. Sync relay auto-switches to .onion. Tor Browser shows ".onion available" badge on clearnet',
      'Codebase audit \u2014 8 bug fixes, 6 accessibility fixes, 2 security hardening, dead code cleanup',
    ]
  },
  {
    version: '1.13.2', date: '2026-03-31', title: 'Agent Access',
    items: [
      'ISO timestamps on all lab values in AI context \u2014 precise dates instead of month/year for better trend analysis',
      'Delta indicators (\u2191/\u2193/\u2192) on all multi-reading markers \u2014 compares to previous reading for accurate recent-trend direction',
      'Rename OpenClaw to Agent Access \u2014 works with getbased-mcp on Hermes Agent, OpenClaw, or any MCP-compatible agent',
    ]
  },
  {
    version: '1.13.1', date: '2026-03-31', title: 'DEXA Scan Support',
    items: [
      'New Body Composition category \u2014 body fat %, lean mass, fat mass, BMI, android/gynoid fat, A/G ratio, visceral fat area',
      'New Bone Density category \u2014 BMD spine/femur, T-scores and Z-scores (total + neck) with WHO classification ranges',
      'Sex-specific reference and optimal ranges for body fat %',
      'Detail modal: hide no-data date cards, color-coded top border (green/red/yellow by status)',
    ]
  },
  {
    version: '1.13.0', date: '2026-03-29', title: 'Tips & Recommendations',
    items: [
      '80 tip slots across biomarkers and lifestyle — Nature \u2192 Whole Food \u2192 Tools \u2192 Supplements',
      'Every supplement form linked to a PubMed study (239 references). Community corrections via GitHub',
      'Fitzpatrick skin type (I\u2013VI) in Light & Circadian card',
      'Local AI CORS help now works on all browsers and shows OS-specific instructions',
    ]
  },
  {
    version: '1.12.0', date: '2026-03-27', title: 'Sync Status & Fixes',
    items: [
      'Sync status indicator in header — green/amber/red dot shows relay connectivity, push confirmation, and pull status',
      'Click the sync dot for details: relay status, last push/pull timestamps, "Sync now" button',
      'Manual mtDNA haplogroup entry in Edit Client form and chat onboarding — no mutation file needed',
      'Fix modal windows closing when drag-selecting text to outside the modal (#87)',
      'Fix 23andMe v5 raw data import — newer export header variant was unrecognized (#89)',
      'PDF report now includes "Additional notes for AI context" field (#92)',
      'PDF report shows precise dates (day + month + year) instead of month only (#93)',
    ]
  },
  {
    version: '1.11.0', date: '2026-03-26', title: 'mtDNA Haplogroup',
    items: [
      'Import mtDNA mutation files (CSV) — resolves maternal haplogroup from diagnostic mutations',
      'Mitochondrial coupling classification based on Doug Wallace\'s framework (coupled → uncoupled)',
      'Environment mismatch detection — compares your haplotype\'s climate adaptation against your latitude',
    ]
  },
  {
    version: '1.10.4', date: '2026-03-26', title: 'Biometrics',
    items: [
      'Track height, weight, blood pressure, and resting pulse in the Edit Client form',
      'Auto-calculated BMI from height + latest weight with category label',
      'Time-series entries with date, averages, and history list for weight, BP, and pulse',
      'Biometrics included in AI context, JSON export/import, and PDF report',
    ]
  },
  {
    version: '1.10.3', date: '2026-03-25', title: 'Food Contaminants',
    items: [
      'Diet card scanned for food contaminant signals — pesticide residues (EWG Dirty Dozen) and plastic chemicals (PlasticList)',
      'Clickable warning on diet card opens detail modal with sources and "Discuss with AI" prompt',
      'Both mito warnings and food contaminants now included in AI context for smarter analysis',
    ]
  },
  {
    version: '1.10.2', date: '2026-03-25', title: 'Mitochondrial Warnings',
    items: [
      'Supplements & medications scanned against independently compiled mitochondrial effects database (PubMed-cited)',
      'Warnings appear below the supplement timeline — only harmful effects flagged (inhibits, depletes, disrupts)',
      '"Ask AI for context" opens the chat with a pre-filled prompt about your specific compounds',
    ]
  },
  {
    version: '1.10.1', date: '2026-03-25', title: 'Chat Summaries',
    items: [
      'Summarize any conversation thread — generates structured notes with key findings, action items, and open questions',
      'Summary modal with copy, download (.md), and print',
      'Saved summaries persisted per-profile and listed in the thread rail',
    ]
  },
  {
    version: '1.10.0', date: '2026-03-25', title: 'Context Tags',
    items: [
      'Section tags in AI context output — machine-parsable [section:name] tags for OpenClaw bot integration',
      'Lab categories include updated:date attributes and an [index] block for selective parsing',
    ]
  },
  {
    version: '1.9.9', date: '2026-03-25', title: 'Sync reliability',
    items: [
      'Fixed sync relay quota — CRDT operations no longer silently fail when exceeding relay limits',
      'Chat messages now refresh live when synced from another device',
      'Added sync diagnostics and polling safety net for missed sync events',
    ]
  },
  {
    version: '1.9.7', date: '2026-03-23', title: 'OpenClaw',
    items: [
      'OpenClaw integration — connect your self-hosted AI bot to answer questions about your labs over any messenger (Settings → Data → OpenClaw)',
    ]
  },
  {
    version: '1.9.6', date: '2026-03-23', title: 'Sync fixes',
    items: [
      'Fixed sync relay connection — data now correctly routes to the self-hosted relay instead of the default Evolu relay',
      'Fixed mnemonic regeneration — disabling and re-enabling sync generates a fresh identity',
      'Fixed chat thread sync when encryption is enabled',
      'Fixed chat history loss when AI stream errors mid-response (#84, #85)',
    ]
  },
  {
    version: '1.9.5', date: '2026-03-22', title: 'Cross-device sync',
    items: [
      'Cross-device sync — E2E encrypted via Evolu CRDT. All profiles and AI settings sync automatically across your devices',
      'Self-hosted relay with live connectivity indicator — no third-party dependencies',
    ]
  },
  {
    version: '1.9.4', date: '2026-03-20', title: 'Proportional chart timelines',
    items: [
      'Chart x-axes now use proportional time spacing — a 1-month gap looks smaller than a 6-month gap, so trends are visually accurate',
      'Fixed phase-aware point colors and tooltips for markers that start later than your first lab draw (female profiles with cycle tracking)',
    ]
  },
  {
    version: '1.9.3', date: '2026-03-20', title: 'Context change history',
    items: [
      'AI now knows when your health context changed — diet switches, new exercise routines, stress changes, etc. are timestamped and included in AI context so it can reason about temporal correlations with your lab results (#76)',
      'Chart timelines extend to today when your last labs are more than 30 days old, so supplements and notes added since then are visible (#78)',
    ]
  },
  {
    version: '1.9.2', date: '2026-03-20', title: 'Supplements, notes & export improvements',
    items: [
      'Focus card now includes supplements with date-aware context — AI no longer attributes changes to supplements started after your last labs (#80)',
      'Add a note/reason to each supplement to track why you\'re taking it — shown in editor, chart tooltips, AI context, and PDF report (#74)',
      'Per-biomarker notes — add persistent notes to any marker from the detail modal, included in AI context (#79)',
      'Genetics section added to PDF export report — full table of findings grouped by category with effect severity (#73)',
      'Removed Sources (OpenAlex) feature — web search via OpenRouter provides better academic coverage',
    ]
  },
  {
    version: '1.9.1', date: '2026-03-19', title: 'Thinking model support + Ollama Cloud',
    items: [
      'Thinking models (Kimi K2.5, DeepSeek R1/V3, GLM-5, QwQ) no longer produce empty responses — max_tokens cap removed so reasoning and content both fit',
      'Focus card and context card health dots work with all thinking models on any provider',
      'Ollama Cloud :cloud models recognized in Model Advisor with cloud badge and fitness ratings',
    ]
  },
  {
    version: '1.9.0', date: '2026-03-19', title: 'Venice End-to-End Encryption',
    items: [
      'Venice E2EE — prompts encrypted in your browser, decrypted only inside a verified TEE. Toggle in Venice settings swaps to E2EE models',
      'Per-message lock indicator (🔒 e2ee) in chat footer when E2EE was used',
      'Web search context hints — model knows when it has web access and when to suggest enabling it',
      'Chat links in user messages now visible (white on accent gradient)',
      'Thread list no longer reorders when switching between conversations',
    ]
  },
  {
    version: '1.8.5', date: '2026-03-19', title: 'Fatty acid trends + smarter trend colors',
    items: [
      'Fatty acid panels now show trend charts across multiple tests — previously only the latest result was visible',
      'Trend arrow colors reflect whether the change is good or bad relative to reference ranges (not just direction)',
      'Raw URLs in chat responses are now clickable links',
      'Fix: importing fatty acid results alongside blood work on the same date no longer loses the FA data',
    ]
  },
  {
    version: '1.8.4', date: '2026-03-18', title: 'Web search in chat',
    items: [
      'Web search toggle in chat — AI can search the internet before responding, useful for recent studies, drug interactions, and current information',
      'Available with OpenRouter and Venice providers; toggle auto-hides for Anthropic and Local AI',
      'Cost footnote shows 🌐 web indicator when search was active; flag persists in message history',
    ]
  },
  {
    version: '1.8.3', date: '2026-03-17', title: 'Chat search + scroll fix',
    items: [
      'Search across chat messages — find any keyword across all conversations with highlighted snippets, click to jump directly to the message (#72)',
      'Smart auto-scroll during AI streaming — scroll up to read earlier text without the chat fighting you back to the bottom (thanks @NodeVonHydra)',
      'Fix: toggling AI provider no longer auto-opens the chat panel (#71)',
    ]
  },
  {
    version: '1.8.2', date: '2026-03-16', title: 'Image import + scanned PDF auto-detect',
    items: [
      'Import lab reports from photos/screenshots (JPG, PNG, WebP) — drop or browse, same AI pipeline as PDF image mode',
      'Scanned PDFs auto-switch to image mode — no manual step needed (#67)',
      'Model Advisor works with all Local AI backends — LM Studio, Jan, not just Ollama (#68)',
      'Focus card persists when AI is paused — shows cached insight instead of disappearing (#69)',
      'DNA import: detect raw data files by content, not just filename — fixes silent failure for renamed 23andMe exports (#70)',
    ]
  },
  {
    version: '1.8.1', date: '2026-03-15', title: 'Biological Age + hs-CRP/HDL',
    items: [
      'Biological Age — combines PhenoAge (Levine 2018, 9 markers) and Bortz Age (Bortz 2023, 22 markers) into a single estimate with chronological age reference line',
      'hs-CRP/HDL Ratio — composite inflammation-lipid cardiovascular risk marker (optimal < 0.24, ref < 0.94)',
      'PhenoAge now accepts standard CRP as fallback when hs-CRP is unavailable',
    ]
  },
  {
    version: '1.8.0', date: '2026-03-15', title: 'DNA Import',
    items: [
      'Drop a raw DNA file (Ancestry, 23andMe, MyHeritage, FTDNA, Living DNA) — parsed locally in a Web Worker, never transmitted',
      '42 curated SNPs across 10 categories (methylation, iron, lipids, vitamin D, B12, blood sugar, sex hormones, thyroid, bilirubin, fatty acids) mapped to your tracked biomarkers',
      'APOE haplotype auto-resolved to ε2/ε3/ε4 notation from the two component SNPs',
      'Genetics dashboard section — collapsible, grouped by category, sorted by severity, expandable to show all findings',
      'Inline SNPs in biomarker detail modals — open Vitamin D and see your VDR, GC, CYP2R1 variants right next to your lab values',
      'AI chat automatically receives your genetic context when interpreting lab results',
      'Each SNP links to its primary study (PubMed) and SNPedia for deeper reading',
      'Sidebar entry and DNA upload step in chat onboarding',
    ]
  },
  {
    version: '1.7.7', date: '2026-03-14', title: 'Local AI Model Advisor',
    items: [
      'Settings → Local AI now rates each installed model for lab analysis: ★ Recommended, Capable, Underpowered, or Inadequate',
      'GPU auto-detected — shows which models fit your VRAM (fits / tight / too large)',
      'Suggests a better model to pull when none of your installed models are recommended',
      'Model dropdown shows file size and quantization at a glance',
      'Remote Ollama servers detected — enter server VRAM manually for accurate recommendations',
    ]
  },
  {
    version: '1.7.6', date: '2026-03-14', title: 'Focus Card + Chat Polish',
    items: [
      'Focus card now considers your health goals, interpretive lens, medical conditions, and context notes',
      'Expanded from one sentence to a brief 2-3 sentence insight with a concrete next step',
      'Typewriter streaming effect — text trickles in smoothly instead of popping in after a wait',
      'Chat now renders markdown tables, blockquotes, headings, and styled callouts',
      'PhenoAge detail modal shows exactly why calculation failed — per-date gaps, CRP mismatch, unit issues',
      'Open-ended optimal ranges now display correctly on charts and in all views',
    ]
  },
  {
    version: '1.7.5', date: '2026-03-13', title: 'Smarter Imports',
    items: [
      'PDF import now captures every numeric result — no more silently dropped markers',
      'Better handling of European lab reports — specimen prefixes and local naming conventions recognized',
      'CRP and hs-CRP tracked as separate markers — PhenoAge correctly requires hs-CRP',
      'Import progress pill shows live status when you scroll away or switch views',
      'Rename any marker from its detail view',
      'PhenoAge and other calculated markers tell you exactly which inputs are missing',
      'Slow AI models no longer get false timeout errors',
    ]
  },
  {
    version: '1.7.3', date: '2026-03-13', title: 'Privacy & Self-Hosting',
    items: [
      'Bundled Chart.js, pdf.js, and fonts locally — no more external CDN calls',
      'Self-hosted analytics — replaced third-party Umami Cloud with own instance',
      'Updated landing page privacy copy to accurately reflect what the app does',
    ]
  },
  {
    version: '1.7.2', date: '2026-03-12', title: 'Issue Fixes & Category Customization',
    items: [
      'Rename categories and change icons with a built-in emoji picker',
      'Pause AI features globally — toggle in Settings → AI tab',
      'Fatty acid cards and table/heatmap rows now open the detail modal',
      'Two-step range revert: manual edit → lab range → schema default',
      'PhenoAge biological age calculation',
      'Urea renamed to "Urea (BUN)" for clarity',
      'Updated default category icons (Hormones, Electrolytes, Lipids, Diabetes, Hematology, WBC)',
      'Toggle sliders replace checkboxes in Settings Privacy section',
    ]
  },
  {
    version: '1.7.1', date: '2026-03-11', title: 'Open-Ended Ranges & Bug Fixes',
    items: [
      'Open-ended reference ranges — clear min or max to set one-sided ranges (e.g. eGFR >59), charts show solid threshold line',
      'Fixed "Ask AI about this marker" sending wrong reference range when optimal/both mode was active',
      'Fixed edited ranges showing "lab" badge instead of "edited", with revert support for both',
      'Fixed percentage biomarkers (Neutrophils %, etc.) importing with wrong reference ranges',
      'Custom markers without ranges now show a clickable placeholder to add them',
      'Fixed OpenRouter custom model pricing not updating — now fetches real pricing on Enter',
      'Fixed thinking model JSON errors — <think> tags stripped before parsing, longer error display',
      'Review & Edit panel: scroll position preserved, diff view is read-only until Edit clicked',
      'Multiple PDF imports on the same date now tracked — Settings shows all filenames',
      'Clearer error for insufficient API credits (402)',
    ]
  },
  {
    version: '1.7.0', date: '2026-03-10', title: 'Specialty Labs & Custom Markers',
    items: [
      'Improved specialty lab support — better detection and categorization for OAT, fatty acid, and combination reports',
      'Delete custom biomarkers — click any custom marker and use "Delete this marker" at the bottom',
      'Set optimal ranges when creating new biomarkers via the "+" button',
    ]
  },
  {
    version: '1.6.2', date: '2026-03-10', title: 'Create Custom Biomarkers',
    items: [
      'Manually create new biomarkers — "+" button next to Categories in the sidebar',
      'Define marker name, unit, category (existing or new), and reference range',
      'After creation, immediately prompts to add the first value',
      'Custom markers are included in the AI marker reference for future PDF imports',
    ]
  },
  {
    version: '1.6.1', date: '2026-03-10', title: 'Import Fixes, Usage Tracking & New Markers',
    items: [
      'AI usage tracking — see per-profile and total AI costs in Settings → AI tab',
      'Cost guide added to docs — real-world pricing estimates for recommended models',
      'Plateletcrit (PCT/Trombokrit) added as a built-in hematology marker',
      'Calcitriol (1,25-(OH)₂D) added as a built-in vitamin marker',
      'Hematocrit now displays with % unit (existing data auto-migrated)',
      '18 missing unit conversions added (thyroid, iron, proteins, lipids, hematology, bone, tumor markers)',
      'Insulin now syncs between Hormones and Diabetes categories regardless of how the AI mapped it',
      'Both-range mode shows reference + optimal ranges on dashboard cards',
      'Sidebar counts now match the active date range filter',
      'Sidebar date filter hides single-point categories (Fatty Acids, etc.) outside the range',
      'PDF filename shown in Settings data list',
      'Refresh all health dots button (↻) on context cards',
      'PII review: visible Edit button for obfuscated text',
      'Reference range badges from lab imports show "lab ×" instead of "edited ×"',
      'Import no longer stores redundant range overrides when lab ranges match defaults',
      'Context cards preserve open/collapsed state on save',
      'Focus card prompt improved for local models',
      'Import preview: wider modal, status badges no longer wrap',
      'Guided tour updated to 8 steps with import FAB and profile button',
      'Light theme scrollbar improved for better visibility',
    ]
  },
  {
    version: '1.6.0', date: '2026-03-09', title: 'Chat Onboarding & Cycle Overhaul',
    items: [
      'New visitors get a friendly chat walkthrough — set up your profile, connect AI, and fill context cards step by step',
      'Menstrual cycle setup integrated into onboarding — regular periods, perimenopause, menopause, pregnancy, breastfeeding',
      'Cycle status field throughout the app — stats, period log, and phase features adapt to your status',
      'LH, FSH, and prolactin added to hormone markers with phase-aware reference ranges for LH and FSH',
      'Hormonal contraception auto-detected — phase ranges and chart bands disabled when on hormonal BC',
      'Flow strength now auto-calculated from your period log entries',
      'Contraceptive field replaced with structured dropdown (hormonal and non-hormonal options)',
      'Expanded period symptoms to 17 options including hot flashes, night sweats, anxiety, and clots',
      'Perimenopause detection now checks for vasomotor symptoms and skipped cycles',
      'Quick-add supplements and medications during onboarding',
      'First-time visitors see the chat guide instead of the app tour',
    ]
  },
  {
    version: '1.5.3', date: '2026-03-08', title: 'Import & Editing Improvements',
    items: [
      'When importing a PDF, you can now exclude individual results and see the lab\'s reference ranges before confirming',
      'New import button in the bottom-right corner for quicker access to importing',
      'Changed a value? A revert button lets you go back to what the lab originally reported',
      'Use any AI model on OpenRouter by typing its ID directly',
      'AI discussions now pick up where you left off after refreshing the page',
      'Automatic backups saved daily and kept for 30 days',
    ]
  },
  {
    version: '1.5.2', date: '2026-03-08', title: 'Chat & Discuss Mode Improvements',
    items: [
      'Get a second opinion — pick which AI persona joins your chat discussion',
      'Marker charts and values display correctly in the detail view',
      'Create custom AI personas with a cleaner editor and auto-generated emoji',
      'New "Unconventional Views" option when creating AI personas',
      'Imported vs manually entered values are now labeled in Settings',
    ]
  },
  {
    version: '1.5.1', date: '2026-03-07', title: 'EMF Improvements & Mobile',
    items: [
      'EMF: sleeping vs daytime SBM-2015 thresholds — severity adjusts per room type',
      'EMF: AI interpretation modal — stream analysis of single assessments or before/after comparisons, saved with assessment',
      'EMF: meter presets with autocomplete, room photos (up to 6 per room), before/after comparison view',
      'Mobile: hamburger menu with slide-out sidebar replaces stacked category pills',
      'Mobile: cleaner header — hides dates, range toggle, feedback, and donate on small screens',
      'Desktop: header groups with subtle dividers between profile, data, and actions',
    ]
  },
  {
    version: '1.5.0', date: '2026-03-06', title: 'EMF Assessment',
    items: [
      'Environment card: Baubiologie EMF assessment sub-module — track electromagnetic field measurements room by room',
      'SBM-2015 severity grading (No Concern → Extreme Concern) for 5 measurement types: AC electric, AC magnetic, RF/microwave, dirty electricity, DC magnetic',
      'Import EMF consultant reports via PDF — AI extracts rooms, measurements, sources, and mitigations',
      'Printable consultant template for on-site assessments (download from EMF editor)',
      'EMF data included in AI chat context, JSON export/import, and environment summary',
    ]
  },
  {
    version: '1.4.3', date: '2026-03-07', title: 'Improved Fatty Acids Support',
    items: [
      'Improved support for fatty acid panels — each lab appears as its own subcategory under a "Fatty Acids" sidebar group',
      'Auto-detects fatty acid lab from PDF content',
      'Re-importing a PDF now updates category labels instead of keeping stale ones from previous imports',
    ]
  },
  {
    version: '1.4.2', date: '2026-03-07', title: 'Bugfixes & Improvements',
    items: [
      'Edit any value — click a value in the detail modal to change it inline, with "edited" badge',
      'Fix: manually added values now store correctly in US unit mode',
      'Compact drop zone on dashboard after first import',
      'Auto-backup cooldown increased to 5 minutes to avoid snapshot churn',
      'PII review: retry button stays visible after successful obfuscation',
    ]
  },
  {
    version: '1.4.1', date: '2026-03-07', title: 'Bugfixes & Improvements',
    items: [
      'Fix: lab reference ranges from US-unit PDFs now import correctly',
      'Fix: PII review diff highlighting works properly with thinking models',
      'Improved PII review editing — cursor lands where you click, highlights persist after edits',
      'Better matching for US lab markers like BUN',
    ]
  },
  {
    version: '1.4.0', date: '2026-03-05', title: 'Image Attachments',
    items: [
      'Chat: attach images via paperclip button, paste, or drag-and-drop \u2014 AI can see photos of lab reports, supplement labels, food logs, and more',
      'Chat: up to 5 images per message, resized for optimal quality vs token cost',
      'PDF import: scanned/image-heavy PDFs now detected automatically with image mode fallback \u2014 renders pages as screenshots for AI analysis',
      'PDF import: "Force image mode" link in drop zone for known scans',
      'Vision support detection: attach button auto-hidden for non-vision models',
      'HD mode toggle: switch between standard (1024px) and high-resolution (2048px) image quality',
      'Image quality warnings: detects blurry, dark, or overexposed photos before sending',
      'Chat: smooth typewriter streaming replaces chunky text updates',
      'Chat: conversation window expanded from 10 to 30 messages for better context',
    ]
  },
  {
    version: '1.3.7', date: '2026-03-06', title: 'Reference Ranges & PII Improvements',
    items: [
      'Editable reference ranges — click any range in the detail modal to customize, with revert badge',
      'Import-time range adoption — toggle to use your lab\'s reference ranges from the PDF',
      'BUN/Creatinine ratio added as a calculated marker in the Kidney category',
      'PII review: green word-level diff highlighting on the right panel, click-to-edit',
      'PII review: model unloads from VRAM on Stop, Cancel, or Use Regex',
      'US lab PII patterns: Specimen ID, Accession No, Account No, MRN, phone, Member ID',
      'IU/L enzyme unit normalization (ALT, AST, ALP) — no more double-conversion on import',
      'Empty marker charts hidden in category views',
      'Background scroll locked on PII review modals',
    ]
  },
  {
    version: '1.3.6', date: '2026-03-05', title: 'Settings Cleanup',
    items: [
      'Profile tab removed from Settings — sex, date of birth, and location are now in the Client List',
      'Location field in Client List now shows live latitude with AI refinement (same as the old Settings)',
    ]
  },
  {
    version: '1.3.5', date: '2026-03-05', title: 'Security & Accessibility Audit',
    items: [
      'Fixed XSS vectors in PDF import preview and settings error messages',
      'Chat threads now encrypted at rest when encryption is enabled',
      'Orphaned CSS cleaned up, ARIA labels added to chat inputs and modals',
      'Avatar src validated, LAN IPs excluded from service worker caching',
    ]
  },
  {
    version: '1.3.4', date: '2026-03-05', title: 'Backup & Key Encryption',
    items: [
      'API keys are now encrypted at rest when encryption is enabled',
      'Folder backup writes timestamped snapshots and prunes to 5 files (matching IndexedDB)',
    ]
  },
  {
    version: '1.3.3', date: '2026-03-05', title: 'Local AI CORS Hints',
    items: [
      'HTTPS + LAN IP detection — immediate warning instead of a confusing timeout',
      'CORS-specific error message when Ollama blocks cross-origin requests',
      'Docs updated with localhost-only HTTPS limitation and OLLAMA_ORIGINS guidance',
    ]
  },
  {
    version: '1.3.2', date: '2026-03-05', title: 'Streaming PII Review',
    items: [
      'PII review modal now streams Local AI obfuscation in real-time \u2014 no more waiting blindly',
      'Regex fallback is an explicit button ("Use regex instead"), not a silent timeout',
      'Stop button to cancel mid-stream and edit partial results',
      'Fixed nested scrollbars in the PII review modal',
    ]
  },
  {
    version: '1.3.1', date: '2026-03-05', title: 'Unified Local AI',
    items: [
      'Provider tab renamed from "Ollama" to "Local" \u2014 one option for all local servers',
      'Removed Ollama/OpenAI mode toggle \u2014 uses the standard OpenAI-compatible API for everything (Ollama, LM Studio, Jan, etc.)',
      'PII obfuscation now works with any local server, not just Ollama',
      'API key field always visible (optional \u2014 most local servers don\u2019t need one)',
    ]
  },
  {
    version: '1.3.0', date: '2026-03-04', title: 'OpenAI-Compatible Local Servers',
    items: [
      'LM Studio, Jan, llama.cpp, LocalAI, and other OpenAI-compatible servers now supported',
      'Mode toggle in Local AI settings \u2014 switch between Ollama and OpenAI Compatible',
      'Optional API key field for servers that require authentication',
      'Auto-discovers models from any /v1/models endpoint',
      'Editable PII review \u2014 fix remaining personal info before sending to AI',
    ]
  },
  {
    version: '1.2.3', date: '2026-03-04', title: 'Folder Backup & Security',
    items: [
      'Auto-backup to a local folder (Proton Drive, Dropbox, NAS, etc.)',
      'Writes getbased-backup-latest.json + daily dated snapshots',
      'Periodic nudge reminds you to download a backup (every 30 days)',
      'Stronger passphrase requirements for encryption (8+ chars, mixed case, special)',
      'Live strength meter with rule checklist in encryption setup',
    ]
  },
  {
    version: '1.2.1', date: '2026-03-03', title: 'Export Upgrade',
    items: [
      'Per-client export from the Client List \u22ee menu',
      'Export All Clients \u2014 full database backup from Client List or Settings',
      'Exports include chat history, threads, and custom personalities',
      'Database bundle import with auto-merge across browsers',
    ]
  },
  {
    version: '1.2.0', date: '2026-03-03', title: 'Client Management',
    items: [
      'Client List modal \u2014 search, sort, filter, and manage all profiles',
      'Profile tags, notes, status (active/flagged/archived), and pinning',
      'Full client form replaces prompt dialogs (name, sex, DOB, location, avatar)',
      'Compact header button with avatar dot opens Client List',
    ]
  },
  {
    version: '1.1.4', date: '2026-03-01', title: 'Diet & Digestion',
    items: [
      '10 new digestion fields on the Diet card (bowel, bloating, reflux, etc.)',
      'Digestive health included in AI context',
    ]
  },
  {
    version: '1.1.3', date: '2026-02-28', title: 'Encryption Nudge',
    items: [
      'One-time prompt to enable encryption after first PDF import',
    ]
  },
  {
    version: '1.1.2', date: '2026-02-28', title: 'Documentation Update',
    items: [
      'New Specialty Labs guide (OAT, DUTCH, HTMA)',
      'Updated 6 guide pages with latest features',
    ]
  },
  {
    version: '1.1.1', date: '2026-02-28', title: 'Model Guidance',
    items: [
      'Model dropdowns split into Recommended / Other tiers',
      'Active model shown in chat header with per-message cost',
      'Cross-provider model mismatch warning fixed',
    ]
  },
  {
    version: '1.1.0', date: '2026-02-28', title: 'Specialty Labs & Brand Refresh',
    items: [
      'Specialty lab support (beta) \u2014 OAT, amino acids, fatty acids, toxic elements',
      'Brand refresh \u2014 getbased gradient wordmark, SVG icons, cleaner layout',
      'Batch import auto-retry and single dashboard refresh',
      'Ollama PII obfuscation now opt-in (Settings \u2192 Privacy)',
      '\u20bf Donate button in header',
    ]
  },
  {
    version: '1.0.5', date: '2026-02-27', title: 'One-Click OpenRouter',
    items: [
      'One-click OAuth connect \u2014 no more copying API keys',
      'OpenRouter is now the default provider tab',
    ]
  },
  {
    version: '1.0.4', date: '2026-02-27', title: 'Simplified First Visit',
    items: [
      'Welcome hero with drop zone and demo data',
      'Context cards collapsed by default for new users',
    ]
  },
  {
    version: '1.0.3', date: '2026-02-27', title: 'Chat Improvements',
    items: [
      'Floating chat bubble \u2014 always one tap away',
      'Setup guide when no API key is configured',
    ]
  },
  {
    version: '1.0.2', date: '2026-02-27', title: 'Pre-Lab Onboarding',
    items: [
      'No lab data? Fill context cards and get personalized test recommendations',
      'Chat prompts adapt to your state (pre-lab, onboarding, analysis)',
      'Health dots work on context alone, even without lab results',
    ]
  },
  {
    version: '1.0.1', date: '2026-02-27', title: 'Minor Tweaks',
    items: [
      'Minor tweaks and bug fixes',
    ]
  },
  {
    version: '1.0', date: '2026-02-25', title: 'Launch',
    items: [
      'AI-powered PDF import \u2014 any lab report, any language',
      '287+ biomarkers across 26 categories with interactive charts',
      'AI chat with customizable personalities',
      'Menstrual cycle-aware interpretation with phase-specific ranges',
      '9 lifestyle context cards that shape AI analysis',
      'Fully private \u2014 all data stays in your browser',
    ]
  },
];

/** Extract major.minor from a semver string (e.g. '1.0.1' → '1.0') */
function getMajorMinor(ver) {
  const parts = String(ver).split('.');
  return parts.slice(0, 2).join('.');
}

function getSeenVersion() {
  return localStorage.getItem('labcharts-changelog-seen') || '';
}

function markChangelogSeen() {
  localStorage.setItem('labcharts-changelog-seen', String(window.APP_VERSION));
}

export function openChangelog(showAll) {
  const overlay = document.getElementById('changelog-modal-overlay');
  const modal = document.getElementById('changelog-modal');
  if (!overlay || !modal) return;

  const entries = showAll ? CHANGELOG : CHANGELOG.slice(0, 3);

  let html = `<button class="modal-close" onclick="closeChangelog()">&times;</button>`;
  html += `<h3>What's New</h3>`;

  for (const entry of entries) {
    html += `<div class="changelog-entry">`;
    html += `<div class="changelog-header"><span class="changelog-version">v${escapeHTML(entry.version)} — ${escapeHTML(entry.title)}</span><span class="changelog-date">${escapeHTML(entry.date)}</span></div>`;
    html += '<ul class="changelog-items">';
    for (const item of entry.items) {
      html += `<li class="changelog-item">${escapeHTML(item)}</li>`;
    }
    html += '</ul></div>';
  }

  modal.innerHTML = html;
  overlay.classList.add('show');
}

export function closeChangelog() {
  const overlay = document.getElementById('changelog-modal-overlay');
  if (overlay) overlay.classList.remove('show');
  markChangelogSeen();
}

export function maybeShowChangelog() {
  const seen = getSeenVersion();
  // First visit — no changelog, just mark as seen
  if (!seen) { markChangelogSeen(); return; }
  // Only show What's New on minor/major bumps, not patch
  if (getMajorMinor(seen) !== getMajorMinor(window.APP_VERSION)) {
    openChangelog(false);
  }
}

Object.assign(window, { openChangelog, closeChangelog, maybeShowChangelog });
