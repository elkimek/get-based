import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'getbased',
  description: 'Blood work dashboard for tracking biomarker trends over time',
  base: '/docs/',
  outDir: '../dist-docs',
  lastUpdated: true,

  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/docs/icon.svg' }]
  ],

  themeConfig: {
    logo: '/icon.svg',
    siteTitle: 'getbased',

    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'Contributors', link: '/contributor/' },
      { text: 'Open App', link: 'https://getbased.health/app', target: '_self' }
    ],

    sidebar: {
      '/guide/': [
        {
          text: 'Getting Started',
          items: [
            { text: 'Quick Start', link: '/guide/getting-started' },
            { text: 'AI Providers', link: '/guide/ai-providers' },
            { text: 'Settings', link: '/guide/settings' }
          ]
        },
        {
          text: 'Importing Data',
          items: [
            { text: 'PDF Import', link: '/guide/pdf-import' },
            { text: 'Batch Import', link: '/guide/batch-import' },
            { text: 'Manual Entry', link: '/guide/manual-entry' },
            { text: 'JSON Export & Import', link: '/guide/json-export-import' },
            { text: 'Custom Markers', link: '/guide/custom-markers' },
            { text: 'Specialty Labs', link: '/guide/specialty-labs' },
            { text: 'DNA Import', link: '/guide/dna-import' },
            { text: 'Wearables', link: '/guide/wearables' },
            { text: 'PII Obfuscation', link: '/guide/pii-obfuscation' }
          ]
        },
        {
          text: 'Dashboard & Views',
          items: [
            { text: 'Dashboard', link: '/guide/dashboard' },
            { text: 'Charts', link: '/guide/charts' },
            { text: 'Trend Alerts', link: '/guide/trend-alerts' },
            { text: 'Compare Dates', link: '/guide/compare-dates' },
            { text: 'Heatmap', link: '/guide/heatmap' },
            { text: 'Correlations', link: '/guide/correlations' },
            { text: 'Guided Tour', link: '/guide/tour' }
          ]
        },
        {
          text: 'Health Context',
          items: [
            { text: 'Context Cards', link: '/guide/context-cards' },
            { text: 'Health Goals', link: '/guide/health-goals' },
            { text: 'Interpretive Lens', link: '/guide/interpretive-lens' },
            { text: 'Focus Card', link: '/guide/focus-card' },
            { text: 'Menstrual Cycle', link: '/guide/menstrual-cycle' },
            { text: 'Supplements', link: '/guide/supplements' },
            { text: 'Tips & Recommendations', link: '/guide/tips-recommendations' },
            { text: 'Notes', link: '/guide/notes' }
          ]
        },
        {
          text: 'AI Features',
          items: [
            { text: 'AI Chat', link: '/guide/ai-chat' },
            { text: 'Biological Age', link: '/guide/phenoage' }
          ]
        },
        {
          text: 'Security & Backup',
          items: [
            { text: 'Encryption', link: '/guide/encryption' },
            { text: 'Cross-Device Sync', link: '/guide/cross-device-sync' },
            { text: 'Agent Access', link: '/guide/agent-access' },
            { text: 'Personal Agents', link: '/guide/personal-agents' },
            { text: 'Folder Backup', link: '/guide/folder-backup' },
            { text: 'Tor Access', link: '/guide/tor-access' }
          ]
        }
      ],
      '/contributor/': [
        {
          text: 'Contributor Guide',
          items: [
            { text: 'Quick Start', link: '/contributor/' },
            { text: 'Architecture', link: '/contributor/architecture' },
            { text: 'Module Reference', link: '/contributor/module-reference' },
            { text: 'Cross-Module Patterns', link: '/contributor/cross-module-patterns' },
            { text: 'Context Assembly', link: '/contributor/context-assembly' },
            { text: 'Data Pipeline', link: '/contributor/data-pipeline' },
            { text: 'Testing', link: '/contributor/testing' },
            { text: 'Deployment', link: '/contributor/deployment' },
            { text: 'Storage Schema', link: '/contributor/storage-schema' }
          ]
        }
      ]
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/elkimek/get-based' },
      { icon: 'discord', link: 'https://discord.gg/zJdVB9zgQB' },
      { icon: 'x', link: 'https://x.com/getbasedhealth' }
    ],

    editLink: {
      pattern: 'https://github.com/elkimek/get-based/edit/main/docs/:path',
      text: 'Edit this page on GitHub'
    },

    search: {
      provider: 'local'
    },

    footer: {
      message: 'Released under the AGPL-3.0-or-later License.',
      copyright: 'Copyright © 2026 getbased'
    }
  }
})
