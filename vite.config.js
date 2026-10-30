import { defineConfig } from 'vite'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.dirname(fileURLToPath(import.meta.url))
const SITE_URL = (process.env.SITE_URL || 'https://cutlocal.app').replace(/\/+$/, '')

/** Every HTML page that should be built, crawled and listed in the sitemap. */
const PAGES = [
  { file: 'index.html', path: '/', priority: '1.0', changefreq: 'weekly' },
  { file: 'white-background.html', path: '/white-background', priority: '0.9', changefreq: 'monthly' },
  { file: 'passport-photo.html', path: '/passport-photo', priority: '0.9', changefreq: 'monthly' },
  { file: 'transparent-png.html', path: '/transparent-png', priority: '0.9', changefreq: 'monthly' },
  { file: 'privacy.html', path: '/privacy', priority: '0.4', changefreq: 'yearly' },
]

const INCLUDE = /<!--\s*include:\s*([^\s>]+)\s*-->/

/**
 * Tiny HTML include system so the app shell lives in one file instead of being
 * copy-pasted into every landing page.
 */
function htmlIncludes() {
  const render = (html, depth = 0) => {
    if (depth > 5 || !html.includes('include:')) return html
    return html.replace(new RegExp(INCLUDE.source, 'g'), (_m, file) => {
      const target = path.join(ROOT, file)
      if (!fs.existsSync(target)) return `<!-- missing include: ${file} -->`
      return render(fs.readFileSync(target, 'utf8'), depth + 1)
    })
  }

  return {
    name: 'cutlocal:html-includes',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        return render(html).replaceAll('%SITE_URL%', SITE_URL)
      },
    },
  }
}

/** robots.txt + sitemap.xml are generated so the domain only lives in one place. */
function seoFiles() {
  const today = new Date().toISOString().slice(0, 10)
  const urls = PAGES.map(
    (p) =>
      `  <url>\n    <loc>${SITE_URL}${p.path === '/' ? '/' : p.path}</loc>\n` +
      `    <lastmod>${today}</lastmod>\n    <changefreq>${p.changefreq}</changefreq>\n` +
      `    <priority>${p.priority}</priority>\n  </url>`
  ).join('\n')

  const sitemap =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`

  const robots = `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`

  return {
    name: 'cutlocal:seo-files',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: sitemap })
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: robots })
    },
  }
}

export default defineConfig({
  optimizeDeps: {
    // The segmentation engine is loaded on demand, so don't pre-bundle it.
    exclude: ['@imgly/background-removal'],
  },
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  preview: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  build: {
    target: 'es2020',
    rollupOptions: {
      input: Object.fromEntries(
        PAGES.map((p) => [p.file.replace(/\.html$/, ''), path.join(ROOT, p.file)])
      ),
    },
  },
  plugins: [
    htmlIncludes(),
    seoFiles(),
    {
      name: 'cutlocal:dev-headers',
      configureServer(server) {
        server.middlewares.use((_req, res, next) => {
          res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
          res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp')
          next()
        })
      },
    },
  ],
})
