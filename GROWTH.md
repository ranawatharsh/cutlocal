# From 0 → 1,000 users in 30 days

An honest assessment of the product, then a plan you can actually execute.

---

## 1. Is this a good idea?

**Yes, with one caveat.**

The background-removal market is crowded at the top (remove.bg, PhotoRoom, Adobe, Pixelcut) and at the bottom (dozens of free clones that all look the same). Competing on "another free background remover" loses. You are not competing on that.

Your wedge is **"it never leaves your device"**, and that is the one claim the incumbents structurally cannot copy:

- Server-side removal costs them money per image → they must cap usage, watermark, or require an account. You can be genuinely unlimited.
- They cannot say "your photo is never uploaded" without rebuilding on WebGPU/WASM. remove.bg has tried; it is not their business.
- "Free + unlimited + no sign-up + no watermark" is a **search query**, not just a feature.

Three audiences care disproportionately about local processing, and they are underserved:

1. **Marketplace sellers** (Amazon, Etsy, eBay, Flipkart, Meesho, Shopify) who need hundreds of white-background squares and don't want to pay per image. Huge in India/Brazil/Indonesia.
2. **Privacy-sensitive work**: passport photos (a biometric ID), NDAs, unreleased products, medical/legal, creators who don't want their photos on a stranger's server.
3. **Developers/privacy people** (r/privacy, Hacker News, self-hosting) — small in number, loud in reach, and they link to things.

**The caveat:** the first-run experience is a ~100 MB model download. That is the single biggest conversion risk on the whole site. Everything below assumes you treat that as the #1 product problem, not a footnote.

## 2. What was fixed in this version

| Problem before | Now |
| --- | --- |
| 44 MB model auto-downloaded on page load, blocking nothing but wasting everyone's data | Starts after first paint, skipped on Save-Data/2G/3G, real MB + ETA, instant on repeat visits |
| Progress bar was faked with `setInterval` | Real byte progress from the library, weighted runtime → model |
| Google Fonts request on a "zero data collected" site | System fonts only. No third-party requests except the model |
| 176 MB model was hard-coded (`isnet`) | Balanced (88 MB) default, Fast/Best selectable, alpha clean-up pass |
| No SEO: one page, thin meta, no sitemap/robots/canonical/structured data | 5 indexable pages, FAQ + WebApplication schema, sitemap, robots, OG image, clean URLs |
| "WebGPU ready" tag with no GPU path | Removed the false claim |
| Memory leaks (object URLs never revoked, no cleanup) | URLs revoked on clear/remove/reprocess |
| No way to check a cutout against the original | Compare slider with pixel-aligned panes |
| Re-editing meant re-running the AI | Compositing is a separate canvas pass — background/size/format changes are instant |
| Export was PNG only, no resize | PNG/WebP/JPEG + quality, 7 size presets, padding, shadow, trim, filename prefix |
| Batch export blocked on deflate | ZIP stored uncompressed (faster), JSZip lazy-loaded, progress shown |
| Not installable, not offline | PWA manifest + service worker caching app shell & model |
| Accessibility: `div` swatches, no keyboard, no labels | Buttons, labels, `role=status`, focus rings, reduced-motion |

## 3. What to build next (in this order)

**P0 — before you launch anywhere**

1. **Analytics you can trust.** You cannot improve a funnel you can't see. Use Cloudflare Web Analytics or Umami/Plausible (cookieless) and disclose it in `/privacy`. Track: `page_view`, `image_dropped`, `engine_loaded`, `engine_error`, `result_downloaded`, `zip_downloaded`. The number that matters is `image_dropped → result_downloaded`.
2. **A 3-second demo.** No file picker, no download. Show a looping before/after of a real person, a product shot and a logo. The current page asks the visitor to find a photo before they've seen any proof. This is the highest-ROI change left.
3. **Passport presets per country**, each as its own page: US 2×2 (600×600), UK/EU 35×45 (413×531), India 2×2, China 33×48, Canada 50×70. People search "passport photo size india" in enormous volume and need a tool at that moment. This is the cheapest SEO win available to you.
4. **Instance/position control** — sliders to nudge and zoom the subject inside the canvas. Sellers need the product centred; auto-fit alone isn't enough.

**P1 — the growth multiplier**

5. **A Chrome/Edge extension**: right-click any image → "Remove background locally". The Web Store is a distribution channel with built-in search, it is the same code, and it converts the "browser tool" story into a habit. This is the single biggest lever for going beyond 1,000 users.
6. **URL recipes** — encode settings in the query string (`?size=1080&bg=fff&format=jpeg`). Every forum answer you write becomes a link that opens with the right preset applied.
7. **Quality upgrade path**: a better model (BiRefNet-lite / RMBG-2.0 class) behind the "Best" option, ideally on WebGPU. Quality complaints are the main thing that kills word of mouth for free tools.

**P2 — later**

8. Desktop app (Tauri) using the same web bundle → "works offline, no browser" for professionals.
9. Video background removal (WebCodecs) — a real differentiator, but a big project.
10. Bulk rename with SKU patterns for sellers.

## 4. The 30-day plan

### Week 0 (today) — ship and measure

- [ ] Set the domain: `SITE_URL=https://yourdomain.com npm run build`, deploy to Vercel.
- [ ] Google Search Console: verify, submit `/sitemap.xml`. Bing Webmaster + IndexNow as well.
- [ ] Add analytics (above) and confirm events fire.
- [ ] Publish the repo publicly + link it in the footer (AGPL compliance *and* a trust signal).
- [ ] Write the 3-sentence pitch: *"Remove image backgrounds without uploading them. Runs in your browser, free, unlimited, works offline."*

### Week 1 — launch to humans, not crawlers

Do all of these in the first 5 days; each is 20–60 minutes of work.

| Channel | What to post | Why it works |
| --- | --- | --- |
| **Product Hunt** | Launch Tue–Thu, 00:01 PST. Gallery: 4 images, first is the before/after. First comment = the privacy story + the honest 100 MB explanation. | One good day = 300–800 visits, plus a permanent backlink |
| **Show HN** | Title: "Show HN: Background remover that never uploads your images (WASM, offline)". Answer every technical comment. | Dev audience, high link value, they will check the Network tab and be impressed |
| **r/privacy**, r/webdev, r/SideProject | Lead with the Network-tab verification, not the tool | These communities reward proof |
| **r/Etsy**, r/AmazonSeller, r/dropship | "Free way to get pure-white product photos, batch ZIP, no sign-up" | Directly matches the pain and the white-background page |
| **X/Twitter + LinkedIn** | 15-second screen recording of drag → result, with the Network tab visible | The video *is* the argument |
| **AlternativeTo, SaaSHub, Uneed, MicroLaunch, Toolify, Futurepedia** | List as a remove.bg alternative | Long-tail referral + backlinks |
| **awesome-privacy / awesome-selfhosted style lists** | PR | Small but targeted |

Expect one or two of these to hit. 1,000 users in a month from a cold start usually means **one spike of 400–700 + long-tail SEO + repeat visits**, not steady growth.

### Week 2–4 — SEO and content (the compounding part)

Google will not rank a 3-week-old domain for "remove background" (that's a 6–18 month fight). It *will* rank long-tail pages if they are genuinely useful:

- `/passport-photo/{us,uk,india,canada,china}` — size + rules + tool
- `/remove-background-without-uploading`
- `/offline-background-remover`
- `/remove-bg-alternative` (comparison, honest table: price, upload, limits)
- `/photoroom-alternative`
- `/batch-background-remover`
- `/remove-background-from-logo`, `/from-signature`, `/from-car-photo`
- `/blog/how-to-get-pure-white-background-for-amazon-photos`
- Translate the 3 core pages into **Hindi, Portuguese and Indonesian**. The product-photo-seller audience is huge there and the English tools ignore them. This is probably the fastest untapped SEO on the list.

Rules that keep you out of trouble: one page per real intent, 300+ words of unique genuinely-useful copy, internal links between pages, no pages that are the same text with a swapped keyword.

### Week 3–4 — make it shareable

- Before/after images on the page? Add a "share" card generator? No — instead: **copy to clipboard** (already in) is the share mechanism people actually use (paste into Slack, Figma, WhatsApp).
- Ask for one thing only: a link. "If this saved you a subscription, tell one seller."
- Post a monthly "what I built and what it cost me" thread on X/IndieHackers. Free distribution, and it compounds.

## 5. Numbers to watch (weekly)

| Metric | Target by day 30 | Where |
| --- | --- | --- |
| Visitors | 1,000 unique | analytics |
| `image_dropped` / visitors | > 25% | analytics |
| `result_downloaded` / `image_dropped` | > 60% | analytics |
| Engine errors | < 3% | analytics |
| Pages indexed | 8+ | Search Console |
| Referring domains | 5+ | Search Console |

If `image_dropped` is low, the dropzone or the demo is the problem. If `result_downloaded` is low, the model download or the quality is the problem. If both are fine and traffic is low, it's distribution — go post somewhere.

## 6. What I would *not* do

- **Don't add sign-up, limits or watermarks** to "monetise later". They destroy the only differentiator you have.
- **Don't pay for ads** at this stage. A 100 MB first-run download has a poor CAC payback and you have no revenue.
- **Don't chase "AI background remover" as a keyword.** You will lose to domains with 10 years of authority. Win the long tail and the communities first.
- **Don't add 20 half-finished tools.** One tool that is obviously the best free option beats a suite nobody links to.
- **Don't claim WebGPU/video/quality you don't ship.** The privacy audience checks.

## 7. Honest risk list

1. **First-run friction** (~100 MB) — mitigate with a demo, honest copy, and caching. This is the thing most likely to cap conversion at ~30%. The `/resize-image` page is the one tool that has zero download, so use it as the low-friction entry point.
2. **Cutout quality** vs remove.bg — IS-Net is good, not state of the art. Hair and thin edges will get complaints. Plan the better model.
3. **AGPL** — publish your source or license commercially; don't discover this after traction.
4. **CDN dependency** — the model comes from `staticimgly.com`. Self-host it if you want the "no third parties at all" claim to be literal.
5. **1000 users is a spike, not a business.** Decide now what month 3 looks like (extension? desktop? paid batch?) before the launch traffic fades.
