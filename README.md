# CutLocal — private background remover

AI background removal that runs **entirely in the browser**. No uploads, no server, no account, no watermark. Free and unlimited, because there is nothing to pay for.

Live pages: `/` (main tool), `/white-background`, `/passport-photo`, `/transparent-png`, `/privacy`.

---

## What it does

- **Background removal** on-device (IS-Net via ONNX Runtime WebAssembly)
- **Batch** processing with ZIP export, original filenames kept
- **Backgrounds**: transparent, solid colour, custom colour, or your own image (with blur)
- **Resize**: original, longest side 512/1024/2048, square 1080, square 600, social 1200×630, custom W×H
- **Framing**: padding slider, drop shadow, trim transparent edges
- **Export**: PNG / WebP / JPEG with quality control, filename prefix
- **Compare slider** per image (drag between original and result)
- **Copy to clipboard**, **paste from clipboard** (Ctrl/⌘+V), drag & drop anywhere
- **Works offline** after the first run (service worker + model cache)
- Installable as an app (PWA manifest)

## Local development

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # dist/
npm run preview  # serve dist/ locally
```

The AI model is **not** downloaded on page load. It starts when the visitor drops an image, clicks "Load AI now", or opens the file picker. That keeps the landing page fast and stops mobile users on data from paying for a 56 MB download they never asked for.

## Deploying

Works on any static host. Vercel and Netlify configs are included.

```bash
npx vercel --prod
# or: npm run build && drag dist/ to netlify.com/drop
```

Set the canonical domain at build time so the sitemap, `robots.txt`, canonical tags and Open Graph URLs are correct:

```bash
SITE_URL=https://yourdomain.com npm run build
```

`SITE_URL` defaults to `https://cutlocal.app`.

### The COOP/COEP headers are required

`vercel.json` and `netlify.toml` both send:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

Without them the page is not cross-origin isolated, WASM threads fall back to a single thread and processing gets slower. `vite.config.js` sets the same headers for `dev` and `preview`.

## Project layout

```
index.html              main tool + content + structured data
white-background.html   SEO landing page (preset: white, 1080², JPEG)
passport-photo.html     SEO landing page (preset: white, 600², JPEG)
transparent-png.html    SEO landing page (preset: transparent, PNG)
privacy.html            trust page (no tool, content only)
partials/               shared HTML (nav, app shell, footer) injected at build
src/main.js             UI, state, queue, settings
src/engine.js           lazy model loader + inference wrapper
src/editor.js           canvas compositor (background, size, padding, trim, shadow, encode)
src/download.js         single file, clipboard, ZIP
src/style.css           all styles (no webfonts — see Privacy)
public/                 icons, og.png, manifest, sw.js
vite.config.js          multi-page build, HTML includes, sitemap/robots generation
scripts/gen-assets.mjs  regenerates og.png + icons (needs `npm i -D sharp`)
```

### Adding another landing page

1. Copy a page like `white-background.html`, change `<title>`, description, canonical, JSON-LD and copy.
2. Set `<body data-preset="...">` and add the preset to `PRESETS` in `src/editor.js` if it needs new defaults.
3. Add the file to `PAGES` in `vite.config.js` so it is built and listed in `sitemap.xml`.
4. Link it from `partials/nav.html` / `partials/footer.html`.

## Model sizes (why the first run is heavy)

Measured from the 1.7.0 distribution, not from the README:

| Setting  | Model  | Model size | + WASM runtime | First run |
| -------- | ------ | ---------- | -------------- | --------- |
| Fast     | `isnet_quint8` | 44 MB | 12 MB | ~56 MB |
| Balanced | `isnet_fp16`   | 88 MB | 12 MB | ~100 MB |
| Best     | `isnet`        | 176 MB | 12 MB | ~188 MB |

Fast is the default. Balanced/Best sharpen edges on hair and thin objects but cost more download on first use. Everything is cached afterwards, and the service worker keeps the engine files so offline use works.

To self-host the model files (fully offline-capable hosting, no third-party CDN), call `preload`/`removeBackground` with `publicPath` pointing at your own copy of the `background-removal-data` package — see `src/engine.js`.

## Privacy model

- No backend, no analytics, no cookies, no webfonts, no third-party scripts.
- Images are read from disk into the tab; nothing about them is sent anywhere.
- `localStorage` holds only export preferences (`cutlocal:settings:v1`).
- Cache Storage holds the app shell and the model files.
- The only third-party requests are the model/runtime downloads from `staticimgly.com`.

## Licence note

`@imgly/background-removal` is **AGPL-3.0**. Running it as a public website counts as network use, so the AGPL asks you to offer the corresponding source to your users. The simplest way to comply — and the best growth move for a privacy tool — is to publish this repository and link to it in the footer. If you need to keep the site closed-source, buy a commercial licence from IMG.LY (support@img.ly) or use a model with a permissive licence.

## Growth

See [GROWTH.md](GROWTH.md) for the 30-day plan to get from 0 to 1,000 users.
