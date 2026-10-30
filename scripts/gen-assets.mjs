// One-off asset generator: social card + PWA icons.
// Run with:
//   npm i -D sharp && node scripts/gen-assets.mjs && npm uninstall sharp
// (sharp is deliberately not a dependency — it is only needed to rebuild art.)
import sharp from 'sharp'
import fs from 'node:fs/promises'

const LIME = '#c8f135'

const og = `
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <pattern id="grid" width="44" height="44" patternUnits="userSpaceOnUse">
      <path d="M44 0H0V44" fill="none" stroke="#c8f135" stroke-opacity="0.06" stroke-width="1"/>
    </pattern>
    <radialGradient id="glow" cx="18%" cy="0%" r="80%">
      <stop offset="0%" stop-color="#c8f135" stop-opacity="0.16"/>
      <stop offset="100%" stop-color="#c8f135" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1200" height="630" fill="#0a0a0a"/>
  <rect width="1200" height="630" fill="url(#grid)"/>
  <rect width="1200" height="630" fill="url(#glow)"/>

  <g transform="translate(72 62)">
    <path d="M16 0l13.9 8v16L16 32 2.1 24V8z" fill="none" stroke="${LIME}" stroke-width="2.6" stroke-linejoin="round"/>
    <text x="44" y="24" font-family="Segoe UI, Arial, sans-serif" font-size="26" font-weight="700" fill="#ffffff" letter-spacing="-0.5">CutLocal</text>
  </g>

  <text x="72" y="292" font-family="Segoe UI, Arial, sans-serif" font-size="86" font-weight="800" fill="#ffffff" letter-spacing="-3">Remove backgrounds.</text>
  <text x="72" y="390" font-family="Segoe UI, Arial, sans-serif" font-size="86" font-weight="800" fill="${LIME}" letter-spacing="-3">No uploads.</text>
  <text x="74" y="462" font-family="Segoe UI, Arial, sans-serif" font-size="30" fill="#8f8f8f">AI that runs in your browser — free, unlimited, private.</text>

  <g transform="translate(72 512)">
    <rect x="0" y="0" width="286" height="44" rx="22" fill="#c8f135" fill-opacity="0.10" stroke="#c8f135" stroke-opacity="0.3"/>
    <text x="24" y="29" font-family="Segoe UI, Arial, sans-serif" font-size="19" fill="${LIME}">100% on-device</text>
    <rect x="304" y="0" width="220" height="44" rx="22" fill="#3bf0a0" fill-opacity="0.10" stroke="#3bf0a0" stroke-opacity="0.28"/>
    <text x="328" y="29" font-family="Segoe UI, Arial, sans-serif" font-size="19" fill="#3bf0a0">No account</text>
    <rect x="542" y="0" width="196" height="44" rx="22" fill="#ffffff" fill-opacity="0.04" stroke="#ffffff" stroke-opacity="0.14"/>
    <text x="566" y="29" font-family="Segoe UI, Arial, sans-serif" font-size="19" fill="#a8a8a8">Works offline</text>
  </g>

  <g transform="translate(880 150)" opacity="0.95">
    <path d="M140 0L262 70v140L140 280 18 210V70z" fill="none" stroke="${LIME}" stroke-opacity="0.24" stroke-width="3" stroke-linejoin="round"/>
    <path d="M140 40L226 89v102l-86 49-86-49V89z" fill="none" stroke="${LIME}" stroke-opacity="0.55" stroke-width="3" stroke-linejoin="round"/>
    <path d="M92 190L190 92" stroke="${LIME}" stroke-width="9" stroke-linecap="round"/>
  </g>
</svg>`

const icon = (pad) => `
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#0a0a0a"/>
  <g transform="translate(${256} ${256}) scale(${(512 - pad * 2) / 320}) translate(-160 -160)">
    <path d="M160 20L286 92v144L160 308 34 236V92z" fill="none" stroke="${LIME}" stroke-width="19" stroke-linejoin="round"/>
    <path d="M104 216L216 104" stroke="${LIME}" stroke-width="21" stroke-linecap="round"/>
  </g>
</svg>`

await fs.mkdir('public', { recursive: true })
await sharp(Buffer.from(og)).png({ quality: 92 }).toFile('public/og.png')
await sharp(Buffer.from(icon(34))).resize(192, 192).png().toFile('public/icon-192.png')
await sharp(Buffer.from(icon(34))).resize(512, 512).png().toFile('public/icon-512.png')
// Maskable icons need their content inside the inner 80% safe zone.
await sharp(Buffer.from(icon(96))).resize(512, 512).png().toFile('public/icon-maskable.png')

console.log('generated og.png, icon-192.png, icon-512.png, icon-maskable.png')
