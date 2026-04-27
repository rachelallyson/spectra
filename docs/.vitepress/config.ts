import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'Spectra',
  description: 'Typed observability primitives for TypeScript apps. Bring your own catalog.',
  base: '/spectra/',
  cleanUrls: true,
  lastUpdated: true,

  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/spectra/favicon.svg' }],
    ['meta', { name: 'theme-color', content: '#5f4fff' }],
    ['meta', { property: 'og:title', content: 'Spectra' }],
    [
      'meta',
      {
        property: 'og:description',
        content: 'Typed observability primitives for TypeScript apps.',
      },
    ],
  ],

  themeConfig: {
    logo: { src: '/logo.svg', alt: 'Spectra' },

    nav: [
      { text: 'Guide', link: '/getting-started' },
      { text: 'API', link: '/api' },
      { text: 'Examples', link: '/examples' },
      {
        text: 'v0.1.0',
        items: [
          { text: 'Changelog', link: 'https://github.com/rachelallyson/spectra/blob/main/CHANGELOG.md' },
          { text: 'npm', link: 'https://www.npmjs.com/package/@rachelallyson/spectra' },
        ],
      },
    ],

    sidebar: [
      {
        text: 'Introduction',
        items: [
          { text: 'What is Spectra?', link: '/' },
          { text: 'Getting Started', link: '/getting-started' },
        ],
      },
      {
        text: 'Core',
        items: [
          { text: 'Concepts', link: '/concepts' },
          { text: 'API Reference', link: '/api' },
        ],
      },
      {
        text: 'Integrations',
        items: [{ text: 'Recipes', link: '/recipes' }],
      },
      {
        text: 'Examples',
        items: [{ text: 'Basic', link: '/examples' }],
      },
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/rachelallyson/spectra' },
      { icon: 'npm', link: 'https://www.npmjs.com/package/@rachelallyson/spectra' },
    ],

    editLink: {
      pattern: 'https://github.com/rachelallyson/spectra/edit/main/docs/:path',
      text: 'Edit this page on GitHub',
    },

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2026 Rachel Allyson',
    },

    search: {
      provider: 'local',
    },
  },
})
