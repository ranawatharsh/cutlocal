# CutLocal — Private Background Removal

AI background removal that runs 100% in the browser. No uploads. No servers. Free forever.

## Local Development

```bash
npm install
npm run dev
```
Open http://localhost:5173

> On first load, the AI model (~40MB) downloads and is cached. After that, instant.

## Deploy to Vercel (Recommended)

```bash
npm install -g vercel
vercel
```

Or push to GitHub and connect at vercel.com — it auto-detects Vite.

## Deploy to Netlify

```bash
npm run build
# drag the dist/ folder to netlify.com/drop
```

## The COOP/COEP headers in vercel.json and netlify.toml are REQUIRED
Without them, SharedArrayBuffer (needed for WASM threads) won't work and the model will fail to load.

## Tech
- [@imgly/background-removal](https://github.com/imgly/background-removal-js) — AI model via WebAssembly
- Vite — bundler
- JSZip — batch ZIP export
